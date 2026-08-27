import apiClient from './client'
import type { ApiResponse, Order, OrderStatus, OrderItemStatus, PaginatedResponse } from '@/types'
import {
  enqueueCreateOrder,
  enqueueAddItems,
  enqueueCloseOrder,
  flushOfflineQueue,
  LOCAL_ORDER_PREFIX,
} from '@/lib/offlineOrderQueue'

export interface CreateOrderItemData {
  menuItemId: string
  quantity: number
  notes?: string
}

export interface CreateOrderData {
  tableId?: string
  customerId?: string
  waiterId?: string
  source?: string
  items: CreateOrderItemData[]
  notes?: string
  applyVat?: boolean
  applyEntertainmentTax?: boolean
  applyServiceCharge?: boolean
}

export interface CloseOrderData {
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'PAYSTACK' | 'WALLET' | 'OTHER'
  amount?: number
  customerEmail?: string
  reference?: string
  notes?: string
}

export interface OrderFilter {
  page?: number
  limit?: number
  status?: OrderStatus
  statuses?: OrderStatus[]
  tableId?: string
  customerId?: string
  waiterId?: string
}

/** Marker so the UI can tell a locally-queued (not-yet-synced) order apart from a real one. */
export interface PendingOrder {
  __offlinePending: true
  localOrderId: string
  tableId?: string
  items: { menuItemId: string; quantity: number; notes?: string }[]
}

/** Marker for a mutation (add-items/close) that got queued rather than applied immediately. */
export interface QueuedResult {
  __offlinePending: true
}

function isNoResponseError(err: unknown): boolean {
  const axiosErr = err as { response?: unknown }
  return !axiosErr.response
}

export const ordersApi = {
  list: async (filter?: OrderFilter): Promise<PaginatedResponse<Order>> => {
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Order>>>('/orders', {
      params: filter,
      // Axios defaults array params to `statuses[]=a&statuses[]=b`, but this API's query parser
      // only turns repeated bare keys (`statuses=a&statuses=b`) into an array — bracket notation
      // arrives as a literal `"statuses[]"` property and fails DTO validation.
      paramsSerializer: { indexes: null },
    })
    return response.data.data
  },
  get: async (id: string): Promise<Order> => {
    const response = await apiClient.get<ApiResponse<Order>>(`/orders/${id}`)
    return response.data.data
  },

  /**
   * Creates an order. If the network is unreachable, queues it in IndexedDB instead of failing
   * and returns a PendingOrder placeholder — see src/lib/offlineOrderQueue.ts for sync behavior.
   * Always sends a clientRequestId, generated once and reused if the online attempt fails over
   * to the offline queue, so a lost response can never turn into a duplicate order.
   */
  create: async (data: CreateOrderData): Promise<Order | PendingOrder> => {
    if (!navigator.onLine) {
      const { localOrderId } = await enqueueCreateOrder(data)
      return { __offlinePending: true, localOrderId, tableId: data.tableId, items: data.items }
    }
    try {
      const clientRequestId = crypto.randomUUID()
      const response = await apiClient.post<ApiResponse<Order>>('/orders', { ...data, clientRequestId })
      return response.data.data
    } catch (err: unknown) {
      if (isNoResponseError(err)) {
        const { localOrderId } = await enqueueCreateOrder(data)
        return { __offlinePending: true, localOrderId, tableId: data.tableId, items: data.items }
      }
      throw err
    }
  },

  /**
   * Adds items to an order. `id` may be a real server id or a `local:` id for an order that
   * hasn't synced yet — in the latter case this always queues (there's nothing to call yet) and
   * the queue resolves the real id once the parent CREATE_ORDER syncs.
   */
  addItems: async (id: string, items: CreateOrderItemData[]): Promise<Order | QueuedResult> => {
    if (id.startsWith(LOCAL_ORDER_PREFIX) || !navigator.onLine) {
      await enqueueAddItems(id, items)
      return { __offlinePending: true }
    }
    try {
      const clientRequestId = crypto.randomUUID()
      const response = await apiClient.post<ApiResponse<Order>>(`/orders/${id}/items`, { items, clientRequestId })
      return response.data.data
    } catch (err: unknown) {
      if (isNoResponseError(err)) {
        await enqueueAddItems(id, items)
        return { __offlinePending: true }
      }
      throw err
    }
  },

  updateItemStatus: async (orderId: string, itemId: string, status: OrderItemStatus): Promise<Order> => {
    const response = await apiClient.patch<ApiResponse<Order>>(`/orders/${orderId}/items/${itemId}/status`, { status })
    return response.data.data
  },

  /** Edits a PENDING item's quantity. 0 removes it (cancelling the order if it was the last item). */
  updateItemQuantity: async (orderId: string, itemId: string, quantity: number): Promise<Order> => {
    const response = await apiClient.patch<ApiResponse<Order>>(`/orders/${orderId}/items/${itemId}`, { quantity })
    return response.data.data
  },

  setCustomer: async (id: string, customerId: string | null): Promise<Order> => {
    const response = await apiClient.patch<ApiResponse<Order>>(`/orders/${id}/customer`, { customerId })
    return response.data.data
  },

  setWaiter: async (id: string, waiterId: string | null): Promise<Order> => {
    const response = await apiClient.patch<ApiResponse<Order>>(`/orders/${id}/waiter`, { waiterId })
    return response.data.data
  },

  /** Folds another still-open, unpaid order's items into this one; the source order is cancelled. */
  merge: async (id: string, sourceOrderId: string): Promise<Order> => {
    const response = await apiClient.post<ApiResponse<Order>>(`/orders/${id}/merge`, { sourceOrderId })
    return response.data.data
  },

  /** Reclassifies an order (e.g. dine-in -> takeaway). tableId is required when switching to an order type that requiresTable. */
  setSource: async (id: string, source: Order['source'], tableId?: string): Promise<Order> => {
    const response = await apiClient.patch<ApiResponse<Order>>(`/orders/${id}/source`, { source, tableId })
    return response.data.data
  },

  /**
   * Moves specific items off this order onto another one — an existing open order
   * (`destinationOrderId`), or a fresh order (defaults to this order's own table/type if
   * `tableId`/`source` aren't given). Returns the destination order.
   */
  moveItems: async (
    id: string,
    data: { itemIds: string[]; destinationOrderId?: string; tableId?: string; source?: Order['source'] },
  ): Promise<Order> => {
    const response = await apiClient.post<ApiResponse<Order>>(`/orders/${id}/move-items`, data)
    return response.data.data
  },

  cancel: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(`/orders/${id}/cancel`)
    return response.data.data
  },

  /** Marks an order ready for payment without collecting it — for roles that can't accept payment (e.g. waiters). */
  markAwaitingPayment: async (id: string): Promise<Order> => {
    const response = await apiClient.post<ApiResponse<Order>>(`/orders/${id}/mark-awaiting-payment`)
    return response.data.data
  },

  /** Applies (value > 0) or clears (value 0) a pre-tax discount. Requires a reason for audit. */
  applyDiscount: async (
    id: string,
    data: { discountType: 'PERCENTAGE' | 'FIXED'; value: number; reason: string },
  ): Promise<Order> => {
    const response = await apiClient.patch<ApiResponse<Order>>(`/orders/${id}/discount`, data)
    return response.data.data
  },

  /**
   * Closes an order against an immediate (non-PAYSTACK) payment method — those queue offline the
   * same way addItems does. PAYSTACK never queues (it needs a live checkout redirect); calling it
   * against a `local:` id or while offline throws immediately with a clear message rather than
   * silently failing later.
   */
  close: async (id: string, data: CloseOrderData): Promise<Order | QueuedResult> => {
    if (data.paymentMethod === 'PAYSTACK') {
      if (id.startsWith(LOCAL_ORDER_PREFIX)) {
        throw new Error('This order hasn’t synced yet — Paystack checkout needs a connection first');
      }
      const response = await apiClient.post<ApiResponse<Order>>(`/orders/${id}/close`, data)
      return response.data.data
    }

    if (id.startsWith(LOCAL_ORDER_PREFIX) || !navigator.onLine) {
      await enqueueCloseOrder(id, data)
      return { __offlinePending: true }
    }
    try {
      const clientRequestId = crypto.randomUUID()
      const response = await apiClient.post<ApiResponse<Order>>(`/orders/${id}/close`, { ...data, clientRequestId })
      return response.data.data
    } catch (err: unknown) {
      if (isNoResponseError(err)) {
        await enqueueCloseOrder(id, data)
        return { __offlinePending: true }
      }
      throw err
    }
  },

  paystackCheckout: async (
    id: string,
    data: CloseOrderData,
  ): Promise<{ paymentUrl: string; reference: string; accessCode?: string }> => {
    const response = await apiClient.post<ApiResponse<{ paymentUrl: string; reference: string; accessCode?: string }>>(
      `/orders/${id}/paystack-checkout`,
      data,
    )
    return response.data.data
  },

  receiptUrl: (id: string): string => {
    const base = apiClient.defaults.baseURL || ''
    return `${base}/orders/${id}/receipt`
  },

  downloadReceipt: async (id: string): Promise<Blob> => {
    const response = await apiClient.get(`/orders/${id}/receipt`, { responseType: 'blob' })
    return response.data
  },

  /** Same data the PDF receipt is built from, as JSON — used to render the print-only bill/receipt. */
  getReceiptData: async (id: string): Promise<ReceiptData> => {
    const response = await apiClient.get<ApiResponse<ReceiptData>>(`/orders/${id}/receipt-data`)
    return response.data.data
  },
}

export interface ReceiptData {
  receiptNumber: string
  createdAt: string
  closedAt: string | null
  source: string
  table: { name: string } | null
  waiter: { firstName: string; lastName: string } | null
  items: Array<{ name: string; quantity: number; unitPrice: number; amount: number; notes?: string | null }>
  subtotal: number
  taxAmount: number
  total: number
  amountPaid: number
  discountType: 'PERCENTAGE' | 'FIXED'
  discountPercent: number
  discountAmount: number
  vatApplied: boolean
  vatRate: number
  vatAmount: number
  entertainmentTaxApplied: boolean
  entertainmentTaxRate: number
  entertainmentTaxAmount: number
  serviceChargeApplied: boolean
  serviceChargeRate: number
  serviceChargeAmount: number
  payments: Array<{ amount: number; paymentMethod: string; paymentDate: string }>
  organization: { name: string; email?: string | null; phone?: string | null; address?: string | null; currency: string }
}

export { flushOfflineQueue }
