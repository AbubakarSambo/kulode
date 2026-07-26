import { WifiOff, AlertTriangle } from 'lucide-react'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { discardFailedAction, retryFailedAction } from '@/lib/offlineOrderQueue'

export function OfflineQueueBanner() {
  const { pending, failed } = useOfflineQueue()

  if (pending.length === 0 && failed.length === 0) return null

  return (
    <div className="flex flex-col gap-1 border-b border-warning/40 bg-warning/20 px-4 py-2 text-xs font-medium text-warning-foreground">
      {pending.length > 0 && (
        <div className="flex items-center gap-2">
          <WifiOff className="h-3.5 w-3.5" />
          <span>{pending.length} order{pending.length > 1 ? 's' : ''} waiting to sync — will send automatically once you're back online.</span>
        </div>
      )}
      {failed.map((entry) => (
        <div key={entry.id} className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="flex-1">Order failed to sync: {entry.errorMessage}</span>
          <button className="underline" onClick={() => retryFailedAction(entry.id)}>Retry</button>
          <button className="underline" onClick={() => discardFailedAction(entry.id)}>Discard</button>
        </div>
      ))}
    </div>
  )
}
