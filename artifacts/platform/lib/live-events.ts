// Shared registry / resolver for live audio events (earnings calls, capital
// markets days, investor conferences). Backs `/api/live-events` and the
// per-event audio + transcript stream endpoints.
//
// Data sources (waterfall):
//   1. FMP earnings calendar (today-1d → today+2d) for global earnings.
//   2. `LIVE_EVENTS_OVERLAY_JSON` env — manual injection for CMDs / investor
//      conferences and for any earnings whose audio URL we have licensed.
//      Shape:
//        [
//          { id, symbol, name, type, country, sector, startsAt, endsAt,
//            year?, quarter?, audioUrl?, deepLink?, listeners? }
//        ]
//
// Audio URL resolution per event:
//   1. Overlay-provided `audioUrl` wins.
//   2. Earnings calls fall back to `LIVE_AUDIO_BASE_URL` (or
//      `TRANSCRIPT_AUDIO_BASE_URL` for parity with the post-call player) with
//      `{base}/{symbol}_{year}_Q{quarter}.mp3` when year/quarter are known.
//   3. Otherwise no audio source — clients render an "audio unavailable"
//      affordance and still get the transcript handover when alignment lands.

import { fmpFetch } from './data-providers'
import { getCachedAlignment } from './transcript-alignment'

export type LiveEventType = 'earnings' | 'cmd' | 'conference'
export type LiveEventStatus = 'live' | 'upcoming' | 'ended'

export interface LiveEvent {
  id: string
  symbol: string
  name: string
  type: LiveEventType
  country: string                    // ISO-2 (US, UK, DE, FR, JP, NL, …)
  sector?: string
  industry?: string
  /** ISO timestamps (UTC) */
  startsAt: string
  endsAt: string
  status: LiveEventStatus
  year?: number
  quarter?: number
  audioAvailable: boolean
  /** Server-internal upstream URL — never leaked to the browser. */
  audioSourceUrl?: string | null
  /** Stable proxy URL clients use. */
  audioProxyUrl: string
  /** Fully-qualified deep link a user can paste into chat. */
  deepLink: string
  /** True once the post-call alignment job has produced word timings. */
  alignedReady: boolean
  /** Streaming live transcript URL (Server-Sent Events). */
  transcriptStreamUrl: string
  listeners?: number
  source: 'fmp' | 'overlay'
}

interface OverlayEvent {
  id?: string
  symbol: string
  name?: string
  type: LiveEventType
  country?: string
  sector?: string
  industry?: string
  startsAt: string
  endsAt?: string
  durationMin?: number
  year?: number
  quarter?: number
  audioUrl?: string
  listeners?: number
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

function basePath(): string {
  return BASE_PATH
}

function publicOrigin(): string {
  // Prefer the public Replit dev/prod domain when configured, otherwise
  // fall back to the configured `APP_BASE_URL`.
  const dev = process.env.REPLIT_DEV_DOMAIN
  if (dev) return `https://${dev}`
  const explicit = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL
  if (explicit) return explicit.replace(/\/$/, '')
  return ''
}

function pad(n: number): string { return n < 10 ? `0${n}` : String(n) }

/**
 * Convert an Eastern Time `HH:MM` to a UTC `Date` for the given date (UTC).
 * Eastern Time is UTC-5 (EST) or UTC-4 (EDT). We approximate with a fixed
 * UTC-5 because the precise DST rule is awkward without a tz lib and the
 * resulting +/- 1h drift is acceptable for the live-event window heuristics
 * that already span 75 minutes. Overlay events should always specify
 * absolute UTC timestamps if precision matters.
 */
function etOnUtcDate(dateIsoYmd: string, hh: number, mm: number): Date {
  // dateIsoYmd is YYYY-MM-DD in the company's local listing day.
  const [y, m, d] = dateIsoYmd.split('-').map(Number)
  // Treat ET as UTC-5 (EST) — drift during DST is tolerable for the heuristic.
  const dt = new Date(Date.UTC(y, m - 1, d, hh + 5, mm, 0))
  return dt
}

function deriveEarningsWindow(date: string, timing: 'BMO' | 'AMC' | 'DMH'): { startsAt: Date; endsAt: Date } {
  // Conservative windows in Eastern Time:
  //   BMO  ~ 08:00 → 09:15 ET
  //   AMC  ~ 16:30 → 17:45 ET
  //   DMH  ~ 12:00 → 13:15 ET (rare; mid-day for non-US issuers)
  // 75-minute windows are wide enough to absorb ET vs EDT drift while keeping
  // "live now" precise enough to be useful.
  let h = 12, m = 0
  if (timing === 'BMO') { h = 8;  m = 0  }
  else if (timing === 'AMC') { h = 16; m = 30 }
  else { h = 12; m = 0 }
  const startsAt = etOnUtcDate(date, h, m)
  const endsAt   = new Date(startsAt.getTime() + 75 * 60 * 1000)
  return { startsAt, endsAt }
}

function classifyTimingFromFmp(time?: string): 'BMO' | 'AMC' | 'DMH' | 'UNKNOWN' {
  const t = (time || '').toLowerCase().trim()
  if (t === 'bmo' || t.includes('before')) return 'BMO'
  if (t === 'amc' || t.includes('after')) return 'AMC'
  if (t === 'dmh' || t.includes('during') || t.includes('mid')) return 'DMH'
  // FMP /stable/earnings-calendar dropped per-row timing in late 2025. We
  // fall back to a country/suffix heuristic in `inferTimingFromSymbol`.
  return 'UNKNOWN'
}

/**
 * When FMP doesn't tell us BMO/AMC/DMH, infer a *typical* schedule from the
 * exchange suffix:
 *   - No suffix (US: NYSE/NASDAQ)            → AMC  (vast majority of US calls)
 *   - .L / .AS / .DE / .PA / .MI / .MC / .BR → BMO  (European pre-market norm)
 *   - .T / .HK / .KS / .NS / .BO / .SS       → DMH  (Asia mid-session reporting)
 * The 75-minute live window absorbs the inevitable mismatch when an issuer
 * doesn't follow the regional norm. Never invents a window for unknown
 * suffixes.
 */
function inferTimingFromSymbol(rawSymbol: string): 'BMO' | 'AMC' | 'DMH' | 'UNKNOWN' {
  const dot = rawSymbol.indexOf('.')
  if (dot < 0) return 'AMC'
  const suffix = rawSymbol.slice(dot + 1).toUpperCase()
  if (['L', 'AS', 'DE', 'PA', 'MI', 'MC', 'BR', 'VX', 'SW', 'ST', 'HE', 'CO', 'OL'].includes(suffix)) return 'BMO'
  if (['T', 'HK', 'KS', 'KQ', 'NS', 'BO', 'SS', 'SZ', 'TW', 'TWO', 'AX', 'NZ', 'SI', 'JK', 'BK'].includes(suffix)) return 'DMH'
  return 'UNKNOWN'
}

function quarterOf(fiscalDateEnding?: string): number {
  if (!fiscalDateEnding) return 1
  const m = new Date(fiscalDateEnding).getUTCMonth() + 1
  if (m <= 3) return 1
  if (m <= 6) return 2
  if (m <= 9) return 3
  return 4
}

function statusFor(now: Date, startsAt: Date, endsAt: Date): LiveEventStatus {
  if (now >= startsAt && now < endsAt) return 'live'
  if (now < startsAt) return 'upcoming'
  return 'ended'
}

function eventIdFor(type: LiveEventType, symbol: string, startsAt: Date, year?: number, quarter?: number): string {
  if (type === 'earnings' && year && quarter) {
    return `earnings_${symbol}_${year}_Q${quarter}`
  }
  const ymd = startsAt.toISOString().slice(0, 10)
  const hm  = `${pad(startsAt.getUTCHours())}${pad(startsAt.getUTCMinutes())}`
  return `${type}_${symbol}_${ymd}_${hm}`
}

function audioUrlForEarnings(symbol: string, year?: number, quarter?: number): string | null {
  const base = process.env.LIVE_AUDIO_BASE_URL
            || process.env.TRANSCRIPT_AUDIO_BASE_URL
            || process.env.NEXT_PUBLIC_TRANSCRIPT_AUDIO_BASE
  if (!base || !year || !quarter) return null
  return `${base.replace(/\/$/, '')}/${symbol}_${year}_Q${quarter}.mp3`
}

function loadOverlay(): OverlayEvent[] {
  const raw = process.env.LIVE_EVENTS_OVERLAY_JSON
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as OverlayEvent[]
  } catch {
    console.warn('[live-events] LIVE_EVENTS_OVERLAY_JSON is not valid JSON; ignoring')
    return []
  }
}

function profileCacheGetCountrySector(): Map<string, { country: string; sector?: string; industry?: string; name?: string }> {
  // We hydrate this lazily inside `loadEvents`. Kept as a module-scope
  // constant so subsequent calls reuse it within a process.
  return PROFILE_INFO
}
const PROFILE_INFO = new Map<string, { country: string; sector?: string; industry?: string; name?: string }>()
const PROFILE_INFO_TTL_MS = 6 * 60 * 60 * 1000
const PROFILE_INFO_LAST = new Map<string, number>()

function countryFromSymbolSuffix(rawSymbol: string): string {
  const dot = rawSymbol.indexOf('.')
  if (dot < 0) return 'US'
  const s = rawSymbol.slice(dot + 1).toUpperCase()
  const map: Record<string, string> = {
    L: 'UK', AS: 'NL', DE: 'DE', PA: 'FR', MI: 'IT', MC: 'ES', BR: 'BE',
    VX: 'CH', SW: 'CH', ST: 'SE', HE: 'FI', CO: 'DK', OL: 'NO',
    T: 'JP', HK: 'HK', KS: 'KR', KQ: 'KR', NS: 'IN', BO: 'IN',
    SS: 'CN', SZ: 'CN', TW: 'TW', TWO: 'TW', AX: 'AU', NZ: 'NZ',
    SI: 'SG', JK: 'ID', BK: 'TH', SA: 'BR', MX: 'MX', TO: 'CA', V: 'CA',
  }
  return map[s] || 'US'
}

async function enrichProfiles(symbols: string[]): Promise<void> {
  const fresh: string[] = []
  const now = Date.now()
  for (const s of symbols) {
    const last = PROFILE_INFO_LAST.get(s) || 0
    if (now - last > PROFILE_INFO_TTL_MS) fresh.push(s)
  }
  if (fresh.length === 0) return
  // FMP /stable/profile takes one symbol at a time. To avoid hammering the
  // upstream we cap concurrent in-flight requests and silently degrade for
  // misses (the suffix-derived country is already a sensible default).
  const CONCURRENCY = 8
  let cursor = 0
  async function worker() {
    while (cursor < fresh.length) {
      const idx = cursor++
      const sym = fresh[idx]
      try {
        const arr = await fmpFetch('/stable/profile', { symbol: sym })
        const p = Array.isArray(arr) ? arr[0] : null
        if (p) {
          PROFILE_INFO.set(sym, {
            country: (p.country || countryFromSymbolSuffix(sym)).toUpperCase().replace('GB', 'UK').slice(0, 2),
            sector: p.sector,
            industry: p.industry,
            name: p.companyName,
          })
        } else {
          PROFILE_INFO.set(sym, { country: countryFromSymbolSuffix(sym) })
        }
      } catch {
        PROFILE_INFO.set(sym, { country: countryFromSymbolSuffix(sym) })
      }
      PROFILE_INFO_LAST.set(sym, now)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, fresh.length) }, worker))
}

interface BuildOptions {
  /** Window in hours to consider "upcoming". Defaults to 24h. */
  upcomingHours?: number
  /**
   * Window in hours to keep "ended" entries visible. When omitted, the
   * default is "everything that ended since the start of today (UTC)" with
   * a 6h floor — so the user always sees what just finished today, even
   * the BMO call from this morning, without dragging in yesterday's tail.
   */
  recentlyEndedHours?: number
}

export async function loadLiveEvents(opts: BuildOptions = {}): Promise<{ events: LiveEvent[]; refreshedAt: string }> {
  const upcomingHours = opts.upcomingHours ?? 24
  const now = new Date()
  // "Just finished today" semantics: include every ended event since
  // 00:00 UTC of the current day, with a 6h minimum so that a freshly-
  // ended overnight call shortly after UTC midnight isn't immediately
  // hidden.
  const utcMidnight = Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0,
  )
  const hoursSinceUtcMidnight = (now.getTime() - utcMidnight) / 3600_000
  const recentlyEndedHours = opts.recentlyEndedHours ?? Math.max(6, hoursSinceUtcMidnight)

  const fromDate = new Date(now.getTime() - 36 * 3600 * 1000)
  const toDate   = new Date(now.getTime() + 36 * 3600 * 1000)
  const fromStr = fromDate.toISOString().slice(0, 10)
  const toStr   = toDate.toISOString().slice(0, 10)

  // ─ FMP earnings ──────────────────────────────────────────────────────────
  // FMP returns a loose row shape that varies between the stable and legacy
  // endpoints — we read individual fields defensively below.
  type FmpEarningsRow = {
    symbol?: string; date?: string; time?: string;
    epsEstimated?: number | null; revenueEstimated?: number | null;
    epsActual?: number | null; revenueActual?: number | null;
    eps?: number | null; revenue?: number | null;
    fiscalYear?: number | string | null; period?: string | null;
    fiscalDateEnding?: string | null; quarter?: number | string | null;
  }
  let fmpRows: FmpEarningsRow[] = []
  try {
    const stable = await fmpFetch('/stable/earnings-calendar', { from: fromStr, to: toStr })
    if (Array.isArray(stable) && stable.length) fmpRows = stable
  } catch { /* fallthrough */ }
  if (fmpRows.length === 0) {
    try {
      const legacy = await fmpFetch('/api/v3/earning_calendar', { from: fromStr, to: toStr })
      if (Array.isArray(legacy)) fmpRows = legacy
    } catch { /* swallow */ }
  }

  const events: LiveEvent[] = []

  const earningsBase: { symbol: string; rawSymbol: string; date: string; timing: 'BMO' | 'AMC' | 'DMH' | 'UNKNOWN'; year: number; quarter: number; estimateConfirmed: boolean }[] = []
  for (const e of fmpRows) {
    const rawSym = String(e.symbol || '')
    const sym    = rawSym.split('.')[0]
    if (!sym) continue
    const date = String(e.date || '').slice(0, 10)
    if (!date) continue
    let timing = classifyTimingFromFmp(e.time)
    if (timing === 'UNKNOWN') timing = inferTimingFromSymbol(rawSym)
    const year = e.fiscalDateEnding ? new Date(e.fiscalDateEnding).getUTCFullYear() : new Date(date).getUTCFullYear()
    const quarter = e.fiscalDateEnding ? quarterOf(e.fiscalDateEnding) : quarterOf(date)
    // Only confirmed events (have estimates or actuals) — skips speculative
    // FMP rows that pad the calendar with placeholder symbols.
    const estimateConfirmed = e.epsEstimated != null || e.revenueEstimated != null
                            || e.epsActual    != null || e.revenueActual    != null
                            || e.eps          != null || e.revenue          != null
    earningsBase.push({ symbol: sym, rawSymbol: rawSym, date, timing, year, quarter, estimateConfirmed })
  }

  // Compute windows + status first so we only enrich profiles for survivors —
  // a "live now" page with 567 events is meaningless and FMP profile calls
  // are expensive per-symbol.
  type Survivor = typeof earningsBase[number] & { startsAt: Date; endsAt: Date; status: LiveEventStatus }
  const survivors: Survivor[] = []
  for (const e of earningsBase) {
    if (!e.estimateConfirmed) continue
    if (e.timing === 'UNKNOWN') continue
    const { startsAt, endsAt } = deriveEarningsWindow(e.date, e.timing)
    const status = statusFor(now, startsAt, endsAt)
    if (status === 'upcoming' && startsAt.getTime() - now.getTime() > upcomingHours * 3600 * 1000) continue
    if (status === 'ended'    && now.getTime() - endsAt.getTime()   > recentlyEndedHours * 3600 * 1000) continue
    survivors.push({ ...e, startsAt, endsAt, status })
  }

  // Cap profile enrichment — the suffix-based country/name fallback is
  // good enough for the long tail and keeps cold-load latency bounded.
  const enrichTargets = survivors
    .sort((a, b) => {
      // Prefer live > upcoming > ended; within each, soonest first.
      const r = (s: LiveEventStatus) => s === 'live' ? 0 : s === 'upcoming' ? 1 : 2
      if (r(a.status) !== r(b.status)) return r(a.status) - r(b.status)
      return a.startsAt.getTime() - b.startsAt.getTime()
    })
    .slice(0, 60)
  await enrichProfiles(Array.from(new Set(enrichTargets.map(s => s.rawSymbol))))

  for (const e of survivors) {
    const { startsAt, endsAt, status } = e
    const prof = profileCacheGetCountrySector().get(e.rawSymbol)
    const country = prof?.country || countryFromSymbolSuffix(e.rawSymbol)
    const audioSourceUrl = audioUrlForEarnings(e.symbol, e.year, e.quarter)
    const id = eventIdFor('earnings', e.symbol, startsAt, e.year, e.quarter)
    const audioProxyUrl = `${basePath()}/api/live-events/${id}/audio`
    const transcriptStreamUrl = `${basePath()}/api/live-events/${id}/transcript`
    const deepLink = `${publicOrigin()}${basePath()}/app/live/${id}`
    const cacheKey = `${e.symbol}_${e.year}_Q${e.quarter}`
    const alignedReady = !!getCachedAlignment(cacheKey, [{ text: ' ' }]) // cheap probe — null if no STT cached
    events.push({
      id,
      symbol: e.symbol,
      name: prof?.name || e.symbol,
      type: 'earnings',
      country,
      sector: prof?.sector,
      industry: prof?.industry,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status,
      year: e.year,
      quarter: e.quarter,
      audioAvailable: !!audioSourceUrl,
      audioSourceUrl,
      audioProxyUrl,
      deepLink,
      alignedReady,
      transcriptStreamUrl,
      source: 'fmp',
    })
  }

  // ─ Overlay (CMDs / conferences / explicit audio overrides) ───────────────
  for (const o of loadOverlay()) {
    const symbol = (o.symbol || '').toUpperCase()
    if (!symbol) continue
    const startsAt = new Date(o.startsAt)
    if (Number.isNaN(startsAt.getTime())) continue
    const endsAt = o.endsAt
      ? new Date(o.endsAt)
      : new Date(startsAt.getTime() + (o.durationMin ?? 75) * 60 * 1000)
    const status = statusFor(now, startsAt, endsAt)
    if (status === 'upcoming' && startsAt.getTime() - now.getTime() > upcomingHours * 3600 * 1000) continue
    if (status === 'ended'    && now.getTime() - endsAt.getTime()   > recentlyEndedHours * 3600 * 1000) continue
    const id = o.id || eventIdFor(o.type, symbol, startsAt, o.year, o.quarter)
    // Overlay overrides any FMP-derived audio URL, and can mark earnings as
    // having a real licensed audio feed even when env-pattern misses.
    const existingIdx = events.findIndex(ev => ev.id === id)
    const audioSourceUrl = o.audioUrl
      || (o.type === 'earnings' ? audioUrlForEarnings(symbol, o.year, o.quarter) : null)
    const ev: LiveEvent = {
      id,
      symbol,
      name: o.name || symbol,
      type: o.type,
      country: (o.country || 'US').toUpperCase(),
      sector: o.sector,
      industry: o.industry,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status,
      year: o.year,
      quarter: o.quarter,
      audioAvailable: !!audioSourceUrl,
      audioSourceUrl,
      audioProxyUrl: `${basePath()}/api/live-events/${id}/audio`,
      deepLink: `${publicOrigin()}${basePath()}/app/live/${id}`,
      alignedReady: o.year && o.quarter
        ? !!getCachedAlignment(`${symbol}_${o.year}_Q${o.quarter}`, [{ text: ' ' }])
        : false,
      transcriptStreamUrl: `${basePath()}/api/live-events/${id}/transcript`,
      listeners: o.listeners,
      source: 'overlay',
    }
    if (existingIdx >= 0) events[existingIdx] = ev
    else events.push(ev)
  }

  events.sort((a, b) => {
    // Live first (most-recently started), then upcoming (soonest), then ended (most-recently).
    const rank = (s: LiveEventStatus) => s === 'live' ? 0 : s === 'upcoming' ? 1 : 2
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status)
    if (a.status === 'upcoming') return a.startsAt.localeCompare(b.startsAt)
    return b.startsAt.localeCompare(a.startsAt)
  })

  return { events, refreshedAt: now.toISOString() }
}

export async function findLiveEventById(id: string): Promise<LiveEvent | null> {
  const { events } = await loadLiveEvents({ upcomingHours: 72, recentlyEndedHours: 72 })
  return events.find(e => e.id === id) || null
}

export function summarise(events: LiveEvent[]): { live: LiveEvent[]; upcoming: LiveEvent[]; ended: LiveEvent[] } {
  return {
    live: events.filter(e => e.status === 'live'),
    upcoming: events.filter(e => e.status === 'upcoming'),
    ended: events.filter(e => e.status === 'ended'),
  }
}
