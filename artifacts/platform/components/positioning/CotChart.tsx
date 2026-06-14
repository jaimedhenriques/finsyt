'use client'
/**
 * CotChart (Task #410)
 * ────────────────────
 * Commercial vs non-commercial net-positioning over time for one CFTC
 * market. Net = long − short per trader category; positive = net long,
 * negative = net short. A zero reference line anchors the long/short flip.
 */
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import type { CotReport } from './useCotData'

function fmtK(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`
  return String(v)
}

function fmtDate(d: string): string {
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

export default function CotChart({ reports }: { reports: CotReport[] }) {
  const rows = reports.map(r => ({
    date: r.date,
    noncommercial: r.noncommercial.net,
    commercial: r.commercial.net,
  }))

  if (rows.length === 0) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
        No positioning history available for this market right now.
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: 360 }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            minTickGap={36}
          />
          <YAxis
            tickFormatter={fmtK}
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            width={56}
          />
          <Tooltip
            formatter={((value: unknown, name: unknown) => [fmtK(Number(value)), name === 'noncommercial' ? 'Non-commercial (specs)' : 'Commercial (hedgers)']) as never}
            labelFormatter={((l: unknown) => fmtDate(String(l))) as never}
            contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          />
          <Legend
            formatter={(value: string) => value === 'noncommercial' ? 'Non-commercial (specs)' : 'Commercial (hedgers)'}
            wrapperStyle={{ fontSize: 12 }}
          />
          <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="2 2" />
          <Line type="monotone" dataKey="noncommercial" stroke="#1B4FFF" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="commercial" stroke="#16A34A" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
