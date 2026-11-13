import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { LoyaltyReportPage } from './LoyaltyReportPage'
import { loyaltyApi } from '@/api'

vi.mock('@/api', () => ({
  loyaltyApi: {
    report: vi.fn(),
    coverage: vi.fn(),
    undelivered: vi.fn(),
    resolveUndelivered: vi.fn(),
    retryUndelivered: vi.fn(),
    downloadMembersCsv: vi.fn(),
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/layout', () => ({ Header: ({ title }: { title: string }) => <h1>{title}</h1> }))

const REPORT = {
  range: { from: '2026-11-01', to: '2026-11-30' },
  members: { total: 412, newInPeriod: 96, byStaff: [{ userId: 'u1', name: 'Ada Eze', count: 60 }, { userId: 'u2', name: 'Tunde Bello', count: 36 }] },
  spend: { total: 9_000_000, member: 5_400_000, nonMember: 3_600_000, memberSharePct: 60, orders: 1200 },
  rewards: { earned: 40, redeemed: 25, expired: 3 },
  cost: { foodCost: 67_500, menuValue: 150_000, pctOfMemberSpend: 1.3 },
  outstanding: { rewards: 12, foodCost: 32_400 },
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LoyaltyReportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('LoyaltyReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loyaltyApi.report).mockResolvedValue(REPORT)
    vi.mocked(loyaltyApi.coverage).mockResolvedValue({
      live: { customers: 5581, withPhone: 2800, pct: 50.2 },
      days: [
        { date: '2026-11-12', customers: 5500, withPhone: 2700, pct: 49.1 },
        { date: '2026-11-13', customers: 5581, withPhone: 2800, pct: 50.2 },
      ],
    })
    vi.mocked(loyaltyApi.undelivered).mockResolvedValue([])
  })

  it('shows members, member share of spend, rewards and what they cost', async () => {
    renderPage()
    expect(await screen.findByText('412')).toBeInTheDocument()
    expect(screen.getByText('96 joined in this period')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('40 earned')).toBeInTheDocument()
    expect(screen.getByText('25 redeemed · 3 expired')).toBeInTheDocument()
    expect(screen.getByText(/1\.3% of member spend/)).toBeInTheDocument()
    expect(screen.getByText('Rewards waiting to be used').parentElement).toHaveTextContent('12')
    expect(screen.getByText('Ada Eze')).toBeInTheDocument()
    expect(screen.getByText('60')).toBeInTheDocument()
  })

  it('asks the server for the chosen dates', async () => {
    renderPage()
    const from = await screen.findByLabelText('From date')
    await waitFor(() => expect(from).toHaveValue('2026-11-01')) // the period the server chose
    fireEvent.change(from, { target: { value: '2026-11-08' } })
    await waitFor(() => expect(loyaltyApi.report).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-11-08' })))
  })

  it('lists coverage by day, newest first, with today\'s live figure', async () => {
    renderPage()
    const list = await screen.findByLabelText('Coverage by day')
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('50.2%')
    expect(screen.getByText(/2,800 of 5,581 customers \(50\.2%\)/)).toBeInTheDocument()
  })

  it('says so when every message got through', async () => {
    renderPage()
    expect(await screen.findByText(/every message got through/)).toBeInTheDocument()
  })

  it('lists a failed welcome with the reason, and can send it again or mark it followed up', async () => {
    vi.mocked(loyaltyApi.undelivered).mockResolvedValue([
      { id: 'm1', kind: 'WELCOME', customerId: 'c1', name: 'Amaka Obi', phone: '+2348031234569', reason: 'Recipient not on WhatsApp', rewardText: null, createdAt: '2026-11-13T10:00:00.000Z' },
    ])
    vi.mocked(loyaltyApi.retryUndelivered).mockResolvedValue()
    vi.mocked(loyaltyApi.resolveUndelivered).mockResolvedValue()
    const user = renderPage()
    expect(await screen.findByText('Amaka Obi')).toBeInTheDocument()
    expect(screen.getByText(/Recipient not on WhatsApp/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send again' }))
    await waitFor(() => expect(loyaltyApi.retryUndelivered).toHaveBeenCalled())
    expect(vi.mocked(loyaltyApi.retryUndelivered).mock.calls[0][0]).toBe('m1')
    await user.click(screen.getByRole('button', { name: 'Followed up' }))
    await waitFor(() => expect(loyaltyApi.resolveUndelivered).toHaveBeenCalled())
    expect(vi.mocked(loyaltyApi.resolveUndelivered).mock.calls[0][0]).toBe('m1')
  })

  it('exports the members, and shows a message if that fails', async () => {
    vi.mocked(loyaltyApi.downloadMembersCsv).mockRejectedValue({ response: { data: { message: 'Not allowed' } } })
    const user = renderPage()
    await user.click(await screen.findByRole('button', { name: /export members/i }))
    await waitFor(() => expect(loyaltyApi.downloadMembersCsv).toHaveBeenCalled())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Not allowed'))
  })

  it('says so when the report cannot be loaded', async () => {
    vi.mocked(loyaltyApi.report).mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText(/Could not load the loyalty report/)).toBeInTheDocument()
  })

  it('shows what a customer earned when their reward message did not arrive, and offers no resend', async () => {
    vi.mocked(loyaltyApi.undelivered).mockResolvedValue([
      {
        id: 'm9',
        kind: 'REWARD_EARNED',
        customerId: 'c9',
        name: 'Bola Ade',
        phone: '+2348039998887',
        reason: 'This message was not delivered to maintain healthy ecosystem engagement.',
        rewardText: 'a free Nigerian Breakfast or Smoked Chicken Salad',
        createdAt: '2026-11-13T17:16:00.000Z',
      },
    ])
    vi.mocked(loyaltyApi.resolveUndelivered).mockResolvedValue()
    const user = renderPage()
    expect(await screen.findByText('Bola Ade')).toBeInTheDocument()
    expect(screen.getByText(/Reward message/)).toBeInTheDocument()
    expect(screen.getByText('Earned a free Nigerian Breakfast or Smoked Chicken Salad')).toBeInTheDocument()
    expect(screen.getByText(/maintain healthy ecosystem engagement/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send again' })).not.toBeInTheDocument() // Meta would refuse it again
    await user.click(screen.getByRole('button', { name: 'Followed up' }))
    await waitFor(() => expect(loyaltyApi.resolveUndelivered).toHaveBeenCalled())
    expect(vi.mocked(loyaltyApi.resolveUndelivered).mock.calls[0][0]).toBe('m9')
  })
})
