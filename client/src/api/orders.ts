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
  source?: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'THIRD_PARTY'
  items: CreateOrderItemData[]
  notes?: string
}

export interface CloseOrderData {
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'PAYSTACK' | 'OTHER'
  amount?: number
  customerEmail?: string
  reference?: string
  notes?: string
}

export interface OrderFilter {
  page?: number
  limit?: number
  status?: OrderStatus
  tableId?: string
  customerId?: string
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
    const response = await apiClient.get<ApiResponse<PaginatedResponse<Order>>>('/orders', { params: filter })
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

  setCustomer: async (id: string, customerId: string | null): Promise<Order> => {
    const response = await apiClient.patch<ApiResponse<Order>>(`/orders/${id}/customer`, { customerId })
    return response.data.data
  },

  cancel: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(`/orders/${id}/cancel`)
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
}

export { flushOfflineQueue }
