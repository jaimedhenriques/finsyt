import { NextRequest, NextResponse } from 'next/server'

const SEC_API_KEY = process.env.SEC_API_KEY

/**
 * GET /api/sec/filings?symbol=AAPL&type=10-K,10-Q,8-K&limit=20
 * Returns filings with direct EDGAR source URLs for full auditability.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const type   = req.nextUrl.searchParams.get('type') || '10-K,10-Q,8-K'
  const limit  = parseInt(req.nextUrl.searchParams.get('limit') || '20')

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  if (!SEC_API_KEY) return NextResponse.json({ error: 'SEC_API_KEY not configured' }, { status: 500 })

  try {
    const types = type.split(',').map((t: string) => `"${t.trim()}"`).join(' OR ')

    const query = {
      query: {
        query_string: {
          query: `ticker:${symbol} AND formType:(${types})`,
        },
      },
      from: '0',
      size: String(limit),
      sort: [{ filedAt: { order: 'desc' } }],
    }

    const res = await fetch('https://efts.sec-api.io?token=' + SEC_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'sec-api error', detail: err }, { status: res.status })
    }

    const data = await res.json()
    const hits = data?.hits?.hits || []

    const filings = hits.map((h: any) => {
      const src = h._source || {}
      return {
        id:             h._id,
        symbol,
        formType:       src.formType,
        filedAt:        src.filedAt,
        periodOfReport: src.periodOfReport,
        companyName:    src.companyName,
        cik:            src.cik,
        // Direct EDGAR source URL — the audit trail
        edgarUrl:       src.linkToFilingDetails,
        htmlUrl:        src.linkToHtml,
        txtUrl:         src.linkToTxt,
        description:    getDescription(src.formType),
        documents:      (src.documentFormatFiles || []).slice(0, 8).map((d: any) => ({
          description: d.description,
          type:        d.type,
          url:         d.documentUrl,
        })),
      }
    })

    return NextResponse.json({ symbol, total: data?.hits?.total?.value || filings.length, filings })
  } catch (e) {
    return NextResponse.json({ error: 'Failed', detail: String(e) }, { status: 500 })
  }
}

function getDescription(formType: string): string {
  const map: Record<string, string> = {
    '10-K': 'Annual Report', '10-Q': 'Quarterly Report', '8-K': 'Current Report',
    '4': 'Insider Transaction', '13F-HR': 'Institutional Holdings',
    'DEF 14A': 'Proxy Statement', 'S-1': 'IPO Registration', '13D': 'Activist Filing',
  }
  return map[formType] || formType
}
