import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { ClientFormPage } from './ClientForm'

vi.mock('@/api', () => ({ clientsApi: { create: vi.fn(), update: vi.fn(), get: vi.fn() } }))
vi.mock('@/lib/posthog', () => ({ posthog: { capture: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/layout', () => ({ Header: ({ title }: { title: string }) => <h1>{title}</h1> }))
vi.mock('@/hooks', () => ({ useOverscrollBounce: () => ({ current: null }) }))
vi.mock('@/components/ui/phone-input', () => ({ PhoneInput: ({ id }: { id: string }) => <input id={id} /> }))

const initialData = {
  id: 'c1',
  name: 'Emeka',
  email: '',
  phone: '08031234567',
  address: '',
  notes: '',
  clientType: 'business' as const,
  whatsappOptIn: false,
}

function renderForm(props: { whatsappOptedOutAt?: string | null } = {}) {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ClientFormPage mode="edit" initialData={initialData} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ClientForm WhatsApp consent', () => {
  it('offers the consent checkbox for a customer with a phone number', () => {
    renderForm()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('shows that the customer replied STOP instead of a checkbox that cannot override it', () => {
    renderForm({ whatsappOptedOutAt: '2026-12-01T10:00:00.000Z' })
    expect(screen.getByRole('note')).toHaveTextContent(/replied STOP on WhatsApp/)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
