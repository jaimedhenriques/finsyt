'use client'

/**
 * Email-draft assistant
 * ---------------------
 * Surface inside Workspaces that takes a target list (Watchlist, saved Matrix
 * snapshot, or uploaded CSV), picks an outreach intent + recipient persona,
 * and generates one personalised, citation-backed email per target.
 *
 * Drafts are inline-editable. Each draft can be regenerated, copied to the
 * clipboard, downloaded as `.eml` (so the user's mail client opens a fresh
 * draft), pinned to the per-symbol research notebook, or exported alongside
 * every other draft as a single CSV.
 *
 * Streaming model: per-target POST to `/api/workspaces/outreach/draft`. The
 * page intentionally fans out one request per target with a small concurrency
 * cap so the UI stays responsive even with watchlists of 30-50 names.
 */

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Tabs,
  Input,
  Select,
  FieldLabel,
  EmptyState,
  Skeleton,
} from '@/components/ui'
import { useWatchlist } from '@/lib/use-watchlist'
import {
  OUTREACH_PERSONAS,
  OUTREACH_INTENTS,
  buildEml,
  draftsToCsv,
  parseTargetCsv,
  loadMatrixSnapshots,
  saveMatrixSnapshots,
  type GeneratedDraft,
  type MatrixSnapshot,
  type Target,
} from '@/lib/email-draft'

const CONCURRENCY = 3
// Next.js runs this app under basePath `/platform`, so a bare `/api/...` fetch
// from the browser would escape that prefix and miss the route entirely. Prefix
// every same-origin API call with the public base path.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''
type SourceTab = 'watchlist' | 'snapshot' | 'csv'

type DraftState = {
  status: 'idle' | 'generating' | 'ready' | 'error'
  draft?: GeneratedDraft
  error?: string
}

function downloadBlob(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safeFilename(s: string) {
  return s.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60) || 'draft'
}

function EmailDraftPageInner() {
  const search = useSearchParams()
  const wsParam = search.get('workspace')
  const seedSymbol = (search.get('symbol') || '').toUpperCase()

  // ─── target source ────────────────────────────────────────────────────────
  const [sourceTab, setSourceTab] = useState<SourceTab>('watchlist')
  const watchlist = useWatchlist()

  const [snapshots, setSnapshots] = useState<MatrixSnapshot[]>([])
  const [activeSnapshotId, setActiveSnapshotId] = useState<string>('')
  useEffect(() => {
    const list = loadMatrixSnapshots()
    setSnapshots(list)
    setActiveSnapshotId(prev => prev || list[0]?.id || '')
  }, [])

  const [csvTargets, setCsvTargets] = useState<Target[]>([])
  const [csvFilename, setCsvFilename] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Selected targets are derived from the active source. Users can de-select
  // individual rows before generating.
  const sourceTargets: Target[] = useMemo(() => {
    if (sourceTab === 'watchlist') {
      return watchlist.symbols.map(s => ({ symbol: s }))
    }
    if (sourceTab === 'snapshot') {
      const snap = snapshots.find(s => s.id === activeSnapshotId)
      return snap ? snap.symbols.map(s => ({ symbol: s.toUpperCase() })) : []
    }
    return csvTargets
  }, [sourceTab, watchlist.symbols, snapshots, activeSnapshotId, csvTargets])

  // Track which targets are selected. Default: all-on whenever the source set
  // changes shape. Stored as a Set for O(1) toggles.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    setSelected(new Set(sourceTargets.map(t => t.symbol)))
  }, [sourceTab, activeSnapshotId, csvFilename, watchlist.symbols.length, sourceTargets.length])

  // Optionally seed selection from `?symbol=`. This lets the workspaces chat
  // top bar deep-link straight into "draft an email about NVDA".
  useEffect(() => {
    if (!seedSymbol) return
    if (sourceTargets.some(t => t.symbol === seedSymbol)) {
      setSelected(new Set([seedSymbol]))
    }
  }, [seedSymbol, sourceTargets])

  // ─── persona & intent ─────────────────────────────────────────────────────
  const [personaId, setPersonaId] = useState<string>(OUTREACH_PERSONAS[0].id)
  const [intentId,  setIntentId]  = useState<string>(OUTREACH_INTENTS[0].id)
  const [fromName,  setFromName]  = useState<string>('')
  const [signature, setSignature] = useState<string>('')
  const [customGuidance, setCustomGuidance] = useState<string>('')

  // Persist sender prefs across sessions — the user only needs to set them once.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('finsyt:outreach:sender')
      if (raw) {
        const v = JSON.parse(raw)
        if (typeof v?.fromName  === 'string') setFromName(v.fromName)
        if (typeof v?.signature === 'string') setSignature(v.signature)
      }
    } catch { /* localStorage unavailable */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem('finsyt:outreach:sender', JSON.stringify({ fromName, signature })) } catch {}
  }, [fromName, signature])

  // ─── draft state ──────────────────────────────────────────────────────────
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({})
  const [pinningId, setPinningId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2400)
  }, [])

  const personasMap = useMemo(() => new Map(OUTREACH_PERSONAS.map(p => [p.id, p])), [])
  const intentsMap  = useMemo(() => new Map(OUTREACH_INTENTS.map(i => [i.id, i])),  [])
  const targetsMap  = useMemo(() => {
    const m = new Map<string, Target>()
    sourceTargets.forEach(t => m.set(t.symbol, t))
    return m
  }, [sourceTargets])

  const generateOne = useCallback(async (target: Target) => {
    setDrafts(prev => ({ ...prev, [target.symbol]: { ...prev[target.symbol], status: 'generating' } }))
    try {
      const res = await fetch(`${BASE}/api/workspaces/outreach/draft`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          symbol: target.symbol,
          companyName:    target.companyName,
          recipientName:  target.recipientName,
          recipientEmail: target.recipientEmail,
          notes:          target.notes,
          personaId,
          intentId,
          fromName,
          signature,
          customGuidance,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setDrafts(prev => ({ ...prev, [target.symbol]: { status: 'ready', draft: data.draft } }))
    } catch (err) {
      setDrafts(prev => ({ ...prev, [target.symbol]: { status: 'error', error: (err as Error).message } }))
    }
  }, [personaId, intentId, fromName, signature, customGuidance])

  const [generatingAll, setGeneratingAll] = useState(false)
  const generateAll = useCallback(async () => {
    const queue = sourceTargets.filter(t => selected.has(t.symbol))
    if (!queue.length) { showToast('Select at least one target.'); return }
    setGeneratingAll(true)
    // Mark all queued targets as pending up-front so the right pane shows the
    // skeleton immediately rather than appearing in waves.
    setDrafts(prev => {
      const next = { ...prev }
      queue.forEach(t => { next[t.symbol] = { ...next[t.symbol], status: 'generating' } })
      return next
    })
    let cursor = 0
    async function worker() {
      while (cursor < queue.length) {
        const idx = cursor++
        await generateOne(queue[idx])
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
    setGeneratingAll(false)
  }, [sourceTargets, selected, generateOne, showToast])

  // ─── per-draft actions ────────────────────────────────────────────────────
  const editDraft = useCallback((symbol: string, patch: Partial<GeneratedDraft>) => {
    setDrafts(prev => {
      const cur = prev[symbol]
      if (!cur?.draft) return prev
      return { ...prev, [symbol]: { ...cur, draft: { ...cur.draft, ...patch } } }
    })
  }, [])

  const copyDraft = useCallback(async (symbol: string) => {
    const d = drafts[symbol]?.draft
    if (!d) return
    const text = `Subject: ${d.subject}\n\n${d.body}`
    try { await navigator.clipboard.writeText(text); showToast(`Copied ${symbol} to clipboard`) }
    catch { showToast('Clipboard unavailable in this browser') }
  }, [drafts, showToast])

  const downloadEml = useCallback((symbol: string) => {
    const d = drafts[symbol]?.draft
    if (!d) return
    const t = targetsMap.get(symbol)
    const eml = buildEml({
      to: t?.recipientEmail,
      from: fromName ? fromName : undefined,
      subject: d.subject,
      body: d.body,
    })
    downloadBlob(`${safeFilename(symbol)}-${safeFilename(d.subject)}.eml`, 'message/rfc822', eml)
  }, [drafts, targetsMap, fromName])

  const pinToNotebook = useCallback(async (symbol: string) => {
    const d = drafts[symbol]?.draft
    if (!d) return
    setPinningId(symbol)
    try {
      const persona = personasMap.get(personaId)
      const intent  = intentsMap.get(intentId)
      const note = [
        `# Outreach draft — ${d.subject}`,
        ``,
        `**Persona:** ${persona?.label || personaId}`,
        `**Intent:** ${intent?.label || intentId}`,
        d.modelUsed ? `**Model:** ${d.modelUsed}` : '',
        ``,
        `## Subject`,
        d.subject,
        ``,
        `## Body`,
        d.body,
        ``,
        d.citations.length ? `## Citations` : '',
        ...d.citations.map(c => `- ${c}`),
      ].filter(Boolean).join('\n')

      const res = await fetch(`${BASE}/api/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          symbol,
          title: `Outreach draft — ${(intent?.label || 'email').slice(0, 60)}`,
          body: note,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      showToast(`Pinned ${symbol} draft to notebook`)
    } catch (err) {
      showToast(`Pin failed: ${(err as Error).message}`)
    } finally {
      setPinningId(null)
    }
  }, [drafts, personaId, intentId, personasMap, intentsMap, showToast])

  const exportCsv = useCallback(() => {
    const rows = Object.values(drafts)
      .map(s => s.draft)
      .filter((d): d is GeneratedDraft => !!d)
    if (!rows.length) { showToast('Generate at least one draft first.'); return }
    const csv = draftsToCsv(rows, targetsMap)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    downloadBlob(`finsyt-outreach-${stamp}.csv`, 'text/csv;charset=utf-8', csv)
  }, [drafts, targetsMap, showToast])

  // ─── CSV upload handler ───────────────────────────────────────────────────
  const onUpload = useCallback(async (file: File) => {
    const text = await file.text()
    const parsed = parseTargetCsv(text)
    if (!parsed.length) { showToast('No valid tickers found in CSV.'); return }
    setCsvTargets(parsed)
    setCsvFilename(file.name)
    setSourceTab('csv')
    showToast(`Loaded ${parsed.length} targets from ${file.name}`)
  }, [showToast])

  // ─── snapshot helpers ─────────────────────────────────────────────────────
  const saveCurrentAsSnapshot = useCallback(() => {
    if (sourceTab !== 'csv') return
    const name = window.prompt('Snapshot name?', csvFilename.replace(/\.csv$/i, '') || 'New snapshot')
    if (!name) return
    const next: MatrixSnapshot = {
      id: `snap-${Date.now()}`,
      name,
      symbols: csvTargets.map(t => t.symbol),
      createdAt: Date.now(),
    }
    const list = [next, ...snapshots]
    setSnapshots(list)
    saveMatrixSnapshots(list)
    setActiveSnapshotId(next.id)
    showToast(`Saved snapshot "${name}"`)
  }, [sourceTab, csvFilename, csvTargets, snapshots, showToast])

  // ─── derived counts ───────────────────────────────────────────────────────
  const counts = useMemo(() => {
    let ready = 0, gen = 0, err = 0
    Object.values(drafts).forEach(s => {
      if (s.status === 'ready')      ready++
      else if (s.status === 'generating') gen++
      else if (s.status === 'error') err++
    })
    return { ready, gen, err }
  }, [drafts])

  // ─── render ───────────────────────────────────────────────────────────────
  const persona = personasMap.get(personaId)
  const intent  = intentsMap.get(intentId)

  return (
    <div style={{ padding: '0 0 80px' }}>
      <PageHeader
        breadcrumbs={[
          { label: 'Workspaces', href: wsParam ? `/app/workspaces?id=${wsParam}` : '/app/workspaces' },
          { label: 'Outreach drafts' },
        ]}
        eyebrow="Outreach"
        title="Email-draft assistant"
        subtitle="Generate citation-backed outreach emails for a target list. Pick a persona, an intent, and let Finsyt draft one email per name — then edit, regenerate, export, or pin straight to the notebook."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!counts.ready}>Export CSV</Button>
            <Button variant="primary" onClick={generateAll} disabled={generatingAll || !sourceTargets.length}>
              {generatingAll ? 'Generating…' : `Generate ${selected.size || 'all'}`}
            </Button>
          </>
        }
        meta={
          <>
            <span>{sourceTargets.length} targets in source</span>
            <span>{selected.size} selected</span>
            <span>{counts.ready} ready</span>
            {counts.gen > 0 && <span style={{ color: 'var(--accent-text)' }}>{counts.gen} in flight</span>}
            {counts.err > 0 && <span style={{ color: 'var(--neg)' }}>{counts.err} failed</span>}
          </>
        }
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 380px) 1fr',
        gap: 20,
        padding: '20px 28px',
        alignItems: 'start',
      }}>
        {/* ── LEFT: setup + target list ───────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 20 }}>
          <Card padding={16}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <FieldLabel>Recipient persona</FieldLabel>
                <Select fieldSize="sm" value={personaId} onChange={e => setPersonaId(e.target.value)}>
                  {OUTREACH_PERSONAS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Select>
                {persona && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{persona.tone}</div>
                )}
              </div>

              <div>
                <FieldLabel>Outreach intent</FieldLabel>
                <Select fieldSize="sm" value={intentId} onChange={e => setIntentId(e.target.value)}>
                  {OUTREACH_INTENTS.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
                </Select>
                {intent && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{intent.description}</div>
                )}
              </div>

              <div>
                <FieldLabel>From (your name)</FieldLabel>
                <Input fieldSize="sm" placeholder="e.g. Jaime D'Henriques" value={fromName} onChange={e => setFromName(e.target.value)} />
              </div>

              <div>
                <FieldLabel>Signature (optional)</FieldLabel>
                <textarea
                  value={signature}
                  onChange={e => setSignature(e.target.value)}
                  placeholder={"Jaime\nHelix Holdings\n+44 ..."}
                  rows={3}
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1.5px solid var(--border)',
                    color: 'var(--text-primary)',
                    padding: '9px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit',
                    outline: 'none', resize: 'vertical', lineHeight: 1.5,
                  }}
                />
              </div>

              <div>
                <FieldLabel>Extra guidance (optional)</FieldLabel>
                <textarea
                  value={customGuidance}
                  onChange={e => setCustomGuidance(e.target.value)}
                  placeholder="e.g. focus on FCF inflection, mention recent guide cut…"
                  rows={2}
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1.5px solid var(--border)',
                    color: 'var(--text-primary)',
                    padding: '9px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit',
                    outline: 'none', resize: 'vertical', lineHeight: 1.5,
                  }}
                />
              </div>
            </div>
          </Card>

          <Card padding={0}>
            <Tabs
              value={sourceTab}
              onChange={(id) => setSourceTab(id as SourceTab)}
              items={[
                { id: 'watchlist', label: `Watchlist (${watchlist.symbols.length})` },
                { id: 'snapshot',  label: `Matrix snapshot${snapshots.length ? ` (${snapshots.length})` : ''}` },
                { id: 'csv',       label: `CSV${csvTargets.length ? ` (${csvTargets.length})` : ''}` },
              ]}
            />
            <div style={{ padding: 14 }}>
              {sourceTab === 'watchlist' && (
                <div>
                  {watchlist.loading ? (
                    <Skeleton width="100%" height={32} />
                  ) : watchlist.symbols.length === 0 ? (
                    <EmptyState title="Watchlist is empty" hint="Add tickers from the Watchlist page first." />
                  ) : (
                    <TargetList
                      targets={sourceTargets}
                      selected={selected}
                      onToggle={(s) => setSelected(prev => {
                        const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n
                      })}
                      onSelectAll={() => setSelected(new Set(sourceTargets.map(t => t.symbol)))}
                      onClear={() => setSelected(new Set())}
                      drafts={drafts}
                    />
                  )}
                </div>
              )}

              {sourceTab === 'snapshot' && (
                <div>
                  {snapshots.length === 0 ? (
                    <EmptyState title="No snapshots saved" hint="Upload a CSV first, then save it as a snapshot." />
                  ) : (
                    <>
                      <Select fieldSize="sm" value={activeSnapshotId} onChange={e => setActiveSnapshotId(e.target.value)} style={{ marginBottom: 10 }}>
                        {snapshots.map(s => <option key={s.id} value={s.id}>{s.name} ({s.symbols.length})</option>)}
                      </Select>
                      <TargetList
                        targets={sourceTargets}
                        selected={selected}
                        onToggle={(s) => setSelected(prev => {
                          const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n
                        })}
                        onSelectAll={() => setSelected(new Set(sourceTargets.map(t => t.symbol)))}
                        onClear={() => setSelected(new Set())}
                        drafts={drafts}
                      />
                    </>
                  )}
                </div>
              )}

              {sourceTab === 'csv' && (
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f) }}
                    style={{ display: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <Button size="sm" onClick={() => fileRef.current?.click()}>Upload CSV…</Button>
                    {csvTargets.length > 0 && <Button size="sm" variant="ghost" onClick={saveCurrentAsSnapshot}>Save as snapshot</Button>}
                  </div>
                  {csvFilename && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>{csvFilename} · {csvTargets.length} rows</div>
                  )}
                  {csvTargets.length === 0 ? (
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                      Expected headers: <code>symbol</code> (or <code>ticker</code>), and optionally <code>company</code>, <code>recipient</code>, <code>email</code>, <code>notes</code>. Headerless files assume column 1 is the ticker.
                    </div>
                  ) : (
                    <TargetList
                      targets={sourceTargets}
                      selected={selected}
                      onToggle={(s) => setSelected(prev => {
                        const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n
                      })}
                      onSelectAll={() => setSelected(new Set(sourceTargets.map(t => t.symbol)))}
                      onClear={() => setSelected(new Set())}
                      drafts={drafts}
                    />
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── RIGHT: drafts ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {selected.size === 0 ? (
            <Card><EmptyState title="Pick at least one target" hint="Choose a source on the left and select the names you want to draft for, then click Generate." /></Card>
          ) : (
            sourceTargets
              .filter(t => selected.has(t.symbol))
              .map(t => (
                <DraftCard
                  key={t.symbol}
                  target={t}
                  state={drafts[t.symbol]}
                  onRegenerate={() => generateOne(t)}
                  onEdit={(patch) => editDraft(t.symbol, patch)}
                  onCopy={() => copyDraft(t.symbol)}
                  onDownload={() => downloadEml(t.symbol)}
                  onPin={() => pinToNotebook(t.symbol)}
                  pinning={pinningId === t.symbol}
                />
              ))
          )}
        </div>
      </div>

      {toast && (
        <div role="status" style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card)', color: 'var(--text-primary)',
          border: '1px solid var(--border)', borderRadius: 10,
          padding: '10px 16px', fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 28px rgba(0,0,0,0.18)', zIndex: 50,
        }}>{toast}</div>
      )}
    </div>
  )
}

// ─── target list component ──────────────────────────────────────────────────
function TargetList({
  targets, selected, onToggle, onSelectAll, onClear, drafts,
}: {
  targets: Target[]
  selected: Set<string>
  onToggle: (s: string) => void
  onSelectAll: () => void
  onClear: () => void
  drafts: Record<string, DraftState>
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 11 }}>
        <span style={{ color: 'var(--text-muted)' }}>{selected.size} / {targets.length} selected</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onSelectAll}
            style={{ background: 'none', border: 'none', color: 'var(--accent-text)', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '2px 4px' }}>
            All
          </button>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <button onClick={onClear}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '2px 4px' }}>
            None
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
        {targets.map(t => {
          const isOn = selected.has(t.symbol)
          const st = drafts[t.symbol]?.status
          return (
            <label key={t.symbol} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 10px', borderRadius: 6,
              background: isOn ? 'rgba(27,79,255,0.06)' : 'transparent',
              cursor: 'pointer', fontSize: 12,
            }}>
              <input type="checkbox" checked={isOn} onChange={() => onToggle(t.symbol)} />
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', minWidth: 60 }}>{t.symbol}</span>
              <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.companyName || t.recipientName || ''}
              </span>
              {st === 'generating' && <Badge tone="blue">…</Badge>}
              {st === 'ready'      && <Badge tone="green">✓</Badge>}
              {st === 'error'      && <Badge tone="red">!</Badge>}
            </label>
          )
        })}
      </div>
    </div>
  )
}

// ─── per-draft card ─────────────────────────────────────────────────────────
function DraftCard({
  target, state, onRegenerate, onEdit, onCopy, onDownload, onPin, pinning,
}: {
  target: Target
  state?: DraftState
  onRegenerate: () => void
  onEdit: (patch: Partial<GeneratedDraft>) => void
  onCopy: () => void
  onDownload: () => void
  onPin: () => void
  pinning: boolean
}) {
  const status = state?.status || 'idle'
  const d = state?.draft

  return (
    <Card padding={0}>
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>{target.symbol}</div>
        {target.companyName && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{target.companyName}</span>}
        {target.recipientName && <Badge tone="violet">{target.recipientName}</Badge>}
        {d?.modelUsed && <Badge tone="gray">{d.modelUsed}</Badge>}
        {d?.hasLiveData && <Badge tone="green">live data</Badge>}
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" onClick={onRegenerate} disabled={status === 'generating'}>
          {status === 'generating' ? 'Generating…' : status === 'ready' ? 'Regenerate' : 'Generate'}
        </Button>
        {status === 'ready' && (
          <>
            <Button size="sm" variant="ghost" onClick={onCopy}>Copy</Button>
            <Button size="sm" variant="ghost" onClick={onDownload}>Download .eml</Button>
            <Button size="sm" variant="secondary" onClick={onPin} disabled={pinning}>
              {pinning ? 'Pinning…' : 'Pin to notebook'}
            </Button>
          </>
        )}
      </div>

      <div style={{ padding: 16 }}>
        {status === 'idle' && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Click <strong>Generate</strong> above (or use <strong>Generate {`{n}`}</strong> in the header) to draft an email for this target.
          </div>
        )}
        {status === 'generating' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="100%" height={12} />
            <Skeleton width="100%" height={12} />
            <Skeleton width="92%" height={12} />
            <Skeleton width="78%" height={12} />
          </div>
        )}
        {status === 'error' && (
          <div style={{ fontSize: 12, color: 'var(--neg)' }}>
            Failed: {state?.error || 'unknown error'} — try Regenerate.
          </div>
        )}
        {status === 'ready' && d && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <FieldLabel>Subject</FieldLabel>
              <Input
                fieldSize="sm"
                value={d.subject}
                onChange={e => onEdit({ subject: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel>Body</FieldLabel>
              <textarea
                value={d.body}
                onChange={e => onEdit({ body: e.target.value })}
                rows={Math.min(18, Math.max(8, d.body.split('\n').length + 2))}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1.5px solid var(--border)',
                  color: 'var(--text-primary)',
                  padding: '10px 12px', borderRadius: 8,
                  fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit',
                  outline: 'none', resize: 'vertical',
                }}
              />
            </div>
            {d.citations.length > 0 && (
              <div>
                <FieldLabel>Citations</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {d.citations.map((c, i) => (
                    <span key={i} style={{
                      fontSize: 11, padding: '3px 9px', borderRadius: 999,
                      background: 'rgba(27,79,255,0.10)', color: 'var(--accent-text)', fontWeight: 600,
                    }}>{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── default export ─────────────────────────────────────────────────────────
// `useSearchParams` must sit inside a Suspense boundary in app router.
export default function EmailDraftPage() {
  return (
    <Suspense fallback={<div style={{ padding: 28, color: 'var(--text-muted)' }}>Loading…</div>}>
      <EmailDraftPageInner />
    </Suspense>
  )
}
