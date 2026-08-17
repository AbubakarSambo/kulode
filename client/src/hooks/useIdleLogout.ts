import { useEffect, useRef } from 'react'

const IDLE_TIMEOUT_MS = 3 * 60 * 1000

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel'] as const

/**
 * Bounces a PIN-eligible user (shared POS terminal — waiter/pass/runner/cashier) back to the PIN
 * pad after a few minutes of no interaction, so a walked-away terminal doesn't sit logged in as
 * whoever last used it. Disabled entirely when `enabled` is false — admins/managers on their own
 * device shouldn't get logged out just for reading a report.
 */
export function useIdleLogout(enabled: boolean, onIdle: () => void) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  useEffect(() => {
    if (!enabled) return

    const resetTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => onIdleRef.current(), IDLE_TIMEOUT_MS)
    }

    resetTimer()
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }))

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer))
    }
  }, [enabled])
}
