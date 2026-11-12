import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { CustomerPhoneCapture } from './CustomerPhoneCapture'
import { customersApi } from '@/api'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api', () => ({
  customersApi: { lookupPhone: vi.fn(), capturePhone: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderField(props: Partial<React.ComponentProps<typeof CustomerPhoneCapture>> = {}, roles = ['WAITER']) {
  useAuthStore.setState({ user: { id: 'w1', roles } as never })
  const onResolved = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CustomerPhoneCapture customer={null} source="ORDER" onResolved={onResolved} {...props} />
    </QueryClientProvider>,
  )
  return { onResolved, user: userEvent.setup() }
}

const type = (user: ReturnType<typeof userEvent.setup>, value: string) => user.type(screen.getByLabelText('Customer phone'), value)

describe('CustomerPhoneCapture', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows nothing to roles that cannot capture numbers', () => {
    renderField({}, ['KITCHEN'])
    expect(screen.queryByLabelText('Customer phone')).not.toBeInTheDocument()
  })

  it('shows nothing when the attached customer already has a number', () => {
    renderField({ customer: { id: 'c1', name: 'Ada', phone: '+2348031234569' } })
    expect(screen.queryByLabelText('Customer phone')).not.toBeInTheDocument()
  })

  it('does not look anything up until enough digits are typed', async () => {
    const { user } = renderField()
    await type(user, '0803')
    await new Promise((r) => setTimeout(r, 500))
    expect(customersApi.lookupPhone).not.toHaveBeenCalled()
  })

  it('tells the waiter why a number is not accepted', async () => {
    vi.mocked(customersApi.lookupPhone).mockResolvedValue({ valid: false, reason: 'REPEATED', message: 'That number looks made up (repeated digits)' })
    const { user } = renderField()
    await type(user, '08000000000')
    expect(await screen.findByText('That number looks made up (repeated digits)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
  })

  it('offers the existing customer who already has the number', async () => {
    vi.mocked(customersApi.lookupPhone).mockResolvedValue({ valid: true, e164: '+2348031234569', customer: { id: 'c9', name: 'Ada Obi', phone: '+2348031234569' } })
    const { user, onResolved } = renderField()
    await type(user, '08031234569')
    expect(await screen.findByText(/already has this number/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use customer' }))
    expect(onResolved).toHaveBeenCalledWith({ id: 'c9', name: 'Ada Obi', phone: '+2348031234569' })
    expect(customersApi.capturePhone).not.toHaveBeenCalled()
  })

  it('creates a customer for a free number, with an optional name, and tells the waiter they earned a credit', async () => {
    vi.mocked(customersApi.lookupPhone).mockResolvedValue({ valid: true, e164: '+2348031234569', customer: null })
    vi.mocked(customersApi.capturePhone).mockResolvedValue({ customer: { id: 'c2', name: 'Tunde', phone: '+2348031234569' }, created: true, credited: true })
    const { user, onResolved } = renderField({ orderId: 'o1', source: 'PAY' })
    await type(user, '08031234569')
    await user.type(await screen.findByLabelText('Customer name'), 'Tunde')
    await user.click(screen.getByRole('button', { name: 'Save and attach' }))

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith({ id: 'c2', name: 'Tunde', phone: '+2348031234569' }))
    expect(vi.mocked(customersApi.capturePhone).mock.calls[0][0]).toMatchObject({
      phone: '08031234569',
      name: 'Tunde',
      source: 'PAY',
      orderId: 'o1',
      customerId: undefined,
      clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(toast.success).toHaveBeenCalledWith('Number saved — +1 credit to you')
  })

  it('puts the number on the customer already on the order instead of creating another', async () => {
    vi.mocked(customersApi.lookupPhone).mockResolvedValue({ valid: true, e164: '+2348031234569', customer: null })
    vi.mocked(customersApi.capturePhone).mockResolvedValue({ customer: { id: 'c1', name: 'Ada', phone: '+2348031234569' }, created: false, credited: true })
    const { user } = renderField({ customer: { id: 'c1', name: 'Ada', phone: null } })
    expect(screen.getByText('Ada has no phone number')).toBeInTheDocument()
    await type(user, '08031234569')
    expect(screen.queryByLabelText('Customer name')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Save number to Ada' }))
    await waitFor(() => expect(customersApi.capturePhone).toHaveBeenCalled())
    expect(vi.mocked(customersApi.capturePhone).mock.calls[0][0]).toMatchObject({ customerId: 'c1' })
  })

  it('offers to switch to the customer who holds the number when it was taken meanwhile', async () => {
    vi.mocked(customersApi.lookupPhone).mockResolvedValue({ valid: true, e164: '+2348031234569', customer: null })
    vi.mocked(customersApi.capturePhone).mockRejectedValue({
      response: { data: { message: 'Customer already exists', code: 'PHONE_EXISTS', errors: { existingCustomerId: 'c9', existingCustomerName: 'Ada Obi' } } },
    })
    const { user, onResolved } = renderField()
    await type(user, '08031234569')
    await user.click(await screen.findByRole('button', { name: 'Save and attach' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    const [, options] = vi.mocked(toast.error).mock.calls[0] as unknown as [string, { action: { label: string; onClick: () => void } }]
    expect(options.action.label).toBe('Use Ada Obi')
    options.action.onClick()
    expect(onResolved).toHaveBeenCalledWith({ id: 'c9', name: 'Ada Obi', phone: null })
  })
})
