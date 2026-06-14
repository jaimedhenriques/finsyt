'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/analytics'
import { useTier } from '@/lib/tier'
import { ContextualAskBar } from '@/components/ui'

interface Question { symbol: string; name: string; date: string; event: string; section: string; q: string; analyst: string }
interface Cluster { id: string; theme: string; chips: string[]; quarter?: string; questions: Question[] }

export default function AnalystQuestionsPage() {
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeChip, setActiveChip] = useState<string | null>(null)
  const [source, setSource] = useState<string>('')
  const [generatedAt, setGeneratedAt] = useState<string>('')
  const { isPro } = useTier()

  const load = (refresh = false) => {
    setLoading(true)
    const url = (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/api/analyst-questions' + (refresh ? '?refresh=1' : '')
    fetch(url).then(r => r.json()).then(d => {
      setClusters(d.clusters || [])
      setSource(d.source || '')
      setGeneratedAt(d.generatedAt || '')
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    track('questions_view', { scope: 'global' })
    if (!isPro) { setLoading(false); return }
    load(false)
  }, [isPro])

  const allChips = Array.from(new Set(clusters.flatMap(c => c.chips)))
  const filteredClusters = clusters.filter(c => {
    if (activeChip && !c.chips.includes(activeChip)) return false
    if (search) {
      const s = search.toLowerCase()
      return c.theme.toLowerCase().includes(s) || c.questions.some(q =>
        q.q.toLowerCase().includes(s) || q.symbol.toLowerCase().includes(s) || q.analyst.toLowerCase().includes(s)
      )
    }
    return true
  })

  if (!isPro) {
    return <div style={{ padding: 40, maxWidth: 600, margin: '0 auto', textAlign: 'center', color: '#E2EEFF' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>◎</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Analyst Questions is a Pro feature</h2>
      <p style={{ fontSize: 13, color: '#7B96B8', marginBottom: 18 }}>Cluster similar Q&A across calls and companies into themes. Available on Pro and Enterprise plans.</p>
      <Link href="/app/upgrade" style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 10, background: 'var(--gradient-brand)', color: '#fff', textDecoration: 'none', fontWeight: 700 }}>Upgrade to Pro</Link>
    </div>
  }

  return (
    <div style={{ padding: '1.75rem', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#E2EEFF', letterSpacing: '-0.025em' }}>Analyst Questions</h1>
          <p style={{ fontSize: 13, color: '#7B96B8', marginTop: 4 }}>Q&A clustered by theme across earnings calls. Find what every analyst is asking — and who answered well.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: '#7B96B8', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 6, background: source === 'live' ? 'var(--pos)' : 'var(--text-muted)' }} />
            {source === 'live' ? 'Auto-clustered from latest transcripts' : source === 'fallback' ? 'Showing curated examples' : ''}
            {generatedAt && <span style={{ marginLeft: 4 }}>· {new Date(generatedAt).toLocaleTimeString()}</span>}
          </span>
          <button onClick={() => load(true)} disabled={loading}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#E2EEFF', fontSize: 11, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <ContextualAskBar
        context="Analyst Questions"
        contextData={{ page: 'analyst-questions', clusters: clusters.length, source }}
        chips={[
          { label: 'Top theme this Q',     prompt: 'Identify the most repeated analyst-question theme this quarter and which companies are facing it most.' },
          { label: 'Sentiment shift',      prompt: 'Track how analyst sentiment has shifted across the latest earnings calls — positive, neutral, and pushback themes.' },
          { label: 'Pushback only',        prompt: 'Filter the Q&A to only the pushback / sceptical questions and rank them by importance.' },
          { label: 'Build my Q&A digest',  prompt: 'Compile a digest of the analyst questions that matter most for my watchlist this earnings season.' },
        ]}
        placeholder="Ask Finsyt about analyst Q&A patterns…"
        style={{ margin: '0 0 14px' }}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search themes, questions, analysts..."
          style={{ flex: 1, minWidth: 240, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '9px 14px', color: '#E2EEFF', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setActiveChip(null)} style={chipStyle(activeChip === null)}>All</button>
          {allChips.map(c => (
            <button key={c} onClick={() => setActiveChip(c === activeChip ? null : c)} style={chipStyle(activeChip === c)}>{c}</button>
          ))}
        </div>
      </div>

      {loading && <div style={{ padding: 32, color: '#7B96B8' }}>Loading clusters…</div>}

      <div style={{ display: 'grid', gap: 14 }}>
        {filteredClusters.map(cluster => (
          <div key={cluster.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#E2EEFF' }}>{cluster.theme}</span>
              {cluster.quarter && cluster.quarter !== 'Curated' && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: '#93B4FF' }}>{cluster.quarter}</span>
              )}
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: 'rgba(27,79,255,0.2)', color: '#93B4FF' }}>
                {cluster.questions.length} {cluster.questions.length === 1 ? 'question' : 'questions'}
              </span>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {cluster.chips.map(c => (
                  <span key={c} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: '#7B96B8', fontWeight: 600 }}>{c}</span>
                ))}
              </div>
            </div>
            <div>
              {cluster.questions.map((q, i) => (
                <Link key={i} href={`/app/company/${q.symbol}?tab=transcripts`}
                  onClick={() => track('question_click', { theme: cluster.theme, symbol: q.symbol })}
                  style={{ display: 'flex', gap: 12, padding: '12px 18px', borderBottom: i < cluster.questions.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', textDecoration: 'none', alignItems: 'flex-start' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 900, flexShrink: 0 }}>{q.symbol.slice(0, 4)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#E2EEFF', lineHeight: 1.55, marginBottom: 4 }}>“{q.q}”</div>
                    <div style={{ fontSize: 11, color: '#7B96B8', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ color: '#93B4FF', fontWeight: 700 }}>{q.symbol}</span>
                      <span>·</span>
                      <span>{q.event}</span>
                      <span>·</span>
                      <span>{q.section}</span>
                      <span>·</span>
                      <span>{q.analyst}</span>
                      <span>·</span>
                      <span>{q.date}</span>
                    </div>
                  </div>
                  <span style={{ color: '#4A6280', fontSize: 12 }}>›</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function chipStyle(active: boolean): React.CSSProperties {
  return { padding: '5px 12px', borderRadius: 18, fontSize: 11, fontWeight: 700, cursor: 'pointer',
    border: '1px solid', borderColor: active ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
    background: active ? 'rgba(27,79,255,0.2)' : 'rgba(255,255,255,0.04)',
    color: active ? '#93B4FF' : '#E2EEFF', fontFamily: 'inherit' }
}
