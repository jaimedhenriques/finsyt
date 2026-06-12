'use client'
import { useState, useEffect, useCallback } from 'react'
import { ContextualAskBar } from '@/components/ui'

// ── Types ─────────────────────────────────────────────────────────────────────
interface FqlMetric {
  key: string
  name: string
  category: string
  unit: 'USD' | '%' | 'x' | 'shares' | 'ratio'
  periodRequired: boolean
  fmpField: string
  description: string
}

// ── Period options ─────────────────────────────────────────────────────────────
const PERIODS = [
  { label: 'Annual (A)',            value: 'A',   desc: 'Full fiscal year' },
  { label: 'Quarterly (Q)',         value: 'Q',   desc: 'Most recent quarter' },
  { label: 'Last Twelve Months',    value: 'LTM', desc: 'Rolling LTM' },
  { label: 'Next Twelve Months',    value: 'NTM', desc: 'Forward estimate' },
]

const OFFSETS = [
  { label: 'Most recent (0)',       value: '0' },
  { label: '1 period back (-1)',    value: '-1' },
  { label: '2 periods back (-2)',   value: '-2' },
  { label: '3 periods back (-3)',   value: '-3' },
  { label: '4 periods back (-4)',   value: '-4' },
]

const CATEGORY_LABELS: Record<string, string> = {
  income_statement: 'Income Statement',
  balance_sheet:    'Balance Sheet',
  cash_flow:        'Cash Flow',
  valuation:        'Valuation',
  market:           'Market & Price',
  growth:           'Growth',
  estimates:        'Estimates',
  ratios:           'Ratios',
  dividends:        'Dividends',
}

const PREFIX_COLORS: Record<string, string> = {
  FX: 'var(--accent)',
  FV: '#7C3AED',
  FM: '#0891B2',
  FE: 'var(--amber)',
  FG: 'var(--pos)',
  FR: 'var(--neg)',
  FD: '#DB2777',
}

function prefixColor(key: string): string {
  const pfx = key.slice(0, 2)
  return PREFIX_COLORS[pfx] ?? '#6B7280'
}

// ── Formula Builder Modal ──────────────────────────────────────────────────────
function FormulaBuilder({ metric, onClose }: { metric: FqlMetric; onClose: () => void }) {
  const [ticker, setTicker]   = useState('AAPL')
  const [period, setPeriod]   = useState('A')
  const [offset, setOffset]   = useState('0')
  const [copied, setCopied]   = useState(false)

  const buildExcel = (): string => {
    if (!metric.periodRequired) {
      return `=FQL("${metric.key}", "${ticker}")`
    }
    return `=FQL("${metric.key}", "${ticker}", "${period}", ${offset})`
  }

  const buildApiUrl = (): string => {
    const periodMap: Record<string, string> = { A: 'annual', Q: 'quarterly', LTM: 'ltm', NTM: 'ntm' }
    const base = `/api/financials?symbol=${ticker}&metric=${metric.key}`
    return metric.periodRequired ? `${base}&period=${periodMap[period] ?? 'annual'}&offset=${offset}` : base
  }

  const buildPython = (): string => {
    if (!metric.periodRequired) {
      return `fql.get("${metric.key}", ticker="${ticker}")`
    }
    return `fql.get("${metric.key}", ticker="${ticker}", period="${period}", offset=${offset})`
  }

  const formula = buildExcel()

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const color = prefixColor(metric.key)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(27,79,255,0.2)', borderRadius: 16, width: '100%', maxWidth: 640, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, background: `${color}22`, color, padding: '3px 10px', borderRadius: 6, letterSpacing: '0.03em' }}>{metric.key}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 5 }}>{CATEGORY_LABELS[metric.category] ?? metric.category}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{metric.name}</div>
              {metric.description && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{metric.description}</div>}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
          </div>
        </div>

        {/* Builder */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: metric.periodRequired ? '1fr 1fr 1fr' : '1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Ticker / Cell Ref</label>
              <input
                value={ticker}
                onChange={e => setTicker(e.target.value)}
                placeholder="AAPL or B1"
                style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid rgba(27,79,255,0.2)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            {metric.periodRequired && (
              <>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Period</label>
                  <select
                    value={period}
                    onChange={e => setPeriod(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid rgba(27,79,255,0.2)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' }}
                  >
                    {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Offset</label>
                  <select
                    value={offset}
                    onChange={e => setOffset(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid rgba(27,79,255,0.2)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' }}
                  >
                    {OFFSETS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Formula outputs */}
          {[
            { label: 'Excel / Google Sheets', value: formula },
            { label: 'REST API', value: buildApiUrl() },
            { label: 'Python SDK', value: buildPython() },
          ].map(({ label, value }) => (
            <div key={label}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>{label}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <code style={{ flex: 1, background: 'var(--bg-page)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#93c5fd', fontFamily: 'monospace', wordBreak: 'break-all' }}>{value}</code>
                <button
                  onClick={() => copy(value)}
                  style={{ flexShrink: 0, background: copied ? 'rgba(52,211,153,0.15)' : 'rgba(27,79,255,0.15)', border: 'none', borderRadius: 8, cursor: 'pointer', padding: '10px 14px', color: copied ? '#34d399' : '#93B4FF', fontSize: 12, fontWeight: 600 }}
                >
                  {copied ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function FormulasPage() {
  const [catalog, setCatalog]         = useState<FqlMetric[]>([])
  const [filtered, setFiltered]       = useState<FqlMetric[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [activeCategory, setCategory] = useState('All')
  const [selected, setSelected]       = useState<FqlMetric | null>(null)
  const [buildTicker, setBuildTicker] = useState('AAPL')

  useEffect(() => {
    fetch('/api/financials/metrics')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.flat) {
          setCatalog(d.flat)
          setFiltered(d.flat)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filter = useCallback(() => {
    let list = catalog
    if (activeCategory !== 'All') list = list.filter(m => m.category === activeCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(m => m.key.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q))
    }
    setFiltered(list)
  }, [catalog, search, activeCategory])

  useEffect(() => { filter() }, [filter])

  const categories = ['All', ...Array.from(new Set(catalog.map(m => m.category)))]

  const exportModel = () => {
    const header = `FQL Formula Model — ${buildTicker}\nGenerated by Finsyt | finsyt.io\n\n`
    const rows = filtered.map(m => {
      const base = `=FQL("${m.key}", "${buildTicker}"`
      if (!m.periodRequired) return `${m.name}\t${base})`
      return `${m.name}\t${base}, "A", 0)\t${base}, "A", -1)\t${base}, "A", -2)\t${base}, "A", -3)`
    }).join('\n')
    const blob = new Blob([header + rows], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `finsyt_fql_model_${buildTicker}.txt`
    a.click()
  }

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">FQL Formula Engine</h1>
          <p style={{ fontSize: 13, color: '#7D8FA9', marginTop: 4 }}>
            Finsyt Query Language — {catalog.length} proprietary mnemonics across financials, valuation, estimates, and market data
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'rgba(27,79,255,0.1)', border: '1px solid rgba(27,79,255,0.2)', padding: '4px 12px', borderRadius: 6, fontFamily: 'monospace' }}>
            =FQL( )
          </span>
          <input
            value={buildTicker}
            onChange={e => setBuildTicker(e.target.value.toUpperCase())}
            placeholder="Ticker for export"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '7px 12px', color: '#fff', fontSize: 13, outline: 'none', width: 120 }}
          />
          <button onClick={exportModel} style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, cursor: 'pointer', padding: '8px 16px', color: '#fff', fontSize: 13, fontWeight: 600 }}>
            ↓ Export model
          </button>
        </div>
      </div>

      <ContextualAskBar
        context="FQL Formulas"
        contextData={{ page: 'formulas', mnemonics: catalog.length, ticker: buildTicker }}
        chips={[
          { label: 'Build P/E formula',  prompt: 'Write the FQL formula for trailing and forward P/E for a ticker I provide.' },
          { label: 'Suggest 5 mnemonics',prompt: 'Suggest 5 FQL mnemonics most relevant to a quality-growth investor and explain when to use each.' },
          { label: 'DCF skeleton',       prompt: 'Lay out a DCF skeleton in FQL with the key drivers I should override per company.' },
          { label: 'Quality screen',     prompt: 'Compose a multi-factor quality screen using FQL — high ROIC, low leverage, stable margins.' },
        ]}
        placeholder="Ask Finsyt to build or explain a formula…"
        style={{ margin: '0 0 16px' }}
      />

      {/* Prefix legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {Object.entries(PREFIX_COLORS).map(([pfx, color]) => (
          <div key={pfx} style={{ display: 'flex', alignItems: 'center', gap: 5, background: `${color}12`, border: `1px solid ${color}33`, borderRadius: 6, padding: '3px 10px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color }}>{pfx}_</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
              {{ FX: 'Financials', FV: 'Valuation', FM: 'Market', FE: 'Estimates', FG: 'Growth', FR: 'Ratios', FD: 'Dividends' }[pfx]}
            </span>
          </div>
        ))}
      </div>

      {/* Search + category filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search mnemonics, names, definitions... (e.g. FX_EBITDA, revenue, margin)"
          style={{ flex: 1, minWidth: 280, background: '#fff', border: '1.5px solid var(--border)', borderRadius: 9, padding: '9px 14px', fontSize: 13, color: 'var(--text-primary)', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: activeCategory === cat ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                color: activeCategory === cat ? '#fff' : 'rgba(255,255,255,0.5)',
              }}
            >
              {cat === 'All' ? 'All' : (CATEGORY_LABELS[cat] ?? cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 14 }}>
        {loading ? 'Loading catalog…' : `${filtered.length} of ${catalog.length} metrics`}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ height: 80, background: 'rgba(255,255,255,0.03)', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {filtered.map(metric => {
            const color = prefixColor(metric.key)
            return (
              <button
                key={metric.key}
                onClick={() => setSelected(metric)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
                  padding: '14px 16px', background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(27,79,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(27,79,255,0.25)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color, letterSpacing: '0.03em' }}>{metric.key}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: 4 }}>{metric.unit}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{metric.name}</div>
                {metric.description && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>{metric.description}</div>}
              </button>
            )
          })}
        </div>
      )}

      {/* FQL Quick Reference */}
      <div style={{ marginTop: 40, background: 'rgba(27,79,255,0.05)', border: '1px solid rgba(27,79,255,0.15)', borderRadius: 12, padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>FQL Quick Reference</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
          {[
            { label: 'Revenue (Annual, most recent)', formula: '=FQL("FX_REV", "AAPL", "A", 0)' },
            { label: 'EBITDA Margin (Quarterly, last Q)', formula: '=FQL("FX_EBITDA_M", "NVDA", "Q", -1)' },
            { label: 'EV/EBITDA (no period needed)', formula: '=FQL("FV_EV_EBITDA", "MSFT")' },
            { label: 'EPS Estimate (NTM)', formula: '=FQL("FE_EPS_EST", "TSLA", "NTM", 0)' },
            { label: 'Free Cash Flow (LTM)', formula: '=FQL("FX_FCF", "AMZN", "LTM", 0)' },
            { label: 'Price Target (consensus)', formula: '=FQL("FE_PT", "GOOGL")' },
          ].map(ex => (
            <div key={ex.label} style={{ background: 'var(--bg-page)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>{ex.label}</div>
              <code style={{ fontSize: 12, color: '#93c5fd', fontFamily: 'monospace' }}>{ex.formula}</code>
            </div>
          ))}
        </div>
      </div>

      {selected && <FormulaBuilder metric={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
