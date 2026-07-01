import { NextRequest, NextResponse } from 'next/server'
import { yahooUpgradeHistory, yahooEstimateTrend } from '@/lib/data-providers'

const FMP = process.env.FMP_API_KEY || ''

async function fmp(path: string, revalidate = 1800) {
  const sep = path.includes('?') ? '&' : '?'
  const r = await fetch(`https://financialmodelingprep.com${path}${sep}apikey=${FMP}`, { next: { revalidate } })
  if (!r.ok) throw new Error(`FMP ${r.status}`)
  return r.json()
}

// GET /api/estimates?symbol=AAPL
//
// Returns the full Visible-Alpha-style estimates bundle assembled from FMP
// `/stable` endpoints. Every field is "real" in the sense that it comes
// directly from the upstream provider — we never synthesise consensus,
// per-analyst price targets, or surprise history.
//
// Shape:
// {
//   symbol,
//   rating, priceTarget, numAnalysts, strongBuy, buy, hold, sell, strongSell,
//   priceTargetHigh, priceTargetLow, priceTargetMedian,
//   estimatesAnnual:    [...analyst-estimates rows, period=annual],
//   estimatesQuarterly: [...analyst-estimates rows, period=quarter],
//   priceTargets:       [...price-target-list rows],
//   priceTargetNews:    [...price-target-news rows],
//   surprises:          [...earnings-surprises rows],
//   recommendations:    [...analyst-stock-recommendations rows],
//   upgrades:           {...upgrades-downgrades-consensus single row},
//   // Legacy/back-compat fields kept for the existing Estimates tab tiles:
//   quarterly: [],   // (computed below)
// }
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  if (!FMP)    return NextResponse.json({ error: 'FMP_API_KEY not configured' }, { status: 500 })

  try {
    const [
      estAnnual,
      estQuarter,
      ptConsensus,
      ptList,
      ptNews,
      surprises,
      recommendations,
      upgrades,
    ] = await Promise.allSettled([
      fmp(`/stable/analyst-estimates?symbol=${symbol}&period=annual&limit=8`),
      fmp(`/stable/analyst-estimates?symbol=${symbol}&period=quarter&limit=12`),
      fmp(`/stable/price-target-consensus?symbol=${symbol}`),
      fmp(`/stable/price-target-list?symbol=${symbol}&limit=40`),
      fmp(`/stable/price-target-news?symbol=${symbol}&limit=20`),
      fmp(`/stable/earnings-surprises?symbol=${symbol}&limit=12`),
      fmp(`/stable/analyst-stock-recommendations?symbol=${symbol}&limit=12`),
      fmp(`/stable/upgrades-downgrades-consensus?symbol=${symbol}`),
    ])

    // Supplementary, keyless Yahoo data — per-firm upgrade/downgrade *history*
    // and the analyst estimate *trend* (how consensus moved over 7/30/60/90d)
    // are both additive over FMP's consensus snapshot. Tagged source:'yahoo'.
    const [yahooUpgrades, yahooTrend] = await Promise.all([
      yahooUpgradeHistory(symbol).catch(() => null),
      yahooEstimateTrend(symbol).catch(() => null),
    ])

    const val = <T,>(p: PromiseSettledResult<any>): T | null =>
      p.status === 'fulfilled' ? (p.value as T) : null
    const arr = (p: PromiseSettledResult<any>): any[] =>
      p.status === 'fulfilled' && Array.isArray(p.value) ? p.value : []

    const ptCons: any =
      ptConsensus.status === 'fulfilled'
        ? Array.isArray(ptConsensus.value) ? ptConsensus.value[0] : ptConsensus.value
        : null

    const upRow: any =
      upgrades.status === 'fulfilled'
        ? Array.isArray(upgrades.value) ? upgrades.value[0] : upgrades.value
        : null

    const recsLatest: any = arr(recommendations)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || null

    // Build a forward "quarterly" preview that the existing Estimates tab UI
    // can keep using until it switches to the new EstimatesTab component.
    const annualRows = arr(estAnnual)
    const quarterlyRows = arr(estQuarter)
    const upcoming = (() => {
      const today = new Date().toISOString().slice(0, 10)
      // The /stable/analyst-estimates endpoint returns short field names
      // (revenueAvg, epsAvg, etc.); we also accept the legacy v3
      // `estimatedRevenueAvg`-style names for forward compatibility.
      const pickAvg = (r: any) => r.revenueAvg ?? r.estimatedRevenueAvg
      const pickEpsAvg = (r: any) => r.epsAvg ?? r.estimatedEpsAvg
      const pickEpsHi  = (r: any) => r.epsHigh ?? r.estimatedEpsHigh
      const pickEpsLo  = (r: any) => r.epsLow  ?? r.estimatedEpsLow
      const futureQ = quarterlyRows
        .filter(r => String(r.date || '') >= today)
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
        .slice(0, 4)
        .map(r => ({
          period:  fmtQuarterLabel(r.date),
          revenue: pickAvg(r),
          epsEst:  pickEpsAvg(r),
          epsHigh: pickEpsHi(r),
          epsLow:  pickEpsLo(r),
          growth:  null,
        }))
      const futureA = annualRows
        .filter(r => String(r.date || '') >= today)
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
        .slice(0, 3)
        .map(r => ({
          period:  `FY${String(r.date || '').slice(0, 4)}`,
          revenue: pickAvg(r),
          epsEst:  pickEpsAvg(r),
          epsHigh: pickEpsHi(r),
          epsLow:  pickEpsLo(r),
          growth:  null,
        }))
      return [...futureQ, ...futureA]
    })()

    return NextResponse.json({
      symbol,

      // ── back-compat fields used by the existing Estimates tab tiles ───
      rating:          recsLatest?.rating ?? null,
      priceTarget:     ptCons?.targetConsensus ?? ptCons?.priceTarget ?? null,
      priceTargetHigh: ptCons?.targetHigh   ?? null,
      priceTargetLow:  ptCons?.targetLow    ?? null,
      priceTargetMedian: ptCons?.targetMedian ?? null,
      numAnalysts:     ptCons?.numberOfAnalysts ?? upRow?.consensus  ?? null,
      strongBuy:       upRow?.strongBuy   ?? null,
      buy:             upRow?.buy         ?? null,
      hold:            upRow?.hold        ?? null,
      sell:            upRow?.sell        ?? null,
      strongSell:      upRow?.strongSell  ?? null,
      quarterly:       upcoming,

      // ── full bundle for the new EstimatesTab component ────────────────
      estimatesAnnual:    annualRows,
      estimatesQuarterly: quarterlyRows,
      priceTargets:       arr(ptList),
      priceTargetNews:    arr(ptNews),
      surprises:          arr(surprises),
      recommendations:    arr(recommendations),
      upgrades:           upRow,
      priceTargetConsensus: ptCons,

      // ── supplementary keyless-Yahoo additions (source:'yahoo') ────────
      // null when Yahoo is unreachable, so the UI degrades gracefully.
      upgradeHistory:     yahooUpgrades,   // { history:[{date,firm,fromGrade,toGrade,action}], source:'yahoo' }
      estimateTrend:      yahooTrend,      // { trend:[{period,epsAvg,eps7dAgo,...}], source:'yahoo' }
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

function fmtQuarterLabel(date: string | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return String(date).slice(0, 7)
  const month = d.getUTCMonth() + 1
  const q = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4
  return `Q${q} ${d.getUTCFullYear()}`
}
