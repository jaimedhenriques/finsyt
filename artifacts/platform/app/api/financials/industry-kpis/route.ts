import { NextRequest, NextResponse } from "next/server"
import { buildKpis, type FinancialBundle } from "@/lib/industry-kpis"

const FMP = process.env.FMP_API_KEY || ""

async function fmp<T = any>(path: string, revalidate = 3600): Promise<T> {
  const sep = path.includes("?") ? "&" : "?"
  const r = await fetch(`https://financialmodelingprep.com${path}${sep}apikey=${FMP}`, {
    next: { revalidate },
  })
  if (!r.ok) throw new Error(`FMP ${r.status}`)
  return r.json()
}

// GET /api/financials/industry-kpis?symbol=AAPL
//
// Returns a sector-aware KPI bundle:
// {
//   symbol,
//   sector, industry, kpiSet,
//   kpis: [{ label, display, hint? }],
// }
//
// The endpoint is intentionally tolerant: if /profile fails we fall back to
// the Generic KPI set. Individual KPI values are rendered as `null` if the
// underlying FMP field isn't present — the UI is responsible for showing "—".
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 })
  if (!FMP)    return NextResponse.json({ error: "FMP_API_KEY not configured" }, { status: 500 })

  try {
    const [profile, keyMetrics, ratios, growth, income] = await Promise.allSettled([
      fmp(`/stable/profile?symbol=${symbol}`),
      fmp(`/stable/key-metrics?symbol=${symbol}&period=annual&limit=2`),
      fmp(`/stable/ratios?symbol=${symbol}&period=annual&limit=2`),
      fmp(`/stable/financial-growth?symbol=${symbol}&period=annual&limit=2`),
      fmp(`/stable/income-statement?symbol=${symbol}&period=annual&limit=2`),
    ])

    const profileRow: any = profile.status === "fulfilled" && Array.isArray(profile.value)
      ? profile.value[0]
      : (profile.status === "fulfilled" ? profile.value : null)

    const sector   = profileRow?.sector   ?? null
    const industry = profileRow?.industry ?? null

    const data: FinancialBundle = {
      keyMetrics: keyMetrics.status === "fulfilled" && Array.isArray(keyMetrics.value) ? keyMetrics.value : [],
      ratios:     ratios.status     === "fulfilled" && Array.isArray(ratios.value)     ? ratios.value     : [],
      growth:     growth.status     === "fulfilled" && Array.isArray(growth.value)     ? growth.value     : [],
      income:     income.status     === "fulfilled" && Array.isArray(income.value)     ? income.value     : [],
    }

    const bundle = buildKpis(sector, industry, data)
    return NextResponse.json({ symbol, ...bundle })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
