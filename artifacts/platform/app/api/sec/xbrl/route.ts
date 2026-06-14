import { NextRequest, NextResponse } from 'next/server'

const SEC_API_KEY = process.env.SEC_API_KEY

/**
 * GET /api/sec/xbrl?url=<10-K or 10-Q filing url>
 * Converts XBRL filing data into structured JSON with source links.
 * Returns all GAAP financial statement data — income, balance sheet, cash flow.
 * Every data point maps back to the original filing for auditability.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url required — provide the HTML filing URL' }, { status: 400 })
  if (!SEC_API_KEY) return NextResponse.json({ error: 'SEC_API_KEY not configured' }, { status: 500 })

  try {
    const apiUrl = `https://api.sec-api.io/xbrl-to-json?htm-url=${encodeURIComponent(url)}&token=${SEC_API_KEY}`
    const res = await fetch(apiUrl)

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'XBRL conversion failed', detail: err }, { status: res.status })
    }

    const raw = await res.json()

    // Extract and normalise key financial statements
    const income    = extractStatements(raw, ['IncomeStatement', 'StatementsOfIncome', 'StatementsOfOperations'])
    const balance   = extractStatements(raw, ['BalanceSheet', 'BalanceSheets'])
    const cashflow  = extractStatements(raw, ['CashFlowStatement', 'StatementsOfCashFlows'])
    const equity    = extractStatements(raw, ['StockholdersEquity', 'StatementsOfEquity'])

    return NextResponse.json({
      source:     { edgarUrl: url, dataType: 'XBRL', standard: 'US-GAAP' },
      income,
      balance,
      cashflow,
      equity,
      // Raw for advanced consumers
      rawKeys:    Object.keys(raw),
    })
  } catch (e) {
    return NextResponse.json({ error: 'Failed', detail: String(e) }, { status: 500 })
  }
}

function extractStatements(raw: any, keys: string[]): any {
  for (const key of keys) {
    if (raw[key]) return raw[key]
    // Case-insensitive search
    const found = Object.keys(raw).find(k => keys.some(name => k.toLowerCase().includes(name.toLowerCase())))
    if (found) return raw[found]
  }
  return null
}
