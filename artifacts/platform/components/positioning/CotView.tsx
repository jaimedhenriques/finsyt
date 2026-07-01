'use client'
/**
 * CotView (Task #410)
 * ───────────────────
 * The Positioning Desk's COT surface: a grouped market picker, the
 * commercial-vs-non-commercial net-positioning chart, and a latest-report
 * highlight card. Honest about provenance — the footer always names the
 * `source` and an empty/errored fetch renders a neutral message rather than
 * fabricated numbers.
 */
import { useMemo, useState } from 'react'
import { Card, Badge, Skeleton, Select } from '@/components/ui'
import { useCotMarkets, useCotReport, type CotReport } from './useCotData'
import CotChart from './CotChart'

function fmtNum(v: number | null): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  const s = abs >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : abs >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toLocaleString()
  return s
}

function fmtSigned(v: number): string {
  return `${v >= 0 ? '+' : ''}${fmtNum(v)}`
}

function fmtDate(d: string): string {
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function LegRow({ label, leg, tone }: { label: string; leg: CotReport['commercial']; tone: 'blue' | 'green' | 'gray' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>L {fmtNum(leg.long)}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>S {fmtNum(leg.short)}</span>
        <span className={leg.net >= 0 ? 'pos' : 'neg'} style={{ fontSize: 13, fontWeight: 800, minWidth: 84, textAlign: 'right' }}>
          {fmtSigned(leg.net)}
        </span>
        <Badge tone={tone} style={{ fontSize: 9 }}>{leg.net >= 0 ? 'NET LONG' : 'NET SHORT'}</Badge>
      </span>
    </div>
  )
}

export default function CotView() {
  const { markets, loading: marketsLoading } = useCotMarkets()
  const [selected, setSelected] = useState<string>('088691') // Gold by default
  const { data, loading, error } = useCotReport(selected, 52)

  const grouped = useMemo(() => {
    const m = new Map<string, typeof markets>()
    for (const mk of markets) {
      const arr = m.get(mk.group) || []
      arr.push(mk)
      m.set(mk.group, arr)
    }
    return Array.from(m.entries())
  }, [markets])

  const latest = data?.latest || null
  const sourceLabel = data?.source && data.source !== 'none' ? data.source : 'CFTC Commitment of Traders'

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Card padding="18px 20px">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Market</span>
            <Select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              disabled={marketsLoading}
              style={{ minWidth: 220 }}
              aria-label="Select COT market"
            >
              {grouped.map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items.map(it => <option key={it.code} value={it.code}>{it.label}</option>)}
                </optgroup>
              ))}
            </Select>
          </div>
          {data?.market?.name && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 420, textAlign: 'right' }}>{data.market.name}</span>
          )}
        </div>
      </Card>

      <Card padding="18px 20px">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Net positioning — commercial vs non-commercial</span>
          {data?.market?.label && <Badge tone="blue" style={{ fontSize: 9 }}>{data.market.label}</Badge>}
        </div>
        {loading ? (
          <Skeleton height={340} />
        ) : error ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            Positioning data is unavailable right now.
          </div>
        ) : (
          <CotChart reports={data?.reports || []} />
        )}
        <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)' }}>
          Weekly futures-only report · read-only research signal · source: {sourceLabel}
          {data?.providerError ? ` · note: ${data.providerError}` : ''}
        </div>
      </Card>

      <Card padding="18px 20px">
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>Latest report</div>
        {loading ? (
          <Skeleton height={120} />
        ) : !latest ? (
          <div style={{ padding: '24px 0', fontSize: 12, color: 'var(--text-muted)' }}>
            No published Commitment-of-Traders report for this market yet.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              As of {fmtDate(latest.date)} · open interest {fmtNum(latest.openInterest)}
            </div>
            <LegRow label="Non-commercial (specs)" leg={latest.noncommercial} tone="blue" />
            <LegRow label="Commercial (hedgers)" leg={latest.commercial} tone="green" />
            <LegRow label="Non-reportable (small)" leg={latest.nonreportable} tone="gray" />
          </>
        )}
      </Card>
    </div>
  )
}
