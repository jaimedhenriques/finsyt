import { NextRequest, NextResponse } from "next/server"

const FMP = process.env.FMP_API_KEY || ""

export async function GET(req: NextRequest) {
  const sp        = req.nextUrl.searchParams
  const symbol    = sp.get("symbol")?.toUpperCase()
  const statement = sp.get("statement") || "income-statement"  // income-statement | balance-sheet-statement | cash-flow-statement
  const period    = sp.get("period") || "annual"               // annual | quarter
  const limit     = sp.get("limit") || "8"

  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 })
  if (!FMP)    return NextResponse.json({ error: "FMP_API_KEY not configured" }, { status: 500 })

  const VALID_STMTS = ["income-statement", "balance-sheet-statement", "cash-flow-statement", "key-metrics", "ratios", "analyst-estimates", "earnings-surprises"]
  if (!VALID_STMTS.includes(statement)) {
    return NextResponse.json({ error: `Invalid statement. Use: ${VALID_STMTS.join(", ")}` }, { status: 400 })
  }

  try {
    // Some endpoints use different param names or paths
    let url: string
    if (statement === "earnings-surprises") {
      url = `https://financialmodelingprep.com/stable/earnings-surprises?symbol=${symbol}&limit=${limit}&apikey=${FMP}`
    } else if (statement === "analyst-estimates") {
      url = `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${symbol}&period=${period}&limit=${limit}&apikey=${FMP}`
    } else {
      url = `https://financialmodelingprep.com/stable/${statement}?symbol=${symbol}&period=${period}&limit=${limit}&apikey=${FMP}`
    }
    const res = await fetch(url, { next: { revalidate: 3600 } })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `FMP error ${res.status}`, detail: text }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ rows: Array.isArray(data) ? data : [], symbol, statement, period })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
