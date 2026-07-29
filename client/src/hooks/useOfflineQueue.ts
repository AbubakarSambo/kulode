import { useEffect, useState } from 'react'
import { getQueue, subscribeOfflineQueue, startOfflineQueueSync, type QueuedAction } from '@/lib/offlineOrderQueue'

export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedAction[]>([])

  useEffect(() => {
    startOfflineQueueSync()
    const refresh = () => void getQueue().then(setQueue)
    refresh()
    return subscribeOfflineQueue(refresh)
  }, [])

  return {
    pending: queue.filter((q) => q.status === 'pending' || q.status === 'blocked'),
    failed: queue.filter((q) => q.status === 'failed'),
  }
}
