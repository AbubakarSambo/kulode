import { lazy, type ComponentType } from 'react'

// Shared key with main.tsx's `vite:preloadError` listener — either failure mode (a chunk fetch
// outright failing, or fetching successfully but missing the expected export, handled here)
// should still only trigger one auto-reload per session, not one from each mechanism.
const PRELOAD_RELOAD_GUARD = 'vite-preload-reloaded'

/**
 * Wraps the `lazy(() => import(...).then((m) => ({ default: m.XxxPage })))` pattern used
 * throughout App.tsx so that a chunk which loaded successfully but doesn't actually have the
 * expected export — a symptom of a stale/mismatched build after a deploy, seen in production as
 * errors like "Element type is invalid... got: undefined" or "Cannot read properties of
 * undefined (reading 'XxxPage')" — triggers the same single auto-reload as an outright failed
 * fetch (`vite:preloadError`), instead of crashing into the generic ErrorBoundary.
 */
export function lazyPage<K extends string, M extends Record<K, ComponentType<any>>>(
  importer: () => Promise<M>,
  key: K,
) {
  return lazy(async () => {
    const mod = await importer()
    const Component = mod?.[key]
    if (!Component) {
      if (!sessionStorage.getItem(PRELOAD_RELOAD_GUARD)) {
        sessionStorage.setItem(PRELOAD_RELOAD_GUARD, '1')
        window.location.reload()
        // Never resolves — the reload takes over before this would matter.
        return new Promise<{ default: ComponentType<any> }>(() => {})
      }
      // Already tried a reload this session and it's still broken — surface a clear error
      // instead of silently rendering nothing.
      throw new Error(`Failed to load page component "${key}" — chunk loaded but export missing`)
    }
    return { default: Component }
  })
}
