'use client'
/**
 * Reusable alt-data cards (Task #326)
 * ───────────────────────────────────
 * Insider Activity, People & Culture and Filing Signal cards, extracted
 * from the company-page `AltDataTiles` so they can be reused on the
 * screener, portfolio and peers surfaces. Every card:
 *
 *   - self-detects the workspace's Apify Actors connection (shared,
 *     cached — see altDataCache);
 *   - renders the same "Connect Apify Actors" CTA when no connection
 *     exists;
 *   - optionally accepts an `onCite` callback so the company page can wire
 *     citation chips into its drawer. On pages without a drawer the chips
 *     are simply omitted.
 */
import { useMemo } from 'react'
import Link from 'next/link'
import { Badge, Skeleton } from '@/components/ui'
import { useApifyConnection, useCapitolTrades, useGlassdoor, useFilingSignals } from './hooks'
import type { CapitolTrade, GlassdoorSnapshot } from './altDataCache'
import { parseDate, bucketCountByWeek } from './altDataCache'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

type CiteFn = (label: string, body: string) => void

// ── Insider Activity ─────────────────────────────────────────────────────────
export function InsiderCard({ symbol, insiders = [], onCite }: { symbol: string; companyName?: string; insiders?: any[]; onCite?: CiteFn }) {
  const connection = useApifyConnection()
  const capitol = useCapitolTrades(connection, symbol)

  const merged = mergeInsider(insiders, capitol.data)

  // ── 12-week insider/congress volume trend ───────────────────────────
  // Aggregated from the dates already present in the FMP Form-4 feed and
  // the Capitol Trades actor rows — no extra Apify call is made.
  const insiderTrend = useMemo(() => {
    const dates: number[] = []
    for (const t of (capitol.data || [])) {
      const ts = parseDate(t.filed ?? t.traded)
      if (ts != null) dates.push(ts)
    }
    for (const t of (insiders || [])) {
      const ts = parseDate(t.date ?? t.filingDate ?? t.transactionDate)
      if (ts != null) dates.push(ts)
    }
    return dates.length ? bucketCountByWeek(dates) : null
  }, [insiders, capitol.data])

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={cardHeaderStyle}>
        <span>Insider Activity</span>
        <Badge tone="violet" style={{ fontSize: 9 }}>FMP + Capitol Trades</Badge>
      </div>
      {connection === undefined ? (
        <SkeletonRows />
      ) : connection === null && (insiders || []).length === 0 ? (
        <ConnectCta line="Connect Apify Actors to surface congressional trades alongside SEC Form 4 disclosures." />
      ) : merged.length === 0 && !capitol.loading ? (
        <EmptyRow>No insider transactions reported in the last reporting window.</EmptyRow>
      ) : (
        <>
          {insiderTrend && (
            <TrendStrip
              label="12-wk disclosure volume"
              values={insiderTrend}
              mode="bar"
              stroke="var(--accent)"
              summary={`${insiderTrend.reduce((a, b) => a + b, 0)} filings`}
            />
          )}
          {merged.map((row, i) => (
            <div key={row.key} style={rowStyle(i === merged.length - 1)}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</span>
                  {row.kind === 'capitol' && <Badge tone="violet" style={{ fontSize: 9 }}>CONGRESS</Badge>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{row.role} · {row.date}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`badge ${row.type.toLowerCase().includes('buy') || row.type === 'Purchase' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 10 }}>{row.type}</span>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{row.shares}</div>
              </div>
              {onCite && (
                <CitationChipBtn
                  i={i + 1}
                  onClick={() => onCite(
                    row.kind === 'capitol' ? `Capitol Trades — ${row.name}` : `SEC Form 4 — ${row.name}`,
                    formatRowBody(row),
                  )}
                />
              )}
            </div>
          ))}
          {capitol.loading && <SkeletonRows count={1} />}
          {capitol.error && (
            <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)' }}>
              Capitol Trades unavailable: {truncate(capitol.error, 80)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── People & Culture ─────────────────────────────────────────────────────────
export function PeopleCard({ symbol, companyName, onCite }: { symbol: string; companyName?: string; onCite?: CiteFn }) {
  const connection = useApifyConnection()
  const people = useGlassdoor(connection, companyName || symbol, symbol)

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={cardHeaderStyle}>
        <span>People &amp; Culture</span>
        <Badge tone="violet" style={{ fontSize: 9 }}>Glassdoor</Badge>
      </div>
      {connection === undefined ? (
        <PeopleSkeleton />
      ) : connection === null ? (
        <ConnectCta line="Connect Apify Actors for live Glassdoor ratings, pros / cons and median salary signals." />
      ) : people.loading ? (
        <PeopleSkeleton />
      ) : people.data ? (
        <PeopleBody data={people.data} companyName={companyName || symbol} symbol={symbol} onCite={onCite} />
      ) : (
        <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          {people.error || 'No reviews returned for this company.'}
        </div>
      )}
    </div>
  )
}

// ── Filing Signal ────────────────────────────────────────────────────────────
export function SignalCard({ symbol, onCite }: { symbol: string; onCite?: CiteFn }) {
  const connection = useApifyConnection()
  const signals = useFilingSignals(connection, symbol)
  const top = signals.data.items.filter((s) => s.score > 0).slice(0, 6)

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={cardHeaderStyle}>
        <span>Filing Signals</span>
        <Badge tone="violet" style={{ fontSize: 9 }}>SEC EDGAR Intelligence</Badge>
      </div>
      {connection === undefined ? (
        <SkeletonRows />
      ) : connection === null ? (
        <ConnectCta line="Connect Apify Actors to score recent SEC filings for material changes and risk language." />
      ) : signals.loading ? (
        <SkeletonRows />
      ) : top.length === 0 ? (
        <EmptyRow>{signals.error ? `Signals unavailable: ${truncate(signals.error, 80)}` : 'No scored filings returned for this company.'}</EmptyRow>
      ) : (
        top.map((s, i) => {
          const tone = scoreTone(s.score)
          return (
            <div key={s.accession || i} style={rowStyle(i === top.length - 1)}>
              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800, fontVariantNumeric: 'tabular-nums', background: tone.bg, color: tone.fg, flexShrink: 0 }}>
                {s.score}
              </span>
              <div style={{ minWidth: 0, flex: 1, fontSize: 11.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.sections.length ? s.sections.join(', ') : 'Material-change signal'}
              </div>
              {onCite && (
                <CitationChipBtn i={i + 1} onClick={() => onCite(`SEC EDGAR Filings Intelligence — ${symbol}`, formatSignalBody(s.score, s.sections))} />
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

/**
 * AltDataSection — composes all three cards in a responsive grid for the
 * screener / portfolio / peers surfaces, driven by a single focus ticker.
 * Bounded to one ticker so we never fan out an Apify run per visible row.
 */
export function AltDataSection({ symbol, companyName }: { symbol: string; companyName?: string }) {
  if (!symbol) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
      <InsiderCard symbol={symbol} companyName={companyName} />
      <PeopleCard symbol={symbol} companyName={companyName} />
      <SignalCard symbol={symbol} />
    </div>
  )
}

/**
 * FocusPicker — compact ticker selector that drives the AltDataSection on
 * pages that list many tickers. Keeps alt-data lookups bounded to the one
 * ticker the user is inspecting.
 */
export function FocusPicker({ label, symbols, value, onChange }: { label: string; symbols: string[]; value: string; onChange: (s: string) => void }) {
  const unique = Array.from(new Set(symbols.filter(Boolean)))
  if (unique.length === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {unique.slice(0, 12).map((s) => {
          const active = s === value
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              aria-pressed={active}
              style={{
                padding: '3px 10px', borderRadius: 14, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${active ? 'var(--accent-text)' : 'var(--border)'}`,
                background: active ? 'var(--accent-bg, rgba(99,102,241,0.12))' : 'transparent',
                color: active ? 'var(--accent-text)' : 'var(--text-primary)',
              }}
            >{s}</button>
          )
        })}
      </div>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function PeopleBody({ data, companyName, symbol, onCite }: { data: GlassdoorSnapshot; companyName: string; symbol: string; onCite?: CiteFn }) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {data.rating != null ? data.rating.toFixed(1) : '—'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/ 5.0</span>
        {typeof data.reviewCount === 'number' && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {data.reviewCount.toLocaleString()} reviews
          </span>
        )}
        {onCite && <CitationChipBtn i={1} onClick={() => onCite(`Glassdoor — ${companyName || symbol}`, formatGlassdoorBody(data))} />}
      </div>
      {data.ratingTrend && (
        <TrendStrip
          label="12-wk rating trend"
          values={data.ratingTrend}
          mode="line"
          stroke="var(--accent)"
          summary={trendSummary(data.ratingTrend)}
          inset
        />
      )}
      <div style={{ display: 'flex', gap: 14, marginBottom: 12, fontSize: 11 }}>
        {typeof data.recommendPct === 'number' && (
          <span><span style={{ color: 'var(--text-muted)' }}>Would recommend</span> <strong style={{ color: 'var(--text-primary)' }}>{Math.round(data.recommendPct)}%</strong></span>
        )}
        {typeof data.ceoApprovePct === 'number' && (
          <span><span style={{ color: 'var(--text-muted)' }}>CEO approval</span> <strong style={{ color: 'var(--text-primary)' }}>{Math.round(data.ceoApprovePct)}%</strong></span>
        )}
        {data.medianSalary && (
          <span><span style={{ color: 'var(--text-muted)' }}>Median salary</span> <strong style={{ color: 'var(--text-primary)' }}>{data.medianSalary}</strong></span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <ProsConsList label="Pros" tone="pos" items={data.pros || []} />
        <ProsConsList label="Cons" tone="neg" items={data.cons || []} />
      </div>
      {data.url && (
        <a href={data.url} target="_blank" rel="noreferrer" style={{ marginTop: 10, display: 'inline-block', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>Open on Glassdoor ↗</a>
      )}
    </div>
  )
}

function ProsConsList({ label, tone, items }: { label: string; tone: 'pos' | 'neg'; items: string[] }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: tone === 'pos' ? 'var(--pos)' : 'var(--neg)', marginBottom: 4 }}>{label}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</div>
      ) : (
        <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {items.map((p, i) => <li key={i}>{truncate(p, 72)}</li>)}
        </ul>
      )}
    </div>
  )
}

function ConnectCta({ line }: { line: string }) {
  return (
    <div style={{ padding: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
      <p style={{ margin: '0 0 10px' }}>{line}</p>
      <Link
        href={`${BASE}/app/connectors?source=apify-actors`}
        className="btn btn-primary btn-sm"
        style={{ fontSize: 12 }}
      >Connect Apify Actors →</Link>
    </div>
  )
}

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div style={{ padding: '4px 0' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ padding: '12px 16px', borderBottom: i === count - 1 ? 'none' : '1px solid var(--border)', display: 'flex', gap: 10 }}>
          <Skeleton style={{ height: 12, flex: 1 }} />
          <Skeleton style={{ height: 12, width: 60 }} />
        </div>
      ))}
    </div>
  )
}

function PeopleSkeleton() {
  return (
    <div style={{ padding: 16 }}>
      <Skeleton style={{ height: 14, width: '60%', marginBottom: 8 }} />
      <Skeleton style={{ height: 12, width: '95%', marginBottom: 6 }} />
      <Skeleton style={{ height: 12, width: '85%' }} />
    </div>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>{children}</div>
}

function CitationChipBtn({ i, onClick }: { i: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="View source"
      style={{
        marginLeft: 8, padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800,
        border: '1px solid var(--border)', background: 'var(--bg-elevated)',
        color: 'var(--accent-text)', cursor: 'pointer', flexShrink: 0,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >[{i}]</button>
  )
}

const cardHeaderStyle: React.CSSProperties = {
  padding: '14px 16px', borderBottom: '1px solid var(--border)',
  fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
}

function rowStyle(isLast: boolean): React.CSSProperties {
  return {
    padding: '10px 16px',
    borderBottom: isLast ? 'none' : '1px solid var(--border)',
    display: 'flex', alignItems: 'center', gap: 8,
  }
}

function scoreTone(score: number): { bg: string; fg: string } {
  return score >= 70 ? { bg: 'var(--pos-dim)', fg: 'var(--pos)' }
    : score >= 40 ? { bg: 'rgba(245,158,11,0.18)', fg: 'rgb(245,158,11)' }
    : { bg: 'var(--neg-dim)', fg: 'var(--neg)' }
}

interface MergedInsiderRow { kind: 'fmp' | 'capitol'; key: string; name: string; role: string; type: string; shares: string; date: string; raw: unknown }

function mergeInsider(insiders: any[], capitol: CapitolTrade[]): MergedInsiderRow[] {
  const fmp: MergedInsiderRow[] = (insiders || []).slice(0, 6).map((t: any, i: number) => ({
    kind: 'fmp',
    key: `fmp-${i}`,
    name: t.name || t.reportingName || '—',
    role: t.role || t.reportingCik || 'Insider',
    type: t.type || t.transactionType || 'Trade',
    shares: t.shares ? `${(Number(t.shares) / 1000).toFixed(0)}K shares` : '—',
    date: t.date || t.filingDate || '',
    raw: t,
  }))
  const cap: MergedInsiderRow[] = (capitol || []).slice(0, 6).map((t, i) => ({
    kind: 'capitol',
    key: `cap-${i}`,
    name: t.politician,
    role: [t.party, t.chamber].filter(Boolean).join(' · ') || 'Member of Congress',
    type: t.type,
    shares: t.amount || '—',
    date: t.filed || t.traded || '',
    raw: t.raw,
  }))
  return [...cap, ...fmp].slice(0, 8)
}

function truncate(s: string, n: number): string { return s.length > n ? s.slice(0, n - 1) + '…' : s }

function formatRowBody(row: { raw: unknown }): string {
  return JSON.stringify(row.raw, null, 2).slice(0, 1800)
}

function formatSignalBody(score: number, sections: string[]): string {
  const lines = [`Signal score: ${score} / 100`]
  if (sections.length) { lines.push('', 'Material sections:'); for (const s of sections) lines.push(`  • ${s}`) }
  return lines.join('\n')
}

/** Replace each null with the most recent non-null value before it. */
function carryForward(nums: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = []
  let prev: number | null = null
  for (const v of nums) {
    if (v != null) prev = v
    out.push(prev)
  }
  return out
}

/** Compact "x.x → y.y" delta summary for a nullable series. */
function trendSummary(values: (number | null)[]): string {
  const present = values.filter((v): v is number => v != null)
  if (present.length === 0) return ''
  const first = present[0]
  const last = present[present.length - 1]
  if (present.length === 1) return last.toFixed(1)
  const delta = last - first
  const arrow = delta > 0.04 ? '↑' : delta < -0.04 ? '↓' : '→'
  return `${first.toFixed(1)} ${arrow} ${last.toFixed(1)}`
}

// ── Trend strip (label + sparkline) ───────────────────────────────────
function TrendStrip({
  label, values, mode, stroke, summary, inset,
}: {
  label: string
  values: (number | null)[]
  mode: 'bar' | 'line'
  stroke: string
  summary?: string
  inset?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: inset ? '0 0 12px' : '10px 16px',
        borderBottom: inset ? 'none' : '1px solid var(--border)',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</div>
        {summary && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{summary}</div>}
      </div>
      <Sparkline values={values} mode={mode} stroke={stroke} />
    </div>
  )
}

/** Inline SVG sparkline. Renders bars (counts) or a line (ratings). */
function Sparkline({
  values, mode, stroke, width = 120, height = 30,
}: {
  values: (number | null)[]
  mode: 'bar' | 'line'
  stroke: string
  width?: number
  height?: number
}) {
  const nums = values.map(v => (v == null ? null : v))
  const present = nums.filter((v): v is number => v != null)
  if (present.length === 0) return null
  const max = Math.max(...present)
  const min = mode === 'line' ? Math.min(...present) : 0
  const span = max - min || 1
  const n = nums.length
  const pad = 2

  if (mode === 'bar') {
    const gap = 2
    const bw = (width - (n - 1) * gap) / n
    return (
      <svg width={width} height={height} role="img" aria-label="trend sparkline" style={{ display: 'block', flexShrink: 0 }}>
        {nums.map((v, i) => {
          const val = v ?? 0
          const h = max === 0 ? 0 : Math.max(val === 0 ? 0 : 1, ((val - min) / span) * (height - pad))
          const x = i * (bw + gap)
          const y = height - h
          return <rect key={i} x={x} y={y} width={bw} height={h} rx={1} fill={stroke} opacity={val === 0 ? 0.18 : 0.85} />
        })}
      </svg>
    )
  }

  // Line mode: carry the last known value forward across null weeks so the
  // line stays continuous, then plot points only where we had real data.
  const stepX = n > 1 ? (width - pad * 2) / (n - 1) : 0
  const y = (val: number) => pad + (1 - (val - min) / span) * (height - pad * 2)
  const filled = carryForward(nums)
  const startIdx = filled.findIndex(v => v != null)
  const linePts = filled
    .map((v, i) => (v != null && i >= startIdx ? `${pad + i * stepX},${y(v)}` : null))
    .filter(Boolean)
    .join(' ')
  return (
    <svg width={width} height={height} role="img" aria-label="trend sparkline" style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={linePts} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {nums.map((v, i) => (v != null ? (
        <circle key={i} cx={pad + i * stepX} cy={y(v)} r={1.6} fill={stroke} />
      ) : null))}
    </svg>
  )
}

function formatGlassdoorBody(data: GlassdoorSnapshot): string {
  const lines: string[] = []
  lines.push(`Rating: ${data.rating ?? '—'} / 5 across ${data.reviewCount ?? '—'} reviews`)
  if (data.recommendPct != null) lines.push(`Would recommend: ${Math.round(data.recommendPct)}%`)
  if (data.ceoApprovePct != null) lines.push(`CEO approval: ${Math.round(data.ceoApprovePct)}%`)
  if (data.medianSalary) lines.push(`Median salary: ${data.medianSalary}`)
  if (data.pros?.length) { lines.push('', 'Pros:'); for (const p of data.pros) lines.push(`  • ${p}`) }
  if (data.cons?.length) { lines.push('', 'Cons:'); for (const c of data.cons) lines.push(`  • ${c}`) }
  return lines.join('\n')
}
