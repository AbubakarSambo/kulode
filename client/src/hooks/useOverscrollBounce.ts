import { useEffect, useRef } from 'react'

export function useOverscrollBounce<T extends HTMLElement>() {
  const containerRef = useRef<T | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let startX = 0
    let startY = 0
    let isDragging = false
    let startAtTop = false
    let startAtBottom = false

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      isDragging = true

      const scrollTop = el.scrollTop
      const scrollHeight = el.scrollHeight
      const clientHeight = el.clientHeight

      startAtTop = scrollTop <= 0
      startAtBottom = scrollTop + clientHeight >= scrollHeight - 1

      // Reset transition to allow immediate touch tracking without delay
      el.style.transition = 'none'
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return
      const currentX = e.touches[0].clientX
      const currentY = e.touches[0].clientY
      
      const diffX = Math.abs(currentX - startX)
      const diffY = currentY - startY

      // Skip predominantly horizontal swipes to prevent gesture conflicts (e.g. back navigation)
      if (diffX > Math.abs(diffY)) {
        return
      }

      // Only intercept and pull if the touch gesture started at a boundary and moves in the overscroll direction
      if ((startAtTop && diffY > 0) || (startAtBottom && diffY < 0)) {
        // Prevent default native browser pull-to-refresh or general viewport overscroll
        if (e.cancelable) {
          e.preventDefault()
        }

        // Apply exponential resistance for a premium mobile-app elastic feel
        const resistance = 0.35
        const dragAmount = diffY * resistance

        // Cap maximum stretch to look professional and avoid layout breakage
        const maxStretch = 60 // px
        const clampedDrag = Math.min(Math.max(dragAmount, -maxStretch), maxStretch)

        el.style.transform = `translateY(${clampedDrag}px)`
      }
    }

    const handleTouchEnd = () => {
      if (!isDragging) return
      isDragging = false
      startAtTop = false
      startAtBottom = false

      // Elastic spring-back easing animation
      el.style.transition = 'transform 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.25)'
      el.style.transform = 'translateY(0px)'
    }

    // Set passive: false for touchmove to enable e.preventDefault()
    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })
    el.addEventListener('touchcancel', handleTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
      el.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [])

  return containerRef
}
