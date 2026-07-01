/**
 * Function-code registry — a Bloomberg/terminal-style command vocabulary for
 * the Finsyt platform. Type a ticker plus a short mnemonic (e.g. `AAPL DES`,
 * `NVDA FA`, `TSLA PEERS`) to jump straight to any company surface, or a bare
 * code (e.g. `MACRO`, `SCR`) to open a global workspace — all keyboard-first.
 *
 * This is the single source of truth consumed by:
 *   • the topbar CommandInput (inline suggestions + Enter-to-run)
 *   • the ⌘K CommandPalette (fuzzy-searchable entries)
 *   • the command-help affordance
 *
 * Codes are data-driven: add an entry to FUNCTION_CODES and every surface
 * picks it up. Each resolver returns either a route to push or an `ask`
 * action that seeds the global Finsyt Agent drawer.
 */

export type CommandResolution =
  | { kind: 'route'; route: string }
  | { kind: 'ask'; prompt: string; autoSubmit?: boolean }

export type FunctionScope = 'company' | 'global'

export interface FunctionCode {
  /** Canonical mnemonic, uppercase (e.g. 'DES'). */
  code: string
  /** Extra accepted spellings, uppercase (e.g. 'OVERVIEW' for DES). */
  aliases?: string[]
  /** Short human label shown in suggestion rows and the palette. */
  label: string
  /** One-line description of where the code goes / what it does. */
  description: string
  /**
   * `company` codes require a ticker (`AAPL FA`); `global` codes stand alone
   * (`MACRO`). The parser uses this to decide how to interpret tokens.
   */
  scope: FunctionScope
  /** Produce a destination route or an agent action. */
  resolve: (symbol?: string) => CommandResolution
}

const companyTab = (sym: string, tab: string): CommandResolution => ({
  kind: 'route',
  route: `/app/company/${sym}?tab=${tab}`,
})

export const FUNCTION_CODES: FunctionCode[] = [
  // ── Company codes (require a ticker) ──────────────────────────────────────
  {
    code: 'DES', aliases: ['OVERVIEW', 'O'], label: 'Description / Overview',
    description: 'Company overview, price chart and snapshot', scope: 'company',
    resolve: (s) => ({ kind: 'route', route: `/app/company/${s}` }),
  },
  {
    code: 'GP', aliases: ['CHART', 'PRICE'], label: 'Graph / Price',
    description: 'Price chart on the company overview', scope: 'company',
    resolve: (s) => ({ kind: 'route', route: `/app/company/${s}` }),
  },
  {
    code: 'FA', aliases: ['FIN', 'FINANCIALS'], label: 'Financials',
    description: 'Income, balance sheet, cash flow and ratios', scope: 'company',
    resolve: (s) => companyTab(s!, 'financials'),
  },
  {
    code: 'EST', aliases: ['ESTIMATES'], label: 'Estimates',
    description: 'Sell-side consensus estimates', scope: 'company',
    resolve: (s) => companyTab(s!, 'estimates'),
  },
  {
    code: 'N', aliases: ['NEWS'], label: 'News',
    description: 'Latest company news & signals', scope: 'company',
    resolve: (s) => companyTab(s!, 'news'),
  },
  {
    code: 'CALL', aliases: ['TR', 'TRANSCRIPTS', 'CN'], label: 'Transcripts',
    description: 'Earnings-call transcripts & synced player', scope: 'company',
    resolve: (s) => companyTab(s!, 'transcripts'),
  },
  {
    code: 'FIL', aliases: ['FILINGS', 'F'], label: 'Filings',
    description: 'SEC filings (10-K / 10-Q / 8-K / Form 4)', scope: 'company',
    resolve: (s) => companyTab(s!, 'filings'),
  },
  {
    code: 'OWN', aliases: ['OWNERSHIP', 'HDS'], label: 'Ownership',
    description: 'Holders, insiders and institutional ownership', scope: 'company',
    resolve: (s) => companyTab(s!, 'ownership'),
  },
  {
    code: 'Q', aliases: ['QUESTIONS', 'QA'], label: 'Analyst Questions',
    description: 'Clustered analyst Q&A themes', scope: 'company',
    resolve: (s) => companyTab(s!, 'questions'),
  },
  {
    code: 'VAL', aliases: ['VALUATIONS', 'FF'], label: 'Valuations',
    description: 'Football-field valuation ranges', scope: 'company',
    resolve: (s) => ({ kind: 'route', route: `/app/valuations/${s}` }),
  },
  {
    code: 'PEERS', aliases: ['PEER', 'COMP', 'RV'], label: 'Peers',
    description: 'Peer basket comparison', scope: 'company',
    resolve: (s) => ({ kind: 'route', route: `/app/company/${s}/peers` }),
  },
  {
    code: 'AI', aliases: ['ANALYSIS'], label: 'AI Analysis',
    description: 'AI-extracted analysis for this company', scope: 'company',
    resolve: (s) => companyTab(s!, 'ai-analysis'),
  },
  {
    code: 'SUM', aliases: ['SUMMARY', 'ASK'], label: 'Ask: Summarise',
    description: 'Ask the Finsyt Agent for a quick company summary', scope: 'company',
    resolve: (s) => ({
      kind: 'ask',
      prompt: `Give me a concise institutional summary of ${s}: what it does, latest results, valuation and the key debate right now. Cite sources.`,
      autoSubmit: true,
    }),
  },

  // ── Global codes (no ticker) ──────────────────────────────────────────────
  {
    code: 'MACRO', aliases: ['MAC'], label: 'Macro',
    description: 'Macro workspace', scope: 'global',
    resolve: () => ({ kind: 'route', route: '/app/macro' }),
  },
  {
    code: 'SCR', aliases: ['SCREEN', 'SCREENER', 'EQS'], label: 'Screener',
    description: 'Equity screener', scope: 'global',
    resolve: () => ({ kind: 'route', route: '/app/screener' }),
  },
  {
    code: 'MKT', aliases: ['MARKETS', 'MOV'], label: 'Markets',
    description: 'Markets overview', scope: 'global',
    resolve: () => ({ kind: 'route', route: '/app/markets' }),
  },
  {
    code: 'WL', aliases: ['WATCH', 'WATCHLIST'], label: 'Watchlist',
    description: 'My watchlist', scope: 'global',
    resolve: () => ({ kind: 'route', route: '/app/watchlist' }),
  },
  {
    code: 'PORT', aliases: ['PORTFOLIO', 'PRT'], label: 'Portfolio',
    description: 'Portfolio & risk analytics', scope: 'global',
    resolve: () => ({ kind: 'route', route: '/app/portfolio' }),
  },
  {
    code: 'CAL', aliases: ['CALENDAR', 'ERN'], label: 'Calendar',
    description: 'Earnings & events calendar', scope: 'global',
    resolve: () => ({ kind: 'route', route: '/app/calendar' }),
  },
  {
    code: 'DEALS', aliases: ['MA', 'MNA'], label: 'Deals & M&A',
    description: 'Latest deals and M&A activity', scope: 'global',
    resolve: () => ({ kind: 'route', route: '/app/deals' }),
  },
  {
    code: 'NEWS', aliases: ['TOP'], label: 'News & Signals',
    description: 'Cross-market news & signals feed', scope: 'global',
    resolve: () => ({ kind: 'route', route: '/app/news' }),
  },
  {
    code: 'AG', aliases: ['AGENTS'], label: 'Agents',
    description: 'My research agents', scope: 'global',
    resolve: () => ({ kind: 'route', route: '/app/agents' }),
  },
]

// ── Lookup helpers ──────────────────────────────────────────────────────────

const CODE_INDEX: Map<string, FunctionCode> = (() => {
  const m = new Map<string, FunctionCode>()
  for (const fc of FUNCTION_CODES) {
    m.set(fc.code.toUpperCase(), fc)
    for (const a of fc.aliases ?? []) m.set(a.toUpperCase(), fc)
  }
  return m
})()

/** Resolve a typed token (canonical or alias, any case) to a FunctionCode. */
export function lookupCode(token: string): FunctionCode | undefined {
  return CODE_INDEX.get(token.trim().toUpperCase())
}

/** A token shaped like a ticker: letters, optional `.`/`-`, ≤10 chars. */
export function isTickerToken(token: string): boolean {
  return /^[A-Za-z][A-Za-z.\-]{0,9}$/.test(token)
}

export interface ParsedCommand {
  /** Uppercased ticker, when a `TICKER CODE` pattern was recognised. */
  symbol?: string
  /** The matched function code, when recognised. */
  code?: FunctionCode
  /** Original trimmed input. */
  freeText: string
}

/**
 * Parse topbar input into a structured command.
 *
 *   `AAPL FA`  → { symbol: 'AAPL', code: FA }
 *   `MACRO`    → { code: MACRO }
 *   `why is …` → { freeText } (falls through to the Ask flow)
 */
export function parseCommand(input: string): ParsedCommand {
  const raw = input.trim()
  if (!raw) return { freeText: raw }
  const tokens = raw.split(/\s+/)

  // Single token: only a global code counts (a lone ticker stays free text so
  // it falls through to the Ask flow rather than guessing a destination).
  if (tokens.length === 1) {
    const g = lookupCode(tokens[0])
    if (g && g.scope === 'global') return { code: g, freeText: raw }
    return { freeText: raw }
  }

  // Two+ tokens: TICKER CODE (exactly two meaningful tokens).
  const [first, second] = tokens
  if (tokens.length === 2 && isTickerToken(first)) {
    const c = lookupCode(second)
    if (c && c.scope === 'company') {
      return { symbol: first.toUpperCase(), code: c, freeText: raw }
    }
  }

  // A leading global code with trailing text (e.g. `SCR tech`) still routes.
  const g = lookupCode(first)
  if (g && g.scope === 'global') return { code: g, freeText: raw }

  return { freeText: raw }
}

export interface CommandSuggestion {
  /** Stable key for React. */
  id: string
  code: FunctionCode
  /** Ticker to resolve with, when this is a company-scoped suggestion. */
  symbol?: string
  /** What to render as the primary text, e.g. `AAPL FA` or `MACRO`. */
  display: string
}

/**
 * Compute inline suggestions for the current raw input. Drives the topbar
 * dropdown.
 *
 *   `AAPL `   → all company codes for AAPL
 *   `AAPL f`  → company codes for AAPL matching "f"
 *   `mac`     → global codes matching "mac"
 */
export function suggestCommands(input: string, limit = 8): CommandSuggestion[] {
  const value = input.replace(/^\s+/, '')
  if (!value) return []

  // Pattern A: ticker, a space, then an optional partial code.
  const tickerSpace = value.match(/^([A-Za-z][A-Za-z.\-]{0,9})\s+(\S*)$/)
  if (tickerSpace) {
    const sym = tickerSpace[1].toUpperCase()
    const partial = tickerSpace[2].toUpperCase()
    const matches = FUNCTION_CODES.filter(fc => fc.scope === 'company' && codeMatches(fc, partial))
    return matches.slice(0, limit).map(fc => ({
      id: `co:${sym}:${fc.code}`,
      code: fc,
      symbol: sym,
      display: `${sym} ${fc.code}`,
    }))
  }

  // Pattern B: a single token with no space — offer matching global codes.
  if (!/\s/.test(value)) {
    const partial = value.toUpperCase()
    const matches = FUNCTION_CODES.filter(fc => fc.scope === 'global' && codeMatches(fc, partial))
    return matches.slice(0, limit).map(fc => ({
      id: `g:${fc.code}`,
      code: fc,
      display: fc.code,
    }))
  }

  return []
}

function codeMatches(fc: FunctionCode, partial: string): boolean {
  if (!partial) return true
  if (fc.code.startsWith(partial)) return true
  if (fc.aliases?.some(a => a.toUpperCase().startsWith(partial))) return true
  return fc.label.toUpperCase().includes(partial)
}
