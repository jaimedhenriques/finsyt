'use client'
import { useEffect, useState } from 'react'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

interface NewsItem {
  title: string
  source: string
  publishedAt?: string
  url?: string
  tone?: number
}

interface NewsBriefResult {
  query: string
  headlines: NewsItem[]
  themes: string[]
  topTheme?: string
  sentimentAvg?: number
  sentimentLabel?: 'Bullish' | 'Bearish' | 'Neutral' | 'Mixed'
  briefs: string[]
  source: string
  fetchedAt: string
  unavailable?: boolean
  unavailableReason?: string
}

const SENTIMENT_COLORS: Record<string, { bg: string; fg: string }> = {
  Bullish:  { bg: 'rgba(14,159,110,0.08)', fg: '#0E9F6E' },
  Bearish:  { bg: 'rgba(239,68,68,0.08)', fg: '#DC2626' },
  Neutral:  { bg: 'rgba(90,106,130,0.08)', fg: '#5A6A82' },
  Mixed:    { bg: 'rgba(251,191,36,0.10)', fg: '#B45309' },
}

function toneColor(tone?: number): string {
  if (tone == null) return 'var(--text-muted)'
  if (tone > 2) return '#0E9F6E'
  if (tone < -2) return '#DC2626'
  return '#B45309'
}

interface Props {
  ticker?: string
  companyName?: string
  topic?: string
  country?: string
  compact?: boolean
  title?: string
}

export default function NewsBriefTile({ ticker, companyName, topic, country, compact, title }: Props) {
  const [data, setData] = useState<NewsBriefResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const qs = new URLSearchParams()
    if (ticker) qs.set('ticker', ticker)
    if (companyName) qs.set('company', companyName)
    if (topic) qs.set('topic', topic)
    if (country) qs.set('country', country)
    fetch(`${BASE}/api/intelligence/news-brief?${qs.toString()}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticker, companyName, topic, country])

  const displayTitle = title || `Intelligence Brief${ticker ? ` · ${ticker}` : topic ? ` · ${topic}` : ''}`
  const sentColors = data?.sentimentLabel ? SENTIMENT_COLORS[data.sentimentLabel] : SENTIMENT_COLORS.Neutral

  if (loading) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{displayTitle}</div>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 14, background: 'var(--bg-secondary)', borderRadius: 4, marginBottom: 8, width: `${60 + i * 10}%`, animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
    )
  }

  if (!data || (data.unavailable && !data.headlines.length)) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{displayTitle}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data?.unavailableReason || 'News sources unavailable'}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Source: Reuters / BBC / GDELT</div>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{displayTitle}</div>
          {data.topTheme && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>Top theme: {data.topTheme}</div>
          )}
        </div>
        {data.sentimentLabel && (
          <div style={{
            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: sentColors.bg, color: sentColors.fg,
          }}>
            {data.sentimentLabel}
          </div>
        )}
      </div>

      {data.themes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
          {data.themes.map((t, i) => (
            <span key={i} style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 12,
              background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}>{t}</span>
          ))}
        </div>
      )}

      {data.briefs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          {data.briefs.map((b, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{b}</div>
          ))}
        </div>
      )}

      {!compact && data.headlines.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Headlines</div>
          {data.headlines.slice(0, 6).map((h, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: toneColor(h.tone), flexShrink: 0, marginTop: 6 }} />
              <div style={{ flex: 1 }}>
                {h.url ? (
                  <a
                    href={h.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 11, color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500, lineHeight: 1.4, display: 'block' }}
                  >
                    {h.title}
                  </a>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.4, display: 'block' }}>{h.title}</span>
                )}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                  {h.source}
                  {h.publishedAt && ` · ${new Date(h.publishedAt).toLocaleDateString()}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        Source: {data.source} · {data.fetchedAt ? new Date(data.fetchedAt).toLocaleDateString() : ''}
      </div>
    </div>
  )
}
