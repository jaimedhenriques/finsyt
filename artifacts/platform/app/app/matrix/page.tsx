'use client'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { PageHero, SectionBand, ContextualAskBar, ACTION_ICONS, ICON_STROKE } from '@/components/ui'
import { GridTemplatesGallery, GridTemplate, SourceLibraryPicker, useSelectedSourceIds } from '@/components/research-pack'
import DataSourcesUsedFooter from '@/components/DataSourcesUsedFooter'
import { type ProviderTrace } from '@/lib/data-sources-trace'
import { BlueprintRunModal } from '@/components/BlueprintRunModal'

// ─── Hebbia-class Matrix ─────────────────────────────────────────────────────
// Documents (rows) × research questions (columns). Each cell streams a real
// run from /api/agent/ask. Matrices persist via /api/matrices and can be
// frozen as snapshots, exported to CSV/PPTX, and watched for re-run on new
// filings.
//
// Architecture
//   • In-memory matrix state (rows, columns, cells) is debounced-persisted to
//     /api/matrices/[id] PATCH so refresh restores the grid.
//   • Cells are run via streaming SSE: per cell we POST { question, context }
//     to /api/agent/ask and stitch together step / tool_call / tool_result /
//     answer_chunk / done events into a typed cell payload.
//   • The cell drawer exposes the agent's reasoning trail (provider waterfall
//     + tool timeline + citations) and a Re-run button — the foundation for
//     the battlecard polish required by the v1 spec.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// ─── Types ──────────────────────────────────────────────────────────────────

type RowSourceKind = 'manual' | 'watchlist' | 'screener' | 'csv' | 'connector'

interface MatrixGridRow {
  id: string
  label: string
  ticker?: string
  kind?: string
}

interface MatrixGridColumn {
  id: string
  label: string
  prompt: string
  width?: number
}

interface MatrixCellCitation {
  label: string
  summary?: string
  href?: string
  type?: string
}

interface MatrixCellStep {
  kind: string                // 'phase' | 'tool'
  name?: string
  label?: string
  summary?: string
  ms?: number
  ok?: boolean
}

type CellState = 'idle' | 'queued' | 'running' | 'done' | 'error'

interface MatrixCell {
  state: CellState
  text?: string
  error?: string
  citations?: MatrixCellCitation[]
  steps?: MatrixCellStep[]
  provider?: string
  ms?: number
  runAt?: string
  dirty?: boolean
}

interface MatrixDoc {
  id: string
  name: string
  description: string
  rowSourceKind: RowSourceKind
  rowSourceMeta: Record<string, unknown>
  rows: MatrixGridRow[]
  columns: MatrixGridColumn[]
  cells: Record<string, MatrixCell>
  rerunOnFiling: boolean
  pinned: boolean
  tags: string[]
  authorUserId: string
  createdAt: string
  updatedAt: string
  mine: boolean
}

interface MatrixSnapshot {
  id: string
  label: string
  authorUserId: string
  createdAt: string
}

// Label prefix used when the client auto-snapshots the live matrix right
// before applying a destructive restore. The snapshots drawer detects this
// prefix to render the snapshot with a distinguishing "Auto" badge so users
// can recognise their one-click undo path.
const AUTO_SNAPSHOT_PREFIX = 'Auto-snapshot before restore of '
function isAutoSnapshot(label: string | undefined | null): boolean {
  return !!label && label.startsWith(AUTO_SNAPSHOT_PREFIX)
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_COLS: MatrixGridColumn[] = [
  { id: 'c1', label: 'Headline take',       prompt: 'In 1–2 sentences, summarise the latest investment-relevant signal for this entity.', width: 320 },
  { id: 'c2', label: 'Key risks',           prompt: 'List the top 3 investment risks. One bullet each.', width: 280 },
  { id: 'c3', label: 'Recent catalysts',    prompt: 'List recent news, filings or earnings that moved sentiment. Cite dates.', width: 280 },
]

const DEFAULT_ROWS: MatrixGridRow[] = [
  { id: 'r1', label: 'Apple',     ticker: 'AAPL', kind: 'ticker' },
  { id: 'r2', label: 'Microsoft', ticker: 'MSFT', kind: 'ticker' },
  { id: 'r3', label: 'NVIDIA',    ticker: 'NVDA', kind: 'ticker' },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function cellKey(rowId: string, colId: string) { return `${rowId}.${colId}` }

function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`
}

// Build the question + context object the agent uses for one cell. Tickers
// expand into a full "for ${TICKER} (${name})" phrase so the agent picks the
// right entity even when the prompt is short like "Key risks".
function buildCellQuestion(row: MatrixGridRow, col: MatrixGridColumn): string {
  const subject = row.ticker ? `${row.label} (${row.ticker})` : row.label
  return `For ${subject}: ${col.prompt}`
}

// Tool labels mirrored from the research page so the cell timeline reads the
// same way as the inline research drawer.
const TOOL_LABEL: Record<string, string> = {
  get_quote: 'Live quote',
  get_news: 'News scan',
  get_filings: 'SEC filings',
  get_financials: 'Financial statements',
  get_transcripts: 'Earnings transcripts',
  get_macro: 'Macro datapoints',
  list_peer_sets: 'Peer sets',
  get_peer_set: 'Peer set detail',
  compare_peers: 'Peer comparison',
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function MatrixPage() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [matrixId, setMatrixId]       = useState<string | null>(null)
  const [name, setName]               = useState('Untitled matrix')
  const [rows, setRows]               = useState<MatrixGridRow[]>(DEFAULT_ROWS)
  const [cols, setCols]               = useState<MatrixGridColumn[]>(DEFAULT_COLS)
  const [cells, setCells]             = useState<Record<string, MatrixCell>>({})
  const [rerunOnFiling, setRerunOnFiling] = useState(false)
  const [rowSourceKind, setRowSourceKind] = useState<RowSourceKind>('manual')

  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [activeCell, setActiveCell]   = useState<{ row: string; col: string } | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [activeTemplate, setActiveTemplate] = useState<GridTemplate | null>(null)
  const [libOpen, setLibOpen]         = useState(false)
  const [rowPickerOpen, setRowPickerOpen] = useState(false)
  const [snapshotsOpen, setSnapshotsOpen] = useState(false)
  const [savedMenuOpen, setSavedMenuOpen] = useState(false)
  const [savedList, setSavedList]     = useState<{ id: string; name: string; updatedAt: string }[]>([])
  const [blueprintsOpen, setBlueprintsOpen] = useState(false)
  // Track Source-library narrowing so the toolbar can show how many sources
  // are currently selected. Used by the BlueprintRunModal target payload too.
  const selectedLeafIds = useSelectedSourceIds()

  const [snapshots, setSnapshots]     = useState<MatrixSnapshot[]>([])
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [statusMsg, setStatusMsg]     = useState<string>('')
  const [compareSnap, setCompareSnap] = useState<{
    id: string
    label: string
    createdAt: string
    rows: MatrixGridRow[]
    columns: MatrixGridColumn[]
    cells: Record<string, MatrixCell>
  } | null>(null)

  const abortMap = useRef<Map<string, AbortController>>(new Map())
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mutate cells (closure-safe).
  const updateCell = useCallback((key: string, mutator: (prev: MatrixCell) => MatrixCell) => {
    setCells(prev => {
      const next = { ...prev }
      next[key] = mutator(prev[key] || { state: 'idle' })
      return next
    })
  }, [])

  // ── Persistence ───────────────────────────────────────────────────────────
  // Lazily POST a new matrix on first significant edit; subsequent edits PATCH.
  const ensureMatrix = useCallback(async (): Promise<string | null> => {
    if (matrixId) return matrixId
    try {
      const r = await fetch(`${BASE}/api/matrices`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name, description: '',
          rowSourceKind, rowSourceMeta: {},
          rows, columns: cols, cells,
          rerunOnFiling,
        }),
      })
      if (!r.ok) {
        if (r.status === 401 || r.status === 409) return null // not signed in or no workspace
        throw new Error(`POST /api/matrices ${r.status}`)
      }
      const j = await r.json()
      const id = j.matrix?.id as string | undefined
      if (id) {
        setMatrixId(id)
        const url = new URL(window.location.href)
        url.searchParams.set('id', id)
        window.history.replaceState(null, '', url.toString())
        return id
      }
    } catch (e) {
      console.warn('matrix create failed', e)
      setStatusMsg('Could not save matrix — running in local-only mode.')
    }
    return null
  }, [matrixId, name, rows, cols, cells, rerunOnFiling, rowSourceKind])

  const persistDebounced = useCallback(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(async () => {
      const id = matrixId
      if (!id) return
      try {
        setSavingState('saving')
        const r = await fetch(`${BASE}/api/matrices/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name, rows, columns: cols, cells,
            rerunOnFiling, rowSourceKind,
          }),
        })
        setSavingState(r.ok ? 'saved' : 'error')
      } catch {
        setSavingState('error')
      }
    }, 800)
  }, [matrixId, name, rows, cols, cells, rerunOnFiling, rowSourceKind])

  useEffect(() => {
    if (matrixId) persistDebounced()
  }, [matrixId, name, rows, cols, cells, rerunOnFiling, rowSourceKind, persistDebounced])

  // Initial load: ?id=… → fetch existing matrix.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const initialId = sp.get('id')
    if (initialId) loadMatrix(initialId)
    void refreshSavedList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadMatrix(id: string) {
    try {
      const r = await fetch(`${BASE}/api/matrices/${id}`, { cache: 'no-store' })
      if (!r.ok) { setStatusMsg(`Could not load matrix (${r.status}).`); return }
      const j = await r.json()
      const m = j.matrix as MatrixDoc | undefined
      if (!m) return
      setMatrixId(m.id)
      setName(m.name)
      setRows(m.rows.length ? m.rows : DEFAULT_ROWS)
      setCols(m.columns.length ? m.columns : DEFAULT_COLS)
      setCells(m.cells || {})
      setRerunOnFiling(m.rerunOnFiling)
      setRowSourceKind((m.rowSourceKind || 'manual') as RowSourceKind)
      setSavingState('saved')
    } catch (e) {
      console.warn('matrix load failed', e)
      setStatusMsg('Could not load matrix.')
    }
  }

  async function refreshSavedList() {
    try {
      const r = await fetch(`${BASE}/api/matrices`, { cache: 'no-store' })
      if (!r.ok) return
      const j = await r.json()
      setSavedList((j.matrices || []).map((m: { id: string; name: string; updatedAt: string }) =>
        ({ id: m.id, name: m.name, updatedAt: m.updatedAt })))
    } catch { /* ignore */ }
  }

  async function refreshSnapshots(id: string) {
    try {
      const r = await fetch(`${BASE}/api/matrices/${id}/snapshots`, { cache: 'no-store' })
      if (!r.ok) return
      const j = await r.json()
      setSnapshots(j.snapshots || [])
    } catch { /* ignore */ }
  }

  // ── Cell run via SSE ──────────────────────────────────────────────────────
  const runCell = useCallback(async (rowId: string, colId: string) => {
    const row = rows.find(r => r.id === rowId)
    const col = cols.find(c => c.id === colId)
    if (!row || !col) return
    const key = cellKey(rowId, colId)

    // Cancel any in-flight run for this cell.
    abortMap.current.get(key)?.abort()
    const ctl = new AbortController()
    abortMap.current.set(key, ctl)

    const startedAt = Date.now()
    updateCell(key, () => ({ state: 'running', text: '', citations: [], steps: [], dirty: false, runAt: new Date().toISOString() }))

    let answer = ''
    const citations: MatrixCellCitation[] = []
    const steps: MatrixCellStep[] = []
    let provider = 'openai-via-finsyt'

    try {
      const r = await fetch(`${BASE}/api/agent/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: ctl.signal,
        body: JSON.stringify({
          question: buildCellQuestion(row, col),
          context: { surface: 'matrix', rowLabel: row.label, ticker: row.ticker || null, columnLabel: col.label },
        }),
      })
      if (!r.ok || !r.body) {
        const txt = await r.text().catch(() => `HTTP ${r.status}`)
        updateCell(key, () => ({ state: 'error', error: txt.slice(0, 400), runAt: new Date().toISOString() }))
        return
      }
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          let eventName = 'message'
          let dataLine = ''
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim()
            else if (line.startsWith('data:')) dataLine += line.slice(5).trim()
          }
          if (!dataLine) continue
          let data: { kind?: string; label?: string; name?: string; id?: string; ok?: boolean; summary?: string; raw?: string; text?: string; message?: string }
          try { data = JSON.parse(dataLine) } catch { continue }

          if (eventName === 'step') {
            steps.push({ kind: 'phase', name: data.kind, label: data.label || data.kind })
          } else if (eventName === 'tool_call') {
            steps.push({ kind: 'tool', name: data.name, label: TOOL_LABEL[data.name || ''] || data.name, ok: undefined })
          } else if (eventName === 'tool_result') {
            const toolStep = [...steps].reverse().find(s => s.kind === 'tool' && s.name === data.name && s.ok === undefined)
            if (toolStep) { toolStep.ok = !!data.ok; toolStep.summary = data.summary }
            else steps.push({ kind: 'tool', name: data.name, label: TOOL_LABEL[data.name || ''] || data.name, ok: !!data.ok, summary: data.summary })
            if (data.ok) {
              citations.push({
                label: `${TOOL_LABEL[data.name || ''] || data.name || 'tool'} · ${data.summary || ''}`.trim().slice(0, 200),
                summary: data.summary,
                type: data.name,
              })
            }
          } else if (eventName === 'answer_chunk') {
            answer += data.text || ''
            updateCell(key, prev => ({ ...prev, text: answer, citations: [...citations], steps: [...steps], state: 'running' }))
          } else if (eventName === 'done') {
            const ms = Date.now() - startedAt
            updateCell(key, prev => ({
              ...prev,
              state: 'done',
              text: answer || prev.text || '',
              citations: [...citations],
              steps: [...steps],
              provider,
              ms,
              runAt: new Date().toISOString(),
            }))
          } else if (eventName === 'error') {
            updateCell(key, () => ({
              state: 'error',
              error: data.message || 'Agent error',
              steps: [...steps],
              runAt: new Date().toISOString(),
            }))
          }
        }
      }
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string }
      if (err?.name === 'AbortError') return
      updateCell(key, () => ({ state: 'error', error: err?.message || 'Network error', runAt: new Date().toISOString() }))
    } finally {
      abortMap.current.delete(key)
    }
    void provider // silence unused-let warning
  }, [rows, cols, updateCell])

  // Run helpers — bounded concurrency so we don't fan out hundreds of agent
  // calls at once on big grids.
  async function runMany(pairs: { row: string; col: string }[], concurrency = 4) {
    await ensureMatrix()
    let i = 0
    const workers = Array.from({ length: Math.min(concurrency, pairs.length) }, async () => {
      while (i < pairs.length) {
        const idx = i++
        const p = pairs[idx]
        await runCell(p.row, p.col)
      }
    })
    await Promise.all(workers)
  }

  function pairsForRow(rowId: string)     { return cols.map(c => ({ row: rowId, col: c.id })) }
  function pairsForCol(colId: string)     { return rows.map(r => ({ row: r.id, col: colId })) }
  function pairsForAll()                  { return rows.flatMap(r => cols.map(c => ({ row: r.id, col: c.id }))) }
  function pairsForDirty()                { return pairsForAll().filter(p => cells[cellKey(p.row, p.col)]?.dirty || cells[cellKey(p.row, p.col)]?.state === 'idle' || !cells[cellKey(p.row, p.col)]) }

  // ── Template / source helpers ─────────────────────────────────────────────
  function applyTemplate(tpl: GridTemplate) {
    setActiveTemplate(tpl)
    const tplCols: MatrixGridColumn[] = tpl.columns.map((c, i) => ({
      id: `tpl-${tpl.id}-${i}`,
      label: c.label, prompt: c.prompt,
      width: i === 0 ? 200 : 280,
    }))
    setCols(tplCols)
    setActiveCell(null)
  }
  function resetTemplate() { setActiveTemplate(null); setCols(DEFAULT_COLS) }

  // ── Snapshot / export ─────────────────────────────────────────────────────
  async function freezeSnapshot() {
    const id = await ensureMatrix()
    if (!id) { setStatusMsg('Sign in and pick a workspace to save snapshots.'); return }
    const label = window.prompt('Name this snapshot', `Snapshot ${new Date().toLocaleString()}`) || ''
    const r = await fetch(`${BASE}/api/matrices/${id}/snapshots`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label }),
    })
    if (r.ok) { setStatusMsg('Snapshot frozen.'); await refreshSnapshots(id); setSnapshotsOpen(true) }
    else setStatusMsg(`Could not freeze (${r.status}).`)
  }
  async function openCompare(snapId: string) {
    if (!matrixId) { setStatusMsg('Save the matrix first to compare snapshots.'); return }
    try {
      setStatusMsg('Loading snapshot for comparison…')
      const r = await fetch(`${BASE}/api/matrices/${matrixId}/snapshots/${snapId}`, { cache: 'no-store' })
      if (!r.ok) { setStatusMsg(`Could not load snapshot (${r.status}).`); return }
      const j = await r.json()
      const snap = j.snapshot as { id: string; label: string; createdAt: string; rows: MatrixGridRow[]; columns: MatrixGridColumn[]; cells: Record<string, MatrixCell> } | undefined
      if (!snap) { setStatusMsg('Snapshot payload was empty.'); return }
      setCompareSnap({
        id: snap.id,
        label: snap.label || 'Snapshot',
        createdAt: snap.createdAt,
        rows: Array.isArray(snap.rows) ? snap.rows : [],
        columns: Array.isArray(snap.columns) ? snap.columns : [],
        cells: snap.cells && typeof snap.cells === 'object' ? snap.cells : {},
      })
      setSnapshotsOpen(false)
      setStatusMsg('')
    } catch (e) {
      console.warn('snapshot compare load failed', e)
      setStatusMsg('Could not load snapshot for comparison.')
    }
  }
  async function restoreSnapshot(snapId: string, label: string) {
    if (!matrixId) { setStatusMsg('Save the matrix first to restore snapshots.'); return }
    const ok = window.confirm(
      `Restore "${label || 'this snapshot'}"?\n\nThis replaces the current rows, columns and cells with the frozen copy. We'll automatically save the live grid as a snapshot first so you can undo this.`,
    )
    if (!ok) return
    try {
      // Cancel any in-flight cell runs so streams don't race the restore.
      for (const ctl of abortMap.current.values()) ctl.abort()
      abortMap.current.clear()

      // Auto-snapshot the current live matrix so the user has a one-click
      // undo path. Labelled with the AUTO_SNAPSHOT_PREFIX so the snapshots
      // drawer can render these with a distinguishing style. If the auto-save
      // fails for any reason we ask the user whether they still want to
      // proceed without an undo trail rather than silently losing work.
      setStatusMsg('Auto-saving the live grid…')
      const autoLabel = `${AUTO_SNAPSHOT_PREFIX}${label || 'snapshot'} · ${new Date().toLocaleString()}`
      const autoRes = await fetch(`${BASE}/api/matrices/${matrixId}/snapshots`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: autoLabel.slice(0, 200) }),
      }).catch(() => null)
      if (!autoRes || !autoRes.ok) {
        const proceed = window.confirm(
          'Could not auto-save the live grid as a snapshot, so this restore won\'t be undoable. Continue anyway?',
        )
        if (!proceed) { setStatusMsg('Restore cancelled — live grid was not auto-saved.'); return }
      }

      setStatusMsg('Restoring snapshot…')
      const r = await fetch(`${BASE}/api/matrices/${matrixId}/snapshots/${snapId}`, { cache: 'no-store' })
      if (!r.ok) { setStatusMsg(`Could not restore snapshot (${r.status}).`); return }
      const j = await r.json()
      const snap = j.snapshot as { rows: MatrixGridRow[]; columns: MatrixGridColumn[]; cells: Record<string, MatrixCell>; label: string } | undefined
      if (!snap) { setStatusMsg('Snapshot payload was empty.'); return }
      setRows(Array.isArray(snap.rows) ? snap.rows : [])
      setCols(Array.isArray(snap.columns) ? snap.columns : [])
      setCells(snap.cells && typeof snap.cells === 'object' ? snap.cells : {})
      setActiveCell(null)
      setSelected(new Set())
      // Refresh snapshots list so the new auto-snapshot appears in the drawer
      // for one-click undo.
      await refreshSnapshots(matrixId)
      // Autosave PATCH cycle (useEffect on rows/cols/cells) will re-sync the doc.
      setStatusMsg(`Restored "${snap.label || 'snapshot'}". Saving…`)
    } catch (e) {
      console.warn('snapshot restore failed', e)
      setStatusMsg('Could not restore snapshot.')
    }
  }
  async function renameSnapshot(snapId: string, currentLabel: string) {
    if (!matrixId) { setStatusMsg('Save the matrix first to rename snapshots.'); return }
    const next = window.prompt('Rename snapshot', currentLabel || '')
    if (next === null) return
    const trimmed = next.trim()
    if (!trimmed) { setStatusMsg('Snapshot name cannot be empty.'); return }
    if (trimmed === currentLabel) return
    try {
      const r = await fetch(`${BASE}/api/matrices/${matrixId}/snapshots/${snapId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: trimmed }),
      })
      if (!r.ok) { setStatusMsg(`Could not rename snapshot (${r.status}).`); return }
      setSnapshots(prev => prev.map(s => s.id === snapId ? { ...s, label: trimmed } : s))
      setStatusMsg('Snapshot renamed.')
    } catch (e) {
      console.warn('snapshot rename failed', e)
      setStatusMsg('Could not rename snapshot.')
    }
  }
  async function deleteSnapshot(snapId: string, label: string) {
    if (!matrixId) { setStatusMsg('Save the matrix first to manage snapshots.'); return }
    const ok = window.confirm(
      `Delete "${label || 'this snapshot'}"?\n\nThis permanently removes the frozen copy. The live grid is not affected.`,
    )
    if (!ok) return
    try {
      const r = await fetch(`${BASE}/api/matrices/${matrixId}/snapshots/${snapId}`, {
        method: 'DELETE',
      })
      if (!r.ok) { setStatusMsg(`Could not delete snapshot (${r.status}).`); return }
      setSnapshots(prev => prev.filter(s => s.id !== snapId))
      setStatusMsg('Snapshot deleted.')
    } catch (e) {
      console.warn('snapshot delete failed', e)
      setStatusMsg('Could not delete snapshot.')
    }
  }
  async function exportFile(format: 'csv' | 'pptx', opts?: { scopeToSelected?: boolean }) {
    const id = await ensureMatrix()
    if (!id) { setStatusMsg('Sign in to export.'); return }
    // Task #267 / #284 — when the analyst has checked rows, both the PPTX
    // and CSV exports ship only those rows so the artifact is a focused
    // snapshot rather than the full grid. With nothing checked, all visible
    // rows are exported (legacy behavior).
    const params = new URLSearchParams({ format })
    if (opts?.scopeToSelected && selected.size > 0) {
      for (const rid of selected) params.append('rowIds', rid)
    }
    window.open(`${BASE}/api/matrices/${id}/export?${params.toString()}`, '_blank', 'noopener')
  }
  async function toggleRerunOnFiling() {
    const next = !rerunOnFiling
    setRerunOnFiling(next)
    await ensureMatrix()
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = rows.length * cols.length
    let done = 0, running = 0, errored = 0
    for (const r of rows) for (const c of cols) {
      const cell = cells[cellKey(r.id, c.id)]
      if (cell?.state === 'done')    done++
      if (cell?.state === 'running') running++
      if (cell?.state === 'error')   errored++
    }
    return { total, done, running, errored, pct: total ? Math.round((done / total) * 100) : 0 }
  }, [rows, cols, cells])

  // Esc to close drawer.
  useEffect(() => {
    if (!activeCell) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setActiveCell(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeCell])

  // Esc to close compare view.
  useEffect(() => {
    if (!compareSnap) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setCompareSnap(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compareSnap])

  function toggleSelected(id: string) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  // Add column inline.
  function addColumn() {
    const label = window.prompt('Column label?', 'New question')
    if (!label) return
    const prompt = window.prompt('Prompt for the agent?', label) || label
    setCols(prev => [...prev, { id: newId('col'), label, prompt, width: 280 }])
  }
  function deleteColumn(colId: string) {
    setCols(prev => prev.filter(c => c.id !== colId))
    setCells(prev => {
      const next: Record<string, MatrixCell> = {}
      for (const k of Object.keys(prev)) if (!k.endsWith(`.${colId}`)) next[k] = prev[k]
      return next
    })
  }
  function addRow(row: Omit<MatrixGridRow, 'id'>) {
    setRows(prev => [...prev, { id: newId('row'), ...row }])
  }
  function deleteRow(rowId: string) {
    setRows(prev => prev.filter(r => r.id !== rowId))
    setCells(prev => {
      const next: Record<string, MatrixCell> = {}
      for (const k of Object.keys(prev)) if (!k.startsWith(`${rowId}.`)) next[k] = prev[k]
      return next
    })
  }

  const activeCellData = activeCell ? cells[cellKey(activeCell.row, activeCell.col)] : undefined
  const activeRow      = activeCell ? rows.find(r => r.id === activeCell.row) : undefined
  const activeCol      = activeCell ? cols.find(c => c.id === activeCell.col) : undefined

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <PageHero
          eyebrow="Matrix"
          title="Read every entity at once."
          accentWord="every entity"
          subtitle="One question across every row. Cells stream live from the Finsyt agent — citations, tool waterfall, and full reasoning surface in the cell drawer."
          actions={
            <>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Matrix name"
                style={{ ...ghostBtn, minWidth: 200 }}
              />
              <button style={ghostBtn} onClick={() => setSavedMenuOpen(v => !v)}>☰ Saved{savedList.length ? ` · ${savedList.length}` : ''}</button>
              <button style={ghostBtn} onClick={() => setTemplatesOpen(true)}>▦ Templates</button>
              <button style={ghostBtn} onClick={() => setBlueprintsOpen(true)}>◎ Run Blueprint</button>
              <button style={ghostBtn} onClick={() => setLibOpen(true)}>▣ Sources{selectedLeafIds.length ? ` · ${selectedLeafIds.length}` : ''}</button>
              <button style={ghostBtn} onClick={() => setRowPickerOpen(true)}>+ Add rows</button>
              <button style={ghostBtn} onClick={addColumn}>+ Add column</button>
              <button style={primaryBtn} onClick={() => runMany(pairsForDirty())} disabled={stats.running > 0}>
                {stats.running > 0 ? `↻ Running ${stats.running}…` : '↻ Run / refresh'}
              </button>
            </>
          }
        />
        {savedMenuOpen && (
          <div style={{ margin: '0 32px 18px', padding: 12, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Saved matrices</div>
              <button style={miniBtn} onClick={() => { setMatrixId(null); setName('Untitled matrix'); setRows(DEFAULT_ROWS); setCols(DEFAULT_COLS); setCells({}); const u = new URL(window.location.href); u.searchParams.delete('id'); window.history.replaceState(null, '', u.toString()); setSavedMenuOpen(false) }}>+ New blank matrix</button>
            </div>
            {savedList.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No saved matrices yet — run a column to save your first.</div>
              : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8 }}>
                  {savedList.map(s => (
                    <button key={s.id} onClick={() => { void loadMatrix(s.id); setSavedMenuOpen(false) }} style={{ ...miniBtn, textAlign: 'left', padding: 10 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 12 }}>{s.name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{new Date(s.updatedAt).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              )}
          </div>
        )}

        <div style={{ padding: '0 32px' }}>
          <ContextualAskBar
            context="Matrix"
            contextData={{ page: 'matrix', name, columns: cols.length, rows: rows.length }}
            chips={[
              { label: 'Add risk column',   prompt: 'Add a column to this matrix asking "What are the top 3 risks for the entity?".' },
              { label: 'Suggest columns',   prompt: 'Suggest 5 additional columns that would deepen the analysis for the loaded template.' },
              { label: 'Run for new rows',  prompt: 'Re-run any rows that have empty cells.' },
              { label: 'Export grid',       prompt: 'Export the current matrix grid as a spreadsheet with citations preserved.' },
            ]}
            placeholder="Ask Finsyt to extend or query the matrix…"
            style={{ margin: '0 0 16px' }}
          />
        </div>
        {activeTemplate && (
          <div style={{ margin: '0 32px 18px', padding: '12px 16px', borderRadius: 12, background: 'var(--accent-dim)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent-text)' }}>Template loaded</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{activeTemplate.name}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{activeTemplate.columns.length} columns applied · {activeTemplate.audience}</span>
            <button onClick={resetTemplate} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Reset to default ×</button>
          </div>
        )}
      </div>

      <SectionBand variant="sage" padded={false}>
        <div style={{ maxWidth: 1600, margin: '0 auto', padding: '24px 32px 48px' }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 16px', marginBottom: 14, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 999, background: 'var(--pos-dim)', color: 'var(--pos)', fontSize: 11, fontWeight: 700 }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--pos)' }} />
                {stats.done} of {stats.total} cells complete · {stats.pct}%
              </div>
              {stats.running > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'var(--accent-dim)', color: 'var(--accent-text)', fontSize: 11, fontWeight: 700 }}>
                  <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent)' }} />
                  {stats.running} running
                </div>
              )}
              {stats.errored > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'var(--neg-dim, rgba(239,68,68,0.12))', color: 'var(--neg)', fontSize: 11, fontWeight: 700 }}>
                  ⚠ {stats.errored} errored
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {rows.length} entities · {cols.length} columns
                {savingState !== 'idle' && (
                  <span style={{ marginLeft: 10, color: savingState === 'error' ? 'var(--neg)' : 'var(--text-muted)' }}>
                    {savingState === 'saving' ? '· saving…' : savingState === 'saved' ? '· saved' : '· save failed'}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={rerunOnFiling} onChange={toggleRerunOnFiling} /> Rerun on new filing
              </label>
              {selected.size > 0 && (
                <button style={miniBtn} onClick={() => runMany([...selected].flatMap(rid => pairsForRow(rid)))}>↻ Run selected ({selected.size})</button>
              )}
              <button style={miniBtn} onClick={freezeSnapshot}>❄ Freeze</button>
              <button style={miniBtn} onClick={() => { if (matrixId) { void refreshSnapshots(matrixId); setSnapshotsOpen(true) } }}>⏱ Snapshots</button>
              <button
                style={miniBtn}
                onClick={() => exportFile('csv', { scopeToSelected: true })}
                title={selected.size > 0
                  ? `Download a CSV of the ${selected.size} row${selected.size === 1 ? '' : 's'} you've selected`
                  : 'Download a CSV of this matrix view (check rows to export a subset)'}
              >
                {selected.size > 0 ? `⤓ Export ${selected.size} selected to CSV` : '⤓ Export CSV'}
              </button>
              <button
                style={miniBtn}
                onClick={() => exportFile('pptx', { scopeToSelected: true })}
                title={selected.size > 0
                  ? `Build a Finsyt-branded PPTX from the ${selected.size} row${selected.size === 1 ? '' : 's'} you've selected`
                  : 'Build a Finsyt-branded PPTX from this matrix view (check rows to export a subset)'}
              >
                {selected.size > 0 ? `⤓ PPTX (${selected.size} selected)` : '⤓ PPTX'}
              </button>
            </div>
          </div>

          {statusMsg && (
            <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)' }}>
              {statusMsg}
              <button onClick={() => setStatusMsg('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
            </div>
          )}

          {/* Grid */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: 'var(--text-primary)', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 44 }} />
                  <col style={{ width: 56 }} />
                  <col style={{ width: 280 }} />
                  <col style={{ width: 100 }} />
                  {cols.map(c => <col key={c.id} style={{ width: c.width || 280 }} />)}
                </colgroup>
                <thead>
                  <tr style={{ background: 'var(--bg-card)' }}>
                    <th style={thStyle}>
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < rows.length }}
                        checked={rows.length > 0 && selected.size === rows.length}
                        onChange={e => setSelected(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())}
                      />
                    </th>
                    <th style={thStyle}>#</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Entity</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Run</th>
                    {cols.map(c => (
                      <th key={c.id} style={{ ...thStyle, textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 14, height: 14, borderRadius: 3, background: 'var(--accent-dim)', color: 'var(--accent-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ACTION_ICONS.sparkles width={9} height={9} strokeWidth={ICON_STROKE} />
                          </span>
                          <span style={{ flex: 1 }}>{c.label}</span>
                          <button onClick={() => runMany(pairsForCol(c.id))} title="Run column" style={iconBtn}>↻</button>
                          <button onClick={() => deleteColumn(c.id)} title="Delete column" style={iconBtn}>×</button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d, idx) => {
                    const isSel = selected.has(d.id)
                    return (
                      <tr key={d.id} style={{ borderTop: '1px solid var(--border)', background: isSel ? 'var(--accent-dim)' : 'transparent' }}>
                        <td style={tdStyle}>
                          <input type="checkbox" aria-label={`Select ${d.label}`} checked={isSel} onChange={() => toggleSelected(d.id)} />
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{idx + 1}</td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 22, height: 22, borderRadius: 5, background: 'var(--accent-dim)', color: 'var(--accent-text)', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{d.ticker ? d.ticker.slice(0, 2) : '◧'}</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</div>
                              {d.ticker && <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{d.ticker}</div>}
                            </div>
                            <button title="Delete row" onClick={() => deleteRow(d.id)} style={{ ...iconBtn, marginLeft: 'auto' }}>×</button>
                          </div>
                        </td>
                        <td style={{ ...tdStyle }}>
                          <button style={miniBtn} onClick={() => runMany(pairsForRow(d.id))}>↻ Row</button>
                        </td>
                        {cols.map(c => {
                          const k = cellKey(d.id, c.id)
                          const cell = cells[k]
                          const isActive = activeCell?.row === d.id && activeCell?.col === c.id
                          return (
                            <td
                              key={c.id}
                              onClick={() => setActiveCell({ row: d.id, col: c.id })}
                              style={{ ...tdStyle, verticalAlign: 'top', cursor: 'pointer', background: isActive ? 'var(--accent-dim)' : undefined, borderLeft: '1px solid var(--border)' }}
                            >
                              <CellView cell={cell} onRun={(e) => { e.stopPropagation(); void runCell(d.id, c.id) }} />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td colSpan={4 + cols.length} style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} onClick={() => setRowPickerOpen(true)}>
                      + Add row
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⌨</span>
            Click any cell to inspect the agent's reasoning, tool waterfall, and citations · press <kbd style={kbd}>g</kbd> then <kbd style={kbd}>x</kbd> to jump back to Matrix
          </div>
        </div>
      </SectionBand>

      {/* Cell inspector drawer (battlecard) */}
      {activeCell && activeRow && activeCol && (
        <CellInspector
          row={activeRow}
          col={activeCol}
          cell={activeCellData}
          onClose={() => setActiveCell(null)}
          onRun={() => runCell(activeRow.id, activeCol.id)}
        />
      )}

      <GridTemplatesGallery open={templatesOpen} onClose={() => setTemplatesOpen(false)} onChoose={tpl => applyTemplate(tpl)} />
      <SourceLibraryPicker open={libOpen} onClose={() => setLibOpen(false)} />

      <RowPicker
        open={rowPickerOpen}
        onClose={() => setRowPickerOpen(false)}
        onAdd={(newRows, kind) => {
          for (const nr of newRows) addRow(nr)
          setRowSourceKind(kind)
          setRowPickerOpen(false)
        }}
      />

      <SnapshotsDrawer
        open={snapshotsOpen}
        snapshots={snapshots}
        matrixId={matrixId}
        onClose={() => setSnapshotsOpen(false)}
        onExport={(snapId, format) => {
          if (!matrixId) return
          window.open(`${BASE}/api/matrices/${matrixId}/export?format=${format}&snapshotId=${snapId}`, '_blank', 'noopener')
        }}
        onRestore={restoreSnapshot}
        onCompare={(snapId) => { void openCompare(snapId) }}
        onRename={renameSnapshot}
        onDelete={deleteSnapshot}
      />

      {compareSnap && (
        <SnapshotCompareView
          snapshot={compareSnap}
          liveRows={rows}
          liveCols={cols}
          liveCells={cells}
          onClose={() => setCompareSnap(null)}
          onRestore={async () => {
            const id = compareSnap.id
            const label = compareSnap.label
            await restoreSnapshot(id, label)
            setCompareSnap(null)
          }}
        />
      )}

      <BlueprintRunModal
        open={blueprintsOpen}
        onClose={() => setBlueprintsOpen(false)}
        target={{
          kind: 'matrix',
          label: activeTemplate?.name ? `Matrix · ${activeTemplate.name}` : (name || 'Matrix'),
          payload: {
            matrixId,
            template: activeTemplate?.name ?? null,
            entities: rows.map(r => ({ id: r.id, label: r.label, ticker: r.ticker })),
            columns: cols.map(c => ({ label: c.label, prompt: c.prompt })),
            selectedSourceIds: selectedLeafIds,
          },
        }}
      />

      <style jsx>{`
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        :global(.pulse-dot) { animation: pulse 1s infinite; }
      `}</style>
    </div>
  )
}

// ─── Cell view ───────────────────────────────────────────────────────────────

function CellView({ cell, onRun }: { cell: MatrixCell | undefined; onRun: (e: React.MouseEvent) => void }) {
  if (!cell || cell.state === 'idle') {
    return (
      <button onClick={onRun} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'inherit', fontStyle: 'italic' }}>
        ▷ Run
      </button>
    )
  }
  if (cell.state === 'queued') {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Queued…</div>
  }
  if (cell.state === 'running') {
    return (
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--accent-text)', fontWeight: 700, marginBottom: 4 }}>
          <span className="pulse-dot" style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--accent)' }} />
          Streaming…
        </div>
        {cell.text && (
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-primary)', maxHeight: 110, overflow: 'hidden' }}>
            {cell.text}
          </div>
        )}
      </div>
    )
  }
  if (cell.state === 'error') {
    return (
      <div>
        <div style={{ fontSize: 11, color: 'var(--neg)', fontWeight: 700, marginBottom: 2 }}>⚠ Error</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', maxHeight: 60, overflow: 'hidden' }}>{cell.error || 'Run failed'}</div>
      </div>
    )
  }
  // done
  return (
    <div>
      <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-primary)', maxHeight: 130, overflow: 'hidden' }}>
        {cell.text || '—'}
      </div>
      {(cell.citations?.length ?? 0) > 0 && (
        <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--accent-text)', fontWeight: 600 }}>
          ◧ {cell.citations!.length} {cell.citations!.length === 1 ? 'source' : 'sources'}
          {cell.dirty && <span style={{ marginLeft: 6, color: 'var(--amber)' }}>· stale</span>}
          {cell.ms != null && <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontWeight: 500 }}>· {(cell.ms / 1000).toFixed(1)}s</span>}
        </div>
      )}
    </div>
  )
}

// ─── Cell inspector (battlecard) ─────────────────────────────────────────────

function CellInspector({
  row, col, cell, onClose, onRun,
}: {
  row: MatrixGridRow
  col: MatrixGridColumn
  cell: MatrixCell | undefined
  onClose: () => void
  onRun: () => void
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(8,14,26,0.55)', backdropFilter: 'blur(4px)', zIndex: 1100 }} />
      <aside role="dialog" aria-modal="true" aria-labelledby="matrix-cell-title"
        style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(560px, 100vw)', zIndex: 1101, background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', boxShadow: '-12px 0 48px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.22s ease' }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{row.label}{row.ticker ? ` · ${row.ticker}` : ''}</div>
              <div id="matrix-cell-title" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{col.label}</div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 22, lineHeight: 1, padding: '4px 8px', borderRadius: 6 }}>×</button>
          </div>
          <div style={{ marginTop: 12, padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11.5, color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Prompt:</span>{col.prompt}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={onRun} style={primaryBtn}>{cell?.state === 'running' ? '↻ Re-streaming…' : (cell?.state === 'done' ? '↻ Re-run cell' : '▷ Run cell')}</button>
            {cell?.runAt && <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>Last run {new Date(cell.runAt).toLocaleString()}{cell.ms != null ? ` · ${(cell.ms / 1000).toFixed(1)}s` : ''}{cell.provider ? ` · ${cell.provider}` : ''}</span>}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          {cell?.state === 'error' && (
            <div style={{ padding: 12, marginBottom: 16, background: 'var(--bg-elevated)', borderLeft: '3px solid var(--neg)', borderRadius: 6, fontSize: 12.5, color: 'var(--text-primary)' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Run failed</div>
              {cell.error}
            </div>
          )}

          {cell?.text && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Answer</div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', marginBottom: 24 }}>{cell.text}</div>
            </>
          )}

          {(cell?.steps?.length ?? 0) > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Provider waterfall · tool timeline</div>
              <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(cell!.steps || []).map((s, i) => {
                  const okColor = s.kind === 'tool' ? (s.ok === false ? 'var(--neg)' : (s.ok === true ? 'var(--pos)' : 'var(--text-muted)')) : 'var(--accent-text)'
                  const dot = s.kind === 'tool' ? (s.ok === false ? '✕' : (s.ok === true ? '✓' : '◌')) : '◆'
                  return (
                    <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--bg-card)', color: okColor, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{dot}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{s.label || s.name || s.kind}</div>
                        {s.summary && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>{s.summary}</div>}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </>
          )}

          {(cell?.citations?.length ?? 0) > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Citations</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(cell!.citations || []).map((c, i) => (
                  <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-text)' }}>[{i + 1}] {c.label}</div>
                    {c.summary && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.summary}</div>}
                    {c.href && <a href={c.href} target="_blank" rel="noreferrer" style={{ marginTop: 4, fontSize: 11, color: 'var(--accent-text)', textDecoration: 'underline', display: 'inline-block' }}>Open source ↗</a>}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Shared "Data sources used" footer (Theme #251) — derives a
              ProviderTrace from the cell's tool steps + citation count so
              every agent surface speaks the same data-transparency language. */}
          {(cell?.steps?.length ?? 0) > 0 && (
            <div style={{ marginTop: 24 }}>
              <DataSourcesUsedFooter
                compact
                trace={(cell!.steps || [])
                  .filter(s => s.kind === 'tool' && s.name)
                  .map((s, i) => ({
                    id: `${row.id}-${col.id}-${s.name}-${i}`,
                    label: s.label || TOOL_LABEL[s.name as string] || s.name || 'Tool',
                    tool: s.name,
                    role: 'primary' as const,
                    responseMs: s.ms,
                    citationCount: 0,
                    connectorHubHref: `${BASE}/app/connectors`,
                    detail: s.summary,
                  })) satisfies ProviderTrace[]}
              />
            </div>
          )}

          {(!cell || cell.state === 'idle') && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, textAlign: 'center', gap: 12, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 28 }}>◌</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>This cell hasn't been run yet</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 320, lineHeight: 1.5 }}>
                Click <strong>Run cell</strong> above to dispatch the column prompt against the entity. The agent will stream its reasoning, tool calls, and citations into this drawer in real time.
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

// ─── Row picker ──────────────────────────────────────────────────────────────

function RowPicker({
  open, onClose, onAdd,
}: {
  open: boolean
  onClose: () => void
  onAdd: (rows: Omit<MatrixGridRow, 'id'>[], kind: RowSourceKind) => void
}) {
  const [tab, setTab] = useState<'paste' | 'watchlist' | 'csv'>('paste')
  const [text, setText] = useState('')
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    fetch(`${BASE}/api/watchlist`).then(r => r.ok ? r.json() : { watchlist: [] }).then((j: { watchlist?: string[] }) => {
      setWatchlist(j.watchlist || [])
    }).catch(() => { /* ignore */ })
  }, [open])

  if (!open) return null

  function commit() {
    if (tab === 'paste' || tab === 'csv') {
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      const rows: Omit<MatrixGridRow, 'id'>[] = lines.map(line => {
        // Format: "TICKER" or "TICKER, Name"
        const parts = line.split(/\s*,\s*/)
        const ticker = parts[0].toUpperCase()
        const label = parts[1] || ticker
        return { ticker, label, kind: 'ticker' }
      })
      if (rows.length) onAdd(rows, tab === 'csv' ? 'csv' : 'manual')
    } else {
      const rows: Omit<MatrixGridRow, 'id'>[] = [...picked].map(t => ({ ticker: t, label: t, kind: 'ticker' }))
      if (rows.length) onAdd(rows, 'watchlist')
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(8,14,26,0.55)', zIndex: 1200 }} />
      <div role="dialog" aria-modal="true" style={{ position: 'fixed', top: '8vh', left: '50%', transform: 'translateX(-50%)', zIndex: 1201, width: 'min(580px, 96vw)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 48px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Add rows to matrix</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-secondary)' }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {(['paste', 'watchlist', 'csv'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                ...miniBtn,
                background: tab === t ? 'var(--accent-dim)' : 'transparent',
                color: tab === t ? 'var(--accent-text)' : 'var(--text-secondary)',
                borderColor: tab === t ? 'var(--accent)' : 'var(--border)',
              }}>
                {t === 'paste' ? '✎ Paste tickers' : t === 'watchlist' ? '★ Watchlist' : '⤓ CSV'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: '16px 20px', minHeight: 220 }}>
          {tab === 'paste' && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Paste one ticker per line. Optional name after a comma.</div>
              <textarea value={text} onChange={e => setText(e.target.value)} placeholder={'AAPL\nMSFT, Microsoft\nNVDA'} rows={8}
                style={{ width: '100%', padding: 10, fontFamily: 'monospace', fontSize: 13, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
            </>
          )}
          {tab === 'watchlist' && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Tickers from your active watchlist:</div>
              {watchlist.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Watchlist is empty.</div> : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {watchlist.map(t => {
                    const on = picked.has(t)
                    return (
                      <button key={t} onClick={() => { setPicked(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n }) }}
                        style={{ padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', background: on ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, color: on ? 'var(--accent-text)' : 'var(--text-primary)' }}>
                        {on ? '✓ ' : ''}{t}
                      </button>
                    )
                  })}
                </div>
              )}
              <button onClick={() => setPicked(new Set(watchlist))} style={{ ...miniBtn, marginTop: 12 }}>Select all</button>
            </>
          )}
          {tab === 'csv' && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Upload a CSV: first column = ticker, optional second column = label.</div>
              <input type="file" accept=".csv,text/csv" onChange={async e => {
                const f = e.target.files?.[0]; if (!f) return
                const buf = await f.text()
                setText(buf.split(/\r?\n/).slice(0, 200).join('\n'))
              }} style={{ marginBottom: 8 }} />
              <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
                style={{ width: '100%', padding: 10, fontFamily: 'monospace', fontSize: 13, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
            </>
          )}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={miniBtn}>Cancel</button>
          <button onClick={commit} style={primaryBtn}>Add rows</button>
        </div>
      </div>
    </>
  )
}

// ─── Snapshots drawer ────────────────────────────────────────────────────────

function SnapshotsDrawer({
  open, snapshots, matrixId, onClose, onExport, onRestore, onCompare, onRename, onDelete,
}: {
  open: boolean
  snapshots: MatrixSnapshot[]
  matrixId: string | null
  onClose: () => void
  onExport: (snapId: string, format: 'csv' | 'pptx') => void
  onRestore: (snapId: string, label: string) => void | Promise<void>
  onCompare: (snapId: string) => void
  onRename: (snapId: string, label: string) => void | Promise<void>
  onDelete: (snapId: string, label: string) => void | Promise<void>
}) {
  if (!open) return null
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(8,14,26,0.55)', zIndex: 1200 }} />
      <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(420px, 100vw)', zIndex: 1201, background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Snapshots</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-secondary)' }}>×</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Frozen point-in-time copies of this matrix. Compare against the live grid to see what changed, restore to roll back, or export a stable version for the IC.</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {!matrixId && <div style={{ padding: 16, fontSize: 12, color: 'var(--text-secondary)' }}>Save the matrix first to enable snapshots.</div>}
          {matrixId && snapshots.length === 0 && <div style={{ padding: 16, fontSize: 12, color: 'var(--text-secondary)' }}>No snapshots yet.</div>}
          {snapshots.map(s => {
            const auto = isAutoSnapshot(s.label)
            // For auto-snapshots, strip the prefix so the displayed label is
            // the human-readable "<original label> · <timestamp>" portion and
            // the auto context is conveyed by the badge instead.
            const display = auto ? s.label.slice(AUTO_SNAPSHOT_PREFIX.length) : (s.label || 'Untitled snapshot')
            return (
              <div
                key={s.id}
                style={{
                  padding: 12,
                  marginBottom: 8,
                  background: auto ? 'transparent' : 'var(--bg-elevated)',
                  border: auto ? '1px dashed var(--border)' : '1px solid var(--border)',
                  borderRadius: 8,
                  opacity: auto ? 0.92 : 1,
                }}
                data-auto-snapshot={auto ? 'true' : undefined}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {auto && (
                    <span
                      title="Auto-saved before a snapshot restore — use this to undo."
                      style={{
                        display: 'inline-block',
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                    >
                      ↺ Auto
                    </span>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 700, color: auto ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{display}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{new Date(s.createdAt).toLocaleString()}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => onCompare(s.id)} style={miniBtn} title="Open a side-by-side diff against the live grid">⇆ Compare</button>
                  <button
                    onClick={() => onRestore(s.id, s.label)}
                    style={miniBtn}
                    title={auto ? 'Undo the previous restore by replacing the live grid with this auto-saved copy' : 'Replace the live grid with this frozen copy'}
                  >
                    {auto ? '↺ Undo restore' : '↺ Restore'}
                  </button>
                  <button onClick={() => onExport(s.id, 'csv')} style={miniBtn}>⤓ CSV</button>
                  <button onClick={() => onExport(s.id, 'pptx')} style={miniBtn}>⤓ PPTX</button>
                  <button onClick={() => onRename(s.id, s.label)} style={miniBtn} title="Rename this snapshot">✎ Rename</button>
                  <button onClick={() => onDelete(s.id, s.label)} style={{ ...miniBtn, color: 'var(--danger, #d4453a)' }} title="Permanently delete this snapshot">🗑 Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      </aside>
    </>
  )
}

// ─── Snapshot compare view ───────────────────────────────────────────────────
// Read-only side-by-side diff of a frozen snapshot vs. the live grid. Rows and
// columns are unioned (snapshot order first, then any new ones from live) so
// the two sides line up; cells whose text differs are highlighted amber, and
// rows/columns that exist on only one side are tinted green (added on live)
// or red (removed since freeze). Restore is exposed inline so analysts can
// roll back without going back to the snapshots drawer.

function SnapshotCompareView({
  snapshot, liveRows, liveCols, liveCells, onClose, onRestore,
}: {
  snapshot: { id: string; label: string; createdAt: string; rows: MatrixGridRow[]; columns: MatrixGridColumn[]; cells: Record<string, MatrixCell> }
  liveRows: MatrixGridRow[]
  liveCols: MatrixGridColumn[]
  liveCells: Record<string, MatrixCell>
  onClose: () => void
  onRestore: () => void | Promise<void>
}) {
  const liveRowIds = useMemo(() => new Set(liveRows.map(r => r.id)), [liveRows])
  const snapRowIds = useMemo(() => new Set(snapshot.rows.map(r => r.id)), [snapshot.rows])
  const liveColIds = useMemo(() => new Set(liveCols.map(c => c.id)), [liveCols])
  const snapColIds = useMemo(() => new Set(snapshot.columns.map(c => c.id)), [snapshot.columns])

  // Unified ordering: snapshot rows/cols first (preserve their order), then any
  // new live-only rows/cols appended. Keeps the two grids visually aligned
  // row-by-row and column-by-column even when one side is missing entries.
  const unionRows: MatrixGridRow[] = useMemo(() => [
    ...snapshot.rows,
    ...liveRows.filter(r => !snapRowIds.has(r.id)),
  ], [snapshot.rows, liveRows, snapRowIds])
  const unionCols: MatrixGridColumn[] = useMemo(() => [
    ...snapshot.columns,
    ...liveCols.filter(c => !snapColIds.has(c.id)),
  ], [snapshot.columns, liveCols, snapColIds])

  function rowStatus(id: string): 'same' | 'added' | 'removed' {
    return snapRowIds.has(id) && liveRowIds.has(id) ? 'same' : (liveRowIds.has(id) ? 'added' : 'removed')
  }
  function colStatus(id: string): 'same' | 'added' | 'removed' {
    return snapColIds.has(id) && liveColIds.has(id) ? 'same' : (liveColIds.has(id) ? 'added' : 'removed')
  }
  function cellDiff(r: MatrixGridRow, c: MatrixGridColumn): 'same' | 'changed' | 'na' | 'empty' {
    if (rowStatus(r.id) !== 'same' || colStatus(c.id) !== 'same') return 'na'
    const k = cellKey(r.id, c.id)
    const a = (snapshot.cells[k]?.text || '').trim()
    const b = (liveCells[k]?.text || '').trim()
    if (!a && !b) return 'empty'
    if (a === b) return 'same'
    return 'changed'
  }

  const counts = useMemo(() => {
    let rowsAdded = 0, rowsRemoved = 0, colsAdded = 0, colsRemoved = 0, cellsChanged = 0
    for (const r of unionRows) {
      const s = rowStatus(r.id)
      if (s === 'added') rowsAdded++
      else if (s === 'removed') rowsRemoved++
    }
    for (const c of unionCols) {
      const s = colStatus(c.id)
      if (s === 'added') colsAdded++
      else if (s === 'removed') colsRemoved++
    }
    for (const r of unionRows) for (const c of unionCols) {
      if (cellDiff(r, c) === 'changed') cellsChanged++
    }
    return { rowsAdded, rowsRemoved, colsAdded, colsRemoved, cellsChanged }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unionRows, unionCols, snapshot.cells, liveCells, liveRowIds, snapRowIds, liveColIds, snapColIds])

  function renderTable(side: 'snapshot' | 'live') {
    const cellsMap = side === 'snapshot' ? snapshot.cells : liveCells
    const presentRow = (id: string) => side === 'snapshot' ? snapRowIds.has(id) : liveRowIds.has(id)
    const presentCol = (id: string) => side === 'snapshot' ? snapColIds.has(id) : liveColIds.has(id)
    return (
      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: 'var(--text-primary)', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 200 }} />
            {unionCols.map(c => <col key={c.id} style={{ width: 240 }} />)}
          </colgroup>
          <thead>
            <tr style={{ background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={{ ...thStyle, textAlign: 'left' }}>Entity</th>
              {unionCols.map(c => {
                const s = colStatus(c.id)
                const here = presentCol(c.id)
                const bg = !here
                  ? 'rgba(148,163,184,0.08)'
                  : (s === 'added' && side === 'live') ? 'rgba(16,185,129,0.10)'
                  : (s === 'removed' && side === 'snapshot') ? 'rgba(239,68,68,0.10)'
                  : undefined
                return (
                  <th key={c.id} style={{ ...thStyle, textAlign: 'left', background: bg, borderLeft: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ flex: 1, opacity: here ? 1 : 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
                      {!here && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)' }}>N/A</span>}
                      {here && s === 'added' && side === 'live' && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--pos)' }}>+ NEW</span>}
                      {here && s === 'removed' && side === 'snapshot' && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--neg)' }}>REMOVED</span>}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {unionRows.length === 0 && (
              <tr><td colSpan={1 + unionCols.length} style={{ padding: 24, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No rows on either side.</td></tr>
            )}
            {unionRows.map(r => {
              const s = rowStatus(r.id)
              const here = presentRow(r.id)
              const rowBg = !here
                ? 'rgba(148,163,184,0.06)'
                : (s === 'added' && side === 'live') ? 'rgba(16,185,129,0.06)'
                : (s === 'removed' && side === 'snapshot') ? 'rgba(239,68,68,0.06)'
                : undefined
              return (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)', background: rowBg }}>
                  <td style={{ ...tdStyle, padding: '10px 12px', opacity: here ? 1 : 0.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</div>
                        {r.ticker && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.ticker}</div>}
                      </div>
                      {!here && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)' }}>N/A</span>}
                      {here && s === 'added' && side === 'live' && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--pos)' }}>+ NEW</span>}
                      {here && s === 'removed' && side === 'snapshot' && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--neg)' }}>REMOVED</span>}
                    </div>
                  </td>
                  {unionCols.map(c => {
                    const colHere = presentCol(c.id)
                    const k = cellKey(r.id, c.id)
                    const cell = cellsMap[k]
                    const text = (cell?.text || '').trim()
                    const diff = cellDiff(r, c)
                    const cellBg = !here || !colHere
                      ? 'rgba(148,163,184,0.06)'
                      : diff === 'changed' ? 'rgba(245,158,11,0.10)'
                      : undefined
                    const borderLeft = diff === 'changed' && here && colHere
                      ? '3px solid rgba(245,158,11,0.6)'
                      : '1px solid var(--border)'
                    return (
                      <td key={c.id} style={{ ...tdStyle, padding: '10px 12px', verticalAlign: 'top', borderLeft, background: cellBg }}>
                        {!here || !colHere ? (
                          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
                        ) : text ? (
                          <div style={{ fontSize: 12, lineHeight: 1.45, maxHeight: 96, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>{text}</div>
                        ) : cell?.state === 'error' ? (
                          <div style={{ fontSize: 11, color: 'var(--neg)', fontWeight: 700 }}>⚠ Error</div>
                        ) : (
                          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>(empty)</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(8,14,26,0.65)', zIndex: 1300 }} />
      <div role="dialog" aria-modal="true" aria-labelledby="snapshot-compare-title"
        style={{ position: 'fixed', top: '4vh', left: '4vw', right: '4vw', bottom: '4vh', zIndex: 1301, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Compare snapshot</div>
            <div id="snapshot-compare-title" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              {snapshot.label || 'Untitled snapshot'}
              <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 12, marginLeft: 8 }}>· frozen {new Date(snapshot.createdAt).toLocaleString()}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <DiffChip label={`Rows +${counts.rowsAdded} / −${counts.rowsRemoved}`} tone={(counts.rowsAdded || counts.rowsRemoved) ? 'warn' : 'neutral'} />
            <DiffChip label={`Cols +${counts.colsAdded} / −${counts.colsRemoved}`} tone={(counts.colsAdded || counts.colsRemoved) ? 'warn' : 'neutral'} />
            <DiffChip label={`${counts.cellsChanged} cell${counts.cellsChanged === 1 ? '' : 's'} changed`} tone={counts.cellsChanged ? 'warn' : 'neutral'} />
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => { void onRestore() }} style={primaryBtn} title="Replace the live grid with this frozen copy">↺ Restore snapshot</button>
            <button onClick={onClose} style={ghostBtn}>Close</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', minHeight: 0 }}>
            <div style={{ padding: '10px 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--text-muted)' }} />
              Snapshot · frozen
            </div>
            {renderTable('snapshot')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '10px 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent)' }} />
              Live · current
            </div>
            {renderTable('live')}
          </div>
        </div>
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', fontSize: 10.5, color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(245,158,11,0.4)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} /> changed text</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(16,185,129,0.4)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} /> added (only on live)</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(239,68,68,0.4)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} /> removed (only in snapshot)</span>
          <span style={{ marginLeft: 'auto' }}>Read-only · use Restore to overwrite the live grid</span>
        </div>
      </div>
    </>
  )
}

function DiffChip({ label, tone }: { label: string; tone: 'warn' | 'neutral' }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
      background: tone === 'warn' ? 'rgba(245,158,11,0.14)' : 'var(--bg-elevated)',
      color: tone === 'warn' ? 'var(--amber, #f59e0b)' : 'var(--text-secondary)',
      border: `1px solid ${tone === 'warn' ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
    }}>{label}</span>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '12px 14px', textAlign: 'center', fontSize: 11, fontWeight: 700,
  color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase',
  borderBottom: '1px solid var(--border)',
}
const tdStyle: React.CSSProperties = { padding: '14px 14px', textAlign: 'left', verticalAlign: 'middle' }
const ghostBtn: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const primaryBtn: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, background: 'var(--gradient-brand)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(27,79,255,0.3)' }
const miniBtn: React.CSSProperties = { padding: '6px 11px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const iconBtn: React.CSSProperties = { padding: '2px 6px', borderRadius: 4, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }
const kbd: React.CSSProperties = { display: 'inline-block', padding: '1px 5px', borderRadius: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'inherit', margin: '0 2px' }
