'use client'
import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts'
import { Badge } from '@/components/ui'

type SentimentLabel = 'positive' | 'neutral' | 'negative'

interface DailyPoint {
  date: string
  count: number
  avgScore: number
  positive: number
  neutral: number
  negative: number
}
interface DeviationMetric { latest: number; mean: number; std: number; z: number; deviated: boolean }
interface SentimentResponse {
  scope: string
  symbol: string | null
  windowDays: number
  series: DailyPoint[]
  deviation: {
    hasSignal: boolean
    volume: DeviationMetric
    sentiment: DeviationMetric
    direction: 'positive' | 'negative' | null
    baselineDays: number
    note: string
  }
  current: {
    avgScore: number
    label: SentimentLabel
    articleCount: number
    positive: number
    neutral: number
    negative: number
  }
  source: string
  generatedAt: string
}

const LABEL_TONE: Record<SentimentLabel, 'green' | 'gray' | 'red'> = {
  positive: 'green',
  neutral: 'gray',
  negative: 'red',
}

function scoreColor(score: number): string {
  if (score >= 0.15) return 'var(--pos)'
  if (score <= -0.15) return 'var(--neg)'
  return 'var(--text-muted)'
}

export default function NewsSentimentTile({
  symbol,
  base = '',
}: {
  symbol: string
  base?: string
}) {
  const [data, setData] = useState<SentimentResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`${base}/api/news/sentiment?symbol=${encodeURIComponent(symbol)}&days=30`)
      .then(r => r.json())
      .then((d: SentimentResponse & { error?: string }) => {
        if (cancelled) return
        if (d.error) { setError(d.error); return }
        setData(d)
      })
      .catch(() => { if (!cancelled) setError('Failed to load sentiment') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [symbol, base])

  if (loading) {
    return (
      <div className="card" style={{ padding: '16px 20px', fontSize: 12, color: 'var(--text-muted)' }}>
        Scoring news sentiment for {symbol}…
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="card" style={{ padding: '16px 20px', fontSize: 12, color: 'var(--text-muted)' }}>
        News sentiment unavailable{error ? ` — ${error}` : ''}.
      </div>
    )
  }

  const { current, deviation, series } = data
  const chartData = series.map(p => ({ date: p.date.slice(5), avgScore: p.avgScore, count: p.count }))
  const dev = deviation.hasSignal

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>News Sentiment</span>
          <Badge tone={LABEL_TONE[current.label]}>{current.label}</Badge>
          <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(current.avgScore) }}>
            {current.avgScore >= 0 ? '+' : ''}{current.avgScore.toFixed(2)}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {current.articleCount} article{current.articleCount === 1 ? '' : 's'} · {data.windowDays}d · src: {data.source}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
        <span style={{ color: 'var(--pos)' }}>▲ {current.positive} pos</span>
        <span>· {current.neutral} neutral</span>
        <span style={{ color: 'var(--neg)' }}>▼ {current.negative} neg</span>
      </div>

      {dev && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            padding: '8px 10px', borderRadius: 8,
            background: deviation.direction === 'negative' ? 'var(--neg-dim)' : 'var(--accent-dim)',
            fontSize: 12,
          }}
        >
          <Badge tone={deviation.sentiment.deviated ? (deviation.direction === 'negative' ? 'red' : 'green') : 'amber'}>
            deviation
          </Badge>
          <span style={{ color: 'var(--text-primary)' }}>{deviation.note}</span>
        </div>
      )}
      {!dev && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
          {deviation.note}
        </div>
      )}

      {chartData.length > 1 ? (
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={chartData} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id={`sent-grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} minTickGap={24} axisLine={false} tickLine={false} />
            <YAxis domain={[-1, 1]} ticks={[-1, 0, 1]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
            <Tooltip
              contentStyle={{ background: 'var(--bg-elevated, #1a1a1a)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
              formatter={(v: any, name: any): [string, string] => name === 'avgScore' ? [Number(v).toFixed(2), 'avg sentiment'] : [String(v), 'articles']}
            />
            <Area type="monotone" dataKey="avgScore" stroke="var(--accent)" strokeWidth={2} fill={`url(#sent-grad-${symbol})`} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '12px 0' }}>
          Not enough daily history to chart a trend yet.
        </div>
      )}
    </div>
  )
}
