'use client'
import { useEffect } from 'react'

// Headless component that drives the live-highlights engine from the
// browser. Polling beats SSE here because the rest of the live surface
// (transcripts, live-events) is also pulled, and the tick endpoint is
// idempotent — pin write is gated on the per-call cursor server-side.
//
// Mounted once inside `AppShell`. We tick on mount, then every 30s while
// the tab is visible. We back off to 2 minutes when the tab is hidden so
// we do not burn DB writes for a backgrounded tab; the next foreground
// tick catches up since the engine cursor is stored server-side.

const ACTIVE_INTERVAL_MS = 30_000
const HIDDEN_INTERVAL_MS = 120_000
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

export default function LiveHighlightsTicker() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    async function tick() {
      try {
        await fetch(`${BASE}/api/live-highlights/tick`, {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
        })
      } catch {
        /* swallow — next tick will retry */
      }
      if (cancelled) return
      const delay = document.hidden ? HIDDEN_INTERVAL_MS : ACTIVE_INTERVAL_MS
      timer = setTimeout(tick, delay)
    }

    function onVisibility() {
      if (!document.hidden && !cancelled) {
        if (timer) { clearTimeout(timer); timer = null }
        tick()
      }
    }

    tick()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return null
}
