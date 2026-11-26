import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DirectDebitChargeForm } from './DirectDebitChargeForm'
import { subscriptionApi } from '@/api/subscription'

vi.mock('@/api/subscription', () => ({
  subscriptionApi: { getDirectDebitBanks: vi.fn(), chargeDirectDebit: vi.fn() },
}))
vi.mock('@/lib/posthog', () => ({ posthog: { capture: vi.fn() } }))

describe('DirectDebitChargeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(subscriptionApi.getDirectDebitBanks).mockResolvedValue([{ name: 'Zenith Bank', code: '057' }])
  })

  it('sends the account details with an international phone number and shows where to transfer', async () => {
    vi.mocked(subscriptionApi.chargeDirectDebit).mockResolvedValue({
      status: 'pending_bank_transfer',
      reference: 'SUB-1',
      transfer: { accountNumber: '9880218357', accountName: 'NIBSS DIRECT DEBIT', bankName: 'Paystack-Titan', amount: '50.00' },
    })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DirectDebitChargeForm planTier="PRO" billingPeriod="MONTHLY" priceLabel="₦100" />
      </QueryClientProvider>,
    )

    await screen.findByRole('option', { name: 'Zenith Bank' })
    await user.selectOptions(screen.getByLabelText('Bank'), '057')
    await user.type(screen.getByLabelText('Account number'), '0123456789')
    await user.type(screen.getByLabelText('Phone number'), '0801 234 5678')
    await user.type(screen.getByLabelText('Street address'), '1 Test Street')
    await user.type(screen.getByLabelText('City'), 'Ikeja')
    await user.type(screen.getByLabelText('State'), 'Lagos')
    await user.click(screen.getByRole('button', { name: 'Pay ₦100 from my bank' }))

    expect(await screen.findByText('9880218357')).toBeInTheDocument()
    expect(screen.getByText('₦50.00')).toBeInTheDocument()
    expect(subscriptionApi.chargeDirectDebit).toHaveBeenCalledWith({
      planTier: 'PRO',
      billingPeriod: 'MONTHLY',
      bankCode: '057',
      accountNumber: '0123456789',
      phone: '+2348012345678',
      street: '1 Test Street',
      city: 'Ikeja',
      state: 'Lagos',
    })
  })
})
