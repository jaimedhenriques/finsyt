// ── Agent schedule helpers ──────────────────────────────────────────────────
// Pure functions used by both the platform API routes and the in-process
// node-cron scheduler to compute the next firing time for an agent.
//
// Times in the agent schema are stored as a free-text label like "8:00 AM"
// plus a timezone label ("ET", "PT", "GMT" …). For the MVP scheduler we treat
// timezones as fixed UTC offsets (DST handled approximately) — a follow-up
// can move to a real IANA tz library if/when that matters in practice.

import type { AgentScheduleSchema } from '@workspace/db'

const TZ_OFFSET_HOURS: Record<string, number> = {
  ET:   -4,  // EDT during summer; -5 in winter — see note above.
  PT:   -7,
  CT:   -5,
  GMT:  0,
  CET:  1,
}
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

/** Parse "8:00 AM" → { h:8, m:0 }. Returns null if unparseable. */
function parseTimeLabel(t?: string | null): { h: number; m: number } | null {
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(t.trim())
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  const ap  = m[3]?.toUpperCase()
  if (ap === 'PM' && h < 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return { h, m: min }
}

/**
 * Compute the next UTC firing instant for a schedule, strictly after `from`.
 * Returns null for `Real-time` (no scheduled fire — those agents react to
 * external events, which the in-process MVP scheduler does not simulate).
 */
export function computeNextRunAt(schedule: AgentScheduleSchema, from: Date = new Date()): Date | null {
  if (schedule.frequency === 'Real-time') return null

  const tzOffset = TZ_OFFSET_HOURS[schedule.timezone ?? 'ET'] ?? -4
  const time = parseTimeLabel(schedule.time) ?? { h: 8, m: 0 }

  // Build a candidate UTC instant for "today at HH:MM in `timezone`".
  // Local-tz hour H corresponds to UTC hour H - tzOffset.
  const candidate = new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
    time.h - tzOffset,
    time.m,
    0, 0,
  ))

  if (schedule.frequency === 'Daily') {
    if (candidate.getTime() <= from.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 1)
    return candidate
  }

  if (schedule.frequency === 'Weekly') {
    const targetDow = WEEKDAY_INDEX[schedule.day ?? 'Mon'] ?? 1
    // Find the next date whose weekday in the schedule's tz equals targetDow.
    while (true) {
      const localMs = candidate.getTime() + tzOffset * 3600_000
      const localDow = new Date(localMs).getUTCDay()
      if (localDow === targetDow && candidate.getTime() > from.getTime()) return candidate
      candidate.setUTCDate(candidate.getUTCDate() + 1)
    }
  }

  if (schedule.frequency === 'Monthly') {
    // Fire on the 1st-of-month <day> at <time>. Find the next month whose
    // first <day> is in the future.
    const targetDow = WEEKDAY_INDEX[schedule.day ?? 'Mon'] ?? 1
    const advance = (d: Date) => {
      d.setUTCDate(1)
      // Walk forward until weekday matches in tz-local time.
      while (true) {
        const localMs = d.getTime() + tzOffset * 3600_000
        const localDow = new Date(localMs).getUTCDay()
        if (localDow === targetDow) return
        d.setUTCDate(d.getUTCDate() + 1)
      }
    }
    advance(candidate)
    if (candidate.getTime() <= from.getTime()) {
      candidate.setUTCMonth(candidate.getUTCMonth() + 1)
      advance(candidate)
    }
    return candidate
  }

  return null
}

/** Human label like "Daily · 8:00 AM ET" — mirrors the client helper. */
export function scheduleSummary(s: AgentScheduleSchema): string {
  if (s.frequency === 'Real-time') return 'Real-time · as events fire'
  if (s.frequency === 'Daily')     return `Daily · ${s.time ?? ''} ${s.timezone ?? ''}`.trim()
  if (s.frequency === 'Weekly')    return `Weekly · ${s.day ?? 'Mon'} · ${s.time ?? ''} ${s.timezone ?? ''}`.trim()
  if (s.frequency === 'Monthly')   return `Monthly · 1st ${s.day ?? 'Mon'} · ${s.time ?? ''} ${s.timezone ?? ''}`.trim()
  return s.frequency
}
