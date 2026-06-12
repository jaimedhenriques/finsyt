'use client'
import { useEffect } from 'react'

/**
 * Minimal shape the drawer needs from a Research-page citation. Kept local
 * (rather than importing the page's `Citation`) so the component stays
 * decoupled from the page module.
 */
export interface SourceRecord {
  id: number
  source: string
  ticker?: string
  doc: string
  date: string
  excerpt: string
  type: 'broker' | 'transcript' | 'filing' | 'news' | 'expert'
  url?: string
  raw?: string
}

const TYPE_LABEL: Record<SourceRecord['type'], string> = {
  broker: 'Market data',
  transcript: 'Transcript',
  filing: 'SEC filing',
  news: 'News',
  expert: 'Expert call',
}

/**
 * Parse the truncated tool-result JSON into a small list of human-readable
 * records (headlines / filings / transcript lines). Falls back to a pretty
 * JSON dump so the drawer always shows *something* concrete rather than just
 * a provider label.
 */
function parseRecords(raw?: string): { title: string; meta?: string; url?: string }[] {
  if (!raw) return []
  let obj: any
  try { obj = JSON.parse(raw) } catch { return [] }
  const out: { title: string; meta?: string; url?: string }[] = []
  if (Array.isArray(obj?.articles)) {
    for (const a of obj.articles.slice(0, 8)) {
      out.push({
        title: a.title || a.headline || 'Untitled article',
        meta: [a.source || a.publisher, a.publishedAt || a.date || a.datetime].filter(Boolean).join(' · ') || undefined,
        url: a.url || a.link,
      })
    }
  }
  if (Array.isArray(obj?.filings)) {
    for (const f of obj.filings.slice(0, 8)) {
      out.push({
        title: [f.form || f.type, f.title].filter(Boolean).join(' — ') || 'Filing',
        meta: [f.filedAt || f.date || f.filingDate, f.accession || f.accessionNumber].filter(Boolean).join(' · ') || undefined,
        url: f.url || f.link,
      })
    }
  }
  if (Array.isArray(obj?.transcripts)) {
    for (const t of obj.transcripts.slice(0, 8)) {
      out.push({
        title: [t.symbol, t.quarter ? `${t.quarter}` : null, t.year].filter(Boolean).join(' ') || 'Transcript',
        meta: [t.date, t.speaker].filter(Boolean).join(' · ') || undefined,
        url: t.url || t.link,
      })
    }
  }
  return out
}

export default function SourceDrawer({ record, onClose }: { record: SourceRecord; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const records = parseRecords(record.raw)
  let prettyRaw = ''
  if (record.raw) {
    try { prettyRaw = JSON.stringify(JSON.parse(record.raw), null, 2) } catch { prettyRaw = record.raw }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(8,14,26,0.55)', zIndex: 1200, backdropFilter: 'blur(4px)' }} />
      <aside
        role="dialog"
        aria-label={`Source ${record.id}: ${record.source}`}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 1201,
          width: 460, maxWidth: 'calc(100vw - 32px)', background: 'var(--bg-card)',
          borderLeft: '1px solid var(--border)', boxShadow: '-12px 0 40px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{record.id}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3 }}>{record.source}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{TYPE_LABEL[record.type]}</span>
              <span>·</span><span>{record.doc}</span>
              <span>·</span><span>{record.date}</span>
              {record.ticker && <><span>·</span><span style={{ fontWeight: 700, color: 'var(--accent-text)' }}>{record.ticker}</span></>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1, padding: 2, flexShrink: 0 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {record.excerpt && (
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-secondary)', padding: '10px 12px', borderLeft: '3px solid var(--accent)', background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: 16 }}>
              {record.excerpt}
            </div>
          )}

          {records.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Records</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {records.map((r, i) => (
                  <div key={i} style={{ padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--row-stripe)' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>{r.title}</div>
                    {r.meta && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>{r.meta}</div>}
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 6, fontSize: 11, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
                        Open original ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {prettyRaw && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: 8 }}>Raw payload</summary>
              <pre style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320 }}>{prettyRaw}</pre>
            </details>
          )}
        </div>

        {record.url && (
          <a href={record.url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 20px', borderTop: '1px solid var(--border)', background: 'var(--accent-dim)', color: 'var(--accent)', textDecoration: 'none', fontSize: 12.5, fontWeight: 800 }}>
            Open source document ↗
          </a>
        )}
      </aside>
    </>
  )
}
