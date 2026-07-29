/**
 * Offline-first queue for POS order mutations: CREATE_ORDER, ADD_ITEMS, CLOSE_ORDER.
 *
 * Idempotency is now server-enforced, not heuristic: every queued action carries a
 * `clientRequestId` (UUID) sent to the API. The backend stores it in an IdempotencyKey table
 * keyed on (organizationId, action, key) and returns the original result on a retried request
 * instead of re-executing — see api/src/modules/orders/orders.service.ts `runIdempotent`. That
 * closes the gap the previous version of this file flagged as a known follow-up (heuristic
 * "does a plausible matching order already exist" reconciliation). We reuse the same
 * clientRequestId across retries of the same queued action rather than generating a new one each
 * attempt — that's what makes the guarantee hold.
 *
 * Dependency chaining: an order taken offline only has a *local* id until its CREATE_ORDER action
 * reaches the server. If the waiter adds items or closes that same order before reconnecting,
 * those actions are queued referencing the local id (`local:<uuid>`), not a real server id. The
 * queue is processed strictly in enqueue order (ascending row id), so a CREATE_ORDER action is
 * always attempted before any action that depends on it — we don't need a general dependency
 * graph, just "does this ref resolve yet." An `order-id-map` store records local-id → server-id
 * once the create syncs, persisted across reloads (not just in-memory), so a dependent action
 * queued in one browser session resolves correctly even if the app is closed and reopened before
 * the parent create finishes syncing.
 *
 * Scope cuts (deliberate, not oversights):
 * - CLOSE_ORDER is never queued for PAYSTACK — that path requires a live checkout redirect and
 *   has its own reference-based idempotency already.
 * - Order-item status updates (kitchen flow) stay online-only. They're frequent, low-stakes,
 *   already-synced-order mutations where the kitchen display is usually near the router; queuing
 *   them adds complexity for a use case that isn't the offline-critical path (taking/closing
 *   orders is).
 */

import apiClient from '@/api/client'
import type { CreateOrderData, CreateOrderItemData, CloseOrderData } from '@/api/orders'

const DB_NAME = 'kulode-pos-offline'
const DB_VERSION = 2
const ACTIONS_STORE = 'pending-actions'
const ORDER_MAP_STORE = 'order-id-map'

export type QueuedActionType = 'CREATE_ORDER' | 'ADD_ITEMS' | 'CLOSE_ORDER'
export type QueuedActionStatus = 'pending' | 'failed' | 'blocked'

interface BaseQueuedAction {
  id: number
  clientRequestId: string
  createdAt: string
  attempted: boolean
  status: QueuedActionStatus
  errorMessage?: string
}

export interface CreateOrderAction extends BaseQueuedAction {
  type: 'CREATE_ORDER'
  localOrderId: string
  payload: CreateOrderData
}

export interface AddItemsAction extends BaseQueuedAction {
  type: 'ADD_ITEMS'
  orderRef: string
  payload: { items: CreateOrderItemData[] }
}

export interface CloseOrderAction extends BaseQueuedAction {
  type: 'CLOSE_ORDER'
  orderRef: string
  payload: CloseOrderData
}

export type QueuedAction = CreateOrderAction | AddItemsAction | CloseOrderAction

export const LOCAL_ORDER_PREFIX = 'local:'

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
      if (!db.objectStoreNames.contains(ACTIONS_STORE)) {
        db.createObjectStore(ACTIONS_STORE, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(ORDER_MAP_STORE)) {
        db.createObjectStore(ORDER_MAP_STORE, { keyPath: 'localOrderId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    const request = fn(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function newClientRequestId(): string {
  return crypto.randomUUID()
}

// ─── Order id map (local id → real server id, once known) ──────────────────

interface OrderIdMapEntry {
  localOrderId: string
  serverOrderId?: string
}

async function getMapEntry(localOrderId: string): Promise<OrderIdMapEntry | undefined> {
  return withStore(ORDER_MAP_STORE, 'readonly', (store) => store.get(localOrderId))
}

async function setMapEntry(entry: OrderIdMapEntry) {
  await withStore(ORDER_MAP_STORE, 'readwrite', (store) => store.put(entry))
}

/** Resolves an order ref to a real server id, or null if it's a local id not yet synced. */
async function resolveOrderRef(orderRef: string): Promise<string | null> {
  if (!orderRef.startsWith(LOCAL_ORDER_PREFIX)) return orderRef
  const entry = await getMapEntry(orderRef)
  return entry?.serverOrderId ?? null
}

// ─── Enqueue ─────────────────────────────────────────────────────────────────

export async function enqueueCreateOrder(payload: CreateOrderData): Promise<{ localOrderId: string }> {
  const localOrderId = `${LOCAL_ORDER_PREFIX}${crypto.randomUUID()}`
  const entry: Omit<CreateOrderAction, 'id'> = {
    type: 'CREATE_ORDER',
    clientRequestId: newClientRequestId(),
    localOrderId,
    payload,
    createdAt: new Date().toISOString(),
    attempted: false,
    status: 'pending',
  }
  await setMapEntry({ localOrderId })
  await withStore(ACTIONS_STORE, 'readwrite', (store) => store.add(entry) as IDBRequest<number>)
  notify()
  return { localOrderId }
}

export async function enqueueAddItems(orderRef: string, items: CreateOrderItemData[]): Promise<void> {
  const entry: Omit<AddItemsAction, 'id'> = {
    type: 'ADD_ITEMS',
    clientRequestId: newClientRequestId(),
    orderRef,
    payload: { items },
    createdAt: new Date().toISOString(),
    attempted: false,
    status: 'pending',
  }
  await withStore(ACTIONS_STORE, 'readwrite', (store) => store.add(entry) as IDBRequest<number>)
  notify()
}

export async function enqueueCloseOrder(orderRef: string, payload: CloseOrderData): Promise<void> {
  if (payload.paymentMethod === 'PAYSTACK') {
    throw new Error('PAYSTACK closes cannot be queued offline — they require a live checkout redirect')
  }
  const entry: Omit<CloseOrderAction, 'id'> = {
    type: 'CLOSE_ORDER',
    clientRequestId: newClientRequestId(),
    orderRef,
    payload,
    createdAt: new Date().toISOString(),
    attempted: false,
    status: 'pending',
  }
  await withStore(ACTIONS_STORE, 'readwrite', (store) => store.add(entry) as IDBRequest<number>)
  notify()
}

// ─── Read / mutate queue rows ────────────────────────────────────────────────

export async function getQueue(): Promise<QueuedAction[]> {
  try {
    const rows = await withStore(ACTIONS_STORE, 'readonly', (store) => store.getAll() as IDBRequest<QueuedAction[]>)
    return rows.sort((a, b) => a.id - b.id)
  } catch {
    return []
  }
}

/** Everything queued (in any state) referencing this local order — used to render a pending order's cart before it has synced. */
export async function getQueuedActionsForLocalOrder(localOrderId: string): Promise<QueuedAction[]> {
  const all = await getQueue()
  return all.filter(
    (a) =>
      (a.type === 'CREATE_ORDER' && a.localOrderId === localOrderId) ||
      (a.type !== 'CREATE_ORDER' && a.orderRef === localOrderId),
  )
}

async function removeFromQueue(id: number) {
  await withStore(ACTIONS_STORE, 'readwrite', (store) => store.delete(id))
  notify()
}

async function putAction(entry: QueuedAction) {
  await withStore(ACTIONS_STORE, 'readwrite', (store) => store.put(entry))
  notify()
}

/**
 * Discards a failed action. If it's a CREATE_ORDER, cascades to fail any dependents — their
 * dependency no longer exists, so leaving them queued would mean they retry forever against an
 * order that will never resolve.
 */
export async function discardFailedAction(id: number) {
  const queue = await getQueue()
  const entry = queue.find((a) => a.id === id)
  if (!entry) return

  if (entry.type === 'CREATE_ORDER') {
    const dependents = queue.filter((a) => a.type !== 'CREATE_ORDER' && a.orderRef === entry.localOrderId)
    for (const dep of dependents) {
      if (dep.status === 'pending' || dep.status === 'blocked') {
        await putAction({ ...dep, status: 'failed', errorMessage: 'The order this depended on failed to sync' })
      } else {
        await removeFromQueue(dep.id)
      }
    }
  }

  await removeFromQueue(id)
}

export async function retryFailedAction(id: number) {
  const queue = await getQueue()
  const entry = queue.find((a) => a.id === id)
  if (!entry) return
  await putAction({ ...entry, status: 'pending', errorMessage: undefined })
  void flushOfflineQueue()
}

// ─── Flush ───────────────────────────────────────────────────────────────────

let flushing = false

export async function flushOfflineQueue(): Promise<void> {
  if (flushing) return
  if (!navigator.onLine) return
  flushing = true
  try {
    const queue = await getQueue()

    for (const entry of queue) {
      if (entry.status === 'failed') continue

      if (entry.type === 'CREATE_ORDER') {
        const result = await sendCreateOrder(entry)
        if (result === 'network-error') break // stop this pass; connection dropped again
        continue
      }

      // ADD_ITEMS / CLOSE_ORDER — resolve dependency first.
      const resolved = await resolveOrderRef(entry.orderRef)
      if (resolved === null) {
        // Dependency (a CREATE_ORDER earlier in this same queue) hasn't synced yet — either it
        // just failed (handled via cascade in discardFailedAction) or is still ahead of us and
        // will resolve on a later pass. Leave this one and move on.
        if (entry.status !== 'blocked') await putAction({ ...entry, status: 'blocked' })
        continue
      }
      if (entry.status === 'blocked') {
        await putAction({ ...entry, status: 'pending' })
      }

      const result =
        entry.type === 'ADD_ITEMS' ? await sendAddItems(entry, resolved) : await sendCloseOrder(entry, resolved)
      if (result === 'network-error') break
    }
  } finally {
    flushing = false
  }
}

type SendResult = 'ok' | 'failed' | 'network-error'

function extractErrorMessage(err: unknown): { hasResponse: boolean; message?: string } {
  const axiosErr = err as { response?: { data?: { message?: string } } }
  if (!axiosErr.response) return { hasResponse: false }
  return { hasResponse: true, message: axiosErr.response.data?.message }
}

async function sendCreateOrder(entry: CreateOrderAction): Promise<SendResult> {
  await putAction({ ...entry, attempted: true })
  try {
    const response = await apiClient.post<{ data: { id: string } }>('/orders', {
      ...entry.payload,
      clientRequestId: entry.clientRequestId,
    })
    await setMapEntry({ localOrderId: entry.localOrderId, serverOrderId: response.data.data.id })
    await removeFromQueue(entry.id)
    return 'ok'
  } catch (err) {
    const { hasResponse, message } = extractErrorMessage(err)
    if (!hasResponse) return 'network-error'
    await putAction({ ...entry, status: 'failed', errorMessage: message || 'Order was rejected by the server' })
    return 'failed'
  }
}

async function sendAddItems(entry: AddItemsAction, serverOrderId: string): Promise<SendResult> {
  await putAction({ ...entry, attempted: true })
  try {
    await apiClient.post(`/orders/${serverOrderId}/items`, {
      items: entry.payload.items,
      clientRequestId: entry.clientRequestId,
    })
    await removeFromQueue(entry.id)
    return 'ok'
  } catch (err) {
    const { hasResponse, message } = extractErrorMessage(err)
    if (!hasResponse) return 'network-error'
    await putAction({ ...entry, status: 'failed', errorMessage: message || 'Items were rejected by the server' })
    return 'failed'
  }
}

async function sendCloseOrder(entry: CloseOrderAction, serverOrderId: string): Promise<SendResult> {
  await putAction({ ...entry, attempted: true })
  try {
    await apiClient.post(`/orders/${serverOrderId}/close`, {
      ...entry.payload,
      clientRequestId: entry.clientRequestId,
    })
    await removeFromQueue(entry.id)
    return 'ok'
  } catch (err) {
    const { hasResponse, message } = extractErrorMessage(err)
    if (!hasResponse) return 'network-error'
    await putAction({ ...entry, status: 'failed', errorMessage: message || 'Close was rejected by the server' })
    return 'failed'
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
