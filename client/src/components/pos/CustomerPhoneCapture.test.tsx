import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { CustomerPhoneCapture } from './CustomerPhoneCapture'
import { customersApi, loyaltyApi } from '@/api'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api', () => ({
  customersApi: { lookupPhone: vi.fn(), capturePhone: vi.fn() },
  loyaltyApi: { settings: vi.fn(), enrol: vi.fn() },
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

const LOYALTY_OFF = { enabled: false, available: true, startAt: null, expiryDays: 90, rules: [] }
const LOYALTY_ON = { ...LOYALTY_OFF, enabled: true }

const type = (user: ReturnType<typeof userEvent.setup>, value: string) => user.type(screen.getByLabelText('Customer phone'), value)

describe('CustomerPhoneCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loyaltyApi.settings).mockResolvedValue(LOYALTY_OFF)
  })

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

  describe('loyalty', () => {
    it('offers no loyalty controls when the programme is off', async () => {
      vi.mocked(customersApi.lookupPhone).mockResolvedValue({ valid: true, e164: '+2348031234569', customer: null })
      const { user } = renderField()
      await type(user, '08031234569')
      await screen.findByRole('button', { name: /save and attach/i })
      expect(screen.queryByLabelText('Loyalty member')).not.toBeInTheDocument()
    })

    it('saves and enrols a new number only once the customer\'s message consent is ticked', async () => {
      vi.mocked(loyaltyApi.settings).mockResolvedValue(LOYALTY_ON)
      vi.mocked(customersApi.lookupPhone).mockResolvedValue({ valid: true, e164: '+2348031234569', customer: null })
      vi.mocked(loyaltyApi.enrol).mockResolvedValue({
        customer: { id: 'c3', name: 'Amaka Obi', phone: '+2348031234569', isMember: true },
        enrolled: true,
        phoneCredited: true,
      })
      const { user, onResolved } = renderField({ orderId: 'o1', source: 'PAY' })
      await type(user, '08031234569')
      await user.click(await screen.findByLabelText('Loyalty member'))
      await user.type(screen.getByLabelText('Customer name'), 'Amaka Obi')
      const save = screen.getByRole('button', { name: /save and enrol/i })
      expect(save).toBeDisabled()
      await user.click(screen.getByLabelText(/agrees to receive loyalty messages/i))
      await user.click(save)
      await waitFor(() => expect(loyaltyApi.enrol).toHaveBeenCalled())
      expect(loyaltyApi.enrol).toHaveBeenCalledWith(expect.objectContaining({ phone: '08031234569', name: 'Amaka Obi', consent: true, source: 'PAY', orderId: 'o1' }))
      expect(customersApi.capturePhone).not.toHaveBeenCalled()
      expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ id: 'c3', isMember: true }))
      expect(toast.success).toHaveBeenCalledWith('Number saved — +1 credit to you · loyalty member')
    })

    it('requires a name to enrol a brand-new customer', async () => {
      vi.mocked(loyaltyApi.settings).mockResolvedValue(LOYALTY_ON)
      vi.mocked(customersApi.lookupPhone).mockResolvedValue({ valid: true, e164: '+2348031234569', customer: null })
      const { user } = renderField()
      await type(user, '08031234569')
      await user.click(await screen.findByLabelText('Loyalty member'))
      await user.click(screen.getByLabelText(/agrees to receive loyalty messages/i))
      expect(screen.getByRole('button', { name: /save and enrol/i })).toBeDisabled()
    })

    it('lets staff enrol the customer already on the order when they have a number but are not a member', async () => {
      vi.mocked(loyaltyApi.settings).mockResolvedValue(LOYALTY_ON)
      vi.mocked(loyaltyApi.enrol).mockResolvedValue({ customer: { id: 'c1', name: 'Ada', phone: '+2348031234569', isMember: true }, enrolled: true, phoneCredited: false })
      const { user, onResolved } = renderField({ customer: { id: 'c1', name: 'Ada', phone: '+2348031234569' } })
      await user.click(await screen.findByRole('button', { name: /enrol ada in loyalty/i }))
      const enrol = screen.getByRole('button', { name: 'Enrol' })
      expect(enrol).toBeDisabled()
      await user.click(screen.getByLabelText(/agrees to receive loyalty messages/i))
      await user.click(enrol)
      await waitFor(() => expect(loyaltyApi.enrol).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'c1', consent: true, source: 'ORDER' })))
      expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', isMember: true }))
    })

    it('asks for a name when the customer\'s name is just their number', async () => {
      vi.mocked(loyaltyApi.settings).mockResolvedValue(LOYALTY_ON)
      const { user } = renderField({ customer: { id: 'c1', name: '+2348031234569', phone: '+2348031234569' } })
      await user.click(await screen.findByRole('button', { name: /enrol .* in loyalty/i }))
      await user.click(screen.getByLabelText(/agrees to receive loyalty messages/i))
      expect(screen.getByRole('button', { name: 'Enrol' })).toBeDisabled()
      await user.type(screen.getByLabelText('Customer name'), 'Ada Obi')
      expect(screen.getByRole('button', { name: 'Enrol' })).toBeEnabled()
    })

    it('shows nothing for a customer who is already a member', async () => {
      vi.mocked(loyaltyApi.settings).mockResolvedValue(LOYALTY_ON)
      renderField({ customer: { id: 'c1', name: 'Ada', phone: '+2348031234569', isMember: true } })
      await waitFor(() => expect(loyaltyApi.settings).toHaveBeenCalled())
      expect(screen.queryByRole('button', { name: /in loyalty/i })).not.toBeInTheDocument()
    })
  })
})
