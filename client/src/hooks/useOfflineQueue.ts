import { useEffect, useState } from 'react'
import { getQueue, subscribeOfflineQueue, startOfflineQueueSync, type QueuedOrderAction } from '@/lib/offlineOrderQueue'

export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedOrderAction[]>([])

  useEffect(() => {
    startOfflineQueueSync()
    const refresh = () => void getQueue().then(setQueue)
    refresh()
    return subscribeOfflineQueue(refresh)
  }, [])

  return {
    pending: queue.filter((q) => q.status === 'pending'),
    failed: queue.filter((q) => q.status === 'failed'),
  }
}
