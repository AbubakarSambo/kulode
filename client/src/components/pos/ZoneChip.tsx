import type { Zone } from '@/api'
import { cn } from '@/lib/utils'
import { ZONE_STYLE } from './zoneStyle'

export function ZoneChip({ zone }: { zone: Zone }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', ZONE_STYLE[zone].chip)}>{ZONE_STYLE[zone].label}</span>
}
