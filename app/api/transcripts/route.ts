import { NextRequest, NextResponse } from 'next/server'
const FMP = process.env.FMP_API_KEY

export async function GET(req: NextRequest) {
  const symbol  = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const year    = req.nextUrl.searchParams.get('year') || ''
  const quarter = req.nextUrl.searchParams.get('quarter') || ''
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  try {
    // Get list of available transcripts
    if (!year) {
      const res = await fetch(`https://financialmodelingprep.com/api/v4/earning_call_transcript?symbol=${symbol}&apikey=${FMP}`)
      const data = await res.json()
      const transcripts = (Array.isArray(data) ? data : []).map((t: any) => ({
        symbol, year: t[0], quarter: t[1], date: t[2],
      }))
      return NextResponse.json({ transcripts })
    }

    // Get specific transcript
    const res = await fetch(`https://financialmodelingprep.com/api/v3/earning_call_transcript/${symbol}?year=${year}&quarter=${quarter}&apikey=${FMP}`)
    const data = await res.json()
    const transcript = Array.isArray(data) ? data[0] : data
    if (!transcript) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Parse into speaker segments
    const content = transcript.content || ''
    const lines = content.split('\n').filter((l: string) => l.trim())
    const segments: { speaker: string; role: string; text: string }[] = []
    let currentSpeaker = ''
    let currentRole = ''
    let currentText: string[] = []

    lines.forEach((line: string) => {
      const speakerMatch = line.match(/^([A-Z][^:]{2,40}):\s*(.*)$/)
      if (speakerMatch) {
        if (currentSpeaker && currentText.length > 0) {
          segments.push({ speaker: currentSpeaker, role: currentRole, text: currentText.join(' ') })
        }
        currentSpeaker = speakerMatch[1]
        currentRole = currentSpeaker.includes('Operator') ? 'Operator' : 'Executive'
        currentText = speakerMatch[2] ? [speakerMatch[2]] : []
      } else {
        currentText.push(line)
      }
    })
    if (currentSpeaker && currentText.length > 0) {
      segments.push({ speaker: currentSpeaker, role: currentRole, text: currentText.join(' ') })
    }

    return NextResponse.json({
      symbol,
      year:     transcript.year,
      quarter:  transcript.quarter,
      date:     transcript.date,
      content:  content,
      segments: segments.slice(0, 60),
    })
  } catch (e) {
    return NextResponse.json({ error: 'Failed', detail: String(e) }, { status: 500 })
  }
}
