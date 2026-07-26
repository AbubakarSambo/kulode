import apiClient from './client'
import type { ApiResponse, Order, OrderStatus, OrderItemStatus } from '@/types'
import { enqueueCreateOrder, flushOfflineQueue } from '@/lib/offlineOrderQueue'

export interface CreateOrderItemData {
  menuItemId: string
  quantity: number
  notes?: string
}

export interface CreateOrderData {
  tableId?: string
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
  status?: OrderStatus
  tableId?: string
}

/** Marker so the UI can tell a locally-queued (not-yet-synced) order apart from a real one. */
export interface PendingOrder {
  __offlinePending: true
  tableId?: string
  items: { menuItemId: string; quantity: number; notes?: string }[]
}

export const ordersApi = {
  list: async (filter?: OrderFilter): Promise<Order[]> => {
    const response = await apiClient.get<ApiResponse<Order[]>>('/orders', { params: filter })
    return response.data.data
  },
  get: async (id: string): Promise<Order> => {
    const response = await apiClient.get<ApiResponse<Order>>(`/orders/${id}`)
    return response.data.data
  },

  /**
   * Creates an order. If the network is unreachable, queues it in IndexedDB instead of failing
   * and returns a PendingOrder placeholder — see src/lib/offlineOrderQueue.ts for sync behavior
   * and its documented scope/limitations.
   */
  create: async (data: CreateOrderData): Promise<Order | PendingOrder> => {
    if (!navigator.onLine) {
      await enqueueCreateOrder(data)
      return { __offlinePending: true, tableId: data.tableId, items: data.items }
    }
    try {
      const response = await apiClient.post<ApiResponse<Order>>('/orders', data)
      return response.data.data
    } catch (err: unknown) {
      const axiosErr = err as { response?: unknown }
      if (!axiosErr.response) {
        // No response reached us — treat as offline, queue it rather than losing the order.
        await enqueueCreateOrder(data)
        return { __offlinePending: true, tableId: data.tableId, items: data.items }
      }
      throw err
    }
  },

  addItems: async (id: string, items: CreateOrderItemData[]): Promise<Order> => {
    const response = await apiClient.post<ApiResponse<Order>>(`/orders/${id}/items`, { items })
    return response.data.data
  },

  updateItemStatus: async (orderId: string, itemId: string, status: OrderItemStatus): Promise<Order> => {
    const response = await apiClient.patch<ApiResponse<Order>>(`/orders/${orderId}/items/${itemId}/status`, { status })
    return response.data.data
  },

  cancel: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(`/orders/${id}/cancel`)
    return response.data.data
  },

  close: async (id: string, data: CloseOrderData): Promise<Order> => {
    const response = await apiClient.post<ApiResponse<Order>>(`/orders/${id}/close`, data)
    return response.data.data
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
