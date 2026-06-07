// NOTE: this module is server-side only — the only importer is
// `agent-scheduler.ts`, which itself carries `import 'server-only'` and is
// only loaded from `instrumentation.ts` under the `nodejs` runtime guard.
// We deliberately omit `import 'server-only'` here so the unit tests in
// `__tests__/filing-signal-watcher.test.ts` can run under plain `node:test`
// (the marker package throws synchronously outside React Server contexts).
import { and, eq } from 'drizzle-orm'
import { db } from '@workspace/db'
import type {
  LiveHighlightsSettings,
  RecordFilingSignalResult,
  ScoredFiling,
} from './live-highlights'

// ── Filing-signal watcher ───────────────────────────────────────────────────
//
// Live Highlights surfaces in-the-moment signals during earnings calls. This
// watcher extends that surface to *filings*: when a watchlisted company files a
// fresh document with the SEC and the workspace's `apify-actors` SEC EDGAR
// Intelligence connection scores it at or above the org's
// `filingScoreThreshold` (default 70), we pin a Live Highlight + fire the same
// bell/email/Slack alert the live-call engine uses.
//
// There is no internal filing-publish event bus today, so this module *polls*:
// the in-process cron (see `agent-scheduler.ts`) calls
// `tickFilingSignalWatcher()` every few minutes. Each tick:
//
//   1. Selects every org with Live Highlights enabled (cross-org scan via the
//      unrestricted owner role; per-org reads/writes are rebound to the org's
//      RLS context downstream).
//   2. For each org, builds its monitored ticker set (watchlist + ad-hoc −
//      disabled) and, per ticker, asks the org's Apify SEC EDGAR Intelligence
//      connection for recent scored filings.
//   3. Filters to filings scoring ≥ the org's threshold and routes each one
//      through `recordFilingSignalHighlight`, which is idempotent per
//      (org, accession): the dedup table makes a repeat or concurrent tick a
//      clean no-op so we never double-pin or double-page the same document.
//
// All side effects (DB queries, scoring calls, the highlight write) are
// dependency-injected so the unit tests can drive the full orchestration with
// fakes.

/** Synthetic actor id for the system-authored research note + audit row. */
export const FILING_SIGNAL_SYSTEM_USER = 'system:filing-signal'

/** Default per-tick cap on the number of (org, symbol) lookups. */
export const DEFAULT_MAX_LOOKUPS_PER_TICK = 60

/** Default per-org cap on monitored symbols scanned each tick. */
export const DEFAULT_MAX_SYMBOLS_PER_ORG = 25

// ── DI seams ─────────────────────────────────────────────────────────────────

/** Per-org configuration the orchestrator needs to decide what to scan. */
export interface OrgConfig {
  settings: LiveHighlightsSettings
  /** Uppercase ticker set: watchlist + ad-hoc − disabled. */
  monitoredSymbols: string[]
}

export type LoadOrgConfigFn = (clerkOrgId: string) => Promise<OrgConfig | null>
export type ScoreFilingsFn = (
  clerkOrgId: string,
  symbol: string,
) => Promise<ScoredFiling[]>
export type RecordHighlightFn = (args: {
  clerkOrgId: string
  userId: string
  settings: LiveHighlightsSettings
  filing: ScoredFiling
}) => Promise<RecordFilingSignalResult>

export interface TickOptions {
  /** Inject the owner DB client (defaults to the workspace `db`). */
  database?: typeof db
  /** Resolve per-org settings + monitored symbols. */
  loadOrgConfig?: LoadOrgConfigFn
  /** Fetch recent scored filings for one (org, symbol). */
  scoreFilings?: ScoreFilingsFn
  /** Pin + alert for one qualifying filing (idempotent per org+accession). */
  recordHighlight?: RecordHighlightFn
  /** System user id for the authored note / audit row. */
  systemUserId?: string
  /** Cap total (org, symbol) lookups per tick. */
  maxLookupsPerTick?: number
  /** Cap monitored symbols scanned per org per tick. */
  maxSymbolsPerOrg?: number
}

export interface TickResult {
  scannedOrgs: number
  scannedSymbols: number
  qualifyingFilings: number
  pinned: number
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Build the monitored ticker set for an org: its watchlist plus ad-hoc
 * symbols, minus the per-ticker opt-outs. Mirrors the live-call engine's
 * `monitorSet` so both surfaces watch exactly the same names.
 */
export function monitoredSymbolsFor(
  watchlist: string[],
  settings: Pick<LiveHighlightsSettings, 'adHocSymbols' | 'disabledSymbols'>,
): string[] {
  const out = new Set<string>()
  for (const s of watchlist) out.add(String(s).toUpperCase().trim())
  for (const s of settings.adHocSymbols) out.add(String(s).toUpperCase().trim())
  for (const s of settings.disabledSymbols) out.delete(String(s).toUpperCase().trim())
  out.delete('')
  return [...out]
}

/**
 * Filter freshly-scored filings down to the ones worth alerting on: a real
 * accession (our dedup key) and a score at or above the org threshold.
 * De-dupes by accession within the batch so a single tick never tries to
 * pin the same document twice.
 */
export function qualifyingFilings(
  filings: ScoredFiling[],
  threshold: number,
): ScoredFiling[] {
  const seen = new Set<string>()
  const out: ScoredFiling[] = []
  for (const f of filings) {
    const acc = String(f.accession || '').trim()
    if (!acc) continue
    if (!Number.isFinite(f.score) || f.score < threshold) continue
    const key = acc.replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(f)
  }
  return out
}

// ── Default IO impls ─────────────────────────────────────────────────────────

/**
 * Default per-org config loader: reads the durable Live Highlights settings
 * and the persisted watchlist, then derives the monitored symbol set. Returns
 * `null` when the workspace has Live Highlights turned off so the orchestrator
 * skips it cheaply.
 */
export const defaultLoadOrgConfig: LoadOrgConfigFn = async (clerkOrgId) => {
  const { getLiveHighlightsSettings } = await import('./live-highlights')
  const settings = await getLiveHighlightsSettings(clerkOrgId)
  if (!settings.enabled) return null
  const { getWatchlist } = await import('./watchlist-store')
  let watchlist: string[] = []
  try {
    watchlist = await getWatchlist(clerkOrgId)
  } catch {
    watchlist = []
  }
  return { settings, monitoredSymbols: monitoredSymbolsFor(watchlist, settings) }
}

/**
 * Default filing scorer: resolves the org's active `apify-actors` connection
 * and runs the `sec_filings_intelligence` actor for one ticker, normalising
 * every returned row into a `ScoredFiling`. Returns `[]` (never throws) when
 * the org has no connection or the actor errors, so one bad symbol/org never
 * aborts the tick.
 *
 * Mirrors `runScoreFiling` in `app/api/agent/ask/route.ts` so the watcher sees
 * the same scores the foreground agent does.
 */
export const defaultScoreFilings: ScoreFilingsFn = async (clerkOrgId, symbol) => {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return []

  let connectionId: string | null = null
  try {
    const { withOrgContext, connectionsTable, connectorDefinitionsTable } = await import('@workspace/db')
    const rows = await withOrgContext(clerkOrgId, (tx) =>
      tx
        .select({ id: connectionsTable.id, status: connectionsTable.status })
        .from(connectionsTable)
        .innerJoin(
          connectorDefinitionsTable,
          eq(connectorDefinitionsTable.id, connectionsTable.definitionId),
        )
        .where(
          and(
            eq(connectionsTable.orgId, clerkOrgId),
            eq(connectorDefinitionsTable.slug, 'apify-actors'),
          ),
        )
        .limit(1),
    )
    const row = rows[0]
    if (row && row.status === 'active') connectionId = row.id
  } catch {
    return []
  }
  if (!connectionId) return []

  try {
    const { executeConnectionOperation } = await import('@/lib/connectors/executor')
    const result = await executeConnectionOperation({
      orgId: clerkOrgId,
      connectionId,
      operation: 'sec_filings_intelligence',
      params: { ticker: sym, limit: 10 },
      actorId: null,
    })
    if (!result.ok) return []
    const items = Array.isArray(result.data) ? result.data : []
    const out: ScoredFiling[] = []
    for (const raw of items) {
      const norm = normalizeFiling(raw, sym)
      if (norm) out.push(norm)
    }
    return out
  } catch {
    return []
  }
}

/**
 * Normalise one raw Apify actor row into a `ScoredFiling`. Returns `null`
 * when the row has no accession (our dedup key). The score derivation matches
 * `runScoreFiling`: prefer the actor's explicit signal, else synthesise from
 * material-section count + form type.
 */
function normalizeFiling(raw: unknown, fallbackSymbol: string): ScoredFiling | null {
  const target = (raw ?? {}) as Record<string, unknown>
  const accession = String(
    target.accession ?? target.accessionNumber ?? target.accNum ?? '',
  ).trim()
  if (!accession) return null

  const materialSections: string[] = Array.isArray(target.materialSections)
    ? (target.materialSections as unknown[]).slice(0, 6).map((s) => String(s))
    : Array.isArray(target.highlights)
      ? (target.highlights as unknown[])
          .slice(0, 6)
          .map((h) => {
            const ho = (h ?? {}) as Record<string, unknown>
            return String(ho.section ?? ho.title ?? h)
          })
      : []

  const formType = (target.formType ?? target.form ?? null) as string | null
  const rawScore = Number(target.signalScore ?? target.score ?? target.signal)
  const score = Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, Math.round(rawScore)))
    : Math.min(100, materialSections.length * 12 + (formType === '10-K' ? 30 : 18))

  const attribution = String(
    target.summary ?? target.attribution ?? target.materialSummary ?? '',
  ).slice(0, 600)

  return {
    accession,
    symbol: String(target.ticker ?? fallbackSymbol).toUpperCase(),
    formType,
    score,
    filedAt: (target.filedAt ?? target.filingDate ?? target.filed ?? null) as string | null,
    attribution,
    materialSections,
  }
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Run one watcher tick. Safe to call concurrently — the in-process latch in
 * `agent-scheduler.ts` already prevents overlapping ticks per process.
 */
export async function tickFilingSignalWatcher(opts: TickOptions = {}): Promise<TickResult> {
  const database = opts.database ?? db
  const loadOrgConfig = opts.loadOrgConfig ?? defaultLoadOrgConfig
  const scoreFilings = opts.scoreFilings ?? defaultScoreFilings
  const recordHighlight = opts.recordHighlight ?? defaultRecordHighlight
  const systemUserId = opts.systemUserId ?? FILING_SIGNAL_SYSTEM_USER
  const lookupCap = opts.maxLookupsPerTick ?? DEFAULT_MAX_LOOKUPS_PER_TICK
  const perOrgCap = opts.maxSymbolsPerOrg ?? DEFAULT_MAX_SYMBOLS_PER_ORG

  // Cross-org scan via the unrestricted owner role. Per-org reads/writes are
  // rebound to each org's RLS context inside the injected helpers.
  const { liveHighlightsSettingsTable } = await import('@workspace/db')
  const orgRows = await database
    .select({ orgId: liveHighlightsSettingsTable.orgId })
    .from(liveHighlightsSettingsTable)
    .where(eq(liveHighlightsSettingsTable.enabled, true))

  let scannedOrgs = 0
  let scannedSymbols = 0
  let qualifying = 0
  let pinned = 0
  let lookups = 0

  for (const { orgId } of orgRows) {
    if (lookups >= lookupCap) break
    let cfg: OrgConfig | null = null
    try {
      cfg = await loadOrgConfig(orgId)
    } catch {
      cfg = null
    }
    if (!cfg || cfg.monitoredSymbols.length === 0) continue
    scannedOrgs++

    const symbols = cfg.monitoredSymbols.slice(0, perOrgCap)
    for (const symbol of symbols) {
      if (lookups >= lookupCap) break
      lookups++
      scannedSymbols++
      let filings: ScoredFiling[] = []
      try {
        filings = await scoreFilings(orgId, symbol)
      } catch {
        filings = []
      }
      const winners = qualifyingFilings(filings, cfg.settings.filingScoreThreshold)
      for (const filing of winners) {
        qualifying++
        try {
          const res = await recordHighlight({
            clerkOrgId: orgId,
            userId: systemUserId,
            settings: cfg.settings,
            filing,
          })
          if (res.pinned) pinned++
        } catch {
          // swallow — one filing must not abort the org/tick
        }
      }
    }
  }

  return { scannedOrgs, scannedSymbols, qualifyingFilings: qualifying, pinned }
}

/** Default highlight recorder — the real pin + alert path. */
const defaultRecordHighlight: RecordHighlightFn = async (args) => {
  const { recordFilingSignalHighlight } = await import('./live-highlights')
  return recordFilingSignalHighlight(args)
}
