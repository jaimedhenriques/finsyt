import { NextRequest, NextResponse } from 'next/server'
const FMP = process.env.FMP_API_KEY

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const type   = req.nextUrl.searchParams.get('type') || '' // 10-K, 10-Q, 8-K, etc.
  const limit  = req.nextUrl.searchParams.get('limit') || '20'

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  try {
    // FMP SEC filings endpoint (returns direct document links)
    let url = `https://financialmodelingprep.com/api/v3/sec_filings/${symbol}?limit=${limit}&apikey=${FMP}`
    if (type) url += `&type=${encodeURIComponent(type)}`

    const res = await fetch(url)
    const data = await res.json()

    const filings = (Array.isArray(data) ? data : []).map((f: any) => ({
      symbol,
      form:          f.type,
      date:          f.fillingDate || f.date,
      acceptedDate:  f.acceptedDate,
      description:   f.type === '10-K' ? 'Annual Report' : f.type === '10-Q' ? 'Quarterly Report' : f.type === '8-K' ? 'Current Report' : f.type,
      documentUrl:   f.finalLink || f.link,
      filingUrl:     f.link,
      cik:           f.cik,
      pages:         null,
    }))

    return NextResponse.json({ company: symbol, filings })
  } catch (e) {
    // Fallback to SEC EDGAR direct
    try {
      const CIK: Record<string,string> = { AAPL:'0000320193',MSFT:'0000789019',GOOGL:'0001652044',AMZN:'0001018724',NVDA:'0001045810',META:'0001326801',TSLA:'0001318605',JPM:'0000019617',BAC:'0000070858',INTC:'0000050863' }
      const cik = CIK[symbol]
      if (!cik) return NextResponse.json({ filings: [], note: 'Not in CIK map' })
      const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: { 'User-Agent': 'Finsyt hello@finsyt.com' } })
      const edgar = await res.json()
      const recent = edgar.filings?.recent || {}
      const forms = recent.form||[], dates = recent.filingDate||[], accNums = recent.accessionNumber||[]
      const important = ['10-K','10-Q','8-K','DEF 14A','S-1','4']
      const filings: any[] = []
      for (let i = 0; i < forms.length && filings.length < 25; i++) {
        if (important.includes(forms[i])) filings.push({ form: forms[i], date: dates[i], accessionNumber: accNums[i] })
      }
      return NextResponse.json({ company: edgar.name, cik: edgar.cik, filings })
    } catch { return NextResponse.json({ error: 'Failed', detail: String(e) }, { status: 500 }) }
  }
}
