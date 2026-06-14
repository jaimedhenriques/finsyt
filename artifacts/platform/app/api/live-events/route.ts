import { NextRequest, NextResponse } from 'next/server'
import { loadLiveEvents, summarise, type LiveEvent } from '@/lib/live-events'

// Public-facing DTO: identical to LiveEvent minus server-internal fields
// (the licensed upstream `audioSourceUrl` lives behind the audio proxy and
// must never reach the browser).
export type PublicLiveEvent = Omit<LiveEvent, 'audioSourceUrl'>

function toPublic(e: LiveEvent): PublicLiveEvent {
  // Destructure to strip audioSourceUrl rather than passing it through and
  // hoping no one consumes it. New server-only fields added to LiveEvent
  // should be added to this strip-list too.
  const { audioSourceUrl: _omit, ...pub } = e
  void _omit
  return pub
}

// Real live-event surface backing the calendar's "Live now" / "Coming up" /
// "Just ended" lanes, the company workspace "Listen live" affordance, and the
// /app/live/[id] live event page.
//
// Replaces the previous deterministic mock — we now derive the list from the
// FMP earnings calendar (today ± 36h, confirmed entries only), enriched with
// sector/country profiles, plus a `LIVE_EVENTS_OVERLAY_JSON` overlay for
// non-earnings events (capital markets days, investor conferences) and for
// licensed audio overrides.
//
// Backwards compatibility: the legacy shape (`live[]`, `activity[]`) is
// preserved because LiveNowStrip / ActivityFeed already shipped against it.

export async function GET(req: NextRequest) {
  const symbolFilter = req.nextUrl.searchParams.get('symbol')?.toUpperCase() || null
  const typeFilter   = req.nextUrl.searchParams.get('type')?.toLowerCase() || null

  let payload
  try {
    payload = await loadLiveEvents()
  } catch (err) {
    return NextResponse.json({
      error: 'Failed to load live events',
      detail: (err as Error).message,
      live: [],
      upcoming: [],
      ended: [],
      activity: [],
      events: [],
      refreshedAt: new Date().toISOString(),
    }, { status: 502 })
  }

  let events: LiveEvent[] = payload.events
  if (symbolFilter) events = events.filter(e => e.symbol === symbolFilter)
  if (typeFilter)   events = events.filter(e => e.type === typeFilter)
  const { live, upcoming, ended } = summarise(events)

  // Activity feed: recent state transitions (live + ended) ordered by recency.
  const activity = [...live, ...ended].slice(0, 12).map(e => ({
    id: e.id,
    symbol: e.symbol,
    name: e.name,
    type: e.status === 'live' ? 'went live' : 'just ended',
    eventType: e.type,
    detail: e.type === 'earnings' && e.quarter
      ? `Q${e.quarter} ${e.year}`
      : e.type === 'cmd' ? 'Capital markets day'
      : 'Investor conference',
    ts: e.status === 'live' ? e.startsAt : e.endsAt,
    ago: Math.max(0, Math.floor((Date.now() - new Date(e.status === 'live' ? e.startsAt : e.endsAt).getTime()) / 60_000)),
  }))

  return NextResponse.json({
    refreshedAt: payload.refreshedAt,
    counts: { live: live.length, upcoming: upcoming.length, ended: ended.length },
    live: live.map(toPublic),
    upcoming: upcoming.map(toPublic),
    ended: ended.map(toPublic),
    events: events.map(toPublic),
    activity,
  })
}
