import { NextRequest, NextResponse } from 'next/server'

const SEC_API_KEY = process.env.SEC_API_KEY

/**
 * GET /api/sec/search?q=<query>&symbol=AAPL&type=10-K&from=0&size=10
 *
 * Full-text search across all 18M+ EDGAR filings since 1993.
 * Search for specific terms, topics, or KPIs within any filing.
 * Returns source links to exact filings where the term appears.
 */
export async function GET(req: NextRequest) {
  const q      = req.nextUrl.searchParams.get('q')
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const type   = req.nextUrl.searchParams.get('type')
  const from   = req.nextUrl.searchParams.get('from') || '0'
  const size   = req.nextUrl.searchParams.get('size') || '10'
  const dateFrom = req.nextUrl.searchParams.get('dateFrom') // YYYY-MM-DD
  const dateTo   = req.nextUrl.searchParams.get('dateTo')

  if (!q) return NextResponse.json({ error: 'q (search query) required' }, { status: 400 })
  if (!SEC_API_KEY) return NextResponse.json({ error: 'SEC_API_KEY not configured' }, { status: 500 })

  try {
    // Build query
    let queryStr = `"${q}"`
    if (symbol) queryStr += ` AND ticker:${symbol}`
    if (type)   queryStr += ` AND formType:"${type}"`
    if (dateFrom || dateTo) {
      const from_ = dateFrom || '2000-01-01'
      const to_   = dateTo   || new Date().toISOString().split('T')[0]
      queryStr += ` AND filedAt:[${from_} TO ${to_}]`
    }

    const query = {
      query: {
        query_string: { query: queryStr },
      },
      from,
      size,
      sort: [{ filedAt: { order: 'desc' } }],
    }

    const res = await fetch('https://efts.sec-api.io?token=' + SEC_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Search failed', detail: await res.text() }, { status: res.status })
    }

    const data = await res.json()
    const hits = data?.hits?.hits || []

    const results = hits.map((h: any) => {
      const src = h._source || {}
      return {
        id:             h._id,
        score:          h._score,
        formType:       src.formType,
        ticker:         src.ticker,
        companyName:    src.companyName,
        filedAt:        src.filedAt,
        periodOfReport: src.periodOfReport,
        // Audit trail URLs
        edgarUrl:       src.linkToFilingDetails,
        htmlUrl:        src.linkToHtml,
        // Highlight where the search term appears
        highlights:     h.highlight || {},
      }
    })

    return NextResponse.json({
      query: q,
      total:   data?.hits?.total?.value || results.length,
      from:    parseInt(from),
      size:    parseInt(size),
      results,
    })
  } catch (e) {
    return NextResponse.json({ error: 'Failed', detail: String(e) }, { status: 500 })
  }
}
