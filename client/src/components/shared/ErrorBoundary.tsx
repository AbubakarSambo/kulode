import { Component, type ErrorInfo, type ReactNode } from 'react'
import { posthog } from '@/lib/posthog'
import { Sentry } from '@/lib/sentry'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

// A render crash anywhere in the tree used to white-screen the whole app with zero recovery path
// and zero visibility — a real problem for a cashier mid-shift. This catches it, offers a reload,
// and reports the error to Sentry (full stack trace/source maps) and PostHog (product-analytics
// context) so it's not silent.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info)
    try {
      Sentry.captureException(error)
    } catch {
      // Sentry not initialized (no DSN configured) — nothing more we can do here.
    }
    try {
      posthog.captureException(error)
    } catch {
      // PostHog not initialized (no key configured) — nothing more we can do here.
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background p-6 text-center">
          <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            An unexpected error occurred. Reloading the page usually fixes this — your data is safe.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
          >
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
