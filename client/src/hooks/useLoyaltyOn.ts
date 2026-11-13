import { useQuery } from '@tanstack/react-query'
import { loyaltyApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { can } from '@/lib/permissions'

/** Is the loyalty programme on for this organization, and may this user enrol people? */
export function useLoyaltyOn() {
  const user = useAuthStore((state) => state.user)
  const allowed = can(user, 'LOYALTY_ENROL')
  const settings = useQuery({ queryKey: ['loyalty-settings'], queryFn: loyaltyApi.settings, enabled: allowed, staleTime: 5 * 60_000 })
  return allowed && settings.data?.enabled === true
}
