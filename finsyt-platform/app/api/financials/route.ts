import { NextRequest, NextResponse } from 'next/server'
const FMP = process.env.FMP_API_KEY
const AV  = process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHA_VANTAGE_KEY

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const type   = req.nextUrl.searchParams.get('type') || 'income' // income | balance | cashflow | earnings | ratios | growth
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  try {
    // FMP has much richer financial data
    const endpointMap: Record<string, string> = {
      income:    `income-statement/${symbol}?limit=12`,
      balance:   `balance-sheet-statement/${symbol}?limit=12`,
      cashflow:  `cash-flow-statement/${symbol}?limit=12`,
      earnings:  `earnings-surprises/${symbol}`,
      ratios:    `ratios/${symbol}?limit=8`,
      growth:    `financial-growth/${symbol}?limit=8`,
      segments:  `revenue-product-segmentation/${symbol}?structure=flat`,
      estimates: `analyst-estimates/${symbol}?limit=4`,
      guidance:  `earnings-call-transcript/${symbol}?limit=1`,
      dcf:       `discounted-cash-flow/${symbol}`,
    }
    const endpoint = endpointMap[type]
    if (!endpoint) return NextResponse.json({ error: 'unknown type' }, { status: 400 })

    const res = await fetch(`https://financialmodelingprep.com/api/v3/${endpoint}&apikey=${FMP}`)
    const data = await res.json()

    if (type === 'earnings') {
      return NextResponse.json({
        quarterly: (data || []).slice(0, 12).map((e: any) => ({
          date:         e.date,
          symbol:       e.symbol,
          reportedEPS:  e.actualEarningResult,
          estimatedEPS: e.estimatedEarning,
          surprise:     e.actualEarningResult - e.estimatedEarning,
          surprisePct:  e.estimatedEarning ? ((e.actualEarningResult - e.estimatedEarning) / Math.abs(e.estimatedEarning)) * 100 : 0,
          beat:         e.actualEarningResult >= e.estimatedEarning,
        })),
      })
    }

    if (type === 'income') {
      const parseStmt = (r: any) => ({
        date:              r.date,
        period:            r.period,
        revenue:           r.revenue,
        grossProfit:       r.grossProfit,
        grossMargin:       r.grossProfitRatio,
        ebitda:            r.ebitda,
        ebitdaMargin:      r.ebitdaratio,
        operatingIncome:   r.operatingIncome,
        operatingMargin:   r.operatingIncomeRatio,
        netIncome:         r.netIncome,
        netMargin:         r.netIncomeRatio,
        eps:               r.eps,
        epsDiluted:        r.epsdiluted,
        revenueGrowth:     null,
        costOfRevenue:     r.costOfRevenue,
        researchDev:       r.researchAndDevelopmentExpenses,
        sgaExpense:        r.sellingGeneralAndAdministrativeExpenses,
      })
      return NextResponse.json({ statements: (data || []).slice(0, 12).map(parseStmt) })
    }

    if (type === 'balance') {
      const parseStmt = (r: any) => ({
        date:                r.date,
        period:              r.period,
        totalAssets:         r.totalAssets,
        totalCurrentAssets:  r.totalCurrentAssets,
        cash:                r.cashAndCashEquivalents,
        shortTermInvest:     r.shortTermInvestments,
        receivables:         r.netReceivables,
        inventory:           r.inventory,
        totalLiabilities:    r.totalLiabilities,
        totalCurrentLiab:    r.totalCurrentLiabilities,
        longTermDebt:        r.longTermDebt,
        totalDebt:           r.totalDebt,
        totalEquity:         r.totalStockholdersEquity,
        retainedEarnings:    r.retainedEarnings,
        netDebt:             r.netDebt,
      })
      return NextResponse.json({ statements: (data || []).slice(0, 12).map(parseStmt) })
    }

    if (type === 'cashflow') {
      const parseStmt = (r: any) => ({
        date:                r.date,
        period:              r.period,
        operatingCashflow:   r.operatingCashFlow,
        capex:               r.capitalExpenditure,
        freeCashflow:        r.freeCashFlow,
        fcfMargin:           r.revenue ? r.freeCashFlow / r.revenue : null,
        dividendsPaid:       r.dividendsPaid,
        stockRepurchase:     r.commonStockRepurchased,
        debtRepayment:       r.debtRepayment,
        netChangeInCash:     r.netChangeInCash,
      })
      return NextResponse.json({ statements: (data || []).slice(0, 12).map(parseStmt) })
    }

    return NextResponse.json({ data })
  } catch (e) {
    // AV fallback for income/earnings
    if (type === 'income' || type === 'earnings') {
      try {
        const fn = type === 'income' ? 'INCOME_STATEMENT' : 'EARNINGS'
        const res = await fetch(`https://www.alphavantage.co/query?function=${fn}&symbol=${symbol}&apikey=${AV}`)
        const data = await res.json()
        return NextResponse.json({ data, source: 'alphavantage' })
      } catch {}
    }
    return NextResponse.json({ error: 'Failed', detail: String(e) }, { status: 500 })
  }
}
