// Sentry's own recommended way to verify a frontend install actually reports errors: visit this
// route and confirm the error shows up in the React Sentry project's dashboard. The ErrorBoundary
// wrapping the whole app (see App.tsx) catches this and reports it. Safe to leave in place — it
// does nothing but throw, no data exposure — but fine to delete once you've confirmed Sentry works.
export function DebugSentryPage(): never {
  throw new Error('Test error from /debug-sentry — Sentry is wired up correctly if you see this in the dashboard.')
}
