/**
 * Types and logic for the Research page's guided follow-up suggestions.
 * Extracted from the page component so `buildFollowups` can be unit-tested
 * independently of the Next.js `'use client'` page module.
 */

export type TimelineStep =
  | { kind: 'phase'; phase: 'plan' | 'tools' | 'synthesise'; label: string }
  | {
      kind: 'tool'
      id: string
      name: string
      label: string
      args?: Record<string, unknown>
      status: 'pending' | 'ok' | 'err'
      summary?: string
    }

/** Minimal Citation fields `buildFollowups` reads (ticker only). */
export interface CitationLike {
  ticker?: string
}

/**
 * Generates contextually relevant follow-up question suggestions.
 *
 * Keyed off the tools the agent actually called (so suggestions are
 * grounded in the data already pulled) plus the dominant ticker in the
 * citation set. De-duplicated and capped at 4 to keep the chip row scannable.
 */
export function buildFollowups(steps: TimelineStep[], citations: CitationLike[]): string[] {
  const tools = new Set(
    steps
      .filter(
        (s): s is Extract<TimelineStep, { kind: 'tool' }> =>
          s.kind === 'tool' && s.status === 'ok',
      )
      .map(s => s.name),
  )
  // Most-cited ticker drives the {co} token; fall back to a generic noun.
  const counts = new Map<string, number>()
  for (const c of citations) if (c.ticker) counts.set(c.ticker, (counts.get(c.ticker) || 0) + 1)
  const co = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  const subj = co || 'this company'
  const out: string[] = []
  if (tools.has('get_financials')) out.push(`Break down ${subj}'s revenue and margins by segment`)
  if (tools.has('get_quote') || tools.has('get_financials'))
    out.push(`How does ${subj}'s valuation compare to its closest peers?`)
  if (tools.has('get_filings')) out.push(`What are the key risk factors in ${subj}'s latest filing?`)
  if (tools.has('get_transcripts'))
    out.push(`What did management say about forward guidance on the last call?`)
  if (tools.has('get_estimates')) out.push(`Where does ${subj} sit versus sell-side consensus?`)
  if (tools.has('get_news')) out.push(`Summarise the most important ${subj} news from the past week`)
  if (tools.has('get_macro')) out.push(`How does the current macro backdrop affect ${subj}?`)
  // Always offer a critical-thinking deep dive so every answer has a path
  // forward even when only one tool ran.
  out.push(`What could go wrong with this thesis on ${subj}?`)
  // De-dupe and cap to keep the chip row scannable.
  return [...new Set(out)].slice(0, 4)
}
