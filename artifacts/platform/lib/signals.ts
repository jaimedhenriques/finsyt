// Signal & decile back-test data layer for the Signals analytics page.
//
// The previous implementation mixed real NLP scores for a small handful of
// covered tickers with deterministic seeded (PRNG-derived) values for every
// other name in the universe. The platform now refuses to fabricate data of
// any kind, so until the NLP pipeline is wired through to a real signals
// store the ranking and returns endpoints intentionally surface
// `insufficient_data`. The Signals page already renders an explicit
// empty-state message for this shape.

export type SignalKey =
  | 'sentiment_change'
  | 'investment_score'
  | 'investment_score_change'
  | 'event_growth'
  | 'event_risk'
  | 'event_guidance'

export const SIGNALS: { key: SignalKey; label: string; short: string; unit: string; help: string }[] = [
  { key: 'sentiment_change',        label: 'Sentiment Change (30d)',     short: 'ΔSentiment', unit: 'σ',  help: 'Change in aggregate transcript & filing sentiment over the last 30 days.' },
  { key: 'investment_score',        label: 'Investment Score',           short: 'Score',      unit: '',   help: 'Composite NLP investment score (–100 to +100) from sentiment, guidance, risk and event mix.' },
  { key: 'investment_score_change', label: 'Investment Score Change',    short: 'ΔScore',     unit: '',   help: 'Month-over-month change in the composite Investment Score.' },
  { key: 'event_growth',            label: 'Event Score · Growth',       short: 'Growth',     unit: '',   help: 'Event-type score for growth-related language (expansion, demand, share gains).' },
  { key: 'event_risk',              label: 'Event Score · Risk',         short: 'Risk',       unit: '',   help: 'Event-type score for risk language (litigation, restatements, downgrades, supply).' },
  { key: 'event_guidance',          label: 'Event Score · Guidance',     short: 'Guidance',   unit: '',   help: 'Event-type score for forward guidance changes called out by management.' },
]

export type UniverseKey = 'sp500' | 'nasdaq100' | 'russell2000' | 'europe600' | 'japan225'

export const UNIVERSES: { key: UniverseKey; label: string; covered: boolean }[] = [
  { key: 'sp500',       label: 'S&P 500',       covered: false },
  { key: 'nasdaq100',   label: 'Nasdaq 100',    covered: false },
  { key: 'russell2000', label: 'Russell 2000',  covered: false },
  { key: 'europe600',   label: 'STOXX Europe 600', covered: false },
  { key: 'japan225',    label: 'Nikkei 225',    covered: false },
]

export const SECTORS = ['Technology','Communication','Consumer Disc.','Consumer Staples','Healthcare','Financials','Industrials','Energy','Materials','Utilities','Real Estate']
export const COUNTRIES = ['US','UK','Germany','France','Japan','Canada']

export interface RankRow {
  rank: number
  symbol: string
  name: string
  sector: string
  country: string
  marketCap: number
  date: string
  value: number
  spark: number[]
  priceChangePct: number
  source: 'nlp' | 'modeled'
}

export interface RankFilters {
  universe: UniverseKey
  signal: SignalKey
  sector?: string
  country?: string
  minCapB?: number
  asOfDate?: string
}

export interface RankResult {
  ok: true
  asOf: string
  universeSize: number
  coveredCount: number
  rows: RankRow[]
}

export interface InsufficientDataResult {
  ok: false
  reason: 'insufficient_data'
  message: string
}

const NOT_WIRED_MSG =
  'Signals are not yet wired to a live NLP pipeline. Ranking, decile back-tests, and per-ticker scores will become available once the pipeline ships. No synthesised values are returned.'

export function buildRanking(_f: RankFilters): RankResult | InsufficientDataResult {
  return { ok: false, reason: 'insufficient_data', message: NOT_WIRED_MSG }
}

export type ReturnInterval = 1 | 3 | 6 | 12
export type ReturnCalc = 'compounded' | 'simple'

export interface ReturnsFilters {
  universe: UniverseKey
  signal: SignalKey
  months: number
  interval: ReturnInterval
  calc: ReturnCalc
}

export interface ReturnsSeriesPoint {
  month: string
  d1: number
  d10: number
  benchmark: number
}

export interface ReturnsSummaryRow {
  horizon: string
  d1: number | null
  d10: number | null
  spread: number | null
}

export interface ReturnsResult {
  ok: true
  asOf: string
  series: ReturnsSeriesPoint[]
  summary: ReturnsSummaryRow[]
  benchmarkLabel: string
  observations: number
  rebalances: number
  decileSize: number
}

export function buildReturns(_f: ReturnsFilters): ReturnsResult | InsufficientDataResult {
  return { ok: false, reason: 'insufficient_data', message: NOT_WIRED_MSG }
}
