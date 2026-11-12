import { toast } from 'sonner'

// The API refuses made-up/invalid phone numbers (PHONE_INVALID) and numbers another customer
// already holds (PHONE_EXISTS, with that customer's id). Pulled out so every customer form shows
// the same message and offers the same "open that customer" shortcut.

interface ApiErrorBody {
  message?: string
  code?: string
  errors?: { existingCustomerId?: string; existingCustomerName?: string } | null
}

export interface CustomerSaveError {
  message: string
  code?: string
  existingCustomerId?: string
  existingCustomerName?: string
}

export function customerSaveError(err: unknown, fallback: string): CustomerSaveError {
  const body = (err as { response?: { data?: ApiErrorBody } })?.response?.data
  return {
    message: body?.message || fallback,
    code: body?.code,
    existingCustomerId: body?.errors?.existingCustomerId,
    existingCustomerName: body?.errors?.existingCustomerName,
  }
}

/** Toast a failed customer save; a number that already belongs to someone offers to open them. */
export function toastCustomerSaveError(err: unknown, fallback: string, openCustomer: (id: string) => void) {
  const { message, code, existingCustomerId } = customerSaveError(err, fallback)
  if (code === 'PHONE_EXISTS' && existingCustomerId) {
    toast.error('Customer already exists', {
      description: 'That number is already saved on another customer.',
      action: { label: 'Open customer', onClick: () => openCustomer(existingCustomerId) },
    })
  } else {
    toast.error(message)
  }
}
