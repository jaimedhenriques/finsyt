/**
 * Shared service that turns a ticker into a stored, downloadable
 * investment memo PPTX. Used by both:
 *
 *   - POST /api/copilot/memo  (direct REST endpoint)
 *   - POST /api/agent/ask     (deck-intent fast path that streams SSE)
 *
 * Centralising this logic keeps the assembler / builder / store / audit
 * sequence identical between the two surfaces and prevents the two
 * call sites from drifting.
 */
import { assembleInvestmentMemoData } from '@/lib/investment-memo-data'
import {
  buildInvestmentMemoPptx,
  buildSlideThumbnails,
  memoSlideTitles,
  type InvestmentMemoData,
} from '@/lib/investment-memo-pptx'
import { putMemo } from '@/lib/memo-store'

export type MemoStage =
  | 'assemble_start'
  | 'assemble_done'
  | 'build_start'
  | 'build_done'
  | 'store_done'

export interface MemoStageEvent {
  stage: MemoStage
  data?: InvestmentMemoData
  bytes?: number
  fileId?: string
}

export interface SectionAvailability {
  overview:     boolean
  valuation:    boolean
  peers:        boolean
  transactions: boolean
  dcf:          boolean
  qualitative:  boolean
}

export interface MemoThumbnail { index: number; title: string; src: string }

export interface MemoResult {
  fileId:       string
  filename:     string
  bytes:        number
  expiresAt:    number
  ticker:       string
  companyName:  string
  asOf:         string
  sourceLine:   string
  slideTitles:  string[]
  thumbnails:   MemoThumbnail[]
  sectionAvailability: SectionAvailability
  durationMs:   number
}

/** Errors thrown by `generateInvestmentMemo` carry an HTTP-style status hint. */
export class MemoGenerationError extends Error {
  status: number
  stage: 'assemble' | 'empty' | 'build' | 'store'
  constructor(stage: MemoGenerationError['stage'], status: number, message: string) {
    super(message)
    this.stage = stage
    this.status = status
  }
}

export function getSectionAvailability(data: InvestmentMemoData): SectionAvailability {
  return {
    overview:     !('unavailable' in data.overview),
    valuation:    !('unavailable' in data.valuation),
    peers:        !('unavailable' in data.peers),
    transactions: !('unavailable' in data.transactions),
    dcf:          !('unavailable' in data.dcf),
    qualitative:  !('unavailable' in data.qualitative),
  }
}

interface GenerateInput {
  baseUrl: string
  ticker:  string
  userId:  string
  orgId?:  string | null
  /** Tag distinguishing direct REST vs agent-intent invocations in audit logs. */
  source:  'copilot_memo_endpoint' | 'agent_ask_intent'
  /** Optional progress callback for surfaces that stream stage events. */
  onStage?: (e: MemoStageEvent) => void
}

/**
 * End-to-end memo generation. Throws `MemoGenerationError` with the
 * appropriate HTTP status on failure so callers can map to a response
 * (REST) or fail the SSE stream (agent).
 */
export async function generateInvestmentMemo(input: GenerateInput): Promise<MemoResult> {
  const { baseUrl, ticker, userId, orgId = null, source, onStage } = input
  const startedAt = Date.now()

  // 1) Assemble live data.
  onStage?.({ stage: 'assemble_start' })
  let data: InvestmentMemoData
  try {
    data = await assembleInvestmentMemoData(baseUrl, ticker)
  } catch (e) {
    throw new MemoGenerationError('assemble', 502, `Failed to assemble memo data: ${(e as Error).message}`)
  }

  const sa = getSectionAvailability(data)
  const availableCount = Object.values(sa).filter(Boolean).length

  // If quote couldn't resolve at all, the memo is effectively empty —
  // surface a specific error rather than producing a half-empty deck.
  const overviewMissing  = 'unavailable' in data.overview
  const valuationMissing = 'unavailable' in data.valuation
  const identityFellBack = !data.identity?.name || data.identity.name === ticker
  if (availableCount === 0 || (identityFellBack && overviewMissing && valuationMissing)) {
    throw new MemoGenerationError(
      'empty',
      404,
      `Couldn't resolve "${ticker}" — no quote, financials or fundamentals returned. Try another US-listed symbol like MSFT or NVDA.`,
    )
  }
  onStage?.({ stage: 'assemble_done', data })

  // 2) Render PPTX.
  // Attach a "Data sources used" trace mirroring the chat-surface footer.
  // Memo-service only knows its own internal pipeline (assemble + render),
  // not the upstream provider fan-out, so the appendix lists those two
  // synthetic stages — the chat answer footer carries the per-provider
  // detail that's surfaced live during streaming.
  const assembleMs = Date.now() - startedAt
  const hubBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  data.dataSources = [
    {
      label: 'Finsyt memo assembler',
      role: 'primary',
      detail: `Live data fan-out for ${data.identity.ticker}`,
      responseMs: assembleMs,
      hubHref: `${hubBase}/app/connectors`,
    },
    {
      label: 'pptxgenjs renderer',
      role: 'primary',
      detail: `${SLIDE_TITLES.length}-slide PPTX composition`,
    },
  ]

  onStage?.({ stage: 'build_start' })
  let buffer: Buffer
  try {
    buffer = await buildInvestmentMemoPptx(data)
  } catch (e) {
    throw new MemoGenerationError('build', 500, `PPTX build failed: ${(e as Error).message}`)
  }
  onStage?.({ stage: 'build_done', bytes: buffer.byteLength })

  // 3) Persist to App Storage (GCS).
  const filename = `${data.identity.ticker} Investment Memo.pptx`.replace(/[\\/:*?"<>|]/g, '_')
  let fileId: string, expiresAt: number, bytes: number
  try {
    ({ fileId, expiresAt, bytes } = await putMemo({
      buffer,
      filename,
      ticker: ticker.toUpperCase(),
      userId,
      template: 'investment-memo',
      slides: memoSlideTitles(data).length,
    }))
  } catch (e) {
    throw new MemoGenerationError('store', 500, `Memo upload failed: ${(e as Error).message}`)
  }
  onStage?.({ stage: 'store_done', fileId, bytes })

  // 4) Audit breadcrumb. Identical shape across surfaces; the `source`
  //    field distinguishes direct REST vs agent-intent invocations.
  const durationMs = Date.now() - startedAt
  console.log(JSON.stringify({
    event: 'copilot_memo_generated',
    source,
    userId,
    orgId,
    ticker: ticker.toUpperCase(),
    fileId,
    bytes,
    durationMs,
    sectionsAvailable: sa,
  }))

  const thumbs = buildSlideThumbnails(data)

  return {
    fileId,
    filename,
    bytes,
    expiresAt,
    ticker:      data.identity.ticker,
    companyName: data.identity.name,
    asOf:        data.asOf,
    sourceLine:  data.sourceLine,
    // Reflects the actual deck shape: cover + 6 memo slides + sources slide
    // (8 entries). Sourced from the memo module so it stays in lockstep with
    // what `buildInvestmentMemoPptx` actually emits.
    slideTitles: memoSlideTitles(data),
    thumbnails:  thumbs.map((t, i) => ({ index: i + 1, title: t.title, src: t.svg })),
    sectionAvailability: sa,
    durationMs,
  }
}
