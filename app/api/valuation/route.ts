import { NextRequest, NextResponse } from 'next/server'

const FMP = process.env.FMP_API_KEY || ''

interface DCFInputs {
  revenue: number
  revenueGrowth: number   // 5-year CAGR assumption
  terminalGrowth: number  // long-run growth
  ebitdaMargin: number    // target EBITDA margin
  taxRate: number
  capexPct: number        // % of revenue
  nwcPct: number          // net working capital change %
  wacc: number            // discount rate
  netDebt: number
  sharesOut: number
  years?: number          // projection horizon
}

function runDCF(inputs: DCFInputs) {
  const {
    revenue, revenueGrowth, terminalGrowth,
    ebitdaMargin, taxRate, capexPct, nwcPct,
    wacc, netDebt, sharesOut, years = 5,
  } = inputs

  const projections: any[] = []
  let rev = revenue
  let totalPV = 0

  for (let i = 1; i <= years; i++) {
    rev = rev * (1 + revenueGrowth)
    const ebitda = rev * ebitdaMargin
    const ebit   = ebitda * 0.85  // rough D&A assumption
    const nopat  = ebit * (1 - taxRate)
    const capex  = rev * capexPct
    const nwcChange = rev * nwcPct
    const fcf   = nopat - capex - nwcChange
    const pv    = fcf / Math.pow(1 + wacc, i)
    totalPV += pv
    projections.push({ year: i, revenue: rev, ebitda, fcf, pv })
  }

  // Terminal value (Gordon Growth Model)
  const terminalFCF = projections[years - 1].fcf * (1 + terminalGrowth)
  const terminalValue = terminalFCF / (wacc - terminalGrowth)
  const pvTerminal = terminalValue / Math.pow(1 + wacc, years)
  totalPV += pvTerminal

  const equityValue = totalPV - netDebt
  const impliedPrice = sharesOut > 0 ? equityValue / sharesOut : null

  return {
    projections,
    totalPresentValue: totalPV,
    terminalValue,
    pvTerminal,
    terminalValuePct: (pvTerminal / totalPV * 100).toFixed(1) + '%',
    equityValue,
    impliedPrice,
    wacc,
    inputs,
  }
}

export async function GET(req: NextRequest) {
  const sp     = req.nextUrl.searchParams
  const symbol = sp.get('symbol')?.toUpperCase()

  if (!symbol || !FMP) {
    return NextResponse.json({ error: !symbol ? 'symbol required' : 'FMP key required' }, { status: 400 })
  }

  try {
    const [profRes, isRes, bsRes, cfRes, ratioRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&period=annual&limit=3&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/stable/balance-sheet-statement?symbol=${symbol}&period=annual&limit=1&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${symbol}&period=annual&limit=1&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=${symbol}&apikey=${FMP}`),
    ])
    const [profs, iss, bss, cfs, ratios] = await Promise.all([profRes.json(), isRes.json(), bsRes.json(), cfRes.json(), ratioRes.json()])

    const prof = Array.isArray(profs) ? profs[0] : {}
    const is0  = Array.isArray(iss) ? iss[0] : {}
    const is1  = Array.isArray(iss) ? iss[1] : {}
    const bs0  = Array.isArray(bss) ? bss[0] : {}
    const cf0  = Array.isArray(cfs) ? cfs[0] : {}
    const r0   = Array.isArray(ratios) ? ratios[0] : {}

    const revenue = is0.revenue || 0
    const revGrowthHistorical = is0.revenue && is1.revenue ? (is0.revenue - is1.revenue) / Math.abs(is1.revenue) : 0
    const ebitdaMargin  = is0.revenue ? (is0.ebitda || 0) / is0.revenue : 0.2
    const capexPct      = is0.revenue ? Math.abs(cf0.capitalExpenditure || 0) / is0.revenue : 0.05
    const netDebt       = bs0.netDebt || 0
    const sharesOut     = prof.sharesOutstanding || (prof.mktCap / prof.price) || 1e9
    const beta          = prof.beta || 1.0
    const taxRate       = is0.incomeTaxExpense && is0.incomeBeforeTax
      ? Math.abs(is0.incomeTaxExpense) / Math.abs(is0.incomeBeforeTax) : 0.21

    // WACC estimate: RF 4.5% + beta * ERP 5.5%
    const rfRate  = 0.045
    const erp     = 0.055
    const costOfEquity = rfRate + beta * erp
    const debtRatio = bs0.totalDebt && bs0.totalAssets ? bs0.totalDebt / bs0.totalAssets : 0.2
    const afterTaxCostOfDebt = 0.055 * (1 - taxRate)
    const wacc = costOfEquity * (1 - debtRatio) + afterTaxCostOfDebt * debtRatio

    // Base case DCF
    const baseCase = runDCF({
      revenue, revenueGrowth: Math.min(Math.max(revGrowthHistorical * 0.7, 0.03), 0.35),
      terminalGrowth: 0.025, ebitdaMargin: Math.max(ebitdaMargin, 0.05),
      taxRate, capexPct, nwcPct: 0.02, wacc, netDebt, sharesOut,
    })

    // Bull case
    const bullCase = runDCF({
      revenue, revenueGrowth: Math.min(revGrowthHistorical * 0.9, 0.4),
      terminalGrowth: 0.03, ebitdaMargin: Math.min(ebitdaMargin * 1.15, 0.5),
      taxRate, capexPct, nwcPct: 0.015, wacc: wacc - 0.005, netDebt, sharesOut,
    })

    // Bear case
    const bearCase = runDCF({
      revenue, revenueGrowth: Math.max(revGrowthHistorical * 0.4, 0.01),
      terminalGrowth: 0.02, ebitdaMargin: Math.max(ebitdaMargin * 0.85, 0.02),
      taxRate, capexPct: capexPct * 1.2, nwcPct: 0.025, wacc: wacc + 0.01, netDebt, sharesOut,
    })

    const currentPrice = prof.price || 0
    const impliedUpsideBase  = baseCase.impliedPrice ? ((baseCase.impliedPrice - currentPrice) / currentPrice * 100).toFixed(1) : null
    const impliedUpsideBull  = bullCase.impliedPrice ? ((bullCase.impliedPrice - currentPrice) / currentPrice * 100).toFixed(1) : null
    const impliedUpsideBear  = bearCase.impliedPrice ? ((bearCase.impliedPrice - currentPrice) / currentPrice * 100).toFixed(1) : null

    return NextResponse.json({
      symbol,
      currentPrice,
      marketCap: prof.mktCap,
      assumptions: {
        wacc: (wacc * 100).toFixed(2) + '%',
        costOfEquity: (costOfEquity * 100).toFixed(2) + '%',
        beta,
        taxRate: (taxRate * 100).toFixed(1) + '%',
        netDebt: netDebt / 1e9,
        sharesOutstanding: sharesOut / 1e9,
      },
      baseCase: { ...baseCase, impliedUpside: impliedUpsideBase },
      bullCase: { ...bullCase, impliedUpside: impliedUpsideBull },
      bearCase: { ...bearCase, impliedUpside: impliedUpsideBear },
      tradingMultiples: {
        pe:       r0.peRatioTTM || prof.pe,
        evEbitda: r0.evToEbitdaTTM,
        evRevenue:r0.evToSalesTTM || r0.priceToSalesRatioTTM,
        pb:       r0.pbRatioTTM,
        ps:       r0.priceToSalesRatioTTM,
        fcfYield: r0.freeCashFlowYieldTTM,
      },
      source: 'fmp',
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const inputs: DCFInputs = await req.json()
    if (!inputs.revenue || !inputs.wacc) {
      return NextResponse.json({ error: 'revenue and wacc required' }, { status: 400 })
    }
    const result = runDCF(inputs)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
