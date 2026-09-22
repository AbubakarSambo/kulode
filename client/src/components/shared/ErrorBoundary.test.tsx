import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

vi.mock('@/lib/posthog', () => ({
  posthog: { captureException: vi.fn(), capture: vi.fn() },
}))

vi.mock('@/lib/sentry', () => ({
  Sentry: { captureException: vi.fn() },
}))

function Bomb(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // React logs the error to the console by default — silence that noise for this test.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('shows a recovery screen and reports the error when a child throws', async () => {
    const { posthog } = await import('@/lib/posthog')
    const { Sentry } = await import('@/lib/sentry')

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error))
    expect(posthog.captureException).toHaveBeenCalledWith(expect.any(Error))
  })

  it('reloads the page when Reload is clicked', async () => {
    const user = userEvent.setup()
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )

    await user.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalled()
  })
})
