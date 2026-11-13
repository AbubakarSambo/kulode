import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LoyaltyPage } from './LoyaltyPage'
import { loyaltyApi, menuItemsApi } from '@/api'

vi.mock('@/api', () => ({
  loyaltyApi: { settings: vi.fn(), updateSettings: vi.fn() },
  menuItemsApi: { list: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/layout', () => ({ Header: ({ title }: { title: string }) => <h1>{title}</h1> }))

const MENU = [
  { id: 'm1', name: 'Nigerian Breakfast' },
  { id: 'm2', name: 'Smoked Chicken Salad' },
  { id: 'm3', name: 'Reward Platter' },
] as never

const base = { enabled: false, available: true, startAt: null, expiryDays: 90, rules: [] }

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LoyaltyPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('LoyaltyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(menuItemsApi.list).mockResolvedValue(MENU)
  })

  it('says loyalty is unavailable for a retail organization', async () => {
    vi.mocked(loyaltyApi.settings).mockResolvedValue({ ...base, available: false })
    renderPage()
    expect(await screen.findByText(/only available for restaurant/i)).toBeInTheDocument()
  })

  it('shows existing rewards with their items', async () => {
    vi.mocked(loyaltyApi.settings).mockResolvedValue({
      ...base,
      enabled: true,
      rules: [{ id: 'r1', name: 'Meal Reward', thresholdAmount: 100000, repeating: true, maxPerOrder: 1, foodCost: 2700, isActive: true, items: [{ id: 'm1', name: 'Nigerian Breakfast' }] }],
    })
    renderPage()
    expect(await screen.findByDisplayValue('Meal Reward')).toBeInTheDocument()
    expect(screen.getByDisplayValue('100000')).toBeInTheDocument()
    expect(screen.getByLabelText('Nigerian Breakfast')).toBeChecked()
    expect(screen.getByLabelText('Smoked Chicken Salad')).not.toBeChecked()
  })

  it('builds the Living Room\'s two rewards and sends them with menu item ids, not names', async () => {
    vi.mocked(loyaltyApi.settings).mockResolvedValue(base)
    vi.mocked(loyaltyApi.updateSettings).mockResolvedValue({ ...base, enabled: true })
    const user = renderPage()
    await screen.findByText('Rewards')

    await user.click(screen.getByLabelText('Loyalty programme is on'))
    expect(screen.getByRole('button', { name: 'Save loyalty settings' })).toBeDisabled() // on, but no reward yet

    await user.click(screen.getByRole('button', { name: /add a reward/i }))
    await user.type(screen.getByPlaceholderText('e.g. Meal Reward'), 'Meal Reward')
    await user.type(screen.getByPlaceholderText('100000'), '100000')
    await user.type(screen.getByPlaceholderText('1'), '1')
    await user.type(screen.getByPlaceholderText('2700'), '2700')
    await user.click(screen.getByLabelText('Nigerian Breakfast'))
    await user.click(screen.getByLabelText('Smoked Chicken Salad'))

    await user.click(screen.getByRole('button', { name: /add a reward/i }))
    const names = screen.getAllByPlaceholderText('e.g. Meal Reward')
    await user.type(names[1], 'Reward Platter')
    await user.type(screen.getAllByPlaceholderText('100000')[1], '1000000')
    await user.click(screen.getAllByLabelText('Reward Platter')[1])

    await user.click(screen.getByRole('button', { name: 'Save loyalty settings' }))
    await waitFor(() => expect(loyaltyApi.updateSettings).toHaveBeenCalled())
    expect(loyaltyApi.updateSettings).toHaveBeenCalledWith({
      enabled: true,
      expiryDays: 90,
      rules: [
        { name: 'Meal Reward', thresholdAmount: 100000, repeating: true, maxPerOrder: 1, foodCost: 2700, menuItemIds: ['m1', 'm2'], isActive: true },
        { name: 'Reward Platter', thresholdAmount: 1000000, repeating: true, maxPerOrder: null, foodCost: 0, menuItemIds: ['m3'], isActive: true },
      ],
    })
  })

  it('will not save a reward with no items', async () => {
    vi.mocked(loyaltyApi.settings).mockResolvedValue(base)
    const user = renderPage()
    await screen.findByText('Rewards')
    await user.click(screen.getByRole('button', { name: /add a reward/i }))
    await user.type(screen.getByPlaceholderText('e.g. Meal Reward'), 'Meal Reward')
    await user.type(screen.getByPlaceholderText('100000'), '100000')
    expect(screen.getByRole('button', { name: 'Save loyalty settings' })).toBeDisabled()
  })
})
