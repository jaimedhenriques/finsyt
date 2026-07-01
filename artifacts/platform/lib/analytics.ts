export function track(event: string, props: Record<string, any> = {}) {
  if (typeof window === 'undefined') return
  try {
    const payload = { event, props, ts: Date.now(), path: window.location.pathname }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[analytics]', event, props)
    }
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
    if (navigator.sendBeacon) navigator.sendBeacon(base + '/api/analytics', blob)
  } catch {}
}
