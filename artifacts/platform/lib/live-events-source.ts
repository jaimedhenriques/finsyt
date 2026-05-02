import {
  CALL_LENGTH_MIN,
  COMPANIES,
  callKey as pureCallKey,
  liveSelection as pureLiveSelection,
  type LiveCall,
  type LiveCompany,
} from './live-events-pure'

// Shared "what's live right now" source. Both the public `/api/live-events`
// route and the live-highlights engine consume from here so the engine sees
// exactly the same calls the user sees in the LiveNow strip.
//
// Selection is deterministic on a 5-minute bucket so a poll-based client and
// a poll-based server engine converge on the same set without flapping.
// The pure deterministic helpers live in `./live-events-pure` so they can be
// unit tested without dragging in `'server-only'`.

export type { LiveCompany, LiveCall }
export { COMPANIES }

export const liveSelection = pureLiveSelection

/**
 * For a given live call, return a stable list of (paragraphIdx, speaker, text,
 * startSec) chunks that progressively reveal as the call proceeds. The engine
 * uses this as a synthetic transcript stream when no real per-chunk feed is
 * wired in, so highlight pinning has deterministic, demo-grade content to
 * classify regardless of FMP availability.
 *
 * The chunk set is deterministic per (symbol, startedAt) so the engine can
 * resume from a saved cursor across server restarts without losing alignment.
 */
export interface LiveChunk {
  idx: number
  startSec: number
  speaker: string
  role: string
  text: string
  /** kind heuristic the rule-based classifier picks up. */
  kind: 'management_commentary' | 'kpi_change' | 'qa_standout' | 'none'
  headline: string
}

const SCRIPT: Omit<LiveChunk, 'idx' | 'startSec'>[] = [
  { speaker: 'Operator', role: 'Operator',
    kind: 'none', headline: 'Operator intro',
    text: 'Good afternoon, and welcome to the earnings conference call. All participants will be in a listen-only mode.' },
  { speaker: 'IR Lead', role: 'IR',
    kind: 'none', headline: 'Safe-harbor statement',
    text: 'Before we begin, I would like to remind you that statements made on this call may include forward-looking statements subject to risks.' },
  { speaker: 'CEO', role: 'CEO',
    kind: 'management_commentary',
    headline: 'CEO opens with strategy reframing',
    text: 'This was a defining quarter for us — demand for the new platform exceeded our internal plan, and we are now reorganising the data-center business as a stand-alone segment to give investors clearer visibility.' },
  { speaker: 'CEO', role: 'CEO',
    kind: 'kpi_change',
    headline: 'CEO calls out segment growth above plan',
    text: 'Data-center revenue grew 71% year over year to a record level, with operating margin expanding by roughly 410 basis points sequentially as supply caught up with bookings.' },
  { speaker: 'CFO', role: 'CFO',
    kind: 'kpi_change',
    headline: 'CFO raises full-year guide',
    text: 'We are raising our full-year revenue guidance by approximately three percent at the midpoint and tightening our gross-margin range to 74 to 75 percent for the balance of the year.' },
  { speaker: 'CFO', role: 'CFO',
    kind: 'kpi_change',
    headline: 'CFO commits to higher capex',
    text: 'Capital expenditure for the year will now land between 11 and 12 billion dollars, up from our prior 9 to 10 billion range, weighted to the back half as we accelerate capacity for the next-generation product.' },
  { speaker: 'CEO', role: 'CEO',
    kind: 'management_commentary',
    headline: 'CEO frames competitive moat',
    text: 'Our software stack is now the dominant reason customers commit multi-year capacity — switching costs are real, and we are seeing renewals at materially higher attach rates than a year ago.' },
  { speaker: 'Operator', role: 'Operator',
    kind: 'none', headline: 'Q&A opens',
    text: 'Thank you. We will now begin the question-and-answer session.' },
  { speaker: 'Analyst — Morgan Stanley', role: 'Analyst — Morgan Stanley',
    kind: 'qa_standout',
    headline: 'Analyst presses on capex payback',
    text: 'You raised capex by two billion mid-year — what is the payback timeline you are underwriting on those dollars, and is any of it pulled forward demand from next year?' },
  { speaker: 'CFO', role: 'CFO',
    kind: 'qa_standout',
    headline: 'CFO answers payback question off-script',
    text: 'We underwrite incremental capex to a return inside eighteen months at current pricing — none of it is pulled forward; if anything, the booked backlog extends into the following fiscal year.' },
  { speaker: 'Analyst — Goldman Sachs', role: 'Analyst — Goldman Sachs',
    kind: 'qa_standout',
    headline: 'Analyst challenges margin durability',
    text: 'Gross margin near 75 percent has historically been peak — what gives you confidence it does not normalise lower as competitive supply ramps in 2027?' },
  { speaker: 'CEO', role: 'CEO',
    kind: 'management_commentary',
    headline: 'CEO defends margin outlook',
    text: 'Mix shift toward software-attached deployments is the structural reason — even in a more competitive hardware market, the attach uplift offsets price compression in our model.' },
  { speaker: 'Operator', role: 'Operator',
    kind: 'none', headline: 'Operator closes',
    text: 'Thank you. That concludes our question-and-answer session and our call. You may now disconnect.' },
]

export function chunksForCall(call: LiveCall): LiveChunk[] {
  // Deterministic timing: 35s per paragraph, with a small per-symbol jitter
  // so two simultaneous calls do not pin in lockstep.
  const jitter = (call.symbol.charCodeAt(0) + call.symbol.charCodeAt(1) || 0) % 7
  return SCRIPT.map((c, i) => ({
    ...c,
    idx: i,
    startSec: i * 35 + jitter,
  }))
}

/** Returns chunks whose startSec is <= elapsed seconds since `startedAt`. */
export function chunksRevealedAt(call: LiveCall, now: Date = new Date()): LiveChunk[] {
  const elapsedSec = (now.getTime() - new Date(call.startedAt).getTime()) / 1000
  return chunksForCall(call).filter((c) => c.startSec <= elapsedSec)
}

/** True when the call's full script has been spoken. */
export function callHasEnded(call: LiveCall, now: Date = new Date()): boolean {
  const elapsedSec = (now.getTime() - new Date(call.startedAt).getTime()) / 1000
  const lastChunk = chunksForCall(call).at(-1)
  if (!lastChunk) return true
  return elapsedSec >= lastChunk.startSec + 35 || elapsedSec >= CALL_LENGTH_MIN * 60
}

export function fmtTimestamp(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const callKey = pureCallKey
