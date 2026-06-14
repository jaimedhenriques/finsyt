import { NextRequest, NextResponse } from 'next/server'

const SEC_API_KEY = process.env.SEC_API_KEY

/**
 * GET /api/sec/extract?url=<filing_url>&section=7
 * Extracts a specific section from a 10-K or 10-Q filing.
 * Sections: 1 (Business), 1A (Risk Factors), 7 (MD&A), 7A (Market Risk), 8 (Financial Statements)
 * For 8-K: 1.01, 1.02, 2.01, 2.02 (Results of Operations — press release), etc.
 */
export async function GET(req: NextRequest) {
  const url     = req.nextUrl.searchParams.get('url')
  const section = req.nextUrl.searchParams.get('section') || '7'  // MD&A default
  const type    = req.nextUrl.searchParams.get('type') || '10-K'  // filing type
  const format  = req.nextUrl.searchParams.get('format') || 'text' // text | html

  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })
  if (!SEC_API_KEY) return NextResponse.json({ error: 'SEC_API_KEY not configured' }, { status: 500 })

  try {
    const apiUrl = new URL('https://api.sec-api.io/extractor')
    apiUrl.searchParams.set('url', url)
    apiUrl.searchParams.set('item', section)
    apiUrl.searchParams.set('type', format)
    apiUrl.searchParams.set('token', SEC_API_KEY)

    const res = await fetch(apiUrl.toString())
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'Extraction failed', detail: err }, { status: res.status })
    }

    const content = await res.text()

    return NextResponse.json({
      url,
      section,
      sectionLabel: getSectionLabel(type, section),
      format,
      content,
      charCount: content.length,
      // Source reference for audit trail
      source: {
        edgarUrl: url,
        section: getSectionLabel(type, section),
        extractedAt: new Date().toISOString(),
      }
    })
  } catch (e) {
    return NextResponse.json({ error: 'Failed', detail: String(e) }, { status: 500 })
  }
}

function getSectionLabel(type: string, section: string): string {
  const tenK: Record<string, string> = {
    '1': 'Business', '1A': 'Risk Factors', '1B': 'Unresolved Staff Comments',
    '2': 'Properties', '3': 'Legal Proceedings', '4': 'Mine Safety',
    '5': 'Market for Registrant Equity', '6': 'Selected Financial Data',
    '7': "Management's Discussion & Analysis", '7A': 'Quantitative Market Risk',
    '8': 'Financial Statements', '9': 'Changes in Accountants',
    '9A': 'Controls and Procedures', '10': 'Directors & Officers',
    '11': 'Executive Compensation', '12': 'Security Ownership',
    '13': 'Certain Relationships', '14': 'Principal Accountant Fees',
  }
  const eightK: Record<string, string> = {
    '1.01': 'Entry into Material Agreement', '1.02': 'Termination of Agreement',
    '2.01': 'Completion of Acquisition', '2.02': 'Results of Operations (Press Release)',
    '2.03': 'Creation of Direct Financial Obligation', '3.01': 'Notice of Delisting',
    '4.01': 'Changes in Registrant Auditor', '5.01': 'Changes in Control',
    '5.02': 'Departure/Appointment of Officers', '5.03': 'Amendments to Articles',
    '7.01': 'Regulation FD Disclosure', '8.01': 'Other Events', '9.01': 'Financial Statements',
  }
  if (type === '8-K') return eightK[section] || `Item ${section}`
  return tenK[section] || `Item ${section}`
}
