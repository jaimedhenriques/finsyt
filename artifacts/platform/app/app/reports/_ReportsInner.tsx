'use client'
/**
 * Reports — drag-and-drop research report / tearsheet builder.
 *
 * Two modes in one client component:
 *   • list   — saved reports for the workspace, "New report" + open/delete.
 *   • builder — title/symbol header, an add-block palette, an ordered canvas
 *               (HTML5 drag-and-drop + up/down + remove), inline per-block
 *               config, Save, and Export to PPTX / PDF.
 *
 * Persistence is via /api/reports (list/create) and /api/reports/[id]
 * (load/replace/delete); export via /api/reports/[id]/export. All blocks are
 * sent as an ordered array — the server replaces the whole block list on PATCH.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BLOCK_KINDS, BLOCK_SPECS, BlockEditor, blockSummary,
  type BlockKind, type ReportBlock,
} from '@/components/reports/blocks'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

type ReportListItem = {
  id: string
  title: string
  subtitle: string
  symbol: string
  authorUserId: string
  blockCount: number
  createdAt: number
  updatedAt: number
}

let _uidSeq = 0
function uid(): string {
  _uidSeq += 1
  return `b${Date.now().toString(36)}${_uidSeq}`
}

function newBlock(kind: BlockKind): ReportBlock {
  return { uid: uid(), kind, config: BLOCK_SPECS[kind].defaultConfig() }
}

export default function ReportsInner() {
  const [list, setList] = useState<ReportListItem[] | null>(null)
  const [viewerUserId, setViewerUserId] = useState<string | null>(null)
  const [mode, setMode] = useState<'list' | 'builder'>('list')

  // Builder state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [symbol, setSymbol] = useState('')
  const [blocks, setBlocks] = useState<ReportBlock[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exportBusy, setExportBusy] = useState<null | 'pptx' | 'pdf'>(null)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const dragIndex = useRef<number | null>(null)

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/reports`)
      if (!r.ok) { setList([]); return }
      const j = await r.json()
      setList(j.reports ?? [])
      setViewerUserId(j.viewerUserId ?? null)
    } catch {
      setList([])
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const markBlocks = useCallback((updater: (b: ReportBlock[]) => ReportBlock[]) => {
    setBlocks((prev) => updater(prev))
    setDirty(true)
  }, [])

  function startNew() {
    setEditingId(null)
    setTitle('')
    setSubtitle('')
    setSymbol('')
    setBlocks([])
    setDirty(false)
    setBanner(null)
    setMode('builder')
  }

  const openReport = useCallback(async (id: string) => {
    setBanner(null)
    try {
      const r = await fetch(`${BASE}/api/reports/${id}`)
      if (!r.ok) { setBanner({ kind: 'err', text: 'Could not open report.' }); return }
      const j = await r.json()
      const rep = j.report
      setEditingId(rep.id)
      setTitle(rep.title || '')
      setSubtitle(rep.subtitle || '')
      setSymbol(rep.symbol || '')
      setBlocks((rep.blocks ?? []).map((b: { kind: BlockKind; config: Record<string, unknown> }) => ({
        uid: uid(), kind: b.kind, config: b.config && typeof b.config === 'object' ? b.config : {},
      })))
      setDirty(false)
      setMode('builder')
    } catch {
      setBanner({ kind: 'err', text: 'Could not open report.' })
    }
  }, [])

  function addBlock(kind: BlockKind) {
    markBlocks((b) => [...b, newBlock(kind)])
  }
  function removeBlock(i: number) {
    markBlocks((b) => b.filter((_, idx) => idx !== i))
  }
  function moveBlock(i: number, dir: -1 | 1) {
    markBlocks((b) => {
      const j = i + dir
      if (j < 0 || j >= b.length) return b
      const next = b.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function reorder(from: number, to: number) {
    if (from === to) return
    markBlocks((b) => {
      const next = b.slice()
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }
  function updateBlock(i: number, next: ReportBlock) {
    markBlocks((b) => b.map((blk, idx) => (idx === i ? next : blk)))
  }

  const payload = useMemo(() => ({
    title: title.trim(),
    subtitle: subtitle.trim(),
    symbol: symbol.trim().toUpperCase(),
    blocks: blocks.map((b) => ({ kind: b.kind, config: b.config })),
  }), [title, subtitle, symbol, blocks])

  const canSave = payload.title.length > 0 && !saving

  async function save(): Promise<string | null> {
    if (!canSave) return null
    setSaving(true)
    setBanner(null)
    try {
      const method = editingId ? 'PATCH' : 'POST'
      const url = editingId ? `${BASE}/api/reports/${editingId}` : `${BASE}/api/reports`
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const t = await r.text().catch(() => '')
        setBanner({ kind: 'err', text: `Save failed: ${t.slice(0, 140) || r.status}` })
        return null
      }
      const j = await r.json()
      const id = j.report?.id ?? editingId
      if (id && !editingId) setEditingId(id)
      setDirty(false)
      setBanner({ kind: 'ok', text: 'Saved.' })
      reload()
      return id
    } catch (e) {
      setBanner({ kind: 'err', text: `Save failed: ${(e as Error).message}` })
      return null
    } finally {
      setSaving(false)
    }
  }

  async function exportReport(format: 'pptx' | 'pdf') {
    setExportBusy(format)
    setBanner(null)
    try {
      // Persist any pending edits so the export reflects the canvas.
      let id = editingId
      if (!id || dirty) {
        id = await save()
        if (!id) { setExportBusy(null); return }
      }
      const r = await fetch(`${BASE}/api/reports/${id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      })
      if (!r.ok) {
        const t = await r.text().catch(() => '')
        setBanner({ kind: 'err', text: `Export failed: ${t.slice(0, 140) || r.status}` })
        return
      }
      const j = await r.json()
      if (j.downloadUrl) {
        window.location.href = j.downloadUrl
        setBanner({ kind: 'ok', text: `Exported ${format.toUpperCase()} — download starting.` })
      }
    } catch (e) {
      setBanner({ kind: 'err', text: `Export failed: ${(e as Error).message}` })
    } finally {
      setExportBusy(null)
    }
  }

  async function deleteReport(id: string) {
    if (!confirm('Delete this report? This cannot be undone.')) return
    try {
      const r = await fetch(`${BASE}/api/reports/${id}`, { method: 'DELETE' })
      if (!r.ok) { setBanner({ kind: 'err', text: 'Delete failed.' }); return }
      reload()
    } catch {
      setBanner({ kind: 'err', text: 'Delete failed.' })
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (mode === 'builder') {
    return (
      <Builder
        editingId={editingId}
        title={title} subtitle={subtitle} symbol={symbol}
        blocks={blocks}
        saving={saving} exportBusy={exportBusy} dirty={dirty} canSave={canSave} banner={banner}
        onTitle={(v) => { setTitle(v); setDirty(true) }}
        onSubtitle={(v) => { setSubtitle(v); setDirty(true) }}
        onSymbol={(v) => { setSymbol(v.toUpperCase()); setDirty(true) }}
        onAdd={addBlock}
        onRemove={removeBlock}
        onMove={moveBlock}
        onUpdate={updateBlock}
        onReorder={reorder}
        dragIndex={dragIndex}
        onSave={save}
        onExport={exportReport}
        onBack={() => setMode('list')}
      />
    )
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Reports</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '6px 0 0', maxWidth: 560 }}>
            Compose research reports and tearsheets from reusable blocks, then export to PowerPoint or PDF. Reports are shared with your workspace; only the author can edit or delete.
          </p>
        </div>
        <button onClick={startNew} style={primaryBtn}>+ New report</button>
      </div>

      {banner && <Banner banner={banner} />}

      {list === null ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading reports…</p>
      ) : list.length === 0 ? (
        <div style={emptyCard}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
          <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>No reports yet</h3>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--text-secondary)', maxWidth: 420 }}>
            Build your first tearsheet from KPI tiles, financial charts, peer comparisons, valuation football fields, and analyst commentary.
          </p>
          <button onClick={startNew} style={primaryBtn}>+ New report</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {list.map((r) => {
            const mine = !!viewerUserId && r.authorUserId === viewerUserId
            return (
              <div key={r.id} style={listRow}>
                <button onClick={() => openReport(r.id)} style={{ ...rowOpen, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{r.title}</span>
                    {r.symbol && <span style={symbolPill}>{r.symbol}</span>}
                    {mine && <span style={{ ...symbolPill, background: 'var(--accent-dim)', color: 'var(--accent-text)' }}>Author</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {r.subtitle ? `${r.subtitle} · ` : ''}{r.blockCount} block{r.blockCount === 1 ? '' : 's'} · updated {new Date(r.updatedAt).toLocaleDateString()}
                  </div>
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => openReport(r.id)} style={ghostBtn}>Open</button>
                  {mine && <button onClick={() => deleteReport(r.id)} style={{ ...ghostBtn, color: 'var(--danger, #c0392b)' }}>Delete</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Builder view ──────────────────────────────────────────────────────────────

function Builder(props: {
  editingId: string | null
  title: string; subtitle: string; symbol: string
  blocks: ReportBlock[]
  saving: boolean; exportBusy: null | 'pptx' | 'pdf'; dirty: boolean; canSave: boolean
  banner: { kind: 'ok' | 'err'; text: string } | null
  onTitle: (v: string) => void
  onSubtitle: (v: string) => void
  onSymbol: (v: string) => void
  onAdd: (k: BlockKind) => void
  onRemove: (i: number) => void
  onMove: (i: number, dir: -1 | 1) => void
  onUpdate: (i: number, next: ReportBlock) => void
  onReorder: (from: number, to: number) => void
  dragIndex: React.MutableRefObject<number | null>
  onSave: () => Promise<string | null>
  onExport: (f: 'pptx' | 'pdf') => void
  onBack: () => void
}) {
  const {
    editingId, title, subtitle, symbol, blocks, saving, exportBusy, dirty, canSave, banner,
    onTitle, onSubtitle, onSymbol, onAdd, onRemove, onMove, onUpdate, onReorder, dragIndex,
    onSave, onExport, onBack,
  } = props

  return (
    <div style={{ padding: '24px 32px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <button onClick={onBack} style={ghostBtn}>← All reports</button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Unsaved changes</span>}
          <button onClick={() => onSave()} disabled={!canSave} style={{ ...primaryBtn, opacity: canSave ? 1 : 0.5 }}>
            {saving ? 'Saving…' : editingId ? 'Save' : 'Create'}
          </button>
          <button onClick={() => onExport('pptx')} disabled={!!exportBusy || !title.trim()} style={ghostBtn}>
            {exportBusy === 'pptx' ? 'Exporting…' : 'Export PPTX'}
          </button>
          <button onClick={() => onExport('pdf')} disabled={!!exportBusy || !title.trim()} style={ghostBtn}>
            {exportBusy === 'pdf' ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {banner && <Banner banner={banner} />}

      {/* Report header fields */}
      <div style={headerCard}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 2, minWidth: 240 }}>
            <span style={miniLabel}>Report title *</span>
            <input style={titleInput} placeholder="e.g. NVIDIA — Q2 FY26 Tearsheet" value={title}
              onChange={(e) => onTitle(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 140 }}>
            <span style={miniLabel}>Primary ticker</span>
            <input style={titleInput} placeholder="NVDA" value={symbol} onChange={(e) => onSymbol(e.target.value)} />
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
          <span style={miniLabel}>Subtitle / dateline</span>
          <input style={{ ...titleInput, fontSize: 13, fontWeight: 500 }} placeholder="NASDAQ · Semiconductors · As of June 2026"
            value={subtitle} onChange={(e) => onSubtitle(e.target.value)} />
        </label>
      </div>

      {/* Add-block palette */}
      <div style={{ margin: '20px 0 14px' }}>
        <div style={miniLabel}>Add a block</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {BLOCK_KINDS.map((k) => (
            <button key={k} onClick={() => onAdd(k)} title={BLOCK_SPECS[k].description} style={paletteBtn}>
              <span style={{ fontSize: 15 }}>{BLOCK_SPECS[k].glyph}</span> {BLOCK_SPECS[k].label}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      {blocks.length === 0 ? (
        <div style={{ ...emptyCard, padding: '40px 24px' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>
            Your report is empty. Add blocks above, then drag to reorder. Blocks pull live data on export.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {blocks.map((b, i) => (
            <div
              key={b.uid}
              draggable
              onDragStart={() => { dragIndex.current = i }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (dragIndex.current != null) onReorder(dragIndex.current, i)
                dragIndex.current = null
              }}
              style={blockCard}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span title="Drag to reorder" style={{ cursor: 'grab', color: 'var(--text-secondary)', fontSize: 16, userSelect: 'none' }}>⠿</span>
                <span style={{ fontSize: 16 }}>{BLOCK_SPECS[b.kind].glyph}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{BLOCK_SPECS[b.kind].label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>· {blockSummary(b)}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button onClick={() => onMove(i, -1)} disabled={i === 0} style={iconBtn} title="Move up">↑</button>
                  <button onClick={() => onMove(i, 1)} disabled={i === blocks.length - 1} style={iconBtn} title="Move down">↓</button>
                  <button onClick={() => onRemove(i)} style={{ ...iconBtn, color: 'var(--danger, #c0392b)' }} title="Remove">✕</button>
                </div>
              </div>
              <BlockEditor block={b} onChange={(next) => onUpdate(i, next)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Small presentational helpers ──────────────────────────────────────────────

function Banner({ banner }: { banner: { kind: 'ok' | 'err'; text: string } }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600,
      background: banner.kind === 'ok' ? 'var(--accent-dim, #e6f4ea)' : '#fdecea',
      color: banner.kind === 'ok' ? 'var(--accent-text, #1a7f37)' : '#c0392b',
      border: `1px solid ${banner.kind === 'ok' ? 'var(--accent, #1a7f37)' : '#c0392b'}33`,
    }}>
      {banner.text}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const primaryBtn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
  background: 'var(--gradient-brand, var(--accent, #2563eb))', color: '#fff', fontSize: 13.5, fontWeight: 700,
}
const ghostBtn: React.CSSProperties = {
  padding: '8px 13px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer',
  background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600,
}
const iconBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer',
  background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, lineHeight: 1, display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center',
}
const paletteBtn: React.CSSProperties = {
  padding: '9px 13px', borderRadius: 9, border: '1px dashed var(--border)', cursor: 'pointer',
  background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', gap: 7,
}
const listRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)',
}
const rowOpen: React.CSSProperties = {
  flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0,
}
const blockCard: React.CSSProperties = {
  padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)',
}
const headerCard: React.CSSProperties = {
  padding: '18px 18px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)',
}
const emptyCard: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
  padding: '48px 24px', borderRadius: 14, border: '1px dashed var(--border)', background: 'var(--bg-card)',
}
const titleInput: React.CSSProperties = {
  padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)',
  background: 'var(--bg-input, var(--bg-card))', color: 'var(--text-primary)', fontSize: 15, fontWeight: 700, width: '100%',
}
const miniLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' }
const symbolPill: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
  background: 'var(--bg-subtle, #eef1f6)', color: 'var(--text-secondary)',
}
