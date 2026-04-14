import { NextRequest, NextResponse } from 'next/server'
import { massiveDividends, massiveSplits } from '@/lib/data-providers'

const FMP   = process.env.FMP_API_KEY || ''
const EODHD = process.env.EODHD_API_KEY || process.env.eodhd_api || ''

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const symbol = sp.get('symbol')?.toUpperCase()
  const type = sp.get('type') || 'dividends' // dividends | splits | both

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  const results: any = { symbol }

  try {
    // Dividends
    if (type !== 'splits') {
      // Try Polygon first
      const polyDivs = await massiveDividends(symbol)
      if (polyDivs && polyDivs.length > 0) {
        results.dividends = polyDivs.map((d: any) => ({
          exDate:    d.ex_dividend_date,
          payDate:   d.pay_date,
          declareDate: d.declaration_date,
          amount:    d.cash_amount,
          type:      d.dividend_type || 'CD',
          frequency: d.frequency,
          currency:  d.currency || 'USD',
        }))
        results.dividendSource = 'polygon'
      } else if (FMP) {
        const res = await fetch(`https://financialmodelingprep.com/stable/dividends-historical?symbol=${symbol}&apikey=${FMP}`)
        const data = await res.json()
        if (Array.isArray(data)) {
          results.dividends = data.slice(0, 20).map((d: any) => ({
            exDate:    d.date,
            payDate:   d.paymentDate,
            declareDate: d.declarationDate,
            amount:    d.dividend,
            adjDividend: d.adjDividend,
            currency:  'USD',
          }))
          results.dividendSource = 'fmp'
        }
      } else if (EODHD) {
        const eodSym = symbol.includes('.') ? symbol : `${symbol}.US`
        const res = await fetch(`https://eodhd.com/api/div/${eodSym}?api_token=${EODHD}&fmt=json&from=2010-01-01`)
        const data = await res.json()
        if (Array.isArray(data)) {
          results.dividends = data.slice(0, 20).map((d: any) => ({
            exDate:  d.date,
            amount:  d.value,
            currency:d.currency || 'USD',
          }))
          results.dividendSource = 'eodhd'
        }
      }

      // Calculate dividend stats
      if (results.dividends?.length > 0) {
        const recent = results.dividends.slice(0, 4)
        const annualDividend = recent.reduce((s: number, d: any) => s + (d.amount || 0), 0)
        const lastDividend = results.dividends[0]
        results.dividendStats = {
          annualDividend,
          lastAmount: lastDividend?.amount,
          lastExDate: lastDividend?.exDate,
          count: results.dividends.length,
          frequency: detectFrequency(results.dividends),
        }
      }
    }

    // Splits
    if (type !== 'dividends') {
      const polySplits = await massiveSplits(symbol)
      if (polySplits && polySplits.length > 0) {
        results.splits = polySplits.map((s: any) => ({
          date:        s.execution_date,
          ratio:       `${s.split_from}:${s.split_to}`,
          splitFactor: s.split_from / s.split_to,
        }))
        results.splitsSource = 'polygon'
      } else if (EODHD) {
        const eodSym = symbol.includes('.') ? symbol : `${symbol}.US`
        const res = await fetch(`https://eodhd.com/api/splits/${eodSym}?api_token=${EODHD}&fmt=json&from=2000-01-01`)
        const data = await res.json()
        if (Array.isArray(data)) {
          results.splits = data.map((s: any) => ({
            date:        s.date,
            ratio:       s.split,
            splitFactor: s.split?.split('/').length === 2
              ? parseInt(s.split.split('/')[0]) / parseInt(s.split.split('/')[1])
              : null,
          }))
          results.splitsSource = 'eodhd'
        }
      }
    }

    return NextResponse.json(results)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function detectFrequency(dividends: any[]): string {
  if (dividends.length < 2) return 'Unknown'
  const dates = dividends.slice(0, 5).map((d: any) => new Date(d.exDate).getTime()).filter(Boolean)
  if (dates.length < 2) return 'Unknown'
  const avgGap = (dates[0] - dates[dates.length - 1]) / (dates.length - 1) / (1000 * 60 * 60 * 24)
  if (avgGap < 40)  return 'Monthly'
  if (avgGap < 100) return 'Quarterly'
  if (avgGap < 200) return 'Semi-Annual'
  return 'Annual'
}
