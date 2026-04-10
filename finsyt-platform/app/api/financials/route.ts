import { NextRequest, NextResponse } from 'next/server'
const AV = process.env.ALPHA_VANTAGE_KEY
function fmt(v: string|undefined) { return v && v!=='None' ? parseFloat(v) : null }
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const type = req.nextUrl.searchParams.get('type')||'income'
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  const fnMap: Record<string,string> = { income:'INCOME_STATEMENT', balance:'BALANCE_SHEET', cashflow:'CASH_FLOW', earnings:'EARNINGS' }
  try {
    const res = await fetch(`https://www.alphavantage.co/query?function=${fnMap[type]}&symbol=${symbol}&apikey=${AV}`)
    const data = await res.json()
    if (type==='earnings') {
      return NextResponse.json({
        annual: (data.annualEarnings||[]).slice(0,8).map((e: any) => ({ date:e.fiscalDateEnding, reportedEPS:fmt(e.reportedEPS), estimatedEPS:fmt(e.estimatedEPS), surprise:fmt(e.surprise), surprisePct:fmt(e.surprisePercentage) })),
        quarterly: (data.quarterlyEarnings||[]).slice(0,12).map((e: any) => ({ date:e.fiscalDateEnding, reportedDate:e.reportedDate, reportedEPS:fmt(e.reportedEPS), estimatedEPS:fmt(e.estimatedEPS), surprise:fmt(e.surprise), surprisePct:fmt(e.surprisePercentage) })),
      })
    }
    const parseReport = (r: any) => {
      const parsed: any = { date: r.fiscalDateEnding, currency: r.reportedCurrency }
      Object.keys(r).forEach(k => { if (k!=='fiscalDateEnding'&&k!=='reportedCurrency') parsed[k]=fmt(r[k]) })
      return parsed
    }
    return NextResponse.json({ annual:(data.annualReports||[]).slice(0,5).map(parseReport), quarterly:(data.quarterlyReports||[]).slice(0,8).map(parseReport) })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
