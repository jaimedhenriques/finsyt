'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Badge, Drawer } from '@/components/ui'
import PeerSelectedTable from '@/components/peers/PeerSelectedTable'
import { AltDataSection, FocusPicker, AltDataCitationView, usePersistentFocusSymbol, type AltDataCitation } from '@/components/alt-data/cards'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

type PeerSet = {
  id: string
  name: string
  description: string
  authorUserId: string
  symbols: string[]
  createdAt: number
  updatedAt: number
}

export default function PeersPage() {
  const [sets, setSets] = useState<PeerSet[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [seedBusy, setSeedBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [newName, setNewName] = useState('')
  const [newSymbols, setNewSymbols] = useState('')
  const [me, setMe] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportErr, setExportErr] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${BASE}/api/peers/me`).then(async (r) => {
      if (!r.ok) return
      try { const j = await r.json(); setMe(j?.userId ?? null) } catch {}
    }).catch(() => {})
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`${BASE}/api/peers/sets`)
      if (!r.ok) { setSets([]); return }
      const j = await r.json()
      setSets(j.sets ?? [])
      if (j.sets?.length && !activeId) setActiveId(j.sets[0].id)
    } finally {
      setLoading(false)
    }
  }, [activeId])

  useEffect(() => { reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const active = useMemo(() => sets?.find((s) => s.id === activeId) || null, [sets, activeId])
  const isOwner = !!(active && me && active.authorUserId === me)

  // Focus ticker for the alt-data cards (one ticker → one Apify run).
  const { focusSymbol, setFocusSymbol, reconcileFocus } = usePersistentFocusSymbol('finsyt.focus.peers')
  useEffect(() => {
    reconcileFocus(active?.symbols ?? [])
  }, [active?.id, active?.symbols, reconcileFocus])

  // Shared citation drawer for the alt-data cards (parity with company page).
  const [citation, setCitation] = useState<{ open: boolean; label: string; body: string; source?: AltDataCitation }>({ open: false, label: '', body: '' })

  async function handleExportDeck() {
    if (!active) return
    setExportBusy(true)
    setExportErr(null)
    try {
      const r = await fetch(`${BASE}/api/copilot/deck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: 'peer-comparison',
          peerSetId: active.id,
          setName: active.name,
          subject: focusSymbol || undefined,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'Deck export failed')
      if (j?.downloadUrl) window.location.assign(j.downloadUrl)
      else throw new Error('Deck export returned no download link')
    } catch (e) {
      setExportErr(String((e as Error)?.message || e))
    } finally {
      setExportBusy(false)
    }
  }

  async function handleSeed() {
    setSeedBusy(true)
    try {
      const r = await fetch(`${BASE}/api/peers/seed`, { method: 'POST' })
      if (r.ok) await reload()
    } finally {
      setSeedBusy(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const symbols = newSymbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    setCreating(true)
    try {
      const r = await fetch(`${BASE}/api/peers/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), symbols }),
      })
      if (r.ok) {
        const j = await r.json()
        setNewName(''); setNewSymbols('')
        await reload()
        if (j?.set?.id) setActiveId(j.set.id)
      }
    } finally {
      setCreating(false)
    }
  }

  async function handleRename(setId: string) {
    const name = editingName.trim()
    if (!name) return
    const r = await fetch(`${BASE}/api/peers/sets/${setId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (r.ok) { setEditingId(null); await reload() }
  }

  async function handleDelete(setId: string) {
    if (!confirm('Delete this peer set? This cannot be undone.')) return
    const r = await fetch(`${BASE}/api/peers/sets/${setId}`, { method: 'DELETE' })
    if (r.ok || r.status === 204) {
      if (activeId === setId) setActiveId(null)
      await reload()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Peers</h1>
          <Badge tone="violet">workspace</Badge>
        </div>
        <p style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>
          Build reusable peer baskets for relative-value work. Sets are visible to your whole workspace; only you can edit a basket you created.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* ── LEFT: peer-set list ─────────────────────────────────────────── */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              My peer sets
            </div>
            {sets && sets.length === 0 && (
              <button onClick={handleSeed} disabled={seedBusy}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 11, fontWeight: 700, cursor: seedBusy ? 'wait' : 'pointer' }}>
                {seedBusy ? 'Seeding…' : '+ Starter sets'}
              </button>
            )}
          </div>

          <div style={{ maxHeight: 480, overflow: 'auto' }}>
            {loading && (
              <div style={{ padding: 14 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 36, marginBottom: 8, borderRadius: 6 }} />
                ))}
              </div>
            )}
            {!loading && sets && sets.length === 0 && (
              <div style={{ padding: 18, fontSize: 13, color: 'var(--text-muted)' }}>
                You don&apos;t have any peer sets yet. Click <strong>+ Starter sets</strong> for six curated baskets, or create your own below.
              </div>
            )}
            {!loading && sets?.map((s) => (
              <button key={s.id} onClick={() => setActiveId(s.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 14px', border: 'none', borderBottom: '1px solid var(--border)',
                  background: activeId === s.id ? 'rgba(99, 102, 241, 0.06)' : 'transparent',
                  cursor: 'pointer', color: 'var(--text-primary)',
                }}>
                {editingId === s.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); handleRename(s.id) }} style={{ display: 'flex', gap: 4 }}>
                    <input value={editingName} onChange={(e) => setEditingName(e.target.value)} autoFocus
                      style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                    <button type="submit" style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                    <button type="button" onClick={() => setEditingId(null)} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>×</button>
                  </form>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{s.symbols.length} ticker{s.symbols.length === 1 ? '' : 's'}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.symbols.slice(0, 6).join(' · ') || 'Empty set'}
                    </div>
                    {me && s.authorUserId === me && activeId === s.id && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <button onClick={(e) => { e.stopPropagation(); setEditingId(s.id); setEditingName(s.name) }}
                          style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Rename</button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id) }}
                          style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: '#b91c1c', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
                      </div>
                    )}
                  </>
                )}
              </button>
            ))}
          </div>

          <form onSubmit={handleCreate} style={{ borderTop: '1px solid var(--border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>+ New peer set</div>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name (e.g. Cybersecurity SaaS)"
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
            <input value={newSymbols} onChange={(e) => setNewSymbols(e.target.value.toUpperCase())} placeholder="Tickers (comma-separated)"
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
            <button type="submit" disabled={!newName.trim() || creating}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: newName.trim() ? 'pointer' : 'not-allowed', opacity: newName.trim() ? 1 : 0.6 }}>
              {creating ? 'Creating…' : 'Create set'}
            </button>
          </form>
        </Card>

        {/* ── RIGHT: active peer set comparison table ─────────────────────── */}
        <div>
          {!active && !loading && (
            <Card style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
              Pick a peer set on the left to see the institutional comparison table.
            </Card>
          )}
          {active && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              {exportErr && <span style={{ fontSize: 11, color: '#b91c1c' }}>{exportErr}</span>}
              <button
                onClick={handleExportDeck}
                disabled={exportBusy || active.symbols.length === 0}
                title={active.symbols.length === 0 ? 'Add at least one ticker to export' : 'Export this peer set to a branded pitch deck (.pptx)'}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: exportBusy || active.symbols.length === 0 ? 'not-allowed' : 'pointer', opacity: exportBusy || active.symbols.length === 0 ? 0.6 : 1 }}>
                {exportBusy ? 'Exporting…' : '⬇ Export to pitch deck'}
              </button>
            </div>
          )}
          {active && (
            <PeerSelectedTable
              key={active.id}
              setId={active.id}
              title={active.name}
              subtitle={active.description || `${active.symbols.length} member${active.symbols.length === 1 ? '' : 's'}`}
              editable={isOwner}
              ownedSetId={isOwner ? active.id : null}
              csvBaseName={`peers-${active.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
              onSelectSymbol={setFocusSymbol}
              activeSymbol={focusSymbol}
            />
          )}

          {active && active.symbols.length > 0 && focusSymbol && (
            <div style={{ marginTop: 18 }}>
              <FocusPicker label="Alt-data for" symbols={active.symbols} value={focusSymbol} onChange={setFocusSymbol} />
              <AltDataSection symbol={focusSymbol} companyName={focusSymbol} onCite={(label, body, source) => setCitation({ open: true, label, body, source })} />
            </div>
          )}
        </div>
      </div>

      {/* Citation drawer — structured source view (provider, link, key fields, retrieved-at) */}
      <Drawer open={citation.open} onClose={() => setCitation({ open: false, label: '', body: '' })} title={citation.label || 'Source'} width={460}>
        {citation.source ? (
          <AltDataCitationView source={citation.source} />
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Source citation · provider record.
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {citation.body || 'No additional context available for this citation.'}
            </div>
          </>
        )}
      </Drawer>
    </div>
  )
}
