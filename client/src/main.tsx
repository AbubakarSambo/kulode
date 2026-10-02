import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './lib/posthog'
import './lib/sentry'

// Vite's dynamic import() chunks are content-hashed per build. A tab left open across a deploy
// still holds references to the old hashes — the next lazy route navigation 404s fetching that
// chunk, which otherwise surfaces as a generic ErrorBoundary crash ("Something went wrong")
// instead of the one-line fix it actually needs: a fresh load picks up the current manifest.
// This file re-running at all means the manifest just loaded successfully, so clear any guard
// left over from a prior reload before arming it — a later, unrelated preload failure (e.g. after
// the *next* deploy) still gets its own single auto-reload rather than being silently swallowed.
const PRELOAD_RELOAD_GUARD = 'vite-preload-reloaded'
sessionStorage.removeItem(PRELOAD_RELOAD_GUARD)
window.addEventListener('vite:preloadError', (event) => {
  if (sessionStorage.getItem(PRELOAD_RELOAD_GUARD)) return // already tried once this failure — avoid a reload loop
  sessionStorage.setItem(PRELOAD_RELOAD_GUARD, '1')
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
