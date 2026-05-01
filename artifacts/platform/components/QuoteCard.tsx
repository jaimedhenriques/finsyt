'use client'
import { useState, ReactNode } from 'react'
import Link from 'next/link'

export interface Quote {
  id: string
  speaker: string
  title: string
  symbol: string
  quarter: string
  section: 'Q&A' | 'Prepared remarks'
  text: string
  date?: string
}

export function CitationChip({ quote, children }: { quote: Quote; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, padding: '1px 7px', borderRadius: 8, background: 'rgba(27,79,255,0.1)', border: '1px solid rgba(27,79,255,0.25)', color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer', verticalAlign: 'middle', fontFamily: 'inherit' }}>
        {children || `${quote.symbol} ${quote.quarter}`}
      </button>
      {open && <QuoteModal quote={quote} onClose={() => setOpen(false)} />}
    </>
  )
}

export function QuoteModal({ quote, onClose }: { quote: Quote; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(8,14,26,0.55)', zIndex: 1100, backdropFilter: 'blur(4px)' }} />
      <div data-theme="white" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1101, width: 560, maxWidth: 'calc(100vw - 32px)', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: speakerColor(quote.speaker), color: '#fff', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {initials(quote.speaker)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0A1628' }}>{quote.speaker}</div>
            <div style={{ fontSize: 11, color: '#7D8FA9' }}>{quote.title}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9BAFC8', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>
        <div style={{ padding: '20px 22px', fontSize: 14, lineHeight: 1.75, color: 'var(--text-primary)', borderLeft: '4px solid var(--accent)', background: 'var(--bg-elevated)', margin: '16px 20px', borderRadius: 8 }}>
          “{quote.text}”
        </div>
        <Link href={`/app/company/${quote.symbol}?tab=transcripts`}
          onClick={onClose}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: 'var(--accent-dim)', borderTop: '1px solid var(--border)', textDecoration: 'none', color: 'var(--accent)' }}>
          <span style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 800 }}>{quote.symbol}</span>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{quote.quarter}</span>
          <span style={{ fontSize: 11, color: '#7D8FA9' }}>·</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#3D4F6E' }}>{quote.section}</span>
          {quote.date && <><span style={{ fontSize: 11, color: '#7D8FA9' }}>·</span><span style={{ fontSize: 11, color: '#7D8FA9' }}>{quote.date}</span></>}
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700 }}>Open transcript →</span>
        </Link>
      </div>
    </>
  )
}

function speakerColor(name: string) {
  const palette = ['var(--accent)', 'var(--pos)', 'var(--amber)', '#7C3AED', 'var(--neg)', '#0D9FE8']
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}
function initials(name: string) { return name.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase() }
