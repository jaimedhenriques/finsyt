'use client'
import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback, useRef } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────
// Mirrors `lib/db/src/schema/agents.ts` so the API responses drop straight in.
export type AgentCategory = 'Monitoring' | 'Research' | 'Competitive' | 'Earnings' | 'Macro' | 'Diligence'
export type AgentStatus   = 'Running' | 'Scheduled' | 'Paused' | 'Draft'
export type Frequency     = 'Daily' | 'Weekly' | 'Monthly' | 'Real-time'
export type Weekday       = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

export interface AgentSchedule {
  frequency: Frequency
  day?:      Weekday
  time?:     string          // e.g. "8:00 AM"
  timezone?: string          // e.g. "ET"
}

export interface AgentTemplate {
  slug:        string
  name:        string
  category:    AgentCategory
  icon:        string
  description: string
  watches:     string[]
  produces:    string[]
  defaultSchedule: AgentSchedule
  defaultInstructions: string
}

export interface Agent {
  id:           string
  name:         string
  status:       AgentStatus
  templateSlug?: string
  category:     AgentCategory
  icon:         string
  schedule:     AgentSchedule
  instructions: string
  createdAt:    string
  lastRunAt?:   string
  nextRunAt?:   string
  authorUserId?: string
}

export interface AgentRun {
  id:        string
  agentId:   string
  agentName: string
  category:  AgentCategory
  icon:      string
  ranAt:     string
  read:      boolean
  headline:  string
  summary:   string
  findings:  { title: string; detail: string }[]
  sources:   { label: string; meta: string }[]
  model?:    string
  provider?: string
  latencyMs?: number
  runStatus?: 'ok' | 'error'
  triggeredBy?: 'manual' | 'scheduled'
}

// ── Templates (14) ───────────────────────────────────────────────────────────
// Library cards read from this; the slug travels with new agents so the
// scheduler can pick the right prompt downstream if we ever specialise prompts.
//
// The default instructions for each template borrow the institutional
// "Query Plan → Sections → Audience" pattern from the S&P Global / Kensho
// agent-skills playbook (kensho-technologies/spglobal-agent-skills) and the
// FIEF-style phrase-pattern signal grammar from the Pronto NLP SDK
// (ProntoNLP/pronto-nlp-sdk). They are copy-pastable starting points an
// analyst can edit before saving an agent.
export const TEMPLATES: AgentTemplate[] = [
  {
    slug: 'earnings-prep', name: 'Earnings Prep Brief', category: 'Earnings', icon: '◉',
    description: 'Pulls together everything you need before a name reports — analyst expectations, recent commentary, KPI deltas, and the questions the Street will ask.',
    watches: ['Sell-side notes', 'Prior transcripts', 'Buy-side surveys', 'Pre-announcements'],
    produces: ['Consensus snapshot', 'KPI walk', '5–7 Street questions', 'Bull / bear setup'],
    defaultSchedule: { frequency: 'Weekly', day: 'Mon', time: '7:00 AM', timezone: 'ET' },
    defaultInstructions: `Audience: Equity Research (PM-ready single-page preview).

Build a pre-earnings preview for NVDA ahead of the next print.

Query plan → sections:
1) Quote + market data (price, mkt cap, NTM P/E, 52-week range) → Header line.
2) Last 4 quarters of revenue, EPS, segment mix (Data Center, Gaming, Auto) → Trend table.
3) Sell-side consensus (revenue, EPS, gross margin, FY guide) → Consensus snapshot.
4) Last call's guidance + any 8-K updates / mid-quarter commentary since → Guidance walk.
5) Pre-announcements, insider 4s, or material 8-Ks in last 30 days → Flags.
6) Five Street questions (rank by what most likely moves the print) with one-line "what answer would surprise" each.
7) Bull / bear setup — two bullets each, tied to a quantifiable variable.

Cite every figure inline (10-K, 10-Q, transcript, FMP).`,
  },
  {
    slug: 'competitive-tracking', name: 'Competitive Tracking', category: 'Competitive', icon: '◳',
    description: 'Watches a peer set for product launches, pricing moves, leadership changes, and material commentary in calls and filings.',
    watches: ['Press releases', 'Earnings calls', '8-K filings', 'Trade press'],
    produces: ['Peer-by-peer change log', 'Pricing & product deltas', 'Strategic narrative shifts'],
    defaultSchedule: { frequency: 'Weekly', day: 'Fri', time: '4:00 PM', timezone: 'ET' },
    defaultInstructions: `Audience: Equity Research / PM weekly competitive read.

Track this peer set week-over-week: NVDA, AMD, AVGO.

Query plan → sections:
1) For each ticker, pull the last 7 days of 8-K filings, press releases, and any earnings-related disclosures.
2) For each ticker, pull current quote, mkt cap, 1-week return, and short-interest change if available.
3) Cross-check trade press / industry conferences for product launches, pricing moves, design wins.

Output sections (per company, in this order):
- Change log: bulleted, one line per material event with date + source.
- Pricing & product deltas: only if something changed; skip the section otherwise.
- Strategic narrative shift: one sentence on whether the story moved bull or bear.
- Read-across: one sentence on what each event implies for the other two.

Rank companies by investor relevance, not alphabetically.`,
  },
  {
    slug: 'weekly-market-brief', name: 'Weekly Market Briefing', category: 'Monitoring', icon: '◷',
    description: 'A Monday-morning brief covering the prior week\'s tape, sector rotations, central bank chatter, and what matters for the week ahead.',
    watches: ['Index moves', 'Sector flows', 'Central bank speeches', 'Economic calendar'],
    produces: ['Tape recap', 'Rotation map', 'Week-ahead catalysts'],
    defaultSchedule: { frequency: 'Weekly', day: 'Mon', time: '8:00 AM', timezone: 'ET' },
    defaultInstructions: 'Brief me on last week\'s market action and the week ahead. Cover index performance, the three biggest sector rotations, central-bank commentary, and the calendar of earnings, data, and Fed speakers I should know about.',
  },
  {
    slug: 'sec-filing-extractor', name: 'SEC Filing Extractor', category: 'Research', icon: '▣',
    description: 'Reads new 10-K, 10-Q, and 8-K filings the moment they hit EDGAR and extracts the parts a generalist analyst actually reads.',
    watches: ['10-K', '10-Q', '8-K', 'DEF 14A', 'S-1'],
    produces: ['Risk factor diff', 'MD&A summary', 'New disclosures', 'Footnote callouts'],
    defaultSchedule: { frequency: 'Real-time', timezone: 'ET' },
    defaultInstructions: `Audience: Equity Research / Risk — fast-read filing extract.

Trigger: any new 10-K, 10-Q, or 8-K for AAPL, MSFT, GOOGL.

Query plan → sections:
1) Pull the new filing + the prior comparable filing for diffing (10-K vs 10-K, 10-Q vs same-period 10-Q).
2) Extract Item 1A Risk Factors and diff against prior — list ADDED, REMOVED, MATERIALLY EDITED items.
3) Summarise MD&A in five bullets focused on revenue drivers, margin moves, capex, segment commentary, FY outlook.
4) Identify any new accounting policies, contingent liabilities, segment reorganisations, or share-buyback authorisations.
5) Identify any disclosure that does NOT appear in the prior filing (genuinely new information).

Quote risk-factor language verbatim — never paraphrase inside quotation marks. Cite exhibit / page numbers.`,
  },
  {
    slug: 'sector-signals', name: 'Sector Signal Scanner', category: 'Monitoring', icon: '◊',
    description: 'Quantitative scan across a sector for unusual price action, volume, options flow, and short interest changes — with a one-line read on each name.',
    watches: ['Price', 'Volume', 'Options flow', 'Short interest', 'Borrow rates'],
    produces: ['Top movers', 'Unusual options', 'Short squeeze candidates'],
    defaultSchedule: { frequency: 'Daily', time: '6:30 AM', timezone: 'ET' },
    defaultInstructions: 'Scan the semiconductor sector for unusual activity overnight. Surface the top 5 names by abnormal price, volume, options skew, or short interest change, and give me a one-line read on what\'s likely driving each.',
  },
  {
    slug: 'analyst-day-debrief', name: 'Investor Day Debrief', category: 'Research', icon: '◧',
    description: 'When a covered company hosts an analyst or capital markets day, this agent produces the same-day brief — guidance changes, capital allocation shifts, and reaction.',
    watches: ['Investor day decks', 'Webcasts', 'Sell-side reactions'],
    produces: ['What changed', 'Long-term guide deltas', 'Sell-side reaction'],
    defaultSchedule: { frequency: 'Real-time', timezone: 'ET' },
    defaultInstructions: `Audience: Equity Research / PM same-day debrief.

Trigger: NVDA hosts an analyst day or capital markets day.

Query plan → sections:
1) Long-term financial framework — pull the new revenue / margin / FCF targets and diff against the prior framework.
2) Segment-level targets — for each reported segment, capture the new TAM / share / growth target.
3) Capital allocation — buyback authorisation, dividend policy, M&A appetite, R&D as % of revenue.
4) Strategic positioning — pull the three biggest narrative shifts management asserted.
5) Sell-side reaction — within 24h, summarise the consensus delta vs prior model (PT change, rating change, EPS revisions).

Verbatim-quote any forward target ("we now expect…") with the speaker name and approximate timestamp.`,
  },
  {
    slug: 'macro-fed-watch', name: 'Fed & Macro Watch', category: 'Macro', icon: '◷',
    description: 'Tracks Fed speeches, FOMC commentary, and key macro releases. Translates the wonk-speak into what it means for rates, the dollar, and equities.',
    watches: ['Fed speakers', 'FOMC minutes', 'CPI / PCE / NFP', 'Treasury auctions'],
    produces: ['Speaker tone summary', 'Rates implication', 'Equity sector read'],
    defaultSchedule: { frequency: 'Daily', time: '7:30 AM', timezone: 'ET' },
    defaultInstructions: 'Summarize all Fed speeches and macro data releases from the last 24 hours. Score each on a hawkish-to-dovish scale, and give me the implied move in 2Y yields, the dollar, and rate-sensitive equity sectors.',
  },
  {
    slug: 'mna-deal-monitor', name: 'M&A Deal Monitor', category: 'Diligence', icon: '◳',
    description: 'Watches your sectors for deal announcements, terminations, and rumours. Builds a one-pager on each deal as it breaks.',
    watches: ['Deal news', 'Antitrust filings', 'Proxy statements'],
    produces: ['Deal terms one-pager', 'Spread / arb math', 'Antitrust risk read'],
    defaultSchedule: { frequency: 'Real-time', timezone: 'ET' },
    defaultInstructions: `Audience: M&A / Diligence — IB-style deal one-pager.

Coverage: enterprise software M&A — announced deals, terminations, and credible rumours.

Per-event query plan → sections:
1) Deal facts: announce date, acquirer, target, headline value, structure (cash / stock / mixed), break-up fee, expected close.
2) Valuation: EV / NTM revenue, EV / NTM EBITDA, premium to undisturbed price, premium to 52-week high.
3) Financing: cash on hand, new debt, equity raise, bridge facility — with any rating-agency reaction.
4) Strategic rationale: in two sentences, what the acquirer is buying (capability, customers, moat) and the synergy pitch.
5) Antitrust read: HSR risk, sector concentration, prior FTC/DOJ posture, EU CMA / UK CMA exposure.
6) Spread / arb math (if announced): current spread, implied IRR to expected close, key gating events.

Cite the 8-K, joint press release, or proxy where each fact came from.`,
  },
  {
    slug: 'analyst-call-digest', name: 'Earnings Call Digest', category: 'Earnings', icon: '◉',
    description: 'Within 60 minutes of an earnings call ending, deliver the brief — guidance change, KPIs, tone shift, and the questions that mattered.',
    watches: ['Live earnings calls', 'Press releases', 'Sell-side flash notes'],
    produces: ['Guidance walk', 'KPI surprises', 'Q&A highlights', 'Tone read'],
    defaultSchedule: { frequency: 'Real-time', timezone: 'ET' },
    defaultInstructions: `Audience: Equity Research / PM 60-minute post-call digest.

Trigger: MSFT reports.

Query plan → sections:
1) Header KPIs: actual vs consensus on revenue, EPS, gross margin, op margin, FCF — show absolute, surprise, and consensus source.
2) Segment delta: each segment's revenue YoY and vs Street, plus management commentary on driver.
3) Guidance walk: prior FY guide vs new FY guide vs Street — express in absolute and growth-rate terms.
4) KPI surprises: 3 positive + 3 negative metrics outside the headline (e.g. Azure growth, AI capex, OpenAI revenue contribution).
5) Q&A heat-map: the three most-asked topics, with the verbatim management response to each (≤ 2 sentences).
6) Tone read: one sentence on management tone vs the prior call (more / less confident on which line items).`,
  },
  {
    slug: 'thematic-mention-tracker', name: 'Thematic Mention Tracker', category: 'Research', icon: '◎',
    description: 'Tracks how a theme — sovereign AI, GLP-1, data-center power — is propagating through earnings calls, broker notes, and the trade press over time.',
    watches: ['Earnings transcripts', 'Broker research', 'Trade publications'],
    produces: ['Mention curve', 'Notable quotes', 'New names entering the theme'],
    defaultSchedule: { frequency: 'Weekly', day: 'Wed', time: '9:00 AM', timezone: 'ET' },
    defaultInstructions: `Audience: Equity Research / Strategy thematic monitor.

Theme: "sovereign AI" (build the phrase pattern as: sovereign|government|state-owned + AI|compute|GPU|model — count any sentence matching the conjunction).

Query plan → sections:
1) Pull the last 30 days of: earnings transcripts (issuer + sell-side), trade press, hyperscaler keynotes, government procurement notices.
2) Score each match on (a) speaker — issuer / sell-side / journalist / government, (b) sentiment — bullish / cautious / negative, (c) whether it's tied to a dollar number.
3) Mention curve: count by week, segmented by speaker type.
4) Top five quoted lines: verbatim, with speaker, source, and date — no paraphrase inside the quotes.
5) New names entering the theme: companies that did NOT mention sovereign AI 90 days ago but did in the last 30.
6) Read-through: one sentence on the dollar implication for NVDA, AVGO, ANET, and the leading hyperscalers.`,
  },
  {
    slug: 'private-co-pulse', name: 'Private Company Pulse', category: 'Diligence', icon: '◎',
    description: 'For a list of private companies, watches funding rounds, executive moves, customer announcements, and credible press leaks.',
    watches: ['Funding databases', 'Press', 'LinkedIn signals', 'Trade press'],
    produces: ['Round-by-round timeline', 'Exec moves', 'Customer wins'],
    defaultSchedule: { frequency: 'Weekly', day: 'Thu', time: '10:00 AM', timezone: 'ET' },
    defaultInstructions: `Audience: Corp Dev / VC — weekly deal-flow digest, one panel per company.

Coverage: OpenAI, Anthropic, Stripe, Databricks.

Pre-validation: confirm each entity is currently operating and independent (not absorbed by a parent). If a name is now a subsidiary, note "acquired by [Parent]" and skip funding queries for it.

Per-company query plan → sections:
1) Latest funding round — date, amount, lead, post-money, secondary vs primary, key new investors.
2) Valuation mark trajectory — last 3 rounds with date, post-money, % step-up.
3) Executive moves — hires and departures at C-suite, GTM lead, head of research / engineering.
4) Named customer wins — only if announced or credibly reported, with source.
5) Product / capability leaks — only credible trade-press reporting; flag rumour vs confirmed.

Footer: include the literal disclaimer "Analysis is AI-generated — please confirm all outputs".`,
  },
  {
    slug: 'guidance-revision-watcher', name: 'Guidance Revision Watcher', category: 'Monitoring', icon: '◐',
    description: 'Catches every pre-announcement, mid-quarter update, and guidance revision across your watchlist — with the implied EPS impact.',
    watches: ['8-K guidance', 'Pre-announcements', 'Conference appearances'],
    produces: ['Revision log', 'Implied EPS impact', 'Sell-side reaction'],
    defaultSchedule: { frequency: 'Daily', time: '5:00 PM', timezone: 'ET' },
    defaultInstructions: 'Catch every guidance revision across NVDA, AMD, AVGO, INTC — 8-Ks, pre-announcements, and management commentary at conferences. For each one, calculate implied EPS impact and summarize same-day sell-side reaction.',
  },
  {
    slug: 'short-report-radar', name: 'Short Report Radar', category: 'Diligence', icon: '◔',
    description: 'Alerts when a notable short-seller publishes on a name you cover, with a structured read on the claims and a fact-check against filings.',
    watches: ['Short-seller publications', 'Twitter / X posts', '13F changes'],
    produces: ['Claim breakdown', 'Filings cross-check', 'Stock reaction'],
    defaultSchedule: { frequency: 'Real-time', timezone: 'ET' },
    defaultInstructions: 'Alert me when a notable short-seller publishes on any name in NVDA, MSFT, META, GOOGL. Break down each claim, cross-check against the most recent 10-K and 10-Q, and track intraday and one-week stock reaction.',
  },
  {
    slug: 'capex-tracker', name: 'Hyperscaler Capex Tracker', category: 'Competitive', icon: '⊞',
    description: 'Aggregates AI infrastructure capex commentary across MSFT, GOOGL, META, AMZN, ORCL — quarter by quarter, with downstream supplier reads.',
    watches: ['Hyperscaler earnings calls', 'Supplier commentary', 'Capex disclosures'],
    produces: ['Capex stack chart', 'Supplier read-through', 'Forward commentary'],
    defaultSchedule: { frequency: 'Monthly', day: 'Mon', time: '8:00 AM', timezone: 'ET' },
    defaultInstructions: 'Aggregate AI infrastructure capex commentary from MSFT, GOOGL, META, AMZN, and ORCL each quarter. Show the capex stack, current vs prior guide, and what each disclosure implies for NVDA, AVGO, AMD, and TSMC.',
  },
]

// ── Provider — API-backed ────────────────────────────────────────────────────
interface CreateInput {
  name:         string
  status?:      AgentStatus
  templateSlug?: string
  category:     AgentCategory
  icon?:        string
  schedule:     AgentSchedule
  instructions: string
  nextRunAt?:   string  // accepted but ignored — server computes it
}

interface AgentsCtx {
  agents:   Agent[]
  runs:     AgentRun[]
  templates: AgentTemplate[]
  loading:   boolean
  synced:    boolean
  unreadCount: number
  refresh:   () => Promise<void>
  createAgent: (a: CreateInput)                 => Promise<Agent | null>
  updateAgent: (id: string, patch: Partial<Pick<Agent,'name'|'status'|'category'|'icon'|'schedule'|'instructions'>>) => Promise<void>
  deleteAgent: (id: string)                     => Promise<void>
  duplicateAgent: (id: string)                  => Promise<Agent | null>
  runAgentNow:  (id: string)                    => Promise<AgentRun | null>
  markRunRead:  (runId: string)                 => Promise<void>
  markAllRunsRead: ()                           => Promise<void>
}

const Ctx = createContext<AgentsCtx | null>(null)

async function jsonOrNull(p: Promise<Response>) {
  try { const r = await p; if (!r.ok) return null; return await r.json() } catch { return null }
}

export function AgentsProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [runs,   setRuns]   = useState<AgentRun[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [synced, setSynced] = useState(false)
  const [loading, setLoading] = useState(true)
  const inflight = useRef(false)

  const refresh = useCallback(async () => {
    if (inflight.current) return
    inflight.current = true
    try {
      const [aRes, rRes] = await Promise.all([
        jsonOrNull(fetch('/api/agents',      { cache: 'no-store' })),
        jsonOrNull(fetch('/api/agents/runs', { cache: 'no-store' })),
      ])
      if (aRes?.synced) {
        setAgents(Array.isArray(aRes.agents) ? aRes.agents : [])
        setSynced(true)
      } else if (aRes && !aRes.synced) {
        // Logged in but no workspace yet — empty state, but mark synced so
        // we don't show a perpetual spinner.
        setAgents([])
        setSynced(true)
      }
      if (rRes) {
        setRuns(Array.isArray(rRes.runs) ? rRes.runs : [])
        setUnreadCount(Number(rRes.unreadCount ?? 0))
      }
    } finally {
      inflight.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Lightweight poll every 60s so the bell + inbox catch scheduled runs.
  useEffect(() => {
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [refresh])

  const value = useMemo<AgentsCtx>(() => ({
    agents, runs, templates: TEMPLATES, loading, synced, unreadCount, refresh,

    async createAgent(input) {
      const body = {
        name: input.name,
        status: input.status ?? 'Scheduled',
        templateSlug: input.templateSlug,
        category: input.category,
        icon: input.icon,
        schedule: input.schedule,
        instructions: input.instructions,
      }
      const res = await fetch('/api/agents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) return null
      const json = await res.json()
      const created: Agent = json.agent
      setAgents(prev => [created, ...prev])
      return created
    },

    async updateAgent(id, patch) {
      // Optimistic UI; reconcile on response.
      setAgents(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
      const res = await fetch(`/api/agents/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (res.ok) {
        const j = await res.json()
        if (j?.agent) setAgents(prev => prev.map(a => a.id === id ? j.agent : a))
      } else {
        // Roll back by refetching on failure.
        refresh()
      }
    },

    async deleteAgent(id) {
      setAgents(prev => prev.filter(a => a.id !== id))
      setRuns(prev => prev.filter(r => r.agentId !== id))
      const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' })
      if (!res.ok) refresh()
    },

    async duplicateAgent(id) {
      const src = agents.find(a => a.id === id)
      if (!src) return null
      return await this.createAgent({
        name: src.name + ' (copy)',
        status: 'Draft',
        templateSlug: src.templateSlug,
        category: src.category,
        icon: src.icon,
        schedule: src.schedule,
        instructions: src.instructions,
      })
    },

    async runAgentNow(id) {
      const res = await fetch(`/api/agents/${id}/run`, { method: 'POST' })
      if (!res.ok) return null
      const j = await res.json()
      const run: AgentRun = j.run
      // Splice the new run in and refresh agent timestamps.
      setRuns(prev => [run, ...prev])
      setUnreadCount(prev => prev + (run.read ? 0 : 1))
      if (j?.agent) {
        setAgents(prev => prev.map(a => a.id === id
          ? { ...a, lastRunAt: j.agent.lastRunAt, nextRunAt: j.agent.nextRunAt }
          : a))
      }
      return run
    },

    async markRunRead(runId) {
      const target = runs.find(r => r.id === runId)
      if (!target || target.read) return
      setRuns(prev => prev.map(r => r.id === runId ? { ...r, read: true } : r))
      setUnreadCount(prev => Math.max(0, prev - 1))
      await fetch(`/api/agents/runs/${runId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      })
    },

    async markAllRunsRead() {
      const before = unreadCount
      setRuns(prev => prev.map(r => ({ ...r, read: true })))
      setUnreadCount(0)
      const res = await fetch('/api/agents/runs/mark-all-read', { method: 'POST' })
      if (!res.ok) {
        // Roll back optimism.
        setUnreadCount(before)
        refresh()
      }
    },
  }), [agents, runs, loading, synced, unreadCount, refresh])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAgents() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAgents must be used inside <AgentsProvider>')
  return v
}

// ── Helpers (kept identical to before so pages don't change) ────────────────
export function scheduleSummary(s: AgentSchedule): string {
  if (s.frequency === 'Real-time') return 'Real-time · as events fire'
  if (s.frequency === 'Daily')     return `Daily · ${s.time ?? ''} ${s.timezone ?? ''}`.trim()
  if (s.frequency === 'Weekly')    return `Weekly · ${s.day ?? 'Mon'} · ${s.time ?? ''} ${s.timezone ?? ''}`.trim()
  if (s.frequency === 'Monthly')   return `Monthly · 1st ${s.day ?? 'Mon'} · ${s.time ?? ''} ${s.timezone ?? ''}`.trim()
  return s.frequency
}

export function relTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const ms = Date.now() - d.getTime()
  if (ms < 0) {
    const fwd = -ms
    const m = Math.round(fwd / 60000), h = Math.round(fwd / 3600000), days = Math.round(fwd / 86400000)
    if (m < 60) return `in ${m}m`
    if (h < 48) return `in ${h}h`
    return `in ${days}d`
  }
  const m = Math.round(ms / 60000), h = Math.round(ms / 3600000), days = Math.round(ms / 86400000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function statusTone(s: AgentStatus): 'green'|'blue'|'amber'|'gray' {
  return s === 'Running' ? 'green' : s === 'Scheduled' ? 'blue' : s === 'Paused' ? 'amber' : 'gray'
}
