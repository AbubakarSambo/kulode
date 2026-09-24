import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN
const apiUrl = import.meta.env.VITE_API_URL

// Pages/requests waiters and cashiers live in all shift — worth a bigger slice of a free-tier
// quota than admin/reporting screens they open a handful of times a day. Matches the pageload
// path (e.g. /pos/orders/:id) or the request's own name (e.g. "GET /api/v1/orders").
const HOT_PATHS = ['/pos/orders', '/pos-dashboard', '/orders']

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Error monitoring only — no session replay. Add integrations here later if that changes.
    sendDefaultPii: false,
    // Performance tracing: captures page-load and XHR/fetch timing as spans. Combined with the
    // backend's tracesSampler (see api/src/instrument.ts), requests that carry a propagated
    // trace header show up as one end-to-end trace from click to DB query. Each sampled
    // transaction counts against the Sentry plan's quota (small on the free tier), so rather than
    // one flat rate, spend more of that budget on the hot POS paths and less everywhere else.
    tracesSampler: (samplingContext) => {
      // A trace already decided upstream (e.g. resumed from a previous navigation) keeps that
      // decision, so a single user journey samples consistently end to end.
      if (samplingContext.parentSampled !== undefined) {
        return samplingContext.inheritOrSampleWith(Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.05))
      }

      const target = `${samplingContext.location?.pathname ?? ''} ${samplingContext.name ?? ''}`
      if (HOT_PATHS.some((p) => target.includes(p))) {
        return Number(import.meta.env.VITE_SENTRY_HOT_PATH_SAMPLE_RATE ?? 0.5)
      }
      return Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.05)
    },
    integrations: [Sentry.browserTracingIntegration()],
    // Same-origin requests (dev's /api/v1 proxy) get trace headers by default; the deployed API
    // lives on a different origin (VITE_API_URL), so it needs to be allow-listed explicitly.
    tracePropagationTargets: apiUrl ? [/^\/api/, apiUrl] : [/^\/api/],
  })
}

export { Sentry }
