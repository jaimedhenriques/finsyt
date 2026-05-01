'use client'
import React from 'react'
import { CitationChip, Quote } from './QuoteCard'

export interface StructuredRow { topic: string; statement: string; source: string; date: string; quote?: Quote }

interface Props { rows: StructuredRow[]; title?: string }

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

export default function StructuredAnswer({ rows, title }: Props) {
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
                {r.quote ? <CitationChip quote={r.quote}>{r.source}</CitationChip> : <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{r.source}</span>}
              </td>
              <td style={{ padding: '10px 12px', color: '#7D8FA9', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{r.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
