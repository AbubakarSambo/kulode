import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PhoneNumbersTab } from './PhoneNumbersTab'
import { collectionApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { CollectionBoard } from '@/api'

vi.mock('@/api', () => ({
  collectionApi: { leaderboard: vi.fn(), periods: vi.fn(), credits: vi.fn() },
  usersApi: { directory: vi.fn().mockResolvedValue([]) },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const board: CollectionBoard = {
  period: { id: 'p1', name: 'November phone drive', startDate: '2026-11-08', endDate: '2026-11-30', status: 'OPEN', phase: 'LIVE', coverageGoalPct: 70 },
  team: { count: 120, minimum: 420, threshold: 525 },
  coverage: { customers: 200, withPhone: 100, pct: 50 },
  canCompete: true,
  entries: [
    { rank: 1, userId: 'w2', name: 'Bayo K', count: 62, today: 7, minimum: 140, threshold: 175, zone: 'GREEN', nextStep: 'On track for Green', isMe: false },
    { rank: 2, userId: 'w1', name: 'Ada O', count: 55, today: 3, minimum: 140, threshold: 175, zone: 'NORMAL', nextStep: '120 to reward', isMe: true },
    { rank: 3, userId: 'w3', name: 'Chi N', count: 40, today: 0, minimum: 140, threshold: 175, zone: 'RED', nextStep: '9 behind pace', isMe: false },
  ],
}

function renderTab(roles: string[]) {
  useAuthStore.setState({ user: { id: 'w1', roles } as never })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PhoneNumbersTab />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PhoneNumbersTab', () => {
  beforeEach(() => vi.mocked(collectionApi.leaderboard).mockResolvedValue(board))

  it('shows the whole board with zone chips, today counts and next steps, highlighting the viewer', async () => {
    renderTab(['WAITER'])
    expect(await screen.findByText('Bayo K')).toBeInTheDocument()
    const ada = screen.getByText('Ada O').closest('div.flex.items-center.gap-3') as HTMLElement
    expect(within(ada).getByText('You')).toBeInTheDocument()
    expect(within(ada).getByText('Normal')).toBeInTheDocument()
    expect(within(ada).getByText('120 to reward')).toBeInTheDocument()
    expect(within(ada).getByText(/Today 3/)).toBeInTheDocument()
    expect(screen.getByText('Green')).toBeInTheDocument()
    expect(screen.getByText('Red')).toBeInTheDocument()
  })

  it('shows phone coverage against the goal and the team total', async () => {
    renderTab(['WAITER'])
    expect(await screen.findByText('50%')).toBeInTheDocument()
    expect(screen.getByText(/of 70% goal/)).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText(/Team minimum 420/)).toBeInTheDocument()
  })

  it('gives a waiter no management buttons', async () => {
    renderTab(['WAITER'])
    await screen.findByText('Bayo K')
    expect(screen.queryByRole('button', { name: /quick add/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /review numbers/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set up/i })).not.toBeInTheDocument()
  })

  it('lets a supervisor quick add, a manager also review, and an admin also set up', async () => {
    const { unmount } = renderTab(['SUPERVISOR'])
    await screen.findByText('Bayo K')
    expect(screen.getByRole('button', { name: /quick add/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /review numbers/i })).not.toBeInTheDocument()
    unmount()

    const manager = renderTab(['MANAGER'])
    await screen.findByText('Bayo K')
    expect(screen.getByRole('button', { name: /review numbers/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set up/i })).not.toBeInTheDocument()
    manager.unmount()

    renderTab(['ADMIN'])
    await screen.findByText('Bayo K')
    expect(screen.getByRole('button', { name: /set up/i })).toBeInTheDocument()
  })

  it('invites an admin to set up a period when none exists, and tells staff to wait', async () => {
    vi.mocked(collectionApi.leaderboard).mockResolvedValue({ period: null })
    const { unmount } = renderTab(['ADMIN'])
    expect(await screen.findByText('No phone collection running')).toBeInTheDocument()
    expect(screen.getByText(/Set up a collection period/)).toBeInTheDocument()
    unmount()

    renderTab(['WAITER'])
    expect(await screen.findByText(/When a collection drive starts/)).toBeInTheDocument()
  })
})
