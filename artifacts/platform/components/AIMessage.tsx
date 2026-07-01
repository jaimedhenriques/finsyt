'use client'
import React from 'react'
import StructuredAnswer, { detectTable } from './StructuredAnswer'

// Matches earnings-call citations like [NVDA Q4 2026] or [AAPL FY 2025]
const EARNINGS_CITE_SRC = /\[([A-Z]{1,5})\s+(Q[1-4]\s+20\d{2}|FY\s*20\d{2})\]/.source
// Matches numeric source citations like [1], [2], [12]
const NUM_CITE_SRC = /\[(\d+)\]/.source

/**
 * Render a single line of text, converting citation markers into interactive
 * badges:
 *   - `[TICKER Q4 2026]` → a linked badge that navigates to the company
 *                          transcript page (honest: no fabricated quote text)
 *   - `[N]`             → numbered source badge that calls `onCiteClick(N)`
 *                         when clicked (links answer text back to the right-rail
 *                         citation card in the Research page).
 */
function renderInline(
  text: string,
  onCiteClick?: (n: number) => void,
): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const combined = new RegExp(`${EARNINGS_CITE_SRC}|${NUM_CITE_SRC}`, 'g')
  let last = 0
  let m: RegExpExecArray | null
  while ((m = combined.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))

    // m[3] is the numeric-cite capture group (third group in combined regex)
    if (m[3] !== undefined) {
      const n = parseInt(m[3], 10)
      if (onCiteClick) {
        out.push(
          <button
            key={`nc-${m.index}`}
            type="button"
            onClick={() => onCiteClick(n)}
            title={`Jump to source [${n}]`}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 18, height: 18, borderRadius: 5, marginLeft: 3,
              verticalAlign: 'middle',
              background: 'var(--accent-dim)', color: 'var(--accent-text)',
              border: '1px solid var(--accent)', cursor: 'pointer',
              fontSize: 9.5, fontWeight: 700, fontFamily: 'inherit', lineHeight: 1,
            }}
          >
            {n}
          </button>,
        )
      } else {
        out.push(`[${n}]`)
      }
    } else {
      // Earnings-call citation [TICKER Q4 2026] — render as a plain linked
      // badge that navigates to the company's transcript page. We do NOT
      // fabricate a speaker quote or specific excerpt here; the transcript
      // page is the canonical source the user can verify directly.
      const symbol = m[1]
      const quarter = m[2].replace(/\s+/g, ' ')
      out.push(
        <a
          key={`ec-${m.index}`}
          href={`/app/company/${symbol}`}
          title={`View ${symbol} ${quarter} earnings call`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '1px 6px', borderRadius: 5, marginLeft: 3,
            verticalAlign: 'middle',
            background: 'var(--accent-dim)', color: 'var(--accent-text)',
            border: '1px solid var(--accent)',
            fontSize: 9.5, fontWeight: 700, textDecoration: 'none', lineHeight: '18px',
          }}
        >
          {symbol} {quarter} ↗
        </a>,
      )
    }

    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

interface AIMessageProps {
  content: string
  /**
   * Called when the user clicks a numeric citation badge `[N]` inside the
   * answer body. `n` is the 1-based index matching the right-rail citation
   * panel. When omitted, numeric markers render as plain text.
   */
  onCiteClick?: (n: number) => void
}

export default function AIMessage({ content, onCiteClick }: AIMessageProps) {
  const tableRows = detectTable(content)
  if (tableRows) {
    const before = content.split(/\|\s*topic\s*\|/i)[0].trim()
    const afterIdx = content.lastIndexOf('|')
    const after = afterIdx > 0 ? content.slice(afterIdx + 1).split('\n').slice(1).join('\n').trim() : ''
    return (
      <div>
        {before && <div style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>{renderInline(before, onCiteClick)}</div>}
        <StructuredAnswer rows={tableRows} onCiteClick={onCiteClick} />
        {after && <div style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{renderInline(after, onCiteClick)}</div>}
      </div>
    )
  }
  const lines = content.split('\n')
  return <>{lines.map((line, i) => (
    <div key={i} style={{ minHeight: line ? undefined : '0.6em' }}>{renderInline(line, onCiteClick)}</div>
  ))}</>
}
