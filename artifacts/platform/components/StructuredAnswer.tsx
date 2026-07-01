'use client'
import React from 'react'

export interface StructuredRow { topic: string; statement: string; source: string; date: string }

interface Props {
  rows: StructuredRow[]
  title?: string
  /** Called when the user clicks a numeric [N] badge in a source cell. */
  onCiteClick?: (n: number) => void
}

// Detect a markdown table block in plain text and parse Topic/Statement/Source/Date columns.
export function detectTable(text: string): StructuredRow[] | null {
  if (!text) return null
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const headerIdx = lines.findIndex(l => /^\|\s*topic\s*\|/i.test(l))
  if (headerIdx === -1) return null
  const dataLines = lines.slice(headerIdx + 2).filter(l => l.startsWith('|') && !/^\|\s*[-:|]+\s*\|/.test(l))
  const rows: StructuredRow[] = []
  for (const line of dataLines) {
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (cells.length < 4) continue
    rows.push({ topic: cells[0], statement: cells[1], source: cells[2], date: cells[3] })
  }
  return rows.length > 0 ? rows : null
}

/**
 * Render a source-cell string, turning any `[N]` markers into clickable
 * badges that call `onCiteClick(N)`. Remaining text is rendered as-is.
 * When `onCiteClick` is not provided the whole text renders as a plain span.
 */
function renderSourceCell(text: string, onCiteClick?: (n: number) => void): React.ReactNode {
  if (!onCiteClick) {
    return <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{text}</span>
  }
  const parts: React.ReactNode[] = []
  const re = /\[(\d+)\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(
        <span key={`t-${m.index}`} style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>
          {text.slice(last, m.index)}
        </span>,
      )
    }
    const n = parseInt(m[1], 10)
    parts.push(
      <button
        key={`nc-${m.index}`}
        type="button"
        onClick={() => onCiteClick(n)}
        title={`Jump to source [${n}]`}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, borderRadius: 5, marginLeft: 2, marginRight: 2,
          verticalAlign: 'middle',
          background: 'var(--accent-dim)', color: 'var(--accent-text)',
          border: '1px solid var(--accent)', cursor: 'pointer',
          fontSize: 9.5, fontWeight: 700, fontFamily: 'inherit', lineHeight: 1,
        }}
      >
        {n}
      </button>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) {
    parts.push(
      <span key="tail" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>
        {text.slice(last)}
      </span>,
    )
  }
  return <>{parts}</>
}

export default function StructuredAnswer({ rows, title, onCiteClick }: Props) {
  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', background: '#fff', marginTop: 10 }}>
      {title && <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead style={{ background: '#F8FAFD' }}>
          <tr>
            {['Topic', 'Statement', 'Source', 'Date'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 800, color: '#7D8FA9', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #E2E8F2' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: i < rows.length - 1 ? '1px solid #F0F4FA' : 'none' }}>
              <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0A1628', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{r.topic}</td>
              <td style={{ padding: '10px 12px', color: '#1C2B4A', lineHeight: 1.6 }}>{r.statement}</td>
              <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                {renderSourceCell(r.source, onCiteClick)}
              </td>
              <td style={{ padding: '10px 12px', color: '#7D8FA9', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{r.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
