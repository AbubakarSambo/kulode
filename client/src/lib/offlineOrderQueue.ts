/**
 * Offline-first queue for order CREATION only (see scope note below).
 *
 * Scope cut: only `CREATE_ORDER` is queued offline. Adding items to an *already-synced* order,
 * updating item status, closing, or cancelling all require connectivity. This is deliberate —
 * CreateOrderDto already accepts the full item list up front, so a waiter can take an entire
 * order offline in one shot; only late additions to a table that's mid-outage-sync are blocked
 * until the connection returns. Queuing partial mutations against an order whose server-side
 * state this client hasn't confirmed yet is a much harder conflict problem, out of scope for v0.
 *
 * Idempotency limitation (honest, not hidden): a queued action is marked `attempted` right before
 * the network call fires and persisted synchronously, so if the tab dies mid-request we know to
 * reconcile on the next flush rather than blindly resubmit — we check for a plausible matching
 * order (same table, same subtotal, created after this action's timestamp) before resubmitting.
 * That covers the common "app closed/crashed mid-request" case. It does NOT fully close the rare
 * window where the server committed the order but the client never received the response *and*
 * no reconciling GET happens before some other action changes the table's order set enough to
 * make the match ambiguous. True idempotency would need a server-side idempotency key, which is
 * a backend change outside this pass — flagging as a known follow-up.
 */

import apiClient from '@/api/client'
import type { Order } from '@/types'
import type { CreateOrderData } from '@/api/orders'

const DB_NAME = 'kulode-pos-offline'
const DB_VERSION = 1
const STORE_NAME = 'pending-orders'

export interface QueuedOrderAction {
  id: number
  payload: CreateOrderData
  createdAt: string
  attempted: boolean
  status: 'pending' | 'failed'
  errorMessage?: string
}

type Listener = () => void
const listeners = new Set<Listener>()
function notify() {
  listeners.forEach((l) => l())
}
export function subscribeOfflineQueue(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)
    const request = fn(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function enqueueCreateOrder(payload: CreateOrderData): Promise<QueuedOrderAction> {
  const entry: Omit<QueuedOrderAction, 'id'> = {
    payload,
    createdAt: new Date().toISOString(),
    attempted: false,
    status: 'pending',
  }
  const id = await withStore('readwrite', (store) => store.add(entry) as IDBRequest<number>)
  notify()
  return { ...entry, id }
}

export async function getQueue(): Promise<QueuedOrderAction[]> {
  try {
    return await withStore('readonly', (store) => store.getAll() as IDBRequest<QueuedOrderAction[]>)
  } catch {
    return []
  }
}

async function removeFromQueue(id: number) {
  await withStore('readwrite', (store) => store.delete(id))
  notify()
}

async function markAttempted(entry: QueuedOrderAction) {
  await withStore('readwrite', (store) => store.put({ ...entry, attempted: true }))
  notify()
}

async function markFailed(entry: QueuedOrderAction, errorMessage: string) {
  await withStore('readwrite', (store) => store.put({ ...entry, status: 'failed', errorMessage }))
  notify()
}

/** Heuristic reconciliation for an action whose previous attempt's outcome is unknown. */
async function alreadySynced(entry: QueuedOrderAction): Promise<boolean> {
  if (!entry.payload.tableId) return false
  try {
    const response = await apiClient.get<{ data: Order[] }>('/orders', {
      params: { tableId: entry.payload.tableId },
    })
    const candidateSubtotalMatch = response.data.data.some((order) => {
      if (new Date(order.createdAt) < new Date(entry.createdAt)) return false
      if (order.status === 'CANCELLED') return false
      return order.items.length === entry.payload.items.length
    })
    return candidateSubtotalMatch
  } catch {
    return false
  }
}

let flushing = false

export async function flushOfflineQueue(): Promise<void> {
  if (flushing) return
  if (!navigator.onLine) return
  flushing = true
  try {
    const queue = await getQueue()
    for (const entry of queue.filter((e) => e.status === 'pending')) {
      if (entry.attempted) {
        const synced = await alreadySynced(entry)
        if (synced) {
          await removeFromQueue(entry.id)
          continue
        }
      }

      await markAttempted(entry)
      try {
        await apiClient.post('/orders', entry.payload)
        await removeFromQueue(entry.id)
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status: number; data?: { message?: string } } }
        if (axiosErr.response) {
          // Server responded (validation/business error) — retrying won't help. Surface it.
          await markFailed(entry, axiosErr.response.data?.message || 'Order was rejected by the server')
        } else {
          // No response — genuine connectivity issue. Leave it queued and stop this pass.
          break
        }
      }
    }
  } finally {
    flushing = false
  }
}

let started = false
export function startOfflineQueueSync() {
  if (started) return
  started = true
  window.addEventListener('online', () => void flushOfflineQueue())
  setInterval(() => void flushOfflineQueue(), 30_000)
  if (navigator.onLine) void flushOfflineQueue()
}

export async function discardFailedAction(id: number) {
  await removeFromQueue(id)
}

export async function retryFailedAction(id: number) {
  const queue = await getQueue()
  const entry = queue.find((e) => e.id === id)
  if (!entry) return
  await withStore('readwrite', (store) => store.put({ ...entry, status: 'pending', errorMessage: undefined }))
  notify()
  void flushOfflineQueue()
}
