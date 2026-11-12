import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { QuickAddCustomerModal } from './QuickAddCustomerModal'
import { collectionApi, usersApi } from '@/api'

vi.mock('@/api', () => ({
  collectionApi: { quickAdd: vi.fn() },
  usersApi: { directory: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <QuickAddCustomerModal isOpen onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: 'Ada O' }) // staff list has loaded
  await user.selectOptions(screen.getByRole('combobox'), 'w1')
  await user.type(screen.getByPlaceholderText('e.g. Tunde Bakare'), 'Tunde')
  await user.type(screen.getByPlaceholderText('0803 123 4567'), '08031234569')
}

describe('QuickAddCustomerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usersApi.directory).mockResolvedValue([{ id: 'w1', firstName: 'Ada', lastName: 'O' }])
  })

  it('needs a collector, name and phone before it can save', async () => {
    renderModal()
    expect(await screen.findByRole('button', { name: /save and add another/i })).toBeDisabled()
  })

  it('saves on behalf of the collector with an idempotency key, then clears for the next form but keeps the collector', async () => {
    const user = userEvent.setup()
    vi.mocked(collectionApi.quickAdd).mockResolvedValue({ id: 'c1', name: 'Tunde', credited: true })
    renderModal()
    await fillIn(user)
    await user.click(screen.getByRole('button', { name: /save and add another/i }))

    await waitFor(() => expect(collectionApi.quickAdd).toHaveBeenCalledTimes(1))
    expect(vi.mocked(collectionApi.quickAdd).mock.calls[0][0]).toMatchObject({
      name: 'Tunde',
      phone: '08031234569',
      collectedById: 'w1',
      clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tunde saved — credit to Ada'))
    expect(screen.getByPlaceholderText('0803 123 4567')).toHaveValue('')
    expect(screen.getByRole('combobox')).toHaveValue('w1')
  })

  it('offers to open the existing customer when the number is already saved', async () => {
    const user = userEvent.setup()
    vi.mocked(collectionApi.quickAdd).mockRejectedValue({
      response: { data: { message: 'Customer already exists', code: 'PHONE_EXISTS', errors: { existingCustomerId: 'c9' } } },
    })
    renderModal()
    await fillIn(user)
    await user.click(screen.getByRole('button', { name: /save and add another/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    const [title, options] = vi.mocked(toast.error).mock.calls[0] as unknown as [string, { action: { label: string } }]
    expect(title).toBe('Customer already exists')
    expect(options.action.label).toBe('Open customer')
    // The rejected entry stays on screen so it can be corrected.
    expect(screen.getByPlaceholderText('0803 123 4567')).toHaveValue('08031234569')
  })
})
