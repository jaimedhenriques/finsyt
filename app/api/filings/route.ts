import { NextRequest, NextResponse } from 'next/server'
const CIK: Record<string,string> = {
  AAPL:'0000320193', MSFT:'0000789019', GOOGL:'0001652044', AMZN:'0001018724',
  NVDA:'0001045810', META:'0001326801', TSLA:'0001318605', JPM:'0000019617',
  BAC:'0000070858', XOM:'0000034088', WMT:'0000104169', V:'0001403161',
  MA:'0001141391', NFLX:'0001065280', INTC:'0000050863', ABBV:'0001551152',
  LLY:'0000059478', JNJ:'0000200406', PG:'0000080424',
}
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  const cik = CIK[symbol]
  if (!cik) return NextResponse.json({ filings: [], note: 'CIK not found' })
  try {
    const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: { 'User-Agent': 'Finsyt hello@finsyt.com' } })
    const data = await res.json()
    const recent = data.filings?.recent || {}
    const forms = recent.form||[], dates = recent.filingDate||[], accNumbers = recent.accessionNumber||[], docs = recent.primaryDocument||[]
    const important = ['10-K','10-Q','8-K','DEF 14A','S-1','4']
    const filings = []
    for (let i = 0; i < forms.length && filings.length < 25; i++) {
      if (important.includes(forms[i])) {
        filings.push({
          form: forms[i], date: dates[i], accessionNumber: accNumbers[i],
          docUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${forms[i]}&dateb=&owner=include&count=10`,
        })
      }
    }
    return NextResponse.json({ company: data.name, cik: data.cik, filings })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
