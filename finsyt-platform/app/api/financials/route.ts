import { NextRequest, NextResponse } from 'next/server'

const EODHD = process.env.EODHD_API_KEY || process.env.eodhd_api
const FMP   = process.env.FMP_API_KEY

export async function GET(req: NextRequest) {
  const symbol  = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const type    = req.nextUrl.searchParams.get('type') || 'income' // income | balance | cashflow | all
  const period  = req.nextUrl.searchParams.get('period') || 'annual' // annual | quarterly

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  // Primary: EODHD fundamentals (income statement, balance sheet, cash flow all in one call)
  if (EODHD) {
    try {
      const eodSymbol = symbol.includes('.') ? symbol : `${symbol}.US`
      const res = await fetch(
        `https://eodhd.com/api/fundamentals/${eodSymbol}?api_token=${EODHD}&fmt=json`,
        { next: { revalidate: 3600 } }
      )
      const data = await res.json()

      const fin = data?.Financials
      if (!fin) throw new Error('No financials in EODHD response')

      const isQuarterly = period === 'quarterly'

      // Helper: extract and sort statements
      const extract = (statements: Record<string, any>) => {
        if (!statements) return []
        return Object.values(statements)
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 20)
          .map((s: any) => ({
            date:              s.date,
            period:            s.period || (isQuarterly ? 'Q' : 'A'),
            // Income statement fields
            revenue:           s.totalRevenue || s.revenue,
            grossProfit:       s.grossProfit,
            operatingIncome:   s.operatingIncome || s.ebit,
            ebitda:            s.ebitda,
            netIncome:         s.netIncome,
            eps:               s.epsActual || s.eps,
            epsDiluted:        s.epsDiluted,
            // Balance sheet fields
            totalAssets:       s.totalAssets,
            totalLiabilities:  s.totalLiab,
            totalEquity:       s.totalStockholderEquity,
            cash:              s.cash || s.cashAndCashEquivalentsAtCarryingValue,
            debt:              s.longTermDebt || s.shortLongTermDebtTotal,
            // Cash flow fields
            operatingCashFlow: s.totalCashFromOperatingActivities,
            capex:             s.capitalExpenditures,
            freeCashFlow:      s.freeCashFlow,
            dividendsPaid:     s.dividendsPaid,
          }))
      }

      if (type === 'income') {
        const stmts = isQuarterly ? fin.Income_Statement?.quarterly : fin.Income_Statement?.annual
        return NextResponse.json({ symbol, period, statements: extract(stmts), source: 'eodhd' })
      }
      if (type === 'balance') {
        const stmts = isQuarterly ? fin.Balance_Sheet?.quarterly : fin.Balance_Sheet?.annual
        return NextResponse.json({ symbol, period, statements: extract(stmts), source: 'eodhd' })
      }
      if (type === 'cashflow') {
        const stmts = isQuarterly ? fin.Cash_Flow?.quarterly : fin.Cash_Flow?.annual
        return NextResponse.json({ symbol, period, statements: extract(stmts), source: 'eodhd' })
      }
      if (type === 'all') {
        const incomeKey   = isQuarterly ? fin.Income_Statement?.quarterly   : fin.Income_Statement?.annual
        const balanceKey  = isQuarterly ? fin.Balance_Sheet?.quarterly       : fin.Balance_Sheet?.annual
        const cashflowKey = isQuarterly ? fin.Cash_Flow?.quarterly           : fin.Cash_Flow?.annual
        return NextResponse.json({
          symbol, period,
          income:   extract(incomeKey),
          balance:  extract(balanceKey),
          cashflow: extract(cashflowKey),
          highlights: data?.Highlights || {},
          valuation:  data?.Valuation || {},
          source: 'eodhd',
        })
      }
    } catch (e) {
      console.error('EODHD financials failed:', e)
    }
  }

  // Fallback: FMP
  if (FMP) {
    try {
      const p = period === 'quarterly' ? 'quarter' : 'annual'
      const endpoints: Record<string, string> = {
        income:   `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?period=${p}&limit=20&apikey=${FMP}`,
        balance:  `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${symbol}?period=${p}&limit=20&apikey=${FMP}`,
        cashflow: `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?period=${p}&limit=20&apikey=${FMP}`,
      }
      const url = endpoints[type] || endpoints.income
      const res = await fetch(url)
      const data = await res.json()
      return NextResponse.json({ symbol, period, statements: data, source: 'fmp' })
    } catch { return NextResponse.json({ error: 'All sources failed' }, { status: 500 }) }
  }

  return NextResponse.json({ error: 'No API keys configured' }, { status: 500 })
}
