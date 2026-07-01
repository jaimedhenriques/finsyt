import { NextRequest, NextResponse } from "next/server"

const FMP = process.env.FMP_API_KEY || ""

// Combined revenue-segmentation endpoint. Returns both product and geographic
// splits for the requested ticker / period in one call so the Financials tab
// only needs a single fetch. The shape matches the upstream FMP /stable
// endpoints: each row is { date: 'YYYY-MM-DD', segments: { name: amount } }.
//
// We deliberately do not synthesise segments for tickers FMP does not cover
// (most banks, REITs, ETFs) — callers receive empty arrays in those cases and
// the UI shows a clear "no segmentation reported" empty state.
async function fmpJson(path: string): Promise<any> {
  const sep = path.includes("?") ? "&" : "?"
  const r = await fetch(
    `https://financialmodelingprep.com${path}${sep}apikey=${FMP}`,
    { next: { revalidate: 21600 } },
  )
  if (!r.ok) throw new Error(`FMP ${r.status}`)
  return r.json()
}

export async function GET(req: NextRequest) {
  const sp     = req.nextUrl.searchParams
  const symbol = sp.get("symbol")?.toUpperCase()
  const period = sp.get("period") || "annual" // annual | quarter
  const limit  = sp.get("limit") || "8"

  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 })
  if (!FMP)    return NextResponse.json({ error: "FMP_API_KEY not configured" }, { status: 500 })

  try {
    const [product, geo] = await Promise.allSettled([
      fmpJson(`/stable/revenue-product-segmentation?symbol=${symbol}&period=${period}&limit=${limit}`),
      fmpJson(`/stable/revenue-geographic-segmentation?symbol=${symbol}&period=${period}&limit=${limit}`),
    ])

    return NextResponse.json({
      symbol,
      period,
      product:    product.status === "fulfilled" && Array.isArray(product.value) ? product.value : [],
      geographic: geo.status     === "fulfilled" && Array.isArray(geo.value)     ? geo.value     : [],
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
