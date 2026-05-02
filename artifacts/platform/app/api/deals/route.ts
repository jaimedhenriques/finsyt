import { NextResponse, type NextRequest } from 'next/server'
import { fmpFetch } from '@/lib/data-providers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Live M&A deals via Financial Modeling Prep:
//   /stable/mergers-acquisitions-latest
//   /stable/mergers-acquisitions-search?symbol=…
// Always returns a `source` field so the page can attribute the data.

interface FmpMaRow {
  symbol?: string
  companyName?: string
  cik?: string
  targetedCompanyName?: string
  targetedCik?: string
  targetedSymbol?: string
  link?: string
  acceptanceTime?: string
  acceptedDate?: string
  filingDate?: string
  transactionDate?: string
  transactionFormType?: string
  status?: string
  description?: string
  totalDealValue?: number | string | null
  cashConsideration?: number | string | null
  stockConsideration?: number | string | null
}

interface DealDto {
  id: string
  acquirer: string
  acquirerSymbol: string | null
  target: string
  targetSymbol: string | null
  status: string
  type: string
  value: number | null
  cashConsideration: number | null
  stockConsideration: number | null
  announceDate: string | null
  description: string
  link: string | null
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(/[, _]/g, ''))
  return Number.isFinite(n) ? n : null
}

function pickStatus(row: FmpMaRow): string {
  const s = (row.status || '').trim()
  if (s) return s
  const tf = (row.transactionFormType || '').toUpperCase()
  if (tf.startsWith('SC 14D9') || tf.startsWith('SC 13D')) return 'Tender Offer'
  if (tf.startsWith('SC TO')) return 'Tender Offer'
  if (tf.startsWith('S-4') || tf.startsWith('DEFM14A')) return 'Pending'
  return 'Announced'
}

function pickType(row: FmpMaRow): string {
  const cash = num(row.cashConsideration)
  const stock = num(row.stockConsideration)
  if (cash != null && stock != null && cash > 0 && stock > 0) return 'Cash & Stock'
  if (cash != null && cash > 0) return 'Cash'
  if (stock != null && stock > 0) return 'Stock'
  return 'Mixed'
}

function normalize(row: FmpMaRow, idx: number): DealDto {
  const acquirerSymbol = (row.symbol || '').toUpperCase() || null
  const targetSymbol = (row.targetedSymbol || '').toUpperCase() || null
  const date = row.acceptedDate || row.transactionDate || row.filingDate || row.acceptanceTime || null
  return {
    id: `${acquirerSymbol ?? row.cik ?? 'unk'}-${targetSymbol ?? row.targetedCik ?? idx}-${date ?? idx}`,
    acquirer: row.companyName || acquirerSymbol || 'Unknown acquirer',
    acquirerSymbol,
    target: row.targetedCompanyName || targetSymbol || 'Undisclosed target',
    targetSymbol,
    status: pickStatus(row),
    type: pickType(row),
    value: num(row.totalDealValue),
    cashConsideration: num(row.cashConsideration),
    stockConsideration: num(row.stockConsideration),
    announceDate: date,
    description: (row.description || '').trim(),
    link: row.link ?? null,
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const symbol = (sp.get('symbol') || '').trim().toUpperCase()
  const limit = Math.min(Math.max(parseInt(sp.get('limit') || '50', 10) || 50, 1), 250)

  // FMP-first waterfall (only provider for M&A right now). Other providers can
  // be plugged in later behind the same `source` contract.
  let raw: unknown = null
  let source: 'fmp' | 'none' = 'none'
  let providerError: string | null = null
  try {
    if (symbol) {
      raw = await fmpFetch('/stable/mergers-acquisitions-search', { symbol, limit: String(limit) })
    } else {
      raw = await fmpFetch('/stable/mergers-acquisitions-latest', { page: '0', limit: String(limit) })
    }
    if (raw != null) source = 'fmp'
  } catch (err) {
    providerError = err instanceof Error ? err.message : String(err)
    console.warn('[api/deals] FMP fetch failed:', providerError)
  }

  const arr = Array.isArray(raw) ? (raw as FmpMaRow[]) : []
  const deals = arr.slice(0, limit).map((row, i) => normalize(row, i))

  return NextResponse.json({
    deals,
    source,
    count: deals.length,
    providerError,
    fetchedAt: new Date().toISOString(),
  })
}
