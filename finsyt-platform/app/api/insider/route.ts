import { NextRequest, NextResponse } from 'next/server'

const EODHD   = process.env.EODHD_API_KEY || process.env.eodhd_api
const FMP     = process.env.FMP_API_KEY
const FINNHUB = process.env.FINNHUB_API_KEY

function normalise(t: any, source: string) {
  return {
    symbol:          t.symbol || t.code || '',
    date:            t.date || t.transactionDate || t.filingDate || '',
    reportingName:   t.name || t.reportingName || t.transactionCode || '',
    transactionType: t.transactionType || t.type || (t.acquistionOrDisposition === 'A' ? 'Buy' : 'Sell') || '',
    securitiesOwned: t.securitiesOwned || t.sharesOwned || 0,
    change:          t.change || t.securitiesTransacted || t.sharesTransacted || 0,
    price:           t.price || t.transactionPrice || 0,
    value:           t.value || (t.change || 0) * (t.price || 0),
    ownership:       t.ownership || t.ownershipType || '',
    title:           t.title || t.officerTitle || t.reportingName || '',
    source,
  }
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const limit  = parseInt(req.nextUrl.searchParams.get('limit') || '30')
  const type   = req.nextUrl.searchParams.get('type') || ''   // buy | sell

  const allTrades: any[] = []
  const seen = new Set<string>()

  // ── Source 1: FMP (most complete insider data) ────────────────────────────
  if (FMP) {
    try {
      const url = symbol
        ? `https://financialmodelingprep.com/stable/insider-trading?symbol=${symbol}&limit=${limit}&apikey=${FMP}`
        : `https://financialmodelingprep.com/stable/insider-trading-transaction-type?transactionType=P-Purchase,S-Sale&limit=${limit}&apikey=${FMP}`
      const res  = await fetch(url, { next: { revalidate: 1800 } })
      const data = await res.json()
      ;(Array.isArray(data) ? data : []).forEach((t: any) => {
        const key = `${t.symbol}-${t.filingDate}-${t.securitiesTransacted}`
        if (!seen.has(key)) { seen.add(key); allTrades.push(normalise(t, 'fmp')) }
      })
    } catch (e) { console.error('FMP insider failed:', e) }
  }

  // ── Source 2: EODHD (good for international) ─────────────────────────────
  if (EODHD && symbol) {
    try {
      const eodSym = symbol.includes('.') ? symbol : `${symbol}.US`
      const res  = await fetch(`https://eodhd.com/api/insider-transactions?code=${eodSym}&api_token=${EODHD}&fmt=json`, { next: { revalidate: 1800 } })
      const data = await res.json()
      ;(Array.isArray(data) ? data : []).slice(0, limit).forEach((t: any) => {
        const key = `${t.code}-${t.date}-${t.change}`
        if (!seen.has(key)) { seen.add(key); allTrades.push(normalise({ ...t, symbol: symbol }, 'eodhd')) }
      })
    } catch (e) { console.error('EODHD insider failed:', e) }
  }

  // ── Source 3: Finnhub ─────────────────────────────────────────────────────
  if (FINNHUB && symbol) {
    try {
      const res  = await fetch(`https://finnhub.io/api/v1/stock/insider-transactions?symbol=${symbol}&token=${FINNHUB}`)
      const data = await res.json()
      ;(data?.data || []).slice(0, limit).forEach((t: any) => {
        const key = `${t.symbol}-${t.transactionDate}-${t.change}`
        if (!seen.has(key)) { seen.add(key); allTrades.push(normalise(t, 'finnhub')) }
      })
    } catch (e) { console.error('Finnhub insider failed:', e) }
  }

  let results = allTrades
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, limit)

  if (type === 'buy')  results = results.filter(t => t.transactionType?.toLowerCase().includes('buy') || t.transactionType?.includes('P-Purchase') || t.change > 0)
  if (type === 'sell') results = results.filter(t => t.transactionType?.toLowerCase().includes('sell') || t.transactionType?.includes('S-Sale') || t.change < 0)

  return NextResponse.json({ data: results, total: results.length, sources: ['fmp', 'eodhd', 'finnhub'] })
}
