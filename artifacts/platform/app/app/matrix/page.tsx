'use client'
import { useState, useMemo, useEffect } from 'react'
import { PageHero, SectionBand, ContextualAskBar, ACTION_ICONS, ICON_STROKE } from '@/components/ui'
import { GridTemplatesGallery, GridTemplate, SourceLibraryPicker, useSelectedSourceIds } from '@/components/research-pack'

// ─── Hebbia-style Matrix ─────────────────────────────────────────────────────
// Documents (rows) × research questions (columns). Each cell is a queued AI
// run. Real agent backend lands in Phase 2 — for now cells render either a
// deterministic precomputed answer (so the UI looks alive) or a "Reading…"
// placeholder mirroring the Hebbia Matrix product surface.

type Doc = {
  id: string
  title: string
  date: string
  type: 'Filings' | 'Marketing Materials' | 'Product' | 'Customer' | 'Public Report' | 'Internal'
  size: string
}

type Col = { id: string; label: string; prompt: string; width: number }

type Cell = { state: 'done' | 'reading' | 'queued' | 'error'; text?: string; sources?: number }

const DOCS: Doc[] = [
  { id:'d1',  title:'FY2024 P&L',                       date:'Jan 16, 2026', type:'Filings',           size:'2.1 MB' },
  { id:'d2',  title:'Project Alpha CIM',                date:'Apr 29, 2024', type:'Marketing Materials', size:'8.4 MB' },
  { id:'d3',  title:'Product Overview Project Alpha',   date:'Feb 28, 2024', type:'Product',           size:'1.6 MB' },
  { id:'d4',  title:'Product Roadmap',                  date:'Feb 28, 2024', type:'Product',           size:'940 KB' },
  { id:'d5',  title:'Expert Calls Project Alpha',       date:'Mar 18, 2024', type:'Customer',          size:'5.2 MB' },
  { id:'d6',  title:'Customer Reference Calls',         date:'Mar 18, 2024', type:'Customer',          size:'3.8 MB' },
  { id:'d7',  title:'Market Report',                    date:'Mar 30, 2024', type:'Public Report',     size:'12.0 MB' },
  { id:'d8',  title:'Consolidated Customer Contracts',  date:'Feb 12, 2024', type:'Internal',          size:'18.3 MB' },
  { id:'d9',  title:'Pipeline',                         date:'Apr 04, 2024', type:'Internal',          size:'620 KB' },
  { id:'d10', title:'Employee Contracts',               date:'Jan 22, 2024', type:'Internal',          size:'4.4 MB' },
  { id:'d11', title:'Vendor Contracts',                 date:'Jan 22, 2024', type:'Internal',          size:'6.8 MB' },
  { id:'d12', title:'ESG Policy',                       date:'Mar 02, 2024', type:'Public Report',     size:'1.9 MB' },
]

const DEFAULT_COLS: Col[] = [
  { id:'c1', label:'Document Type',          prompt:'Classify the document type.',                                                width: 170 },
  { id:'c2', label:'Investment Highlights',  prompt:'List the top 3 investment highlights surfaced by this document.',           width: 320 },
  { id:'c3', label:'Investment Risks',       prompt:'List the top 3 investment risks surfaced by this document.',                width: 320 },
  { id:'c4', label:'Market Considerations',  prompt:'Summarise market context relevant to the deal.',                            width: 320 },
  { id:'c5', label:'Mistakes / Issues',      prompt:'Highlight any inconsistencies, gaps, or concerns.',                         width: 280 },
]

// Deterministic precomputed cells — the parts of the matrix the "agent" has
// already finished. Anything not in this map shows the Hebbia "Reading…" state.
const ANSWERED: Record<string, Cell> = {
  // Document Type column — populated for every row
  'd1.c1':  { state:'done', text:'Financials',           sources: 1 },
  'd2.c1':  { state:'done', text:'Marketing Materials',  sources: 1 },
  'd3.c1':  { state:'done', text:'Product',              sources: 1 },
  'd4.c1':  { state:'done', text:'Product',              sources: 1 },
  'd5.c1':  { state:'done', text:'Customer',             sources: 1 },
  'd6.c1':  { state:'done', text:'Customer',             sources: 1 },
  'd7.c1':  { state:'done', text:'Public Report',        sources: 1 },
  'd8.c1':  { state:'done', text:'Internal',             sources: 1 },
  'd9.c1':  { state:'done', text:'Internal',             sources: 1 },
  'd10.c1': { state:'done', text:'Internal',             sources: 1 },
  'd11.c1': { state:'done', text:'Internal',             sources: 1 },
  'd12.c1': { state:'done', text:'Public Report',        sources: 1 },

  // First few Investment Risks rows
  'd1.c3': { state:'done', text:'There have been increasing costs related to component sourcing and a step-up in marketing spend that compresses near-term EBITDA.', sources: 4 },
  'd2.c3': { state:'done', text:'Risk factors that are not detailed in the CIM include exposure to a single anchor customer (~38% of ARR) and a concentrated geography mix.', sources: 6 },
  'd3.c3': { state:'done', text:'Current product lacks detail regarding the multi-tenant isolation model required by enterprise infosec teams.', sources: 3 },
  'd4.c3': { state:'done', text:'Several integrations listed within the roadmap depend on third-party APIs that may be deprecated within 12 months.', sources: 5 },
  'd5.c3': { state:'done', text:'Expert calls hesitate on defensibility of the technical moat once cloud incumbents prioritise the segment.', sources: 7 },
  'd6.c3': { state:'done', text:'Common negative feedback across customer references centres on slow time-to-value during onboarding.', sources: 9 },
  'd7.c3': { state:'done', text:'Headwinds raised across this report include macro-driven enterprise budget tightening and longer sales cycles.', sources: 4 },

  // Market Considerations rows
  'd1.c4': { state:'done', text:'Despite the growing TAM described within investor materials, gross margin compression in 2025 is the gating variable for valuation.', sources: 5 },
  'd2.c4': { state:'done', text:'The TAM is estimated at approximately $7.2B with the company addressing a $1.4B SAM. Comparable transactions priced at 8-12x ARR.', sources: 8 },
  'd3.c4': { state:'done', text:'Competitive set is fragmented; no incumbent has more than 14% share. Buyer interest is highest among PE-backed roll-ups.', sources: 6 },
  'd7.c4': { state:'done', text:'Sector consolidation is accelerating with three platform acquisitions year-to-date averaging 9.6x trailing revenue.', sources: 7 },
}

const DOC_TYPE_COLOR: Record<Doc['type'], { bg: string; fg: string }> = {
  'Filings':             { bg:'rgba(27,79,255,0.15)',  fg:'var(--accent-text)' },
  'Marketing Materials': { bg:'rgba(167,139,250,0.15)', fg:'#C4B5FD' },
  'Product':             { bg:'rgba(52,211,153,0.15)', fg:'var(--pos)' },
  'Customer':            { bg:'rgba(251,191,36,0.15)', fg:'var(--amber)' },
  'Public Report':       { bg:'rgba(56,189,248,0.15)', fg:'#7DD3FC' },
  'Internal':            { bg:'rgba(255,255,255,0.06)',fg:'var(--text-secondary)' },
}

export default function MatrixPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [activeCell, setActiveCell] = useState<{ row: string; col: string } | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [activeTemplate, setActiveTemplate] = useState<GridTemplate | null>(null)
  // Columns are state — selecting a template *replaces* them with the
  // template's prompt set so the grid is immediately ready to run.
  const [cols, setCols] = useState<Col[]>(DEFAULT_COLS)
  const [libOpen, setLibOpen] = useState(false)
  // Source-library selection narrows which DOCS the matrix runs across.
  const selectedLeafIds = useSelectedSourceIds()
  const selectedSet = useMemo(() => new Set(selectedLeafIds), [selectedLeafIds])
  // Map each Doc.type to the source-library buckets that would source it. If
  // the user has narrowed the library, hide docs whose bucket is fully off.
  const TYPE_TO_BUCKETS: Record<Doc['type'], string[]> = {
    'Filings':              ['fl.10k','fl.10q','fl.8k','fl.def','fl.13f'],
    'Marketing Materials':  ['deal.alpha','deal.beta','strat.2026','strat.ai'],
    'Product':              ['rm.h1','rm.h2'],
    'Customer':             ['rec.cust11','rec.exp42','ex.tegus','ex.guidepoint'],
    'Public Report':        ['nw.bb','nw.rt','nw.wsj','nw.ft','cp.idays','cp.cmd'],
    'Internal':             ['board.q4','board.strat','exec.weekly','xls.dcf','xls.cohorts','fcst.opmodel','fcst.scenarios','ir.q4','ir.faq','eprep.script','eprep.kpi'],
  }
  const visibleDocs = useMemo(() => {
    if (selectedSet.size === 0) return DOCS
    return DOCS.filter(d => (TYPE_TO_BUCKETS[d.type] || []).some(id => selectedSet.has(id)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSet])

  function applyTemplate(tpl: GridTemplate) {
    setActiveTemplate(tpl)
    // Map template column defs into Matrix Col shape with sensible widths.
    const tplCols: Col[] = tpl.columns.map((c, i) => ({
      id: `tpl-${tpl.id}-${i}`,
      label: c.label,
      prompt: c.prompt,
      width: i === 0 ? 200 : 280,
    }))
    setCols(tplCols)
    setActiveCell(null)
  }
  function resetTemplate() {
    setActiveTemplate(null)
    setCols(DEFAULT_COLS)
  }

  const stats = useMemo(() => {
    const total = visibleDocs.length * cols.length
    let done = 0
    for (const d of visibleDocs) for (const c of cols) if (ANSWERED[`${d.id}.${c.id}`]) done++
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }
  }, [cols, visibleDocs])

  useEffect(() => {
    if (!activeCell) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setActiveCell(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeCell])

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const activeCellData =
    activeCell ? ANSWERED[`${activeCell.row}.${activeCell.col}`] : undefined
  const activeDoc = activeCell ? visibleDocs.find(d => d.id === activeCell.row) : undefined
  const activeCol = activeCell ? cols.find(c => c.id === activeCell.col) : undefined

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <PageHero
          eyebrow="Matrix · Project Alpha"
          title="Read every document at once."
          accentWord="every document"
          subtitle="Drop a deal room into Matrix and ask the same question across every artefact. Every cell runs an independent research agent — answers stream in with citations back to the source page."
          actions={
            <>
              <button style={ghostBtn} onClick={() => setTemplatesOpen(true)}>▦ Templates</button>
              <button style={ghostBtn} onClick={() => setLibOpen(true)}>▣ Sources{selectedLeafIds.length ? ` · ${selectedLeafIds.length}` : ''}</button>
              <button style={ghostBtn}>+ Add documents</button>
              <button style={ghostBtn}>+ Add column</button>
              <button style={primaryBtn}>↻ Re-run all</button>
            </>
          }
        />
        <div style={{ padding: '0 32px' }}>
          <ContextualAskBar
            context="Matrix"
            contextData={{ page: 'matrix', template: activeTemplate?.name ?? null, columns: activeTemplate?.columns?.length ?? 0 }}
            chips={[
              { label: 'Add capex column',     prompt: 'Add a column to the matrix asking for capital expenditure intensity (capex / revenue) across each document.' },
              { label: 'Run query across all', prompt: 'Run a single research question across every row and stream answers with citations.' },
              { label: 'Suggest columns',      prompt: 'Suggest 5 additional columns for this matrix that would deepen the analysis for the loaded template.' },
              { label: 'Export grid',          prompt: 'Export the current matrix grid as a spreadsheet with citations preserved.' },
            ]}
            placeholder="Ask Finsyt to extend or query the matrix…"
            style={{ margin: '0 0 16px' }}
          />
        </div>
        {activeTemplate && (
          <div style={{ margin:'0 32px 18px', padding:'12px 16px', borderRadius:12, background:'var(--accent-dim)', border:'1px solid var(--accent)', display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:11, fontWeight:800, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--accent-text)' }}>Template loaded</span>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{activeTemplate.name}</span>
            <span style={{ fontSize:12, color:'var(--text-secondary)', flex:1 }}>{activeTemplate.columns.length} columns applied · {activeTemplate.audience}</span>
            <button onClick={resetTemplate} style={{ background:'transparent', border:'none', color:'var(--text-secondary)', cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>Reset to default ×</button>
          </div>
        )}
      </div>

      <SectionBand variant="sage" padded={false}>
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: '24px 32px 48px' }}>
          {/* Toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, padding: '14px 16px', marginBottom: 14,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '5px 10px', borderRadius: 999,
                background: 'var(--pos-dim)', color: 'var(--pos)',
                fontSize: 11, fontWeight: 700,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--pos)' }} />
                {stats.done} of {stats.total} cells complete · {stats.pct}%
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {visibleDocs.length} documents · {cols.length} columns{selectedSet.size > 0 ? ` · scoped to ${selectedSet.size} sources` : ''} · last run 2m ago
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={miniBtn}>⤓ Export CSV</button>
              <button style={miniBtn}>⊞ Save view</button>
              <button style={miniBtn}>⌘ Share</button>
            </div>
          </div>

          {/* Grid */}
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                fontSize: 13, color: 'var(--text-primary)',
                tableLayout: 'fixed',
              }}>
                <colgroup>
                  <col style={{ width: 44 }} />
                  <col style={{ width: 56 }} />
                  <col style={{ width: 280 }} />
                  <col style={{ width: 130 }} />
                  {cols.map(c => <col key={c.id} style={{ width: c.width }} />)}
                </colgroup>
                <thead>
                  <tr style={{ background: 'var(--bg-card)' }}>
                    <th style={thStyle}>
                      <input type="checkbox" aria-label="Select all" />
                    </th>
                    <th style={thStyle}>#</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Document</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Date</th>
                    {cols.map(c => (
                      <th key={c.id} style={{ ...thStyle, textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            width: 14, height: 14, borderRadius: 3,
                            background: 'var(--accent-dim)', color: 'var(--accent-text)',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <ACTION_ICONS.sparkles width={9} height={9} strokeWidth={ICON_STROKE} />
                          </span>
                          {c.label}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleDocs.map((d, idx) => {
                    const isSel = selected.has(d.id)
                    const dt = DOC_TYPE_COLOR[d.type]
                    return (
                      <tr key={d.id} style={{
                        borderTop: '1px solid var(--border)',
                        background: isSel ? 'var(--accent-dim)' : 'transparent',
                      }}>
                        <td style={tdStyle}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${d.title}`}
                            checked={isSel}
                            onChange={() => toggleRow(d.id)}
                          />
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                          {idx + 1}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              width: 22, height: 22, borderRadius: 5,
                              background: dt.bg, color: dt.fg,
                              fontSize: 11, fontWeight: 700,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}>▣</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {d.title}
                              </div>
                              <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{d.size}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: 12 }}>{d.date}</td>
                        {cols.map(c => {
                          const cellKey = `${d.id}.${c.id}`
                          const cell = ANSWERED[cellKey]
                          const isActive = activeCell?.row === d.id && activeCell?.col === c.id
                          return (
                            <td
                              key={c.id}
                              onClick={() => setActiveCell({ row: d.id, col: c.id })}
                              style={{
                                ...tdStyle,
                                verticalAlign: 'top',
                                cursor: 'pointer',
                                background: isActive ? 'var(--accent-dim)' : undefined,
                                borderLeft: '1px solid var(--border)',
                              }}
                            >
                              {cell?.state === 'done' ? (
                                c.id === 'c1' ? (
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '3px 9px', borderRadius: 5,
                                    background: dt.bg, color: dt.fg,
                                    fontSize: 11, fontWeight: 700,
                                  }}>{cell.text}</span>
                                ) : (
                                  <div>
                                    <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-primary)' }}>
                                      {cell.text}
                                    </div>
                                    {cell.sources != null && (
                                      <div style={{
                                        marginTop: 6,
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        fontSize: 10.5, color: 'var(--accent-text)', fontWeight: 600,
                                      }}>
                                        ◧ {cell.sources} {cell.sources === 1 ? 'source' : 'sources'}
                                      </div>
                                    )}
                                  </div>
                                )
                              ) : (
                                <ReadingCell />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td colSpan={4 + cols.length} style={{
                      padding: '12px 16px',
                      color: 'var(--text-muted)',
                      fontSize: 12, fontWeight: 600,
                    }}>
                      + Add row
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{
            marginTop: 14,
            fontSize: 11.5, color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>⌨</span>
            Click any cell to inspect the agent's reasoning and citations · press <kbd style={kbd}>g</kbd> then <kbd style={kbd}>x</kbd> to jump back to Matrix
          </div>
        </div>
      </SectionBand>

      {/* Cell inspector drawer */}
      {activeCell && activeDoc && activeCol && (
        <>
          <div
            onClick={() => setActiveCell(null)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(8,14,26,0.55)', backdropFilter: 'blur(4px)',
              zIndex: 1100,
            }}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="matrix-cell-title"
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 'min(520px, 100vw)', zIndex: 1101,
              background: 'var(--bg-card)',
              borderLeft: '1px solid var(--border)',
              boxShadow: '-12px 0 48px rgba(0,0,0,0.35)',
              display: 'flex', flexDirection: 'column',
              animation: 'slideInRight 0.22s ease',
            }}
          >
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                    color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4,
                  }}>{activeDoc.title}</div>
                  <div id="matrix-cell-title" style={{
                    fontSize: 16, fontWeight: 700,
                    color: 'var(--text-primary)', letterSpacing: '-0.01em',
                  }}>{activeCol.label}</div>
                </div>
                <button
                  onClick={() => setActiveCell(null)}
                  aria-label="Close"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-secondary)', fontSize: 22, lineHeight: 1,
                    padding: '4px 8px', borderRadius: 6,
                  }}
                >×</button>
              </div>
              <div style={{
                marginTop: 12, padding: '8px 10px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)', borderRadius: 8,
                fontSize: 11.5, color: 'var(--text-secondary)',
              }}>
                <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Prompt:</span>
                {activeCol.prompt}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
              {activeCellData?.state === 'done' ? (
                <>
                  <div style={{
                    fontSize: 14, lineHeight: 1.6,
                    color: 'var(--text-primary)', whiteSpace: 'pre-wrap',
                  }}>{activeCellData.text}</div>

                  <div style={{
                    marginTop: 24, fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.08em', color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                  }}>Citations</div>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Array.from({ length: activeCellData.sources || 1 }).map((_, i) => (
                      <div key={i} style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                      }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-text)' }}>
                          [{i + 1}] {activeDoc.title} · p.{12 + i * 7}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          Excerpt highlighted in source — click to jump to the page in the document viewer.
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  height: '100%', textAlign: 'center', gap: 12,
                }}>
                  <div style={{ fontSize: 28, color: 'var(--text-muted)' }}>◌</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Agent is reading…</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 280, lineHeight: 1.5 }}>
                    The research agent is parsing this document and applying the column prompt. The answer will appear here with citations as soon as it lands.
                  </div>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      <GridTemplatesGallery
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onChoose={tpl => applyTemplate(tpl)}
      />

      <SourceLibraryPicker
        open={libOpen}
        onClose={() => setLibOpen(false)}
      />
    </div>
  )
}

function ReadingCell() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 12, color: 'var(--text-muted)',
    }}>
      <span style={{
        display: 'inline-block', width: 6, height: 6, borderRadius: 3,
        background: 'var(--text-muted)',
        animation: 'pulse 1.4s ease-in-out infinite',
      }} />
      Reading…
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '12px 14px',
  textAlign: 'center',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  borderBottom: '1px solid var(--border)',
}

const tdStyle: React.CSSProperties = {
  padding: '14px 14px',
  textAlign: 'left',
  verticalAlign: 'middle',
}

const ghostBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const primaryBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  background: 'var(--gradient-brand)',
  border: 'none',
  color: '#fff',
  fontSize: 13, fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: '0 4px 12px rgba(27,79,255,0.3)',
}

const miniBtn: React.CSSProperties = {
  padding: '6px 11px',
  borderRadius: 6,
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  fontSize: 12, fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const kbd: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 5px',
  borderRadius: 3,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  fontSize: 10, fontWeight: 700,
  color: 'var(--text-secondary)',
  fontFamily: 'inherit',
  margin: '0 2px',
}
