'use client'
import React from 'react'
import StructuredAnswer, { detectTable } from './StructuredAnswer'
import { CitationChip, Quote } from './QuoteCard'

const QUOTE_LIBRARY: Record<string, Quote> = {
  'NVDA Q4 2026': { id: 'nvda-q4-26', symbol: 'NVDA', quarter: 'Q4 2026', section: 'Q&A', date: '2026-02-21',
    speaker: 'Colette Kress', title: 'CFO, NVIDIA',
    text: 'Steady-state we are guiding to mid-70s gross margin on a non-GAAP basis once Blackwell mix normalises.' },
  'AAPL Q1 2026': { id: 'aapl-q1-26', symbol: 'AAPL', quarter: 'Q1 2026', section: 'Prepared remarks', date: '2026-02-01',
    speaker: 'Tim Cook', title: 'CEO, Apple',
    text: 'Services revenue reached an all-time high, growing 14% year-over-year and now contributes record profitability.' },
  'MSFT Q2 2026': { id: 'msft-q2-26', symbol: 'MSFT', quarter: 'Q2 2026', section: 'Q&A', date: '2026-01-30',
    speaker: 'Satya Nadella', title: 'CEO, Microsoft',
    text: 'AI capex is sized against signed bookings — we will continue to invest aggressively while ROI is in line with our return thresholds.' },
  'META Q4 2025': { id: 'meta-q4-25', symbol: 'META', quarter: 'Q4 2025', section: 'Q&A', date: '2026-01-29',
    speaker: 'Susan Li', title: 'CFO, Meta',
    text: 'Llama-driven engagement lift is already reflected in time-spent metrics and we expect that to monetise through Reels and Stories ads.' },
  'TSLA Q4 2025': { id: 'tsla-q4-25', symbol: 'TSLA', quarter: 'Q4 2025', section: 'Q&A', date: '2026-01-24',
    speaker: 'Elon Musk', title: 'CEO, Tesla',
    text: 'China demand has stabilised and we expect order growth to inflect positively in the second quarter.' },
}

const CITE_RE = /\[([A-Z]{1,5})\s+(Q[1-4]\s+20\d{2}|FY\s*20\d{2})\]/g

function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  CITE_RE.lastIndex = 0
  while ((m = CITE_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const key = `${m[1]} ${m[2].replace(/\s+/g, ' ')}`
    const quote = QUOTE_LIBRARY[key] || {
      id: key, symbol: m[1], quarter: m[2], section: 'Q&A', date: '',
      speaker: 'Management', title: `${m[1]} earnings call`,
      text: `Cited from the ${m[1]} ${m[2]} earnings call.`,
    }
    out.push(<CitationChip key={`c-${m.index}`} quote={quote} />)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export default function AIMessage({ content }: { content: string }) {
  const tableRows = detectTable(content)
  if (tableRows) {
    const before = content.split(/\|\s*topic\s*\|/i)[0].trim()
    const afterIdx = content.lastIndexOf('|')
    const after = afterIdx > 0 ? content.slice(afterIdx + 1).split('\n').slice(1).join('\n').trim() : ''
    return (
      <div>
        {before && <div style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>{renderInline(before)}</div>}
        <StructuredAnswer rows={tableRows.map(r => {
          const k = (r.source.match(/[A-Z]{1,5}\s+Q[1-4]\s+20\d{2}/) || [])[0]
          return { ...r, quote: k ? QUOTE_LIBRARY[k] : undefined }
        })} />
        {after && <div style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{renderInline(after)}</div>}
      </div>
    )
  }
  // Non-table — render with inline citations
  const lines = content.split('\n')
  return <>{lines.map((line, i) => (
    <div key={i} style={{ minHeight: line ? undefined : '0.6em' }}>{renderInline(line)}</div>
  ))}</>
}
