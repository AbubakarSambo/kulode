import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Error monitoring only — no performance tracing/session replay, matching what was enabled
    // on the backend Sentry project. Add integrations here later if that changes.
    sendDefaultPii: false,
  })
}

export { Sentry }
