// Must be imported before any other module in main.ts (Sentry patches Node's core modules for
// auto-instrumentation, which only works if it runs before those modules are first required) —
// so this file has no dependency on the NestJS/ConfigModule bootstrap and reads env vars directly.
import * as Sentry from '@sentry/nestjs';

// Route prefixes waiters/cashiers hit constantly while running the floor (placing/updating
// orders, the POS dashboard) — worth a bigger slice of a free-tier quota than background or
// admin/reporting traffic. Matched against the request path as a plain substring.
const HOT_PATHS = ['/orders', '/pos-dashboard'];

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // This app's requests carry customer names, order details, and payment data — don't ship
    // that to a third party by default. Revisit deliberately if/when that's actually wanted.
    sendDefaultPii: false,
    // Performance tracing: captures per-request duration broken into spans (HTTP handler,
    // Prisma queries, etc.) so slow endpoints/queries show up without hand-rolled timing. Each
    // sampled request counts against the Sentry plan's quota (small on the free tier), so rather
    // than one flat rate, spend more of that budget on the hot POS paths and less everywhere else.
    tracesSampler: (samplingContext) => {
      // A request arriving with its own trace decision (e.g. propagated from the frontend's
      // Sentry SDK) keeps that decision, so a single user journey samples consistently end to
      // end instead of getting re-decided at each hop.
      if (samplingContext.parentSampled !== undefined) {
        return samplingContext.inheritOrSampleWith(Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05));
      }

      const path = samplingContext.normalizedRequest?.url ?? '';
      if (HOT_PATHS.some((p) => path.includes(p))) {
        return Number(process.env.SENTRY_HOT_PATH_SAMPLE_RATE ?? 0.5);
      }
      return Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05);
    },
    integrations: [Sentry.prismaIntegration()],
  });
}
