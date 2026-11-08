import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { PaymentCallbackPage } from './PaymentCallback'
import apiClient from '@/api/client'

vi.mock('@/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/lib/posthog', () => ({ posthog: { capture: vi.fn() } }))

describe('PaymentCallbackPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the bank-account message after linking and verifies nothing, since no payment was taken', () => {
    render(
      <MemoryRouter initialEntries={['/payment/callback?type=direct_debit']}>
        <PaymentCallbackPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Bank account submitted')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Billing' })).toHaveAttribute('href', '/settings/billing')
    expect(apiClient.post).not.toHaveBeenCalled()
    expect(apiClient.get).not.toHaveBeenCalled()
  })

  it('still verifies a subscription payment', async () => {
    ;(apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    render(
      <MemoryRouter initialEntries={['/payment/callback?type=subscription&reference=SUB-1']}>
        <PaymentCallbackPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Subscription Activated!')).toBeInTheDocument()
    expect(apiClient.post).toHaveBeenCalledWith('/subscription/verify-payment', { reference: 'SUB-1' })
  })

  it('tells the customer their plan is active while a bank payment is still processing', async () => {
    ;(apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { activated: false, pending: true } } })
    render(
      <MemoryRouter initialEntries={['/payment/callback?type=subscription&reference=SUB-2']}>
        <PaymentCallbackPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Your plan is active')).toBeInTheDocument()
    expect(screen.getByText(/within 24 hours/)).toBeInTheDocument()
  })
})
