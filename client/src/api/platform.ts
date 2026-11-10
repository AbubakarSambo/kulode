import apiClient from './client'
import type {
  PlatformDashboard,
  PlatformPosDashboard,
  ApiResponse,
  PlatformOrganizationsResponse,
  PlatformOrganizationDetails,
  PlatformOrganization,
  PendingVendorPayout,
  OrgModule,
  PosMode,
  PlatformUserLookup,
  GrantedOrgAccess,
  UserRole,
  AuthResponse,
  GoLivePreview,
  GoLiveSummary,
} from '@/types'

export interface PrintDiagnostics {
  organization: { id: string; name: string }
  agent: {
    hasToken: boolean
    lastSeenAt: string | null
    online: boolean
    /** Null for agents older than 1.3.0, which don't say. */
    version: string | null
    hostname: string | null
  }
  discovery: {
    scanning: boolean
    scannedAt: string | null
    devices: Array<{ ipAddress: string; port: number; macAddress: string | null; printerId: string | null; printerName: string | null }>
  }
  printers: Array<{
    id: string
    name: string
    station: string
    connectionType: 'NETWORK' | 'USB' | 'BLUETOOTH'
    ipAddress: string | null
    port: number | null
    devicePath: string | null
    macAddress: string | null
    isActive: boolean
    routes: string[]
    lastPrintedAt: string | null
  }>
  jobs: Array<{
    id: string
    orderId: string | null
    printerId: string
    printerName: string
    type: string
    tableName: string | null
    status: 'PENDING' | 'DISPATCHED' | 'SENT' | 'FAILED'
    error: string | null
    attempts: number
    createdAt: string
    printedAt: string | null
  }>
  logs: Array<{ id: string; loggedAt: string; message: string }>
}

export const platformApi = {
  // Printer support — see PrinterDiagnosticsModal.
  getPrintDiagnostics: async (organizationId: string): Promise<PrintDiagnostics> => {
    const response = await apiClient.get<ApiResponse<PrintDiagnostics>>(`/platform/organizations/${organizationId}/printing`)
    return response.data.data
  },
  requestPrinterScan: async (organizationId: string): Promise<void> => {
    await apiClient.post(`/platform/organizations/${organizationId}/printing/scan`)
  },
  testPrint: async (organizationId: string, printerId: string): Promise<{ jobId: string }> => {
    const response = await apiClient.post<ApiResponse<{ jobId: string }>>(
      `/platform/organizations/${organizationId}/printing/printers/${printerId}/test-print`,
    )
    return response.data.data
  },
  getPrintJob: async (organizationId: string, jobId: string): Promise<{ id: string; status: string; error: string | null }> => {
    const response = await apiClient.get<ApiResponse<{ id: string; status: string; error: string | null }>>(
      `/platform/organizations/${organizationId}/printing/jobs/${jobId}`,
    )
    return response.data.data
  },

  // Read-only "View as Super Admin" — see api/src/modules/auth/impersonation.controller.ts
  startImpersonation: async (organizationId: string, reason?: string): Promise<AuthResponse> => {
    const response = await apiClient.post<ApiResponse<AuthResponse>>('/impersonation/start', { organizationId, reason })
    return response.data.data
  },

  exitImpersonation: async (): Promise<void> => {
    await apiClient.post('/impersonation/exit')
  },

  getDashboard: async (startDate?: string, endDate?: string): Promise<PlatformDashboard> => {
    const response = await apiClient.get<ApiResponse<PlatformDashboard>>('/platform/dashboard', {
      params: { startDate, endDate }
    })
    return response.data.data
  },

  getPosDashboard: async (startDate?: string, endDate?: string): Promise<PlatformPosDashboard> => {
    const response = await apiClient.get<ApiResponse<PlatformPosDashboard>>('/platform/pos-dashboard', {
      params: { startDate, endDate },
    })
    return response.data.data
  },

  getOrganizations: async (params?: {
    search?: string
    planTier?: string
    subscriptionStatus?: string
    isGrandfathered?: boolean
    page?: number
    limit?: number
  }): Promise<PlatformOrganizationsResponse> => {
    const response = await apiClient.get<ApiResponse<PlatformOrganizationsResponse>>('/platform/organizations', {
      params,
    })
    return response.data.data
  },

  getOrganizationDetails: async (id: string): Promise<PlatformOrganizationDetails> => {
    const response = await apiClient.get<ApiResponse<PlatformOrganizationDetails>>(`/platform/organizations/${id}`)
    return response.data.data
  },

  updateOrganization: async (
    id: string,
    data: {
      planTier?: string
      subscriptionStatus?: string
      isGrandfathered?: boolean
      platformFeePercent?: number
      enabledModules?: OrgModule
      isTestAccount?: boolean
      isAccountingFeedEnabled?: boolean
      posMode?: PosMode
    }
  ): Promise<PlatformOrganization> => {
    const response = await apiClient.patch<ApiResponse<PlatformOrganization>>(`/platform/organizations/${id}`, data)
    return response.data.data
  },

  extendTrial: async (id: string, days: number): Promise<PlatformOrganization> => {
    const response = await apiClient.patch<ApiResponse<PlatformOrganization>>(`/platform/organizations/${id}/trial`, { days })
    return response.data.data
  },

  /** Counts of the pre-launch test activity that goLive would delete. */
  previewGoLive: async (id: string): Promise<GoLivePreview> => {
    const response = await apiClient.get<ApiResponse<GoLivePreview>>(`/platform/organizations/${id}/go-live/preview`)
    return response.data.data
  },

  /** Deletes the org's pre-launch test activity, keeping its setup. One-shot per org. */
  goLive: async (
    id: string,
    data: { confirmName: string; deleteCustomers: boolean },
  ): Promise<GoLiveSummary & { wentLiveAt: string }> => {
    const response = await apiClient.post<ApiResponse<GoLiveSummary & { wentLiveAt: string }>>(
      `/platform/organizations/${id}/go-live`,
      data,
    )
    return response.data.data
  },

  getPendingVendorPayouts: async (): Promise<PendingVendorPayout[]> => {
    const response = await apiClient.get<ApiResponse<PendingVendorPayout[]>>('/platform/vendor-payouts/pending')
    return response.data.data
  },

  activateVendorPayout: async (vendorId: string): Promise<PendingVendorPayout> => {
    const response = await apiClient.patch<ApiResponse<PendingVendorPayout>>(`/platform/vendor-payouts/${vendorId}/activate`)
    return response.data.data
  },

  findUserByEmail: async (email: string): Promise<PlatformUserLookup> => {
    const response = await apiClient.get<ApiResponse<PlatformUserLookup>>('/platform/users/by-email', {
      params: { email },
    })
    return response.data.data
  },

  /** Replaces the roles a user holds in one org — their primary org included. */
  updateMembershipRoles: async (userId: string, organizationId: string, roles: UserRole[]): Promise<GrantedOrgAccess> => {
    const response = await apiClient.patch<ApiResponse<GrantedOrgAccess>>(
      `/platform/users/${userId}/organizations/${organizationId}`,
      { roles },
    )
    return response.data.data
  },

  grantOrganizationAccess: async (
    userId: string,
    organizationId: string,
    roles?: UserRole[],
  ): Promise<GrantedOrgAccess> => {
    const response = await apiClient.post<ApiResponse<GrantedOrgAccess>>(
      `/platform/users/${userId}/organizations`,
      { organizationId, roles },
    )
    return response.data.data
  },
}

