import type * as Sentry from '@sentry/nestjs';

type TracesSampler = NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>['tracesSampler']>;

// Route prefixes waiters/cashiers hit constantly while running the floor (placing/updating
// orders, the POS dashboard) — worth a bigger slice of a free-tier quota than background or
// admin/reporting traffic. Matched against the request path as a plain substring.
const HOT_PATHS = ['/orders', '/pos-dashboard'];

// Every print agent polls this every few seconds, around the clock. At the default rate it used up
// more than half of the monthly span quota, and Sentry then dropped everything until the next
// billing period. The traffic is so high and so uniform that a tiny sample still shows its latency.
const PRINT_POLL_PATH = /\/print-agent\/jobs\/?(\?|$)/;

export const tracesSampler: TracesSampler = (samplingContext) => {
  const path = samplingContext.normalizedRequest?.url ?? '';

  // Only the poll itself — job status updates (PATCH .../jobs/:id) are rare and worth keeping.
  if (samplingContext.normalizedRequest?.method === 'GET' && PRINT_POLL_PATH.test(path)) {
    return Number(process.env.SENTRY_POLL_SAMPLE_RATE ?? 0.001);
  }

  // A request arriving with its own trace decision (e.g. propagated from the frontend's
  // Sentry SDK) keeps that decision, so a single user journey samples consistently end to
  // end instead of getting re-decided at each hop.
  if (samplingContext.parentSampled !== undefined) {
    return samplingContext.inheritOrSampleWith(Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05));
  }

  if (HOT_PATHS.some((p) => path.includes(p))) {
    return Number(process.env.SENTRY_HOT_PATH_SAMPLE_RATE ?? 0.5);
  }
  return Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05);
};
