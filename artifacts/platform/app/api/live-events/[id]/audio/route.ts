import { NextRequest, NextResponse } from 'next/server'
import { findLiveEventById } from '@/lib/live-events'

export const dynamic = 'force-dynamic'

// Server-side audio proxy for live events. The browser's <audio> element
// connects here; we pull the upstream feed and stream it back, forwarding
// `Range` so seeking works on archived MP3s. This avoids CORS issues with
// IR webcasts that don't expose an Access-Control-Allow-Origin header.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const event = await findLiveEventById(id)
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }
  if (!event.audioSourceUrl) {
    return NextResponse.json({
      error: 'Audio source not configured for this event',
      hint: 'Set LIVE_AUDIO_BASE_URL or add `audioUrl` in LIVE_EVENTS_OVERLAY_JSON.',
    }, { status: 404 })
  }

  const range = req.headers.get('range') || undefined
  let upstream: Response
  try {
    upstream = await fetch(event.audioSourceUrl, {
      headers: range ? { range } : undefined,
      // Don't cache audio bodies — they're large and Range-served.
      cache: 'no-store',
    })
  } catch (err) {
    return NextResponse.json({
      error: 'Upstream audio fetch failed',
      detail: (err as Error).message,
    }, { status: 502 })
  }

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json({
      error: `Upstream returned HTTP ${upstream.status}`,
    }, { status: upstream.status })
  }

  const headers = new Headers()
  const passthrough = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'last-modified']
  for (const k of passthrough) {
    const v = upstream.headers.get(k)
    if (v) headers.set(k, v)
  }
  if (!headers.has('content-type')) headers.set('content-type', 'audio/mpeg')
  if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes')
  // Don't let the proxy itself cache aggressively — the upstream's headers win.
  headers.set('x-finsyt-live-audio', '1')

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  })
}
