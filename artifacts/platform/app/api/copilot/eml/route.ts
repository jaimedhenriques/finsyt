/**
 * POST /api/copilot/eml
 * ──────────────────────
 * Generates an Outlook-ready email draft (.eml) from a structured research
 * summary and streams it back as a direct download. The generated file opens
 * directly in Outlook, Apple Mail, Thunderbird, and most desktop clients as
 * a pre-populated draft ready to review and send.
 *
 * Two modes:
 *
 * 1. **Ticker mode** — supply `{ ticker }` only. The route assembles live
 *    investment memo data (same assembler as the Word/PPTX routes) and
 *    synthesises a research-summary email with real key points, metrics, and
 *    cited data sources.
 *
 * 2. **Content mode** — supply `{ subject, body, keyPoints?, citations? }`.
 *    Used by the AppShell agent answer export button: converts an existing
 *    agent answer into an .eml draft without a fresh data fetch.
 *
 * Response: message/rfc822 (.eml binary)
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { buildEmlBuffer } from '@/lib/eml-draft'
import { assembleInvestmentMemoData } from '@/lib/investment-memo-data'
import { isUnavailable } from '@/lib/investment-memo-pptx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RATE_WINDOW_MS = 5 * 60 * 1000
const RATE_MAX = 20
const rateBuckets = new Map<string, { count: number; resetAt: number }>()
function checkRate(key: string): { ok: boolean; resetAt: number } {
  const now = Date.now()
  const b = rateBuckets.get(key)
  if (!b || b.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return { ok: true, resetAt: now + RATE_WINDOW_MS }
  }
  if (b.count >= RATE_MAX) return { ok: false, resetAt: b.resetAt }
  b.count += 1
  return { ok: true, resetAt: b.resetAt }
}

const TICKER_RE_STRICT = /^[A-Z][A-Z0-9.\-]{0,9}$/

// ── Ticker-mode email builder ────────────────────────────────────────────────
async function buildTickerEmail(ticker: string, baseUrl: string): Promise<{
  subject: string; body: string; keyPoints: string[]; citations: string[]
}> {
  const memo = await assembleInvestmentMemoData(baseUrl, ticker)
  const id = memo.identity

  const keyPoints: string[] = []
  const citations: string[] = [
    'Financial Modeling Prep (FMP) — Quote, financials, peer multiples, M&A',
    'Finsyt DCF Model — Discounted cash-flow, intrinsic value range',
    'SEC EDGAR — Regulatory filings and disclosures',
  ]

  const lines: string[] = []

  // Overview
  if (!isUnavailable(memo.overview)) {
    const ov = memo.overview
    lines.push(ov.description)
    lines.push('')

    const price = ov.metrics.find(m => m.label === 'Price')?.value
    const mktCap = ov.metrics.find(m => m.label === 'Market Cap' || m.label === 'Mkt Cap')?.value
    const revenue = ov.metrics.find(m => m.label === 'Revenue' || m.label === 'LTM Revenue')?.value
    const peRatio = ov.metrics.find(m => m.label === 'P/E' || m.label === 'EV/EBITDA')?.value

    if (price)   keyPoints.push(`Current price: ${price}`)
    if (mktCap)  keyPoints.push(`Market cap: ${mktCap}`)
    if (revenue) keyPoints.push(`Revenue: ${revenue}`)
    if (peRatio) keyPoints.push(`${ov.metrics.find(m => m.value === peRatio)?.label}: ${peRatio}`)
  }

  // Valuation highlights
  if (!isUnavailable(memo.valuation)) {
    const val = memo.valuation
    const evRev = val.current.find(m => m.label.includes('EV/Rev') || m.label.includes('EV / Rev'))?.value
    const evEbi = val.current.find(m => m.label.includes('EBITDA'))?.value
    if (evRev) keyPoints.push(`EV/Revenue: ${evRev}`)
    if (evEbi) keyPoints.push(`EV/EBITDA: ${evEbi}`)

    if (val.forwardConsensus?.items.length) {
      lines.push('Street Consensus')
      val.forwardConsensus.items.forEach(i => {
        lines.push(`  • ${i.label}: ${i.value}`)
      })
      lines.push('')
    }
  }

  // DCF intrinsic value
  if (!isUnavailable(memo.dcf)) {
    const dcf = memo.dcf as any
    if (dcf.intrinsicValuePerShare != null) {
      keyPoints.push(`DCF intrinsic value: $${Number(dcf.intrinsicValuePerShare).toFixed(2)}/share`)
    }
    if (dcf.impliedUpside != null) {
      const upside = (Number(dcf.impliedUpside) * 100).toFixed(1)
      keyPoints.push(`Implied upside (DCF): ${upside}%`)
    }
  }

  // Qualitative thesis
  if (!isUnavailable(memo.qualitative)) {
    const q = memo.qualitative as any
    if (q.thesis?.length) {
      lines.push('Investment Thesis')
      q.thesis.slice(0, 3).forEach((t: string) => { lines.push(`  • ${t}`) })
      lines.push('')
    }
    if (q.catalysts?.length) {
      lines.push('Upcoming Catalysts (next 12 months)')
      q.catalysts.slice(0, 3).forEach((c: string) => { lines.push(`  • ${c}`) })
      lines.push('')
    }
  }

  lines.push('Please review all data before sharing — AI-generated content may contain inaccuracies. Source attribution is included below.')

  const sector = id.sector ? ` · ${id.sector}` : ''
  const subject = `${id.ticker} Research Brief — ${id.name}${sector}`
  const body = lines.filter(Boolean).join('\n')

  return { subject, body, keyPoints, citations }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized — sign in to generate email drafts.' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty */ }

  const rate = checkRate(userId)
  if (!rate.ok) {
    const wait = Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))
    return NextResponse.json(
      { error: 'Rate limit exceeded.', retryAfterSeconds: wait },
      { status: 429, headers: { 'Retry-After': String(wait) } }
    )
  }

  // ── Ticker mode: assemble live data and derive email content ────────────────
  const tickerRaw = typeof body.ticker === 'string' ? body.ticker.trim().toUpperCase() : ''
  const hasExplicitContent = typeof body.subject === 'string' && typeof body.body === 'string'

  if (tickerRaw && !hasExplicitContent) {
    if (!TICKER_RE_STRICT.test(tickerRaw)) {
      return NextResponse.json({ error: `"${tickerRaw}" is not a valid ticker.` }, { status: 400 })
    }

    const basePath = req.nextUrl.basePath || process.env.NEXT_PUBLIC_BASE_PATH || ''
    const baseUrl  = `${req.nextUrl.origin}${basePath}`

    try {
      const { subject, body: emailBody, keyPoints, citations } = await buildTickerEmail(tickerRaw, baseUrl)
      const asOf = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      const { buffer, filename } = buildEmlBuffer({ subject, body: emailBody, keyPoints, citations, ticker: tickerRaw, asOf })

      console.log(JSON.stringify({ event: 'copilot_eml_ticker_generated', userId, ticker: tickerRaw, bytes: buffer.byteLength }))

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'message/rfc822',
          'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
          'Content-Length': String(buffer.byteLength),
          'Cache-Control': 'private, no-store',
        },
      })
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message || 'Email generation failed' }, { status: 500 })
    }
  }

  // ── Content mode: explicit subject + body supplied ──────────────────────────
  const subject  = (typeof body.subject  === 'string' ? body.subject  : '').trim()
  const emailBody = (typeof body.body    === 'string' ? body.body     : '').trim()

  if (!subject) return NextResponse.json({ error: 'subject is required' }, { status: 400 })
  if (!emailBody) return NextResponse.json({ error: 'body is required' }, { status: 400 })

  const input = {
    subject,
    body: emailBody,
    keyPoints:  Array.isArray(body.keyPoints)  ? (body.keyPoints  as unknown[]).slice(0, 8).map(String)  : undefined,
    citations:  Array.isArray(body.citations)  ? (body.citations  as unknown[]).slice(0, 10).map(String) : undefined,
    fromName:   typeof body.fromName  === 'string' ? body.fromName.slice(0, 100)    : 'Finsyt Research',
    toAddress:  typeof body.toAddress === 'string' ? body.toAddress.slice(0, 200)  : undefined,
    ticker:     tickerRaw || undefined,
    asOf:       typeof body.asOf === 'string' ? body.asOf.slice(0, 40) : undefined,
  }

  const { buffer, filename } = buildEmlBuffer(input)

  console.log(JSON.stringify({ event: 'copilot_eml_generated', userId, ticker: input.ticker || null, bytes: buffer.byteLength }))

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'message/rfc822',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      'Content-Length': String(buffer.byteLength),
      'Cache-Control': 'private, no-store',
    },
  })
}
