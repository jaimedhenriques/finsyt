import { NextRequest, NextResponse } from 'next/server'
const FMP = process.env.FMP_API_KEY
const AV  = process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHA_VANTAGE_KEY
const SEC = process.env.SEC_API_KEY

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const type   = req.nextUrl.searchParams.get('type') || 'income'
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  try {
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

    const [fmpRes, secFilingsData] = await Promise.allSettled([
      fetch(`https://financialmodelingprep.com/api/v3/${endpoint}&apikey=${FMP}`).then(r => r.json()),
      // Fetch latest filings from sec-api for source annotation
      SEC ? fetchSecFilings(symbol, type) : Promise.resolve([]),
    ])

    const data = fmpRes.status === 'fulfilled' ? fmpRes.value : null
    const filings = secFilingsData.status === 'fulfilled' ? secFilingsData.value : []

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
      const statements = (data || []).slice(0, 12).map((r: any) => ({
        date:            r.date,
        period:          r.period,
        revenue:         r.revenue,
        grossProfit:     r.grossProfit,
        grossMargin:     r.grossProfitRatio,
        ebitda:          r.ebitda,
        ebitdaMargin:    r.ebitdaratio,
        operatingIncome: r.operatingIncome,
        operatingMargin: r.operatingIncomeRatio,
        netIncome:       r.netIncome,
        netMargin:       r.netIncomeRatio,
        eps:             r.eps,
        epsDiluted:      r.epsdiluted,
        costOfRevenue:   r.costOfRevenue,
        researchDev:     r.researchAndDevelopmentExpenses,
        sgaExpense:      r.sellingGeneralAndAdministrativeExpenses,
        // Attach source filing for audit trail
        _source:         matchFiling(filings, r.date),
      }))
      return NextResponse.json({ statements })
    }

    if (type === 'balance') {
      const statements = (data || []).slice(0, 12).map((r: any) => ({
        date:               r.date,
        period:             r.period,
        totalAssets:        r.totalAssets,
        totalCurrentAssets: r.totalCurrentAssets,
        cash:               r.cashAndCashEquivalents,
        shortTermInvest:    r.shortTermInvestments,
        receivables:        r.netReceivables,
        inventory:          r.inventory,
        totalLiabilities:   r.totalLiabilities,
        totalCurrentLiab:   r.totalCurrentLiabilities,
        longTermDebt:       r.longTermDebt,
        totalDebt:          r.totalDebt,
        totalEquity:        r.totalStockholdersEquity,
        retainedEarnings:   r.retainedEarnings,
        netDebt:            r.netDebt,
        _source:            matchFiling(filings, r.date),
      }))
      return NextResponse.json({ statements })
    }

    if (type === 'cashflow') {
      const statements = (data || []).slice(0, 12).map((r: any) => ({
        date:              r.date,
        period:            r.period,
        operatingCashflow: r.operatingCashFlow,
        capex:             r.capitalExpenditure,
        freeCashflow:      r.freeCashFlow,
        fcfMargin:         r.revenue ? r.freeCashFlow / r.revenue : null,
        dividendsPaid:     r.dividendsPaid,
        stockRepurchase:   r.commonStockRepurchased,
        debtRepayment:     r.debtRepayment,
        netChangeInCash:   r.netChangeInCash,
        _source:           matchFiling(filings, r.date),
      }))
      return NextResponse.json({ statements })
    }

    return NextResponse.json({ data })
  } catch (e) {
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

async function fetchSecFilings(symbol: string, type: string): Promise<any[]> {
  const formType = (type === 'income' || type === 'balance' || type === 'cashflow') ? '10-K,10-Q' : '8-K'
  try {
    const types = formType.split(',').map((t: string) => `"${t.trim()}"`).join(' OR ')
    const query = {
      query: { query_string: { query: `ticker:${symbol} AND formType:(${types})` } },
      from: '0', size: '20',
      sort: [{ filedAt: { order: 'desc' } }],
    }
    const res = await fetch('https://efts.sec-api.io?token=' + SEC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data?.hits?.hits || []).map((h: any) => {
      const src = h._source || {}
      return {
        formType:       src.formType,
        filedAt:        src.filedAt,
        periodOfReport: src.periodOfReport,
        edgarUrl:       src.linkToFilingDetails,
        htmlUrl:        src.linkToHtml,
        ticker:         symbol,
        companyName:    src.companyName,
      }
    })
  } catch { return [] }
}

function matchFiling(filings: any[], stmtDate: string): any {
  if (!filings.length || !stmtDate) return null
  const stmtMonth = stmtDate.substring(0, 7) // YYYY-MM
  const match = filings.find(f => {
    const fp = (f.periodOfReport || '').substring(0, 7)
    return fp === stmtMonth
  })
  const filing = match || filings[0]
  if (!filing) return null
  return {
    formType:    filing.formType,
    filedAt:     filing.filedAt,
    edgarUrl:    filing.edgarUrl,
    htmlUrl:     filing.htmlUrl,
    citation:    `${filing.ticker || ''} ${filing.formType} (Filed ${(filing.filedAt || '').split('T')[0]})`.trim(),
  }
}
