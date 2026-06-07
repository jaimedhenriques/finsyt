'use client'
import { useEffect, useState } from 'react'
import { track } from '@/lib/analytics'

interface Question { symbol: string; name: string; date: string; event: string; section: string; q: string; analyst: string }
interface Cluster { id: string; theme: string; chips: string[]; quarter?: string; questions: Question[] }

export default function CompanyQuestions({ symbol }: { symbol: string }) {
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<string>('')

  useEffect(() => {
    track('questions_view', { scope: symbol })
    setLoading(true)
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/api/analyst-questions?symbol=${symbol}`).then(r => {
      if (r.status === 402) { setClusters([]); return null }
      return r.json()
    }).then(d => {
      if (d) { setClusters(d.clusters || []); setSource(d.source || '') }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [symbol])

  if (loading) return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading questions…</div>
  if (!clusters.length) return (
    <div style={{ padding: 30, textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
      No clustered analyst questions for {symbol} yet. We surface them automatically as new transcripts come in.
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 6, background: source === 'live' ? 'var(--pos)' : 'var(--text-muted)' }} />
        {source === 'live' ? 'Auto-clustered from latest earnings call transcripts' : 'Showing curated example clusters'}
      </div>
      {clusters.map(cluster => (
        <div key={cluster.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{cluster.theme}</span>
            <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: 'var(--accent-dim)', color: 'var(--accent)' }}>{cluster.questions.length}</span>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              {cluster.chips.map(c => (
                <span key={c} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontWeight: 600 }}>{c}</span>
              ))}
            </div>
          </div>
          {cluster.questions.map((q, i) => (
            <div key={i} style={{ padding: '12px 16px', borderBottom: i < cluster.questions.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55, marginBottom: 4 }}>“{q.q}”</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{q.event} · {q.section} · {q.analyst} · {q.date}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
