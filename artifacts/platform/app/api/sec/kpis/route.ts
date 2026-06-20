import { NextRequest, NextResponse } from 'next/server'

const SEC_API_KEY = process.env.SEC_API_KEY

/**
 * GET /api/sec/kpis?symbol=AAPL&quarters=8
 *
 * Fetches the latest 8-K press releases (Item 2.02 — Results of Operations)
 * and extracts non-GAAP KPIs, guidance, and segment data that don't appear
 * in standard XBRL-structured financials.
 *
 * This is what Daloopa charges enterprise prices for —
 * we get it from the source directly.
 */
export async function GET(req: NextRequest) {
  const symbol   = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const quarters = parseInt(req.nextUrl.searchParams.get('quarters') || '8')

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  if (!SEC_API_KEY) return NextResponse.json({ error: 'SEC_API_KEY not configured' }, { status: 500 })

  try {
    // Step 1: Find 8-K filings for this ticker (specifically Item 2.02 — earnings press releases)
    const query = {
      query: {
        query_string: {
          query: `ticker:${symbol} AND formType:"8-K"`,
        },
      },
      from: '0',
      size: String(quarters),
      sort: [{ filedAt: { order: 'desc' } }],
    }

    const searchRes = await fetch('https://efts.sec-api.io?token=' + SEC_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    })

    if (!searchRes.ok) {
      return NextResponse.json({ error: 'Filing search failed', detail: await searchRes.text() }, { status: searchRes.status })
    }

    const searchData = await searchRes.json()
    const filings = searchData?.hits?.hits || []

    // Step 2: For each 8-K, extract Item 2.02 (Results of Operations press release)
    const kpiResults = await Promise.allSettled(
      filings.slice(0, quarters).map(async (h: any) => {
        const src = h._source || {}
        const htmlUrl = src.linkToHtml

        if (!htmlUrl) return null

        // Extract Item 2.02 — the earnings press release section
        const extractUrl = `https://api.sec-api.io/extractor?url=${encodeURIComponent(htmlUrl)}&item=2.02&type=text&token=${SEC_API_KEY}`
        const extractRes = await fetch(extractUrl)
        const content = extractRes.ok ? await extractRes.text() : ''

        // Parse common non-GAAP metrics from press release text
        const kpis = parseKPIsFromText(content, symbol)

        return {
          filedAt:        src.filedAt,
          periodOfReport: src.periodOfReport,
          edgarUrl:       src.linkToFilingDetails,
          htmlUrl:        src.linkToHtml,
          kpis,
          hasContent:     content.length > 100,
          contentLength:  content.length,
          // Source reference — every KPI links back to this filing
          source: {
            formType:    '8-K',
            item:        '2.02',
            description: 'Results of Operations and Financial Condition',
            edgarUrl:    src.linkToFilingDetails,
            filedAt:     src.filedAt,
          },
        }
      })
    )

    const results = kpiResults
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value)

    return NextResponse.json({
      symbol,
      quarters: results.length,
      note: 'KPIs extracted from 8-K Item 2.02 (earnings press releases). Each KPI links to its source SEC filing.',
      data: results,
    })
  } catch (e) {
    return NextResponse.json({ error: 'Failed', detail: String(e) }, { status: 500 })
  }
}

/**
 * Basic regex-based KPI extractor from press release text.
 * Pulls common non-GAAP metrics that appear in earnings releases.
 */
function parseKPIsFromText(text: string, symbol: string): Record<string, string | null> {
  if (!text || text.length < 50) return {}

  const extract = (patterns: RegExp[]): string | null => {
    for (const p of patterns) {
      const m = text.match(p)
      if (m) return m[1]?.trim() || null
    }
    return null
  }

  return {
    revenue:        extract([/(?:net revenue|total revenue|revenues)[^\d]*\$([\d,.]+\s*(?:billion|million|B|M)?)/i]),
    eps_gaap:       extract([/(?:earnings|EPS|diluted EPS)[^\d]*\$([\d.]+)/i]),
    eps_non_gaap:   extract([/(?:non-GAAP|adjusted)(?:[^$]*)\$([\d.]+)\s*(?:per share|diluted)?/i]),
    gross_margin:   extract([/gross margin[^\d]*(\d+\.?\d*)\s*%/i]),
    operating_income: extract([/operating income[^\d]*\$([\d,.]+\s*(?:billion|million|B|M)?)/i]),
    guidance_revenue: extract([/(?:guidance|outlook|expects|anticipates)[^\d]*revenue[^\d]*\$([\d,.]+\s*(?:billion|million|B|M)?)/i]),
    guidance_eps:   extract([/(?:guidance|outlook)[^\$]*\$([\d.]+)\s*to\s*\$([\d.]+)/i]),
    dau:            extract([/(?:daily active|DAU)[^\d]*([\d,.]+\s*(?:million|billion|M|B)?)/i]),
    mau:            extract([/(?:monthly active|MAU)[^\d]*([\d,.]+\s*(?:million|billion|M|B)?)/i]),
    subscribers:    extract([/(?:subscriber|paid subscriber)[^\d]*([\d,.]+\s*(?:million|billion|M|B)?)/i]),
    units_sold:     extract([/(?:unit|device)[^\d]*([\d,.]+\s*(?:million|billion|M|B)?)\s*(?:units|devices)/i]),
    gmv:            extract([/(?:GMV|gross merchandise)[^\d]*\$([\d,.]+\s*(?:billion|million|B|M)?)/i]),
    arpu:           extract([/(?:ARPU|average revenue per user)[^\d]*\$([\d,.]+)/i]),
  }
}
