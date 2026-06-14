import { NextRequest, NextResponse } from 'next/server'

const FMP = process.env.FMP_API_KEY || ''

async function fetchFilingText(url: string): Promise<string> {
  if (!url) return ''
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Finsyt research@finsyt.com', Accept: 'text/html,application/xhtml+xml' },
    next: { revalidate: 86400 },
  })
  if (!r.ok) return ''
  const html = await r.text()
  // strip tags + collapse whitespace
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(s => s.trim())
    .filter(s => s.length > 30 && s.length < 600)
}

function extractRiskFactors(text: string): string {
  // Look for "Risk Factors" section heuristically
  const lower = text.toLowerCase()
  const start = lower.indexOf('risk factors')
  if (start === -1) return text.slice(0, 50_000)
  const after = text.slice(start)
  // Stop at next major section heading
  const stopMatch = after.toLowerCase().search(/\b(unresolved staff comments|properties|legal proceedings|item\s+\d+[a-z]?\s)/i)
  return after.slice(0, stopMatch > 0 ? stopMatch : 80_000)
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const form   = req.nextUrl.searchParams.get('form') || '10-K'
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  if (!FMP)    return NextResponse.json({ error: 'FMP_API_KEY not configured' }, { status: 503 })

  try {
    // Fetch the latest two filings of this form
    const r = await fetch(`https://financialmodelingprep.com/api/v3/sec_filings/${symbol}?type=${encodeURIComponent(form)}&limit=2&apikey=${FMP}`, {
      next: { revalidate: 3600 },
    })
    if (!r.ok) return NextResponse.json({ error: `FMP ${r.status}` }, { status: 502 })
    const arr = await r.json()
    if (!Array.isArray(arr) || arr.length < 2) {
      return NextResponse.json({ symbol, form, ready: false, note: 'Need at least two filings of this form to diff.' })
    }
    const [latest, prior] = arr

    const [latestText, priorText] = await Promise.all([
      fetchFilingText(latest.finalLink || latest.link),
      fetchFilingText(prior.finalLink  || prior.link),
    ])
    if (!latestText || !priorText) {
      return NextResponse.json({ symbol, form, ready: false, note: 'Filing text could not be downloaded from SEC.' })
    }

    const latestSec = extractRiskFactors(latestText)
    const priorSec  = extractRiskFactors(priorText)
    const latestSent = new Set(splitSentences(latestSec))
    const priorSent  = new Set(splitSentences(priorSec))

    const added: string[] = []
    const removed: string[] = []
    latestSent.forEach(s => { if (!priorSent.has(s)) added.push(s) })
    priorSent.forEach(s  => { if (!latestSent.has(s))  removed.push(s) })

    return NextResponse.json({
      symbol, form, ready: true,
      latest: { date: latest.fillingDate || latest.date, link: latest.finalLink || latest.link },
      prior:  { date: prior.fillingDate  || prior.date,  link: prior.finalLink  || prior.link  },
      stats: {
        latestSentences: latestSent.size,
        priorSentences:  priorSent.size,
        added:           added.length,
        removed:         removed.length,
      },
      added:   added.slice(0, 25),
      removed: removed.slice(0, 25),
      section: 'Risk Factors',
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
