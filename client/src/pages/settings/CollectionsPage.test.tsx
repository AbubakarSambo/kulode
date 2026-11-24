import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionsPage } from './CollectionsPage'
import { invoiceCollectionsApi } from '@/api'
import { toast } from 'sonner'

vi.mock('@/api', () => ({
  invoiceCollectionsApi: { policy: vi.fn(), updatePolicy: vi.fn(), pending: vi.fn(), approve: vi.fn(), skip: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/layout', () => ({ Header: ({ title }: { title: string }) => <h1>{title}</h1> }))

const policy = {
  enabled: true,
  schedule: [
    { offsetDays: -2, template: 'pre_due' },
    { offsetDays: 3, template: 'payment_reminder' },
  ],
  mode: 'APPROVE' as const,
  sendHour: 9,
  maxMessages: 4,
  paused: false,
}

const reminder = {
  id: 'r1',
  invoiceId: 'i1',
  stepIndex: 1,
  template: 'payment_reminder',
  scheduledFor: '2026-11-25T08:00:00.000Z',
  invoice: { invoiceNumber: 'INV-0042', total: '50000', amountPaid: '20000', dueDate: '2026-11-20T00:00:00.000Z', client: { name: 'Ada Stores' } },
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CollectionsPage />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('CollectionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(invoiceCollectionsApi.pending).mockResolvedValue([])
  })

  it('offers to turn reminders on in approve mode when not yet enabled', async () => {
    vi.mocked(invoiceCollectionsApi.policy).mockResolvedValue({ ...policy, enabled: false })
    vi.mocked(invoiceCollectionsApi.updatePolicy).mockResolvedValue(policy)
    const user = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Turn on reminders' }))
    expect(invoiceCollectionsApi.updatePolicy).toHaveBeenCalledWith({ mode: 'APPROVE' })
    expect(invoiceCollectionsApi.pending).toHaveBeenCalled()
  })

  it('does not load pending reminders while disabled', async () => {
    vi.mocked(invoiceCollectionsApi.policy).mockResolvedValue({ ...policy, enabled: false })
    renderPage()
    await screen.findByRole('button', { name: 'Turn on reminders' })
    expect(invoiceCollectionsApi.pending).not.toHaveBeenCalled()
  })

  it('shows the schedule and the amount still owing on a pending reminder', async () => {
    vi.mocked(invoiceCollectionsApi.policy).mockResolvedValue(policy)
    vi.mocked(invoiceCollectionsApi.pending).mockResolvedValue([reminder])
    renderPage()
    expect(await screen.findByText(/2 days before due/)).toBeInTheDocument()
    expect(await screen.findByText(/Ada Stores · INV-0042/)).toBeInTheDocument()
    expect(screen.getByText(/₦30,000 owing/)).toBeInTheDocument()
  })

  it('saves edited settings', async () => {
    vi.mocked(invoiceCollectionsApi.policy).mockResolvedValue(policy)
    vi.mocked(invoiceCollectionsApi.updatePolicy).mockResolvedValue({ ...policy, mode: 'AUTO', sendHour: 10 })
    const user = renderPage()
    await user.click(await screen.findByLabelText(/Send automatically/))
    const hour = screen.getByLabelText(/Send at/)
    await user.clear(hour)
    await user.type(hour, '10')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(invoiceCollectionsApi.updatePolicy).toHaveBeenCalledWith({ mode: 'AUTO', sendHour: 10, maxMessages: 4 })
  })

  it('blocks saving an out-of-range send hour', async () => {
    vi.mocked(invoiceCollectionsApi.policy).mockResolvedValue(policy)
    const user = renderPage()
    const hour = await screen.findByLabelText(/Send at/)
    await user.clear(hour)
    await user.type(hour, '23')
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  })

  it('pauses reminders', async () => {
    vi.mocked(invoiceCollectionsApi.policy).mockResolvedValue(policy)
    vi.mocked(invoiceCollectionsApi.updatePolicy).mockResolvedValue({ ...policy, paused: true })
    const user = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Pause' }))
    expect(invoiceCollectionsApi.updatePolicy).toHaveBeenCalledWith({ paused: true })
  })

  it('approving sends and toasts success', async () => {
    vi.mocked(invoiceCollectionsApi.policy).mockResolvedValue(policy)
    vi.mocked(invoiceCollectionsApi.pending).mockResolvedValue([reminder])
    vi.mocked(invoiceCollectionsApi.approve).mockResolvedValue({ sent: true })
    const user = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Send reminder for INV-0042' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Reminder sent'))
    expect(vi.mocked(invoiceCollectionsApi.approve).mock.calls[0][0]).toBe('r1')
  })

  it('explains why an approved reminder was not sent', async () => {
    vi.mocked(invoiceCollectionsApi.policy).mockResolvedValue(policy)
    vi.mocked(invoiceCollectionsApi.pending).mockResolvedValue([reminder])
    vi.mocked(invoiceCollectionsApi.approve).mockResolvedValue({ sent: false, reason: 'no_consent' })
    const user = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Send reminder for INV-0042' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/not agreed to WhatsApp/)))
  })

  it('skips a reminder', async () => {
    vi.mocked(invoiceCollectionsApi.policy).mockResolvedValue(policy)
    vi.mocked(invoiceCollectionsApi.pending).mockResolvedValue([reminder])
    vi.mocked(invoiceCollectionsApi.skip).mockResolvedValue()
    const user = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Skip reminder for INV-0042' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Reminder skipped'))
  })
})
