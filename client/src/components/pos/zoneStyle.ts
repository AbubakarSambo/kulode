import type { Zone } from '@/api'

export const ZONE_STYLE: Record<Zone, { label: string; chip: string; bar: string }> = {
  RED: { label: 'Red', chip: 'bg-red-100 text-red-700', bar: 'bg-red-500' },
  NORMAL: { label: 'Normal', chip: 'bg-slate-100 text-slate-700', bar: 'bg-slate-400' },
  GREEN: { label: 'Green', chip: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
}
