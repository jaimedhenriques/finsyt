'use client'
import { useRef, useState } from 'react'
import type { ModelBuilderResponse, ModelAssumptions } from './types'
import DcfOutputPanel from './DcfOutputPanel'
import CompsPanel from './CompsPanel'
import LboPanel from './LboPanel'
import TxCompsPanel from './TxCompsPanel'
import AuditPanel from './AuditPanel'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

const EXAMPLE_PROMPTS = [
  'Build a DCF for NVDA with 12% WACC and a comps set of its top 5 peers',
  'Run a DCF on AAPL — conservative 8% WACC, 2% terminal growth, 5-year stage 1 at 9% growth',
  'Generate trading comps for MSFT vs GOOGL, AMZN, META, ORCL, CRM',
  'LBO model for a target with 10x EV/EBITDA entry, 5-year hold, 4.5x leverage, 8% EBITDA growth',
  'Show me precedent M&A transaction comps for AAPL',
  'Audit my DCF model for TSLA — WACC 9%, terminal growth 3.5%',
]

function csvToBlob(rows: string[][]): Blob {
  const lines = rows.map(r => r.map(cell => {
    const s = cell == null ? '' : String(cell)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }).join(','))
  return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function fmtPct(v: number) { return (v * 100).toFixed(2) + '%' }

type Phase = 'idle' | 'parsing' | 'running' | 'done' | 'error'
type TabKey = 'dcf' | 'comps' | 'lbo' | 'tx-comps' | 'audit'

interface TabDef { key: TabKey; label: string; icon: string }

export default function ModelBuilderView({ initialSymbol }: { initialSymbol?: string }) {
  const [prompt, setPrompt] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ModelBuilderResponse | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('dcf')
  const [savingWorkspace, setSavingWorkspace] = useState(false)
  const [savedWorkspace, setSavedWorkspace] = useState<{ id: string; name: string } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  async function run(overridePrompt?: string) {
    const q = (overridePrompt ?? prompt).trim()
    if (!q) return
    setPhase('parsing')
    setError(null)
    setResult(null)

    try {
      setPhase('running')
      const r = await fetch(`${BASE}/api/model-builder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: q, context: initialSymbol ? { symbol: initialSymbol } : undefined }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`)
      const res = j as ModelBuilderResponse
      setResult(res)
      setPhase('done')
      // Default to the primary tab based on what was built
      if (res.lbo && !res.lbo.error) setActiveTab('lbo')
      else if (res.txComps && !res.txComps.error && !res.txComps.skipped) setActiveTab('tx-comps')
      else if (res.dcf && !res.dcf.error) setActiveTab('dcf')
      else if (res.comps && !res.comps.error && !res.comps.skipped) setActiveTab('comps')
      else if (res.audit && !res.audit.error) setActiveTab('audit')
    } catch (e: any) {
      setError(e.message || String(e))
      setPhase('error')
    }
  }

  async function saveToWorkspace() {
    if (!result) return
    setSavingWorkspace(true)
    try {
      const spec = result.spec
      const modelLabel = spec.type === 'lbo' ? 'LBO' : spec.type === 'tx-comps' ? 'Tx Comps' : spec.type === 'audit' ? 'Audit' : spec.type === 'dcf' ? 'DCF' : spec.type === 'comps' ? 'Comps' : 'DCF + Comps'
      const name = `Model: ${spec.ticker} ${modelLabel} — ${new Date().toLocaleDateString()}`
      const r = await fetch(`${BASE}/api/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: result.spec.reasoning,
          kind: 'research',
          metadata: { modelSpec: spec, generatedAt: result.generatedAt },
        }),
      })
      if (r.ok) {
        const j = await r.json()
        setSavedWorkspace({ id: j.workspace?.id || j.id, name })
      }
    } finally {
      setSavingWorkspace(false)
    }
  }

  function handleDcfCsvExport(rows: string[][]) {
    downloadBlob(csvToBlob(rows), `dcf-${result?.spec.ticker || 'model'}.csv`)
  }
  function handleCompsCsvExport(rows: string[][]) {
    downloadBlob(csvToBlob(rows), `comps-${result?.spec.ticker || 'model'}.csv`)
  }
  function handleLboCsvExport(rows: string[][]) {
    downloadBlob(csvToBlob(rows), `lbo-${result?.spec.ticker || 'model'}.csv`)
  }
  function handleTxCompsCsvExport(rows: string[][]) {
    downloadBlob(csvToBlob(rows), `tx-comps-${result?.spec.ticker || 'model'}.csv`)
  }

  function exportCombinedCsv() {
    if (!result) return
    const spec = result.spec
    const rows: string[][] = []
    rows.push([`Model Builder Export — ${spec.ticker} (${spec.type.toUpperCase()}) — ${new Date().toLocaleDateString()}`])
    rows.push(['Generated by Finsyt Model Builder'])
    rows.push([])
    rows.push(['PROMPT', prompt])
    rows.push(['REASONING', spec.reasoning])
    rows.push([])
    // DCF section
    if (result.dcf && !result.dcf.error) {
      const a = spec.assumptions
      rows.push(['=== DCF MODEL ==='])
      rows.push(['Ticker', spec.ticker])
      rows.push(['WACC', fmtPct(a.wacc)])
      rows.push(['Terminal Growth', fmtPct(a.terminalGrowth)])
      rows.push(['Stage 1 Growth', fmtPct(a.growthStage1)])
      rows.push(['Stage 2 Growth', fmtPct(a.growthStage2)])
      rows.push(['Stage 1 Years', String(a.stage1Years)])
      rows.push(['Stage 2 Years', String(a.stage2Years)])
      rows.push([])
      const d = result.dcf
      rows.push(['Enterprise Value ($M)', d.enterpriseValue?.toFixed(1) ?? ''])
      rows.push(['Equity Value ($M)', d.equityValue?.toFixed(1) ?? ''])
      rows.push(['Intrinsic Value / Share', d.intrinsicValuePerShare?.toFixed(2) ?? ''])
      rows.push(['TV % of EV', d.terminalValuePctOfEv != null ? (d.terminalValuePctOfEv * 100).toFixed(1) + '%' : ''])
      rows.push([])
      if (d.years?.length) {
        rows.push(['Year-by-Year Projections'])
        rows.push(['Year', 'FCF ($M)', 'Growth %', 'Discount Factor', 'PV ($M)'])
        for (const y of d.years) {
          rows.push([String(y.year), y.fcf.toFixed(1), (y.growth * 100).toFixed(2) + '%', y.discountFactor.toFixed(4), y.presentValue.toFixed(1)])
        }
      }
      rows.push([])
    }
    // Comps section
    if (result.comps && !result.comps.error && !result.comps.skipped) {
      rows.push(['=== TRADING COMPS ==='])
      const metrics = result.comps.metricsMeta || []
      const compRows = result.comps.rows || []
      rows.push(['Symbol', 'Name', ...metrics.map(m => m.label)])
      for (const r of compRows) {
        rows.push([r.symbol, r.name, ...metrics.map(m => r.cells[m.key]?.display ?? '')])
      }
      rows.push([])
    }
    // Audit section
    if (result.audit && result.audit.findings && result.audit.findings.length > 0) {
      rows.push(['=== MODEL AUDIT ==='])
      rows.push(['Score', String(result.audit.score ?? '—')])
      rows.push(['Summary', result.audit.summary ?? ''])
      rows.push([])
      rows.push(['Severity', 'Field', 'Finding', 'Message', 'Observed', 'Benchmark'])
      for (const f of result.audit.findings) {
        rows.push([f.severity, f.field, f.label, f.message, f.observed ?? '', f.benchmark ?? ''])
      }
    }
    downloadBlob(csvToBlob(rows), `finsyt-model-${spec.ticker}-${Date.now()}.csv`)
  }

  const spec = result?.spec
  const isRunning = phase === 'parsing' || phase === 'running'
  const hasDcf    = !!result?.dcf    && !result.dcf.error
  const hasComps  = !!result?.comps  && !result.comps.error  && !result.comps.skipped
  const hasLbo    = !!result?.lbo    && !result.lbo.error
  const hasTxComps = !!result?.txComps && !result.txComps.error && !result.txComps.skipped
  const hasAudit  = !!result?.audit  && !result.audit.error  && !result.audit.skipped

  const availableTabs: TabDef[] = [
    hasDcf     && { key: 'dcf'     as TabKey, label: 'DCF',              icon: '⊟' },
    hasComps   && { key: 'comps'   as TabKey, label: 'Trading Comps',    icon: '⊞' },
    hasLbo     && { key: 'lbo'     as TabKey, label: 'LBO',              icon: '⬡' },
    hasTxComps && { key: 'tx-comps'as TabKey, label: 'Tx Comps',         icon: '⟳' },
    hasAudit   && { key: 'audit'   as TabKey, label: 'Audit',            icon: '✓' },
  ].filter(Boolean) as TabDef[]

  const showTabs = availableTabs.length > 1

  // Audit badge: show on the audit tab if there are errors/warnings
  const auditBadge = result?.audit?.findings
    ? result.audit.findings.filter(f => f.severity === 'error' || f.severity === 'warning').length
    : 0

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Prompt input */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-dim)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>⊟</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Describe your model</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>DCF · Trading Comps · LBO · Precedent Tx Comps · Model Audit</div>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run() }
            }}
            placeholder="e.g. LBO model for DELL with 10x entry, 5-year hold at 4.5x leverage; or Audit my DCF for NVDA…"
            rows={3}
            disabled={isRunning}
            style={{
              width: '100%', resize: 'vertical', padding: '10px 14px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg-elevated)',
              color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit',
              lineHeight: 1.5, outline: 'none', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {EXAMPLE_PROMPTS.slice(0, 4).map((p, i) => (
                <button
                  key={i}
                  onClick={() => { setPrompt(p); setTimeout(() => run(p), 0) }}
                  disabled={isRunning}
                  style={{
                    padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                    border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)', cursor: isRunning ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', opacity: isRunning ? 0.5 : 1,
                  }}
                >
                  {p.length > 50 ? p.slice(0, 50) + '…' : p}
                </button>
              ))}
            </div>
            <button
              onClick={() => run()}
              disabled={!prompt.trim() || isRunning}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none',
                background: !prompt.trim() || isRunning ? 'var(--bg-elevated)' : 'var(--gradient-brand)',
                color: !prompt.trim() || isRunning ? 'var(--text-muted)' : '#fff',
                fontWeight: 800, fontSize: 13, cursor: !prompt.trim() || isRunning ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {isRunning ? (
                <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> {phase === 'parsing' ? 'Parsing…' : 'Building model…'}</>
              ) : (
                <><span>⊟</span> Build Model</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {phase === 'error' && error && (
        <div style={{ padding: '14px 18px', borderRadius: 10, border: '1px solid var(--neg)', background: 'var(--neg-dim)', color: 'var(--neg)', fontSize: 13 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Loading skeleton */}
      {isRunning && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ animation: 'spin 1s linear infinite', fontSize: 18 }}>⟳</span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {phase === 'parsing' ? 'Parsing your request with AI…' : 'Fetching financials and building model…'}
            </span>
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ width: `${70 + i * 10}%`, height: 12 }} />
          ))}
        </div>
      )}

      {/* Results */}
      {phase === 'done' && result && spec && (
        <>
          {/* Spec card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{spec.ticker}</div>
                <span style={{ padding: '2px 8px', borderRadius: 999, background: 'var(--accent-dim)', color: 'var(--accent-text)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
                  {spec.type === 'lbo' ? 'LBO' : spec.type === 'tx-comps' ? 'Transaction Comps' : spec.type === 'audit' ? 'Model Audit' : spec.type === 'dcf' ? 'DCF' : spec.type === 'comps' ? 'Comps' : 'DCF + Comps'}
                </span>
                {/* Audit score badge */}
                {result.audit?.score != null && (
                  <span style={{
                    padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800,
                    background: result.audit.score >= 80 ? 'rgba(34,197,94,0.12)' : result.audit.score >= 60 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                    color: result.audit.score >= 80 ? 'var(--pos)' : result.audit.score >= 60 ? 'var(--warn)' : 'var(--neg)',
                  }}>
                    Audit {result.audit.score}/100
                  </span>
                )}
              </div>
              {spec.reasoning && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: 600 }}>{spec.reasoning}</div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {spec.type !== 'lbo' && spec.type !== 'tx-comps' && [
                  { label: 'WACC', value: fmtPct(spec.assumptions.wacc) },
                  { label: 'Terminal g', value: fmtPct(spec.assumptions.terminalGrowth) },
                  { label: 'S1 Growth', value: fmtPct(spec.assumptions.growthStage1) },
                  { label: 'S1 Years', value: String(spec.assumptions.stage1Years) },
                  ...(spec.peerSymbols.length > 0 ? [{ label: 'Peers', value: spec.peerSymbols.join(', ') }] : []),
                ].map((tag, i) => (
                  <span key={i} style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    <strong style={{ color: 'var(--text-muted)' }}>{tag.label}:</strong> {tag.value}
                  </span>
                ))}
                {spec.type === 'lbo' && spec.lboAssumptions && [
                  { label: 'Entry', value: spec.lboAssumptions.entryMultiple.toFixed(1) + 'x' },
                  { label: 'Exit', value: spec.lboAssumptions.exitMultiple.toFixed(1) + 'x' },
                  { label: 'Hold', value: spec.lboAssumptions.holdPeriod + 'y' },
                  { label: 'Leverage', value: spec.lboAssumptions.totalLeverage.toFixed(1) + 'x' },
                  { label: 'EBITDA CAGR', value: fmtPct(spec.lboAssumptions.ebitdaGrowth) },
                ].map((tag, i) => (
                  <span key={i} style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    <strong style={{ color: 'var(--text-muted)' }}>{tag.label}:</strong> {tag.value}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
              {savedWorkspace ? (
                <a href={`${BASE}/app/workspaces`} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--pos)', color: '#fff', fontWeight: 700, fontSize: 12, textDecoration: 'none' }}>
                  ✓ Saved to Workspaces
                </a>
              ) : (
                <button
                  onClick={saveToWorkspace}
                  disabled={savingWorkspace}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12, cursor: savingWorkspace ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                >
                  {savingWorkspace ? 'Saving…' : '💾 Save to Workspace'}
                </button>
              )}
              <button
                onClick={exportCombinedCsv}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                ⬇ Export All CSV
              </button>
            </div>
          </div>

          {/* Tab selector */}
          {showTabs && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {availableTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  aria-pressed={activeTab === tab.key}
                  style={{
                    padding: '6px 16px', borderRadius: 8, fontWeight: 700, fontSize: 12,
                    border: '1px solid',
                    borderColor: activeTab === tab.key ? 'var(--accent)' : 'var(--border)',
                    background: activeTab === tab.key ? 'var(--accent-dim)' : 'transparent',
                    color: activeTab === tab.key ? 'var(--accent-text)' : 'var(--text-muted)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                  {/* Audit badge */}
                  {tab.key === 'audit' && auditBadge > 0 && (
                    <span style={{
                      minWidth: 18, height: 18, borderRadius: 99,
                      background: result.audit?.hasErrors ? 'var(--neg)' : 'var(--warn)',
                      color: '#fff', fontSize: 9, fontWeight: 900,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 4px',
                    }}>
                      {auditBadge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Panel rendering */}
          {hasDcf && (!showTabs || activeTab === 'dcf') && (
            <DcfOutputPanel
              dcf={result.dcf!}
              initialAssumptions={spec.assumptions}
              onExportCsv={handleDcfCsvExport}
            />
          )}
          {result.dcf?.error && (!showTabs || activeTab === 'dcf') && (
            <div style={{ padding: '14px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13 }}>
              <strong style={{ color: 'var(--neg)' }}>DCF note:</strong> {result.dcf.error}
            </div>
          )}

          {(hasComps || (result.comps && !result.comps.skipped)) && (!showTabs || activeTab === 'comps') && (
            <CompsPanel
              comps={result.comps!}
              onExportCsv={handleCompsCsvExport}
            />
          )}

          {(hasLbo || (result.lbo && result.lbo.error)) && (!showTabs || activeTab === 'lbo') && (
            <LboPanel
              lbo={result.lbo!}
              ticker={spec.ticker}
              onExportCsv={handleLboCsvExport}
            />
          )}

          {(hasTxComps || (result.txComps && (result.txComps.skipped || result.txComps.error))) && (!showTabs || activeTab === 'tx-comps') && (
            <TxCompsPanel
              txComps={result.txComps!}
              ticker={spec.ticker}
              onExportCsv={handleTxCompsCsvExport}
            />
          )}

          {hasAudit && (!showTabs || activeTab === 'audit') && (
            <AuditPanel audit={result.audit!} />
          )}
        </>
      )}

      {/* Idle state */}
      {phase === 'idle' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '36px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ready to model</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', maxWidth: 540 }}>
            Describe a model in plain English and Finsyt will build it from live data
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, maxWidth: 540 }}>
            Supports DCF (sensitivity grid, live-editable assumptions), Trading Comps (real quote data),
            LBO models (sources &amp; uses, debt schedule, IRR/MOIC sensitivity),
            Precedent Transaction Comps (M&amp;A multiples), and a Model Audit pass that catches
            broken assumptions and inconsistencies.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
            {EXAMPLE_PROMPTS.map((p, i) => (
              <button
                key={i}
                onClick={() => { setPrompt(p); setTimeout(() => run(p), 0) }}
                style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                  border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
