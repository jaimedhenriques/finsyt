// Resolves and parses the real investor deck PDF that an issuer publishes
// alongside each earnings call.
//
// Strategy
// ────────
// 1. Try a per-issuer resolver to compute a stable URL on the issuer's CDN
//    (Apple's newsroom CDN and Tesla's digitalassets CDN both publish under
//    deterministic, versioned paths). Returns the actual PDF URL when found.
// 2. Fetch and parse the PDF with pdf-parse, then split into slides by page.
//    Each slide carries the page's title (first non-empty line) and a few
//    bullets (subsequent text snippets) plus the deep-link `pageNumber` so
//    SlidesViewer can render the actual page in an embedded viewer.
// 3. If no deck PDF is resolvable for that call, fall back to a deck composed
//    from the company's reported financials for that quarter — clearly
//    labeled as `fallback-financials` so the UI surfaces the source.
//
// The previous behavior (a single hard-coded NVIDIA template applied to every
// company and every quarter) is fully removed — no synthesized numbers are
// ever attributed to an issuer they don't belong to.

// @ts-expect-error pdf-parse ships JS without bundled .d.ts; runtime is fine.
import pdfParse from 'pdf-parse'

const FMP = process.env.FMP_API_KEY || ''

export interface DeckSlide {
  id: string
  title: string
  bullets: string[]
  chartType?: 'bar' | 'line' | 'table'
  pageNumber?: number
}

export type DeckSource = 'real-pdf' | 'fallback-financials' | 'fallback-empty'

export interface BuiltDeck {
  slides: DeckSlide[]
  deckSource: DeckSource
  deckPageUrl: string | null
  deckPdfUrl: string | null
}

// IR landing pages where each issuer publishes its official earnings deck.
const IR_DECK_PAGES: Record<string, string> = {
  NVDA:  'https://investor.nvidia.com/financial-info/financial-reports/',
  AAPL:  'https://www.apple.com/investor/earnings-call/',
  MSFT:  'https://www.microsoft.com/en-us/investor/earnings/recent-earnings',
  GOOGL: 'https://abc.xyz/investor/earnings/',
  GOOG:  'https://abc.xyz/investor/earnings/',
  META:  'https://investor.atmeta.com/financials/quarterly-earnings/',
  AMZN:  'https://ir.aboutamazon.com/quarterly-results/',
  TSLA:  'https://ir.tesla.com/#quarterly-disclosure',
  AVGO:  'https://investors.broadcom.com/financial-information/quarterly-results',
  AMD:   'https://ir.amd.com/financial-information/quarterly-results',
  ORCL:  'https://investor.oracle.com/financial-reporting/quarterly-earnings/default.aspx',
  CRM:   'https://investor.salesforce.com/financials/default.aspx',
  NFLX:  'https://ir.netflix.net/financials/quarterly-earnings/default.aspx',
  ADBE:  'https://www.adobe.com/investor-relations/financial-documents.html',
  INTC:  'https://www.intc.com/financial-info/financial-results',
  IBM:   'https://www.ibm.com/investor/events/earnings',
  CSCO:  'https://investor.cisco.com/financial-information/quarterly-results/default.aspx',
  QCOM:  'https://investor.qualcomm.com/financial-information/quarterly-results',
  TXN:   'https://investor.ti.com/financial-information/quarterly-results',
  MU:    'https://investors.micron.com/financial-information/financial-results',
}

export function irDeckPageFor(symbol: string): string | null {
  return IR_DECK_PAGES[symbol.toUpperCase()] || null
}

// ── Per-issuer deck-PDF resolvers ─────────────────────────────────────────
// Each resolver returns a candidate URL (or null). We HEAD-check the URL
// before using it. Apple uses fiscal-year naming aligned to the calendar
// quarter the call announces; Tesla uses calendar quarter directly.

type DeckResolver = (year: number, quarter: number) => string | null

const DECK_RESOLVERS: Record<string, DeckResolver> = {
  AAPL: (y, q) => {
    const yy = String(y).slice(-2)
    return `https://www.apple.com/newsroom/pdfs/fy${y}-q${q}/FY${yy}_Q${q}_Consolidated_Financial_Statements.pdf`
  },
  TSLA: (y, q) => `https://digitalassets.tesla.com/tesla-contents/image/upload/IR/TSLA-Q${q}-${y}-Update.pdf`,
}

async function headOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) })
    return r.ok
  } catch {
    return false
  }
}

async function resolveDeckPdfUrl(symbol: string, year: number, quarter: number): Promise<string | null> {
  const resolver = DECK_RESOLVERS[symbol.toUpperCase()]
  if (!resolver) return null
  const candidate = resolver(year, quarter)
  if (!candidate) return null
  return (await headOk(candidate)) ? candidate : null
}

// ── PDF extraction ────────────────────────────────────────────────────────
// pdf-parse delivers the full text concatenated; pages are separated by a
// form-feed character (\f) when the underlying PDF preserves page breaks.
// We split on \f and then tease a title (first non-trivial line) and up to
// 5 bullet lines (subsequent non-empty lines, deduplicated, length-capped)
// from each page. Pages that look like pure boilerplate (legal disclaimer,
// safe-harbor) are filtered.

const BOILERPLATE_RE = /(safe harbor|forward[- ]looking|disclaimer|trademarks|table of contents|appendix)/i

// Lines that look like running page headers (issuer name, "Page N",
// "Confidential", etc.) — we skip them when picking the slide title so the
// title reflects the page's actual subject (e.g. "CONDENSED CONSOLIDATED
// STATEMENTS OF OPERATIONS") rather than the running header.
const HEADER_RE = /^(page\s+\d+|confidential|©|copyright|q[1-4]\s*['′]?\d{2,4})/i

function isLikelyHeader(line: string, allLines: string[]): boolean {
  if (HEADER_RE.test(line)) return true
  // A short line that looks like a company name (≤ 4 words, ends with Inc./Corp./etc.)
  if (line.length < 40 && /\b(Inc|Corp|Corporation|Co|LLC|N\.V|plc|Ltd|S\.A)\.?$/i.test(line)) return true
  // Repeated across many pages → almost certainly a running header
  return allLines.filter(l => l === line).length >= 3
}

function extractSlidesFromText(text: string): { title: string; bullets: string[] }[] {
  const pages = text.split(/\f/).map(p => p.trim()).filter(Boolean)
  // Build a flat list of lines across pages so we can detect repeated headers.
  const allLines = pages.flatMap(p => p.split('\n').map(l => l.replace(/\s+/g, ' ').trim()))

  return pages.map(page => {
    const lines = page
      .split('\n')
      .map(l => l.replace(/\s+/g, ' ').trim())
      .filter(l => l.length > 1 && l.length < 240 && !/^\d+$/.test(l))
    // Pick the first non-header line as the title; fall back to the first
    // line so we always have something.
    const titleIdx = lines.findIndex(l => !isLikelyHeader(l, allLines))
    const title = (titleIdx >= 0 ? lines[titleIdx] : lines[0]) || 'Slide'
    const seen = new Set<string>([title.toLowerCase()])
    const bullets: string[] = []
    for (const l of lines) {
      if (l === title) continue
      if (isLikelyHeader(l, allLines)) continue
      const key = l.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      bullets.push(l)
      if (bullets.length >= 5) break
    }
    return { title, bullets }
  })
}

// pdf-parse's default text concatenation drops page boundaries; we override
// `pagerender` to emit a form-feed (\f) between pages so we can split the
// concatenated text back into per-page slides downstream.
async function renderPage(pageData: any): Promise<string> {
  const tc = await pageData.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false })
  let last = -1
  let out = ''
  for (const item of tc.items) {
    if (last !== -1 && last !== item.transform[5]) out += '\n'
    out += item.str
    last = item.transform[5]
  }
  return out + '\f'
}

async function fetchAndParseDeck(url: string): Promise<{ title: string; bullets: string[] }[] | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    const parsed = await pdfParse(buf, { pagerender: renderPage })
    const slides = extractSlidesFromText(parsed.text || '')
    if (!slides.length) return null
    // Drop trailing pages that are clearly back-matter so the UI deck stays
    // focused on operating content. Keep at least 3 slides.
    const filtered = slides.filter(s => !BOILERPLATE_RE.test(s.title))
    return (filtered.length >= 3 ? filtered : slides).slice(0, 16)
  } catch {
    return null
  }
}

// ── FMP helpers (used only for the financial-data fallback) ───────────────

async function fmpFetch(path: string): Promise<any[]> {
  if (!FMP) return []
  const sep = path.includes('?') ? '&' : '?'
  try {
    const r = await fetch(`https://financialmodelingprep.com${path}${sep}apikey=${FMP}`, { next: { revalidate: 3600 } })
    if (!r.ok) return []
    const j = await r.json()
    return Array.isArray(j) ? j : []
  } catch {
    return []
  }
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e3)  return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !isFinite(n)) return '—'
  return `${(n * 100).toFixed(digits)}%`
}

function fmtDelta(curr: number | null | undefined, prev: number | null | undefined): string {
  if (curr == null || prev == null || !isFinite(curr) || !isFinite(prev) || prev === 0) return '—'
  const d = (curr - prev) / Math.abs(prev)
  return `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}% YoY`
}

interface FinancialRow { date?: string; [k: string]: unknown }

function pickByDate(rows: FinancialRow[], callDate: Date | null): FinancialRow | null {
  if (!rows.length) return null
  if (!callDate) return rows[0] || null
  const ms = (d?: string) => (d ? new Date(d).getTime() : NaN)
  const ts = callDate.getTime()
  const candidates = rows
    .filter(r => r.date && ms(r.date) <= ts && (ts - ms(r.date)) < 120 * 86400e3)
    .sort((a, b) => ms(b.date) - ms(a.date))
  if (candidates[0]) return candidates[0]
  return [...rows].sort((a, b) => Math.abs(ms(a.date) - ts) - Math.abs(ms(b.date) - ts))[0] || null
}

function pickPriorYear(rows: FinancialRow[], currentDate: string | null): FinancialRow | null {
  if (!currentDate || !rows.length) return null
  const target = new Date(currentDate).getTime() - 365 * 86400e3
  const ms = (d?: string) => (d ? new Date(d).getTime() : NaN)
  return [...rows].sort((a, b) => Math.abs(ms(a.date) - target) - Math.abs(ms(b.date) - target))[0] || null
}

async function buildFinancialDeck(symbol: string, year: number, quarter: number, callDateStr: string | null): Promise<DeckSlide[]> {
  const sym = symbol.toUpperCase()
  const [income, cashflow, balance] = await Promise.all([
    fmpFetch(`/stable/income-statement?symbol=${sym}&period=quarter&limit=12`),
    fmpFetch(`/stable/cash-flow-statement?symbol=${sym}&period=quarter&limit=12`),
    fmpFetch(`/stable/balance-sheet-statement?symbol=${sym}&period=quarter&limit=12`),
  ])
  let callDate: Date | null = null
  if (callDateStr) { const d = new Date(callDateStr); if (!isNaN(d.getTime())) callDate = d }
  if (!callDate) {
    const m = ({ 1: 3, 2: 6, 3: 9, 4: 12 } as Record<number, number>)[quarter] || 12
    callDate = new Date(`${year}-${String(m).padStart(2, '0')}-15`)
  }
  const is   = pickByDate(income, callDate) as Record<string, number | undefined> | null
  const isPY = pickPriorYear(income, (is?.date as unknown as string) ?? null) as Record<string, number | undefined> | null
  const cf   = pickByDate(cashflow, callDate) as Record<string, number | undefined> | null
  const bs   = pickByDate(balance, callDate)  as Record<string, number | undefined> | null

  if (!is) return []

  const slides: DeckSlide[] = [
    {
      id: '1',
      title: `Q${quarter} ${year} highlights (from reported financials)`,
      chartType: 'bar',
      bullets: [
        `Revenue ${fmtMoney(is.revenue)} (${fmtDelta(is.revenue, isPY?.revenue)})`,
        `Gross margin ${fmtPct(is.grossProfitRatio)} · Operating margin ${fmtPct(is.operatingIncomeRatio)}`,
        `Net income ${fmtMoney(is.netIncome)} (${fmtDelta(is.netIncome, isPY?.netIncome)})`,
        `Diluted EPS ${is.epsdiluted != null ? `$${Number(is.epsdiluted).toFixed(2)}` : '—'} (${fmtDelta(is.epsdiluted, isPY?.epsdiluted)})`,
      ],
    },
    {
      id: '2',
      title: 'Margin profile',
      chartType: 'line',
      bullets: [
        `Gross margin ${fmtPct(is.grossProfitRatio)} (vs ${fmtPct(isPY?.grossProfitRatio)} PY)`,
        `EBITDA margin ${fmtPct(is.ebitdaratio)} (vs ${fmtPct(isPY?.ebitdaratio)} PY)`,
        `Operating margin ${fmtPct(is.operatingIncomeRatio)} (vs ${fmtPct(isPY?.operatingIncomeRatio)} PY)`,
        `Net margin ${fmtPct(is.netIncomeRatio)} (vs ${fmtPct(isPY?.netIncomeRatio)} PY)`,
      ],
    },
  ]
  if (cf || bs) {
    slides.push({
      id: '3',
      title: 'Cash & capital allocation',
      chartType: 'table',
      bullets: [
        `Operating cash flow ${fmtMoney(cf?.operatingCashFlow)}`,
        `Free cash flow ${fmtMoney(cf?.freeCashFlow)} (capex ${fmtMoney(cf?.capitalExpenditure)})`,
        `Buybacks ${fmtMoney(cf?.commonStockRepurchased)} · Dividends ${fmtMoney(cf?.dividendsPaid)}`,
        `Cash & ST investments ${fmtMoney(bs?.cashAndShortTermInvestments)}`,
      ].filter(b => !b.endsWith('—')),
    })
  }
  return slides
}

// ── Public entry point ────────────────────────────────────────────────────

export async function buildRealDeck(
  symbol: string,
  year: string | number,
  quarter: string | number,
  callDateStr?: string | null,
): Promise<BuiltDeck> {
  const sym = symbol.toUpperCase()
  const y   = Number(year)
  const q   = Number(quarter)
  const deckPageUrl = irDeckPageFor(sym)

  // 1. Try the real published deck PDF.
  if (Number.isFinite(y) && Number.isFinite(q)) {
    const deckPdfUrl = await resolveDeckPdfUrl(sym, y, q)
    if (deckPdfUrl) {
      const pages = await fetchAndParseDeck(deckPdfUrl)
      if (pages && pages.length) {
        const slides: DeckSlide[] = pages.map((p, i) => ({
          id: String(i + 1),
          title: p.title,
          bullets: p.bullets,
          pageNumber: i + 1,
        }))
        return { slides, deckSource: 'real-pdf', deckPageUrl, deckPdfUrl }
      }
    }
  }

  // 2. Fall back to a deck composed from this company's reported financials.
  if (Number.isFinite(y) && Number.isFinite(q)) {
    const slides = await buildFinancialDeck(sym, y, q, callDateStr ?? null)
    if (slides.length) {
      return { slides, deckSource: 'fallback-financials', deckPageUrl, deckPdfUrl: null }
    }
  }

  // 3. Last resort: a single neutral placeholder pointing at the IR page.
  return {
    slides: [{
      id: '1',
      title: `${sym} Q${quarter} ${year} earnings deck`,
      bullets: ['Official deck unavailable for this call', 'Open the issuer IR page for the published slides'],
    }],
    deckSource: 'fallback-empty',
    deckPageUrl,
    deckPdfUrl: null,
  }
}
