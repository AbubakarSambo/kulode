import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PeriodOutcomeModal } from './PeriodOutcomeModal'
import { collectionApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { PeriodOutcome } from '@/api'

vi.mock('@/api', () => ({
  collectionApi: { outcome: vi.fn(), lockPeriod: vi.fn(), downloadOutcomeCsv: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const outcome = (over: Partial<PeriodOutcome> = {}): PeriodOutcome => ({
  period: { id: 'p1', name: 'November phone drive', startDate: '2026-11-08', endDate: '2026-11-30', status: 'OPEN', lockedAt: null, rewardAmount: 40000, deductionPct: 10 },
  provisional: true,
  ended: true,
  rows: [
    { userId: 'w1', name: 'Ada O', count: 180, minimum: 140, threshold: 175, zone: 'GREEN', incentiveAmount: 40000, deductionPct: 0 },
    { userId: 'w2', name: 'Bayo K', count: 150, minimum: 140, threshold: 175, zone: 'NORMAL', incentiveAmount: 0, deductionPct: 0 },
    { userId: 'w3', name: 'Chi N', count: 100, minimum: 140, threshold: 175, zone: 'RED', incentiveAmount: 0, deductionPct: 10 },
  ],
  totals: { incentiveDue: 40000, deductions: 1 },
  ...over,
})

function renderModal(roles: string[]) {
  useAuthStore.setState({ user: { id: 'm1', roles } as never })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PeriodOutcomeModal isOpen onClose={() => {}} periodId="p1" />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('PeriodOutcomeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(collectionApi.outcome).mockResolvedValue(outcome())
  })

  it('shows each person with the incentive for Green, the deduction for Red and nothing for Normal, plus totals', async () => {
    renderModal(['MANAGER'])
    expect(await screen.findByText('Ada O')).toBeInTheDocument()
    expect(screen.getByText(/₦40,000 incentive/)).toBeInTheDocument()
    expect(screen.getByText('10% deduction')).toBeInTheDocument()
    expect(screen.getByText('None')).toBeInTheDocument()
    expect(screen.getByText(/Incentives due/)).toHaveTextContent('₦40,000')
  })

  it('says provisional until the period is locked, and final once it is', async () => {
    renderModal(['MANAGER'])
    expect(await screen.findByText(/Provisional\./)).toBeInTheDocument()
    expect(screen.getByText(/locks automatically within the hour/)).toBeInTheDocument()
  })

  it('says final and frozen for a locked period, and offers no lock button', async () => {
    vi.mocked(collectionApi.outcome).mockResolvedValue(
      outcome({ provisional: false, period: { ...outcome().period, status: 'LOCKED', lockedAt: '2026-12-01T00:30:00Z' } }),
    )
    renderModal(['ADMIN'])
    expect(await screen.findByText(/Final\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /lock now/i })).not.toBeInTheDocument()
  })

  it('downloads the payroll CSV', async () => {
    vi.mocked(collectionApi.downloadOutcomeCsv).mockResolvedValue()
    const user = renderModal(['MANAGER'])
    await user.click(await screen.findByRole('button', { name: /export csv for payroll/i }))
    await waitFor(() => expect(collectionApi.downloadOutcomeCsv).toHaveBeenCalledWith('p1'))
  })

  it('lets only an admin lock, and only after the period has ended', async () => {
    renderModal(['MANAGER'])
    await screen.findByText('Ada O')
    expect(screen.queryByRole('button', { name: /lock now/i })).not.toBeInTheDocument()
  })

  it('an admin can lock an ended, unlocked period after confirming', async () => {
    vi.mocked(collectionApi.lockPeriod).mockResolvedValue({ locked: true, alreadyLocked: false, results: 3 })
    const user = renderModal(['ADMIN'])
    await user.click(await screen.findByRole('button', { name: /lock now/i }))
    expect(collectionApi.lockPeriod).not.toHaveBeenCalled() // asks first
    await user.click(screen.getByRole('button', { name: 'Lock period' }))
    await waitFor(() => expect(collectionApi.lockPeriod).toHaveBeenCalledWith('p1'))
  })

  it('hides the lock button while the period is still running', async () => {
    vi.mocked(collectionApi.outcome).mockResolvedValue(outcome({ ended: false }))
    renderModal(['ADMIN'])
    expect(await screen.findByText(/where everyone would land/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /lock now/i })).not.toBeInTheDocument()
  })
})
