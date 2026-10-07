import apiClient from './client'
import type { ApiResponse } from '@/types'

export interface MoniepointTerminal {
  id: string
  serial: string
  label: string
  isActive: boolean
}

export interface MoniepointStatus {
  isSetup: boolean
  terminals: MoniepointTerminal[]
  isWebhookSubscribed: boolean
  hasWebhookSecret: boolean
}

export interface MoniepointSetupData {
  clientId: string
  clientSecret: string
  businessId?: string
}

export interface MoniepointPushResult {
  merchantReference: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  amount: number
}

export interface MoniepointTransaction {
  id: string
  orderId: string
  merchantReference: string
  terminalSerial: string
  amount: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  failureReason: string | null
  completedAt: string | null
}

export interface MoniepointUnreconciledTransferSenderMetadata {
  customerName?: string
  customerAccountNumber?: string
  customerBank?: string
  narration?: string
}

export interface MoniepointUnreconciledTransfer {
  id: string
  amount: string
  transactionReference: string | null
  senderMetadata: MoniepointUnreconciledTransferSenderMetadata | null
  status: 'PENDING_REVIEW' | 'RESOLVED' | 'IGNORED'
  resolutionType?: 'ORDER' | 'WALLET_TOPUP' | 'OTHER' | null
  matchReason: string
  resolvedOrder?: { id: string; source: string; total: number; table?: { name: string } | null } | null
  resolvedCustomer?: { id: string; name: string } | null
  resolvedBy?: { id: string; firstName: string; lastName: string } | null
  resolutionNotes: string | null
  createdAt: string
}

export const moniepointApi = {
  getStatus: async (): Promise<MoniepointStatus> => {
    const response = await apiClient.get<ApiResponse<MoniepointStatus>>('/organizations/moniepoint-status')
    return response.data.data
  },
  pushPayment: async (orderId: string, terminalId: string, amount?: number): Promise<MoniepointPushResult> => {
    const response = await apiClient.post<ApiResponse<MoniepointPushResult>>(`/orders/${orderId}/moniepoint-push`, {
      terminalId,
      amount,
    })
    return response.data.data
  },
  getTransaction: async (merchantReference: string): Promise<MoniepointTransaction> => {
    const response = await apiClient.get<ApiResponse<MoniepointTransaction>>(`/moniepoint-transactions/${merchantReference}`)
    return response.data.data
  },
  setup: async (data: MoniepointSetupData) => {
    const response = await apiClient.post<ApiResponse<{ success: boolean }>>('/organizations/setup-moniepoint', data)
    return response.data.data
  },
  disconnect: async () => {
    const response = await apiClient.delete<ApiResponse<{ success: boolean }>>('/organizations/moniepoint')
    return response.data.data
  },
  listTerminals: async (): Promise<MoniepointTerminal[]> => {
    const response = await apiClient.get<ApiResponse<MoniepointTerminal[]>>('/organizations/moniepoint-terminals')
    return response.data.data
  },
  createTerminal: async (serial: string, label: string): Promise<MoniepointTerminal> => {
    const response = await apiClient.post<ApiResponse<MoniepointTerminal>>('/organizations/moniepoint-terminals', { serial, label })
    return response.data.data
  },
  updateTerminal: async (id: string, data: Partial<Pick<MoniepointTerminal, 'serial' | 'label' | 'isActive'>>): Promise<MoniepointTerminal> => {
    const response = await apiClient.patch<ApiResponse<MoniepointTerminal>>(`/organizations/moniepoint-terminals/${id}`, data)
    return response.data.data
  },
  removeTerminal: async (id: string) => {
    const response = await apiClient.delete<ApiResponse<{ success: boolean }>>(`/organizations/moniepoint-terminals/${id}`)
    return response.data.data
  },
  subscribeWebhook: async () => {
    const response = await apiClient.post<ApiResponse<{ id: string; endpointUrl: string; status: string }>>(
      '/organizations/moniepoint-subscribe-webhook',
    )
    return response.data.data
  },
  setWebhookSecret: async (webhookSecret: string) => {
    const response = await apiClient.post<ApiResponse<{ success: boolean }>>('/organizations/moniepoint-webhook-secret', {
      webhookSecret,
    })
    return response.data.data
  },
  listUnreconciledTransfers: async (status?: 'PENDING_REVIEW' | 'RESOLVED' | 'IGNORED'): Promise<MoniepointUnreconciledTransfer[]> => {
    const response = await apiClient.get<ApiResponse<MoniepointUnreconciledTransfer[]>>('/moniepoint-unreconciled-transfers', {
      params: status ? { status } : undefined,
    })
    return response.data.data
  },
  assignUnreconciledTransfer: async (id: string, orderId: string) => {
    const response = await apiClient.post<ApiResponse<MoniepointUnreconciledTransfer>>(
      `/moniepoint-unreconciled-transfers/${id}/assign`,
      { orderId },
    )
    return response.data.data
  },
  resolveUnreconciledTransferToWallet: async (id: string, customerId: string, notes?: string) => {
    const response = await apiClient.post<ApiResponse<MoniepointUnreconciledTransfer>>(
      `/moniepoint-unreconciled-transfers/${id}/resolve-wallet`,
      { customerId, notes },
    )
    return response.data.data
  },
  ignoreUnreconciledTransfer: async (id: string, notes?: string) => {
    const response = await apiClient.post<ApiResponse<MoniepointUnreconciledTransfer>>(
      `/moniepoint-unreconciled-transfers/${id}/ignore`,
      { notes },
    )
    return response.data.data
  },
}
