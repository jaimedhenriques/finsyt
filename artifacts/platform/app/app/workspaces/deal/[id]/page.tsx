'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Tabs } from '@/components/ui'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// ── Types ───────────────────────────────────────────────────────────────────
type StaleSurface = 'memo' | 'deck' | 'valuation'
type QueueStatus = 'queued' | 'running' | 'ok' | 'error'

interface BlueprintQueueItem {
  slug: string
  label?: string
  runId?: string
  status?: QueueStatus
  queuedAt: number
  completedAt?: number
  note?: string
}

interface DealMetadata {
  templateVersion?: number
  targetSymbol?: string
  targetName?: string
  peerSetId?: string
  blueprintQueue?: BlueprintQueueItem[]
  latestMemoFileId?: string
  latestMemoAt?: number
  latestDeckFileId?: string
  latestDeckAt?: number
  staleSurfaces?: StaleSurface[]
  clonedFromWorkspaceId?: string
}

interface WorkspaceDto {
  id: string
  name: string
  description: string
  kind: string
  targetSymbol: string | null
  metadata: DealMetadata
  authorUserId: string
  createdAt: string
  updatedAt: string
  mine: boolean
}

interface PeerSetDto {
  id: string
  name: string
  description: string
  symbols: string[]
  authorUserId: string
}

interface TeamMember {
  membershipId: string
  userId: string | null
  name: string
  email: string | null
  role: string
}

interface AuditEvent {
  id: string
  action: string
  resourceId?: string | null
  metadata?: Record<string, unknown> | null
  createdAt: string
  actorId?: string | null
}

// ── Tab keys ────────────────────────────────────────────────────────────────
type DealTab = 'overview' | 'notebook' | 'peers' | 'valuation' | 'memo' | 'deck' | 'blueprints' | 'team' | 'activity'

const TABS: { id: DealTab; label: string }[] = [
  { id: 'overview',   label: 'Overview'   },
  { id: 'notebook',   label: 'Notebook'   },
  { id: 'peers',      label: 'Peers'      },
  { id: 'valuation',  label: 'Valuation'  },
  { id: 'memo',       label: 'Memo'       },
  { id: 'deck',       label: 'Deck'       },
  { id: 'blueprints', label: 'Blueprints' },
  { id: 'team',       label: 'Team'       },
  { id: 'activity',   label: 'Activity'   },
]

// Helper: small primitives
function StaleBadge({ stale }: { stale: boolean }) {
  return stale
    ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#FEF3C7', color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Out of date</span>
    : <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#D1FAE5', color: '#065F46', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Up to date</span>
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { style, ...rest } = props
  return <button {...rest} style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: 'var(--gradient-brand)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', ...style }} />
}

function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { style, ...rest } = props
  return <button {...rest} style={{ padding: '8px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer', ...style }} />
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function DealWorkspacePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id

  const [workspace, setWorkspace] = useState<WorkspaceDto | null>(null)
  const [peerSet, setPeerSet] = useState<PeerSetDto | null>(null)
  const [team, setTeam] = useState<TeamMember[]>([])
  const [activity, setActivity] = useState<AuditEvent[]>([])
  const [tab, setTab] = useState<DealTab>('overview')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [memoBusy, setMemoBusy] = useState(false)
  const [deckBusy, setDeckBusy] = useState(false)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneSymbol, setCloneSymbol] = useState('')
  const [cloneBusy, setCloneBusy] = useState(false)

  const targetSymbol = workspace?.targetSymbol || workspace?.metadata?.targetSymbol || ''

  const refreshWorkspace = useCallback(async () => {
    if (!id) return
    const res = await fetch(`${BASE}/api/workspaces`, { cache: 'no-store' })
    if (!res.ok) {
      setError(res.status === 401 ? 'Sign in to load this workspace' : `Could not load workspace (${res.status})`)
      return
    }
    const data: { workspaces?: WorkspaceDto[] } = await res.json().catch(() => ({}))
    const found = (data.workspaces ?? []).find((w) => w.id === id)
    if (!found) { setError('Workspace not found'); return }
    if (found.kind !== 'deal') {
      // Non-deal workspaces should never end up here — bounce to the list.
      router.replace(`${BASE}/app/workspaces`)
      return
    }
    setWorkspace(found)
  }, [id, router])

  // Initial hydration: workspace + peer set + team + activity in parallel.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        await refreshWorkspace()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    ;(async () => {
      try {
        const r = await fetch(`${BASE}/api/team`, { cache: 'no-store' })
        if (!r.ok) return
        const d: { members?: TeamMember[] } = await r.json().catch(() => ({}))
        if (!cancelled && Array.isArray(d.members)) setTeam(d.members)
      } catch { /* non-fatal */ }
    })()
    return () => { cancelled = true }
  }, [id, refreshWorkspace])

  // Load peer set members once we know the peerSetId.
  useEffect(() => {
    const peerSetId = workspace?.metadata?.peerSetId
    if (!peerSetId) { setPeerSet(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`${BASE}/api/peers/sets`, { cache: 'no-store' })
        if (!r.ok) return
        const d: { sets?: PeerSetDto[] } = await r.json().catch(() => ({}))
        const found = (d.sets ?? []).find((s) => s.id === peerSetId)
        if (!cancelled && found) setPeerSet(found)
      } catch { /* non-fatal */ }
    })()
    return () => { cancelled = true }
  }, [workspace?.metadata?.peerSetId])

  // Load activity (audit events filtered to this workspace). The Team tab
  // also derives per-member last-activity from this feed, so we load it for
  // both tabs eagerly (the activity tab gets the freshest fetch on switch).
  useEffect(() => {
    if (!id) return
    if (tab !== 'activity' && tab !== 'team') return
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`${BASE}/api/audit?resourceType=workspace&resourceId=${encodeURIComponent(id)}&limit=100`, { cache: 'no-store' })
        if (!r.ok) return
        const d: { events?: AuditEvent[] } = await r.json().catch(() => ({}))
        if (!cancelled && Array.isArray(d.events)) setActivity(d.events)
      } catch { /* non-fatal */ }
    })()
    return () => { cancelled = true }
  }, [tab, id])

  const stale = useMemo(() => new Set<StaleSurface>(workspace?.metadata?.staleSurfaces ?? []), [workspace])

  const patchMetadata = useCallback(async (patch: Partial<DealMetadata>) => {
    if (!workspace) return
    const next: DealMetadata = { ...(workspace.metadata ?? {}), ...patch }
    const res = await fetch(`${BASE}/api/workspaces?id=${encodeURIComponent(workspace.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: next }),
    })
    if (res.ok) {
      const data: { workspace?: WorkspaceDto } = await res.json().catch(() => ({}))
      if (data.workspace) setWorkspace(data.workspace)
      return true
    }
    const d = await res.json().catch(() => ({}))
    setError(
      res.status === 403
        ? "You don't have permission to update this deal workspace's metadata."
        : d?.error || `Could not update workspace (${res.status}).`,
    )
    return false
  }, [workspace])

  // Internal deck regen step. Returns the fileId on success or null on
  // failure. Used by both the manual "Refresh deck" button and the memo
  // regen cascade (memo→deck), so it does NOT touch metadata itself —
  // the caller is responsible for merging the new fileId / stale flags.
  const runDeckGeneration = useCallback(async (): Promise<string | null> => {
    if (!targetSymbol) return null
    const res = await fetch(`${BASE}/api/copilot/deck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: targetSymbol, template: 'banker-pitch' }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error || `Deck generation failed (${res.status})`)
      return null
    }
    const d: { fileId?: string } = await res.json().catch(() => ({}))
    return d.fileId ?? null
  }, [targetSymbol])

  const regenerateMemo = useCallback(async () => {
    if (!targetSymbol || memoBusy) return
    setMemoBusy(true)
    // Mark deck busy too — regenerating the memo automatically cascades into
    // a deck regen so the two artifacts stay in sync. The UI shows both
    // buttons as busy through the chained operation.
    setDeckBusy(true)
    try {
      const res = await fetch(`${BASE}/api/copilot/memo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: targetSymbol }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error || `Memo generation failed (${res.status})`)
        return
      }
      const d: { fileId?: string } = await res.json().catch(() => ({}))
      const memoAt = Date.now()

      // Cascade into a deck regen so the two artifacts always stay aligned.
      // If deck regen fails we fall back to flagging deck as stale so the
      // team knows it still needs a refresh.
      const deckFileId = await runDeckGeneration()
      const cur = new Set<StaleSurface>(workspace?.metadata?.staleSurfaces ?? [])
      cur.delete('memo')
      if (deckFileId) cur.delete('deck')
      else            cur.add('deck')

      await patchMetadata({
        latestMemoFileId: d.fileId,
        latestMemoAt: memoAt,
        ...(deckFileId ? { latestDeckFileId: deckFileId, latestDeckAt: Date.now() } : {}),
        staleSurfaces: Array.from(cur),
      })
    } finally {
      setMemoBusy(false)
      setDeckBusy(false)
    }
  }, [targetSymbol, memoBusy, workspace, patchMetadata, runDeckGeneration])

  const regenerateDeck = useCallback(async () => {
    if (!targetSymbol || deckBusy) return
    setDeckBusy(true)
    try {
      const fileId = await runDeckGeneration()
      if (!fileId) return
      const remaining = (workspace?.metadata?.staleSurfaces ?? []).filter((s) => s !== 'deck')
      await patchMetadata({
        latestDeckFileId: fileId,
        latestDeckAt: Date.now(),
        staleSurfaces: remaining,
      })
    } finally {
      setDeckBusy(false)
    }
  }, [targetSymbol, deckBusy, workspace, patchMetadata, runDeckGeneration])

  const cloneToNewTarget = useCallback(async () => {
    if (!workspace || !cloneSymbol.trim() || cloneBusy) return
    setCloneBusy(true)
    try {
      // Same dual-shape rule as the New-Workspace modal: a UUID becomes
      // targetCompanyId, anything else is treated as a public ticker.
      const raw = cloneSymbol.trim()
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
      const targetField = isUuid
        ? { targetCompanyId: raw }
        : { targetSymbol: raw.toUpperCase() }
      const res = await fetch(`${BASE}/api/workspaces/${encodeURIComponent(workspace.id)}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetField),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error || `Clone failed (${res.status})`)
        return
      }
      const d: { workspace?: { id?: string } } = await res.json().catch(() => ({}))
      if (d.workspace?.id) {
        router.push(`${BASE}/app/workspaces/deal/${d.workspace.id}`)
      }
    } finally {
      setCloneBusy(false)
      setCloneOpen(false)
    }
  }, [workspace, cloneSymbol, cloneBusy, router])

  const markPeersChanged = useCallback(async () => {
    if (!workspace) return
    await fetch(`${BASE}/api/workspaces/${encodeURIComponent(workspace.id)}/mark-stale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ surfaces: ['memo', 'deck', 'valuation'], reason: 'peer set updated' }),
    }).catch(() => undefined)
    await refreshWorkspace()
  }, [workspace, refreshWorkspace])

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading deal workspace…</div>
  }
  if (error || !workspace) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--neg)', fontSize: 13, marginBottom: 12 }}>{error || 'Workspace unavailable'}</p>
        <Link href={`${BASE}/app/workspaces`} style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>← Back to Workspaces</Link>
      </div>
    )
  }

  const queue = workspace.metadata?.blueprintQueue ?? []

  return (
    <div style={{ padding: '1.5rem 1.75rem 4rem', maxWidth: 1300, margin: '0 auto' }}>
      {/* Breadcrumb + back */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        <Link href={`${BASE}/app/workspaces`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Workspaces</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Deal team · {targetSymbol}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 18, flexShrink: 0 }}>
          {targetSymbol[0] || 'D'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{workspace.name}</h1>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(124,58,237,0.12)', color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deal team</span>
            {targetSymbol && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: 'var(--bg-card-alt)', color: 'var(--text-primary)' }}>{targetSymbol}</span>}
            {workspace.metadata?.clonedFromWorkspaceId && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>cloned from prior cycle</span>}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{workspace.description}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <GhostButton onClick={() => setCloneOpen(true)} title="Clone this workspace for a new target">⎘ Clone for new target</GhostButton>
          {targetSymbol && (
            <Link href={`${BASE}/app/company/${encodeURIComponent(targetSymbol)}`} style={{ padding: '8px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              Company page →
            </Link>
          )}
        </div>
      </div>

      {/* Stale callout */}
      {stale.size > 0 && (
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: '#FEF3C7', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: '#92400E' }}>
            <strong>Inputs changed.</strong>{' '}
            {Array.from(stale).join(', ')} {stale.size === 1 ? 'is' : 'are'} out of date — re-run when ready.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {stale.has('memo') && <PrimaryButton onClick={regenerateMemo} disabled={memoBusy} style={{ padding: '6px 12px', fontSize: 12 }}>{memoBusy ? 'Refreshing memo…' : 'Refresh memo'}</PrimaryButton>}
            {stale.has('deck') && <PrimaryButton onClick={regenerateDeck} disabled={deckBusy} style={{ padding: '6px 12px', fontSize: 12 }}>{deckBusy ? 'Refreshing deck…' : 'Refresh deck'}</PrimaryButton>}
            {stale.has('valuation') && targetSymbol && (
              <Link href={`${BASE}/app/valuations/${encodeURIComponent(targetSymbol)}`} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--gradient-brand)', color: '#fff', fontWeight: 700, fontSize: 12, textDecoration: 'none' }}>Open valuation</Link>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ marginBottom: 18 }}>
        <Tabs sticky value={tab} onChange={(v) => setTab(v as DealTab)} items={TABS} />
      </div>

      {tab === 'overview' && (
        <OverviewTab
          workspace={workspace}
          peerSet={peerSet}
          team={team}
          stale={stale}
          onJump={setTab}
          memoAt={workspace.metadata?.latestMemoAt}
          deckAt={workspace.metadata?.latestDeckAt}
        />
      )}

      {tab === 'notebook' && (
        <NotebookTab workspaceId={workspace.id} />
      )}

      {tab === 'peers' && (
        <PeersTab peerSet={peerSet} targetSymbol={targetSymbol} onPeersChanged={markPeersChanged} />
      )}

      {tab === 'valuation' && (
        <DeepLinkTab
          title={`Valuation workbench · ${targetSymbol}`}
          description="DCF, comps and trading multiples for the target. Edits to the peer set automatically flag the memo and deck as out of date."
          href={`${BASE}/app/valuations/${encodeURIComponent(targetSymbol)}`}
          ctaLabel="Open valuation →"
          stale={stale.has('valuation')}
        />
      )}

      {tab === 'memo' && (
        <MemoTab
          metadata={workspace.metadata ?? {}}
          stale={stale.has('memo')}
          busy={memoBusy}
          onRegenerate={regenerateMemo}
        />
      )}

      {tab === 'deck' && (
        <DeckTab
          metadata={workspace.metadata ?? {}}
          stale={stale.has('deck')}
          busy={deckBusy}
          onRegenerate={regenerateDeck}
        />
      )}

      {tab === 'blueprints' && (
        <BlueprintsTab queue={queue} targetSymbol={targetSymbol} peerSet={peerSet} />
      )}

      {tab === 'team' && (
        <TeamTab team={team} workspace={workspace} activity={activity} stale={stale} />
      )}

      {tab === 'activity' && (
        <ActivityTab events={activity} />
      )}

      {/* Clone modal */}
      {cloneOpen && (
        <>
          <div onClick={() => setCloneOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(8,14,26,0.4)', zIndex: 1000 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1001, width: 420, maxWidth: 'calc(100vw - 32px)', background: '#fff', borderRadius: 16, boxShadow: '0 16px 64px rgba(0,0,0,0.18)', padding: 22 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>Clone for a new target</h2>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 14 }}>Spins up a fresh deal workspace with the same peer set and blueprint queue, anchored to the new ticker. Comments and chat history aren't copied.</p>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#4A5568', display: 'block', marginBottom: 6 }}>New target ticker</label>
            <input
              autoFocus
              value={cloneSymbol}
              onChange={(e) => setCloneSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. AMD"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #E2E8F2', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <GhostButton style={{ flex: 1 }} onClick={() => setCloneOpen(false)}>Cancel</GhostButton>
              <PrimaryButton style={{ flex: 2 }} onClick={cloneToNewTarget} disabled={!cloneSymbol.trim() || cloneBusy}>{cloneBusy ? 'Cloning…' : 'Clone workspace'}</PrimaryButton>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Subviews ────────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="card" style={{ padding: 18, borderRadius: 14, background: '#fff', border: '1px solid var(--border)', ...style }}>{children}</div>
}

function OverviewTab({
  workspace, peerSet, team, stale, onJump, memoAt, deckAt,
}: {
  workspace: WorkspaceDto
  peerSet: PeerSetDto | null
  team: TeamMember[]
  stale: Set<StaleSurface>
  onJump: (t: DealTab) => void
  memoAt?: number
  deckAt?: number
}) {
  const queue = workspace.metadata?.blueprintQueue ?? []
  const queuedCount = queue.filter((q) => q.status === 'queued').length
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
      <Card>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Notebook</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>Persistent thread for findings, hypotheses and citations bound to the target.</p>
        <button onClick={() => onJump('notebook')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Open notebook →</button>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Peer set</div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{peerSet?.symbols.length ?? 0} peers</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, minHeight: 36 }}>{peerSet?.symbols.slice(0, 8).join(' · ') || 'No peers seeded yet.'}</p>
        <button onClick={() => onJump('peers')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Edit peer set →</button>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Memo</div>
          <StaleBadge stale={stale.has('memo')} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>{memoAt ? `Last generated ${new Date(memoAt).toLocaleString()}` : 'No memo generated yet.'}</p>
        <button onClick={() => onJump('memo')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Open memo →</button>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Deck</div>
          <StaleBadge stale={stale.has('deck')} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>{deckAt ? `Last generated ${new Date(deckAt).toLocaleString()}` : 'No deck generated yet.'}</p>
        <button onClick={() => onJump('deck')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Open deck →</button>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Blueprint queue</div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{queuedCount} queued</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>Pre-seeded playbooks ready to fan out across the deal team.</p>
        <button onClick={() => onJump('blueprints')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>View queue →</button>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Team</div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{team.length} members</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>{team.slice(0, 3).map((m) => m.name).join(', ') || 'No teammates yet.'}{team.length > 3 ? ` +${team.length - 3}` : ''}</p>
        <button onClick={() => onJump('team')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>See team view →</button>
      </Card>
    </div>
  )
}

function NotebookTab({ workspaceId }: { workspaceId: string }) {
  return (
    <Card>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
        The notebook is the persistent AI research thread for this deal — the same engine that powers a research workspace, scoped to the target ticker.
      </div>
      <Link
        href={`${BASE}/app/workspaces?open=${encodeURIComponent(workspaceId)}`}
        style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 10, background: 'var(--gradient-brand)', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}
      >
        Open notebook chat →
      </Link>
    </Card>
  )
}

function PeersTab({ peerSet, targetSymbol, onPeersChanged }: { peerSet: PeerSetDto | null; targetSymbol: string; onPeersChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editing && peerSet) setDraft(peerSet.symbols.join(', '))
  }, [editing, peerSet])

  if (!peerSet) {
    return <Card><div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No peer set is wired to this workspace yet.</div></Card>
  }

  async function save() {
    if (!peerSet || saving) return
    const symbols = Array.from(new Set(draft.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))).slice(0, 30)
    setSaving(true)
    try {
      // Replace the peer set's name+symbols via PATCH if available; otherwise
      // recreate via POST. Today the peers/sets API only exposes POST + GET,
      // so we surface a deep link to the dedicated peers editor instead.
      const res = await fetch(`${BASE}/api/peers/sets/${encodeURIComponent(peerSet.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      })
      if (res.ok) {
        onPeersChanged()
        setEditing(false)
      } else {
        // Fallback: just open the peers editor.
        window.open(`${BASE}/app/peers?set=${encodeURIComponent(peerSet.id)}`, '_blank', 'noopener')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{peerSet.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{peerSet.symbols.length} peers · target {targetSymbol}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`${BASE}/app/peers?set=${encodeURIComponent(peerSet.id)}`} style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 12, textDecoration: 'none' }}>Open in Peers →</Link>
            {!editing && <PrimaryButton onClick={() => setEditing(true)} style={{ padding: '6px 12px', fontSize: 12 }}>Edit</PrimaryButton>}
          </div>
        </div>
        {!editing ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {peerSet.symbols.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No peers seeded.</span>}
            {peerSet.symbols.map((s) => (
              <span key={s} style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'var(--bg-card-alt)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>{s}</span>
            ))}
          </div>
        ) : (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.toUpperCase())}
              placeholder="AAPL, MSFT, GOOGL, AMZN, META"
              rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #E2E8F2', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase', marginBottom: 10 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <GhostButton onClick={() => setEditing(false)} style={{ padding: '6px 12px', fontSize: 12 }}>Cancel</GhostButton>
              <PrimaryButton onClick={save} disabled={saving} style={{ padding: '6px 12px', fontSize: 12 }}>{saving ? 'Saving…' : 'Save peers'}</PrimaryButton>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>Saving this list will mark the memo and deck as out of date.</div>
          </>
        )}
      </Card>
    </div>
  )
}

function DeepLinkTab({ title, description, href, ctaLabel, stale }: { title: string; description: string; href: string; ctaLabel: string; stale?: boolean }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
        {stale ? <StaleBadge stale={true} /> : null}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>{description}</p>
      <Link href={href} style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 10, background: 'var(--gradient-brand)', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>{ctaLabel}</Link>
    </Card>
  )
}

function MemoTab({ metadata, stale, busy, onRegenerate }: { metadata: DealMetadata; stale: boolean; busy: boolean; onRegenerate: () => void }) {
  const fileId = metadata.latestMemoFileId
  const at = metadata.latestMemoAt
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Investment memo (PPTX)</div>
        <StaleBadge stale={stale} />
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
        {at ? `Last generated ${new Date(at).toLocaleString()}.` : 'No memo has been generated for this deal yet.'}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <PrimaryButton onClick={onRegenerate} disabled={busy}>{busy ? 'Generating memo…' : (fileId ? 'Regenerate memo' : 'Generate memo')}</PrimaryButton>
        {fileId && (
          <a href={`${BASE}/api/copilot/memo/${encodeURIComponent(fileId)}`} download style={{ padding: '8px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>Download latest</a>
        )}
      </div>
    </Card>
  )
}

function DeckTab({ metadata, stale, busy, onRegenerate }: { metadata: DealMetadata; stale: boolean; busy: boolean; onRegenerate: () => void }) {
  const fileId = metadata.latestDeckFileId
  const at = metadata.latestDeckAt
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Banker pitch deck (PPTX)</div>
        <StaleBadge stale={stale} />
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
        {at ? `Last generated ${new Date(at).toLocaleString()}.` : 'No deck has been generated for this deal yet.'}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <PrimaryButton onClick={onRegenerate} disabled={busy}>{busy ? 'Generating deck…' : (fileId ? 'Regenerate deck' : 'Generate deck')}</PrimaryButton>
        {fileId && (
          <a href={`${BASE}/api/copilot/deck/${encodeURIComponent(fileId)}`} download style={{ padding: '8px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>Download latest</a>
        )}
      </div>
    </Card>
  )
}

function BlueprintsTab({ queue, targetSymbol, peerSet }: { queue: BlueprintQueueItem[]; targetSymbol: string; peerSet: PeerSetDto | null }) {
  if (queue.length === 0) {
    return <Card><div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No blueprints have been queued for this deal.</div></Card>
  }
  return (
    <Card>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
        Pre-seeded playbooks ready to fan out across the deal team. Open a blueprint to fill in inputs and run.
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {queue.map((q, i) => {
          const peerString = peerSet?.symbols.slice(0, 6).join(',') || ''
          const params = new URLSearchParams({ slug: q.slug, ticker: targetSymbol, peers: peerString })
          return (
            <div key={`${q.slug}-${i}`} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card-alt)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{q.label || q.slug}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>slug: {q.slug} · queued {new Date(q.queuedAt).toLocaleDateString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.04em',
                  background: q.status === 'ok' ? '#D1FAE5' : q.status === 'error' ? '#FEE2E2' : q.status === 'running' ? '#DBEAFE' : '#E5E7EB',
                  color:      q.status === 'ok' ? '#065F46' : q.status === 'error' ? '#991B1B' : q.status === 'running' ? '#1E3A8A' : '#374151',
                }}>{q.status || 'queued'}</span>
                <Link href={`${BASE}/app/blueprints/run?${params.toString()}`} style={{ padding: '5px 10px', borderRadius: 8, background: 'var(--gradient-brand)', color: '#fff', fontWeight: 700, fontSize: 11, textDecoration: 'none' }}>Run →</Link>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(ms).toLocaleDateString()
}

function TeamTab({ team, workspace, activity, stale }: {
  team: TeamMember[]
  workspace: WorkspaceDto
  activity: AuditEvent[]
  stale: Set<StaleSurface>
}) {
  // Build per-member last-activity map keyed by actorId.
  const lastByActor = useMemo(() => {
    const m = new Map<string, AuditEvent>()
    for (const ev of activity) {
      if (!ev.actorId) continue
      const existing = m.get(ev.actorId)
      if (!existing || new Date(ev.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        m.set(ev.actorId, ev)
      }
    }
    return m
  }, [activity])

  // Pending review items: stale surfaces + memo/deck that haven't been
  // generated yet. These are the things the team owes the workspace.
  const pendingItems = useMemo(() => {
    const items: { label: string; severity: 'pending' | 'stale'; surface: StaleSurface }[] = []
    const meta = workspace.metadata ?? {}
    if (!meta.latestMemoFileId) items.push({ label: 'Initial memo not yet generated', severity: 'pending', surface: 'memo' })
    else if (stale.has('memo'))  items.push({ label: 'Memo refresh pending review', severity: 'stale', surface: 'memo' })
    if (!meta.latestDeckFileId) items.push({ label: 'Initial deck not yet generated', severity: 'pending', surface: 'deck' })
    else if (stale.has('deck'))  items.push({ label: 'Deck refresh pending review', severity: 'stale', surface: 'deck' })
    if (stale.has('valuation'))  items.push({ label: 'Valuation refresh pending review', severity: 'stale', surface: 'valuation' })
    return items
  }, [workspace, stale])

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Pending review items</div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{pendingItems.length} open</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Surfaces that need a teammate to generate, refresh, or sign off.</div>
        {pendingItems.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>All clear — every surface is up to date.</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {pendingItems.map((it, i) => (
              <div key={`${it.surface}-${i}`} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 600 }}>{it.label}</div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: it.severity === 'stale' ? '#FEF3C7' : '#DBEAFE', color: it.severity === 'stale' ? '#92400E' : '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{it.severity === 'stale' ? 'Out of date' : 'Pending'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Deal team</div>
          <Link href={`${BASE}/app/team`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>Manage →</Link>
        </div>
        {team.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No teammates yet — invite collaborators from the Team page.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {team.map((m) => {
              const isOwner = m.userId === workspace.authorUserId
              const last = m.userId ? lastByActor.get(m.userId) : undefined
              const lastText = last ? `${last.action.replace(/^workspace\./, '')} · ${relativeTime(new Date(last.createdAt).getTime())}` : 'No activity in this workspace yet'
              return (
                <div key={m.membershipId} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card-alt)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{m.name}{isOwner ? ' · workspace owner' : ''}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.email || '—'}</div>
                    <div style={{ fontSize: 11, color: last ? 'var(--text-secondary)' : 'var(--text-muted)', marginTop: 2 }}>Last activity: {lastText}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: '#E5E7EB', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{m.role}</span>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

function ActivityTab({ events }: { events: AuditEvent[] }) {
  return (
    <Card>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12 }}>Audit activity</div>
      {events.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No audit events recorded for this workspace yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {events.map((e) => (
            <div key={e.id} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-card-alt)', fontSize: 12, color: 'var(--text-secondary)' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{e.action}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(e.createdAt).toLocaleString()}{e.actorId ? ` · ${e.actorId.slice(0, 14)}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
