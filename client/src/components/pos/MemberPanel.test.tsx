import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { MemberPanel } from './MemberPanel'
import { loyaltyApi, ordersApi } from '@/api'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api', () => ({
  loyaltyApi: { settings: vi.fn(), member: vi.fn() },
  ordersApi: { redeemReward: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const SUMMARY = {
  customer: { id: 'c1', name: 'Amaka', phone: '+2348031234569', isMember: true, lifetimeSpend: 210000, enrolledAt: null },
  rewards: [
    {
      id: 'rw1',
      ruleId: 'r1',
      name: 'Meal Reward',
      expiresAt: '2027-02-12T00:00:00.000Z',
      maxPerOrder: 1,
      items: [
        { id: 'm1', name: 'Nigerian Breakfast' },
        { id: 'm2', name: 'Smoked Chicken Salad' },
      ],
    },
  ],
  progress: [
    { ruleId: 'r1', name: 'Meal Reward', toNext: 90000 },
    { ruleId: 'r2', name: 'Reward Platter', toNext: 790000 },
  ],
}

function renderPanel(props: Partial<React.ComponentProps<typeof MemberPanel>> = {}) {
  useAuthStore.setState({ user: { id: 'w1', roles: ['WAITER'] } as never })
  const onRedeemed = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemberPanel customerId="c1" orderId="o1" canRedeem onRedeemed={onRedeemed} {...props} />
    </QueryClientProvider>,
  )
  return { onRedeemed, user: userEvent.setup() }
}

describe('MemberPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loyaltyApi.settings).mockResolvedValue({ enabled: true, available: true, startAt: null, expiryDays: 90, rules: [] })
    vi.mocked(loyaltyApi.member).mockResolvedValue(SUMMARY)
  })

  it('shows lifetime spend, the nearest next reward and the rewards that can be used', async () => {
    renderPanel()
    expect(await screen.findByText(/Lifetime spend/)).toBeInTheDocument()
    expect(screen.getByText(/to the next Meal Reward/)).toBeInTheDocument()
    expect(screen.queryByText(/Reward Platter/)).not.toBeInTheDocument() // only the nearest is shown
    expect(screen.getByText('Meal Reward')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use' })).toBeInTheDocument()
  })

  it('shows nothing when loyalty is off or the customer is not a member', async () => {
    vi.mocked(loyaltyApi.member).mockResolvedValue({ ...SUMMARY, customer: { ...SUMMARY.customer, isMember: false }, rewards: [], progress: [] })
    renderPanel()
    await waitFor(() => expect(loyaltyApi.member).toHaveBeenCalled())
    expect(screen.queryByLabelText('Loyalty member')).not.toBeInTheDocument()
  })

  it('lets the customer pick an item, then puts it on the order', async () => {
    vi.mocked(ordersApi.redeemReward).mockResolvedValue({} as never)
    const { user, onRedeemed } = renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Use' }))
    await user.click(screen.getByRole('button', { name: 'Smoked Chicken Salad' }))
    await waitFor(() => expect(ordersApi.redeemReward).toHaveBeenCalledWith('o1', { rewardId: 'rw1', menuItemId: 'm2' }))
    expect(onRedeemed).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Reward added to the order at ₦0')
  })

  it('shows the server message when the reward was already used elsewhere', async () => {
    vi.mocked(ordersApi.redeemReward).mockRejectedValue({ response: { data: { message: 'That reward is no longer available' } } })
    const { user, onRedeemed } = renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Use' }))
    await user.click(screen.getByRole('button', { name: 'Nigerian Breakfast' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('That reward is no longer available'))
    expect(onRedeemed).not.toHaveBeenCalled()
  })

  it('only displays rewards (no Use button) before an order exists', async () => {
    renderPanel({ orderId: undefined, canRedeem: false })
    await screen.findByText('Meal Reward')
    expect(screen.queryByRole('button', { name: 'Use' })).not.toBeInTheDocument()
    expect(screen.getByText(/once the order has been placed/)).toBeInTheDocument()
  })
})
