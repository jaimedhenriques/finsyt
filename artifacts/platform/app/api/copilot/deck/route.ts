/**
 * POST /api/copilot/deck
 * ─────────────────────
 * Generic deck-generation endpoint backed by `lib/deck-service.ts`.
 *
 * Body:
 *   {
 *     template: 'banker-pitch' | 'matrix-snapshot' | 'investment-memo',
 *     ticker?: string                  // banker-pitch / investment-memo
 *     matrix?: MatrixSnapshotInput     // matrix-snapshot
 *   }
 *
 * Returns: { fileId, downloadUrl, filename, bytes, expiresAt, slideTitles }
 *
 * The generated PPTX is stored in the same App Storage bucket the existing
 * memo route uses, so callers download it via /api/copilot/memo/<fileId>.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { putMemo } from '@/lib/memo-store'
import { renderDeck, deckSlideTitles } from '@/lib/deck-service'
import {
  bankerPitchTemplate,
  matrixSnapshotTemplate,
  investmentMemoTemplate,
  peerComparisonTemplate,
  type MatrixSnapshotInput,
} from '@/lib/deck-templates'
import { assembleBankerPitch, type BankerPitchOpts } from '@/lib/banker-pitch-data'
import { assembleInvestmentMemoData } from '@/lib/investment-memo-data'
import { assemblePeerComparison } from '@/lib/peer-comparison-deck'
import {
  withClerkContext,
  peerSetsTable,
  peerSetMembersTable,
  deckOverridesTable,
  audit,
} from '@workspace/db'
import { and, eq, inArray } from 'drizzle-orm'
import { getHouseStyle, applyHouseStyleToBrand, reformatNumberToHouseStyle, houseStyleAuditSummary } from '@/lib/house-style'
import { verifyDeck } from '@/lib/deliverable-verification'
import type { HouseStyle } from '@/lib/house-style'
import type { DeckTemplate } from '@/lib/deck-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RATE_WINDOW_MS = 5 * 60 * 1000
const RATE_MAX = 10
const rateBuckets = new Map<string, { count: number; resetAt: number }>()
function checkRate(key: string): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const b = rateBuckets.get(key)
  if (!b || b.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return { ok: true, remaining: RATE_MAX - 1, resetAt: now + RATE_WINDOW_MS }
  }
  if (b.count >= RATE_MAX) return { ok: false, remaining: 0, resetAt: b.resetAt }
  b.count += 1
  return { ok: true, remaining: RATE_MAX - b.count, resetAt: b.resetAt }
}

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/

/**
 * Optional deal-team-workspace overrides forwarded by the company /
 * deal team UI. Any value left undefined falls back to the assembler's
 * defaults. `peerSetId` resolves the workspace's saved peer set into a
 * concrete tickers array server-side (so the client doesn't need to
 * join the rows itself).
 */
interface DeckOverrides {
  peers?:           string[]
  peerSetId?:       string
  wacc?:            number
  terminalGrowth?:  number
  growthStage1?:    number
  growthStage2?:    number
}

interface DeckBody extends DeckOverrides {
  template?: 'banker-pitch' | 'matrix-snapshot' | 'investment-memo' | 'peer-comparison'
  ticker?:   string
  matrix?:   MatrixSnapshotInput
  /** peer-comparison: explicit ticker list (alternative to peerSetId). */
  symbols?:  unknown
  /** peer-comparison: anchor / subject ticker pinned at the top. */
  subject?:  string
  /** peer-comparison: deck title when an explicit symbol list is used. */
  setName?:  string
}

function clampDecimal(v: unknown, lo: number, hi: number): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return undefined
  if (n < lo || n > hi) return undefined
  return n
}

function sanitisePeerList(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const t = raw.trim().toUpperCase()
    if (!TICKER_RE.test(t)) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= 12) break
  }
  return out.length > 0 ? out : undefined
}

/**
 * Load the workspace's pinned deck overrides (peer set + DCF assumptions),
 * if any. Returns null when the caller has no active org or no row exists.
 * RLS on `deck_overrides` prevents cross-org reads.
 */
async function loadSavedOverrides(
  orgId: string,
  userId: string,
): Promise<{
  peerSetId: string | null
  wacc: number | null
  terminalGrowth: number | null
  growthStage1: number | null
  growthStage2: number | null
} | null> {
  try {
    return await withClerkContext(orgId, userId, async (tx) => {
      const rows = await tx
        .select()
        .from(deckOverridesTable)
        .where(eq(deckOverridesTable.orgId, orgId))
        .limit(1)
      if (rows.length === 0) return null
      const r = rows[0]
      return {
        peerSetId:      r.peerSetId ?? null,
        wacc:           r.wacc ?? null,
        terminalGrowth: r.terminalGrowth ?? null,
        growthStage1:   r.growthStage1 ?? null,
        growthStage2:   r.growthStage2 ?? null,
      }
    })
  } catch {
    return null
  }
}

/**
 * Resolve a workspace peer-set id to its symbol list. Returns null when
 * the caller has no active workspace or the set isn't found / readable.
 * RLS on `peer_sets` ensures cross-org reads are blocked.
 */
async function loadPeerSetTickers(
  setId: string,
  orgId: string,
  userId: string,
): Promise<string[] | null> {
  try {
    return await withClerkContext(orgId, userId, async (tx) => {
      const setRows = await tx
        .select()
        .from(peerSetsTable)
        .where(and(eq(peerSetsTable.id, setId), eq(peerSetsTable.orgId, orgId)))
        .limit(1)
      if (setRows.length === 0) return null
      const memberRows = await tx
        .select()
        .from(peerSetMembersTable)
        .where(and(
          eq(peerSetMembersTable.orgId, orgId),
          inArray(peerSetMembersTable.setId, [setId]),
        ))
      return memberRows
        .sort((a, b) => a.position - b.position)
        .map((r) => r.symbol.toUpperCase())
    })
  } catch {
    return null
  }
}

/**
 * Resolve a workspace peer-set id to its name + ordered symbol list for the
 * peer-comparison deck export. Returns null when the caller has no active
 * workspace or the set isn't found / readable (RLS-blocked).
 */
async function loadPeerSetForDeck(
  setId: string,
  orgId: string,
  userId: string,
): Promise<{ name: string; symbols: string[] } | null> {
  try {
    return await withClerkContext(orgId, userId, async (tx) => {
      const setRows = await tx
        .select()
        .from(peerSetsTable)
        .where(and(eq(peerSetsTable.id, setId), eq(peerSetsTable.orgId, orgId)))
        .limit(1)
      if (setRows.length === 0) return null
      const memberRows = await tx
        .select()
        .from(peerSetMembersTable)
        .where(and(
          eq(peerSetMembersTable.orgId, orgId),
          inArray(peerSetMembersTable.setId, [setId]),
        ))
      const symbols = memberRows
        .sort((a, b) => a.position - b.position)
        .map((r) => r.symbol.toUpperCase())
      return { name: setRows[0].name, symbols }
    })
  } catch {
    return null
  }
}

/**
 * Apply the org's house style to a freshly built deck template in place:
 *   1. Brand colors — deterministic override of the five configurable tokens
 *      (navy / ink / accent / positive / negative) on `context.brand`.
 *   2. Number formatting — reformat KPI metric values that deviate from the
 *      desk number convention (decimals / thousands / negative style). Only
 *      values that parse as a single number are touched; prose is left alone.
 * Returns the count of reformatted numbers so the caller can record it in the
 * audit trail. No-op when house style is disabled.
 */
function applyHouseStyleToDeck(tpl: DeckTemplate, hs: HouseStyle | null): { numbersReformatted: number } {
  if (!hs || !hs.enabled) return { numbersReformatted: 0 }
  tpl.context.brand = applyHouseStyleToBrand(tpl.context.brand, hs)
  const nf = hs.config.numberFormat
  let numbersReformatted = 0
  for (const section of tpl.sections) {
    if (section.type === 'kpi-table') {
      for (const metric of section.data.metrics) {
        const fixed = reformatNumberToHouseStyle(metric.value, nf)
        if (fixed !== null) {
          metric.value = fixed
          numbersReformatted++
        }
      }
    }
  }
  return { numbersReformatted }
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized — sign in to generate decks.' }, { status: 401 })
  }

  let body: DeckBody = {}
  try { body = await req.json() } catch { /* empty body handled below */ }
  const template = body.template || 'banker-pitch'

  const rate = checkRate(userId)
  if (!rate.ok) {
    const wait = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))
    return NextResponse.json({
      error: 'Rate limit exceeded. Please wait before generating another deck.',
      retryAfterSeconds: wait,
    }, { status: 429, headers: { 'Retry-After': String(wait) } })
  }

  const basePath = req.nextUrl.basePath || process.env.NEXT_PUBLIC_BASE_PATH || ''
  const baseUrl  = `${req.nextUrl.origin}${basePath}`
  const startedAt = Date.now()

  // House style is org-scoped; load once and apply to whichever template the
  // caller asked for. Failures here must never block deck generation.
  let houseStyle: HouseStyle | null = null
  if (orgId) {
    try { houseStyle = await getHouseStyle(orgId, userId) } catch { houseStyle = null }
  }

  try {
    let filename: string
    let ticker:   string
    let builtTpl: DeckTemplate

    if (template === 'banker-pitch') {
      const tickerRaw = (body.ticker || '').toString().trim().toUpperCase()
      if (!tickerRaw || !TICKER_RE.test(tickerRaw)) {
        return NextResponse.json({ error: `"${tickerRaw || ''}" doesn't look like a US-listed ticker. Try a symbol like MSFT or NVDA.` }, { status: 400 })
      }

      // Resolve overrides in three layers (most-specific wins):
      //   1. Explicit fields on the request body (manual one-off override).
      //   2. The workspace's saved deck overrides (pinned by the deal team
      //      via the company-page Overrides panel).
      //   3. Platform defaults inside `assembleBankerPitch`.
      const saved = orgId ? await loadSavedOverrides(orgId, userId) : null
      const peerSetIdFromBody = typeof body.peerSetId === 'string' && body.peerSetId
        ? body.peerSetId
        : null
      const effectivePeerSetId = peerSetIdFromBody ?? saved?.peerSetId ?? null

      let resolvedPeers = sanitisePeerList(body.peers)
      if (!resolvedPeers && effectivePeerSetId && orgId) {
        const tickers = await loadPeerSetTickers(effectivePeerSetId, orgId, userId)
        if (tickers && tickers.length > 0) resolvedPeers = tickers
      }
      const wacc           = clampDecimal(body.wacc,           0.01, 0.40) ?? clampDecimal(saved?.wacc,           0.01, 0.40)
      const terminalGrowth = clampDecimal(body.terminalGrowth, 0.00, 0.10) ?? clampDecimal(saved?.terminalGrowth, 0.00, 0.10)
      const growthStage1   = clampDecimal(body.growthStage1,  -0.20, 0.50) ?? clampDecimal(saved?.growthStage1,  -0.20, 0.50)
      const growthStage2   = clampDecimal(body.growthStage2,  -0.20, 0.30) ?? clampDecimal(saved?.growthStage2,  -0.20, 0.30)
      const opts: BankerPitchOpts = {
        peers: resolvedPeers,
        wacc,
        terminalGrowth,
        growthStage1,
        growthStage2,
      }

      const { pitch } = await assembleBankerPitch(baseUrl, tickerRaw, opts)
      const tpl = bankerPitchTemplate(pitch)
      builtTpl = tpl
      filename = `${pitch.ticker} Banker Pitch.pptx`.replace(/[\\/:*?"<>|]/g, '_')
      ticker = pitch.ticker

    } else if (template === 'matrix-snapshot') {
      if (!body.matrix || !Array.isArray(body.matrix.rows)) {
        return NextResponse.json({ error: 'matrix-snapshot template requires a `matrix` body with rows[].' }, { status: 400 })
      }
      const tpl = matrixSnapshotTemplate(body.matrix)
      builtTpl = tpl
      filename = `${body.matrix.matrixName || 'Matrix Snapshot'}.pptx`.replace(/[\\/:*?"<>|]/g, '_')
      ticker = 'MATRIX'

    } else if (template === 'investment-memo') {
      const tickerRaw = (body.ticker || '').toString().trim().toUpperCase()
      if (!tickerRaw || !TICKER_RE.test(tickerRaw)) {
        return NextResponse.json({ error: `"${tickerRaw || ''}" doesn't look like a US-listed ticker.` }, { status: 400 })
      }
      // Memo template — same code path as /api/copilot/memo (the legacy
      // `buildInvestmentMemoPptx` is a strict wrapper around exactly this
      // call), so we render directly through the deck service here.
      const memo = await assembleInvestmentMemoData(baseUrl, tickerRaw)
      const tpl = investmentMemoTemplate(memo)
      builtTpl = tpl
      filename = `${memo.identity.ticker} Investment Memo.pptx`.replace(/[\\/:*?"<>|]/g, '_')
      ticker = memo.identity.ticker

    } else if (template === 'peer-comparison') {
      // Resolve symbols from either an explicit list or a saved peer set.
      let symbols = sanitisePeerList(body.symbols) ?? []
      let setName = typeof body.setName === 'string' ? body.setName : null

      const peerSetId = typeof body.peerSetId === 'string' && body.peerSetId ? body.peerSetId : null
      if ((symbols.length === 0 || !setName) && peerSetId) {
        if (!orgId) return NextResponse.json({ error: 'No active workspace for this peer set.' }, { status: 409 })
        const detail = await loadPeerSetForDeck(peerSetId, orgId, userId)
        if (!detail) return NextResponse.json({ error: 'Peer set not found.' }, { status: 404 })
        if (symbols.length === 0) symbols = detail.symbols
        if (!setName) setName = detail.name
      }

      if (symbols.length === 0) {
        return NextResponse.json({ error: 'peer-comparison template requires a peerSetId or a symbols[] list.' }, { status: 400 })
      }

      const subjectRaw = (body.subject || '').toString().trim().toUpperCase()
      const subject = subjectRaw && TICKER_RE.test(subjectRaw) ? subjectRaw : null

      const input = await assemblePeerComparison(baseUrl, { symbols, subject, setName })
      const tpl = peerComparisonTemplate(input)
      builtTpl = tpl
      filename = `${(setName || 'Peer Comparison')} Peer Comparison.pptx`.replace(/[\\/:*?"<>|]/g, '_')
      ticker = subject || symbols[0] || 'PEERS'

    } else {
      return NextResponse.json({ error: `Unknown template "${template}". Supported: banker-pitch, matrix-snapshot, investment-memo, peer-comparison.` }, { status: 400 })
    }

    // Apply org house style (brand colors + number formatting) before render,
    // then emit the deck. Titles are computed post-application (house style
    // never changes slide titles, but keep the source of truth consistent).
    const hsApplied = applyHouseStyleToDeck(builtTpl, houseStyle)
    const titles = deckSlideTitles(builtTpl)

    // Pre-finalization verification (Task #519): run the deck through the same
    // pure verification engine the matrix export uses, so the generated
    // artifact's quality status is recorded as provenance before delivery.
    // Verification is advisory — it never blocks deck generation.
    let deckReport: ReturnType<typeof verifyDeck> | null = null
    try {
      deckReport = verifyDeck(builtTpl, {
        houseStyle: houseStyle ?? undefined,
      })
    } catch { deckReport = null }

    const buffer = await renderDeck(builtTpl)

    if (orgId && houseStyle?.enabled) {
      try {
        await audit.log({
          orgId,
          actorId: userId,
          actorType: 'user',
          action: 'deliverable.house_style_applied',
          resourceType: 'deck',
          resourceId: `${template}:${ticker}`,
          metadata: {
            template,
            ticker,
            numbersReformatted: hsApplied.numbersReformatted,
            houseStyle: houseStyleAuditSummary(houseStyle),
          },
        })
      } catch { /* audit must never block deck delivery */ }
    }

    if (orgId && deckReport) {
      try {
        await audit.log({
          orgId,
          actorId: userId,
          actorType: 'user',
          action: 'deliverable.verified',
          resourceType: 'deck',
          resourceId: `${template}:${ticker}`,
          metadata: {
            template,
            ticker,
            passed: deckReport.passed,
            houseStyleApplied: deckReport.houseStyleApplied,
            summary: deckReport.summary,
          },
        })
      } catch { /* audit must never block deck delivery */ }
    }

    const { fileId, expiresAt, bytes } = await putMemo({
      buffer, filename, ticker, userId,
      template,
      slides: titles.length,
    })

    const durationMs = Date.now() - startedAt
    console.log(JSON.stringify({
      event: 'copilot_deck_generated',
      template,
      userId,
      orgId: orgId || null,
      ticker,
      fileId,
      bytes,
      slides: titles.length,
      durationMs,
    }))

    return NextResponse.json({
      template,
      fileId,
      filename,
      bytes,
      expiresAt,
      ticker,
      slideTitles: titles,
      // Reuse the memo download endpoint — same bucket / object layout.
      downloadUrl: `${basePath}/api/copilot/memo/${fileId}`,
      rateLimit:   { remaining: rate.remaining, resetAt: rate.resetAt },
    }, {
      headers: {
        'X-RateLimit-Limit':     String(RATE_MAX),
        'X-RateLimit-Remaining': String(rate.remaining),
        'X-RateLimit-Reset':     String(Math.max(0, Math.ceil((rate.resetAt - Date.now()) / 1000))),
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'Deck generation failed' }, { status: 500 })
  }
}
