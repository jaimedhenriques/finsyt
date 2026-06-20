'use client'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, Badge } from '@/components/ui'
import PeerSelectedTable from '@/components/peers/PeerSelectedTable'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// Fallback "Suggested" peer baskets — preserves the heuristic that lived in
// the old PeerCompareModal. Used when the workspace has no saved peer set
// containing the subject ticker.
const SUGGESTED_PEERS: Record<string, string[]> = {
  AAPL:  ['MSFT', 'GOOGL', 'META'],
  MSFT:  ['AAPL', 'GOOGL', 'AMZN'],
  GOOGL: ['MSFT', 'META',  'AMZN'],
  NVDA:  ['AMD',  'AVGO',  'INTC'],
  META:  ['GOOGL','SNAP',  'PINS'],
  AMZN:  ['MSFT', 'GOOGL', 'WMT'],
  TSLA:  ['F',    'GM',    'RIVN'],
}

type PeerSet = {
  id: string
  name: string
  description: string
  authorUserId: string
  symbols: string[]
}

export default function CompanyPeersPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params)
  const SYM = (symbol || '').toUpperCase()

  const [sets, setSets] = useState<PeerSet[] | null>(null)
  const [activeSetId, setActiveSetId] = useState<string | null>(null)
  const [me, setMe] = useState<string | null>(null)
  const [creatingFromSuggested, setCreatingFromSuggested] = useState(false)

  const reload = useCallback(async () => {
    const r = await fetch(`${BASE}/api/peers/sets`)
    if (!r.ok) { setSets([]); return }
    const j = await r.json()
    setSets(j.sets ?? [])
  }, [])

  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    fetch(`${BASE}/api/peers/me`).then(async (r) => {
      if (!r.ok) return
      try { const j = await r.json(); setMe(j?.userId ?? null) } catch {}
    }).catch(() => {})
  }, [])

  // Auto-pick the first peer set that contains this symbol; otherwise null,
  // which falls back to the suggested-peers heuristic below.
  const setsContaining = useMemo(
    () => (sets ?? []).filter((s) => s.symbols.includes(SYM)),
    [sets, SYM],
  )
  useEffect(() => {
    if (activeSetId) return
    if (setsContaining.length > 0) setActiveSetId(setsContaining[0].id)
  }, [setsContaining, activeSetId])

  const active = useMemo(() => sets?.find((s) => s.id === activeSetId) || null, [sets, activeSetId])
  const isOwner = !!(active && me && active.authorUserId === me)

  const suggested = useMemo(
    () => SUGGESTED_PEERS[SYM] || ['SPY', 'QQQ', 'DIA'],
    [SYM],
  )

  async function createFromSuggested() {
    setCreatingFromSuggested(true)
    try {
      const r = await fetch(`${BASE}/api/peers/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${SYM} comp set`,
          description: `Auto-suggested peers for ${SYM}.`,
          symbols: [SYM, ...suggested],
        }),
      })
      if (r.ok) {
        const j = await r.json()
        await reload()
        if (j?.set?.id) setActiveSetId(j.set.id)
      }
    } finally {
      setCreatingFromSuggested(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link href={`${BASE}/app/company/${SYM}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textDecoration: 'none' }}>← {SYM}</Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{SYM} · Peers</h1>
        <Badge tone="violet">workspace</Badge>
        <Link href={`${BASE}/app/peers`} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
          Manage all peer sets →
        </Link>
      </header>

      {/* ── Set picker / suggested fallback ────────────────────────────────── */}
      <Card style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Peer set
        </div>

        {sets === null && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading peer sets…</div>}

        {sets && setsContaining.length === 0 && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              No saved peer set contains <strong>{SYM}</strong>. Showing the suggested basket below.
            </div>
            <button onClick={createFromSuggested} disabled={creatingFromSuggested}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: creatingFromSuggested ? 0.7 : 1 }}>
              {creatingFromSuggested ? 'Saving…' : '+ Save as peer set'}
            </button>
          </div>
        )}

        {setsContaining.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {setsContaining.map((s) => (
              <button key={s.id} onClick={() => setActiveSetId(s.id)}
                style={{
                  padding: '6px 12px', borderRadius: 999,
                  border: '1px solid ' + (activeSetId === s.id ? 'var(--accent)' : 'var(--border)'),
                  background: activeSetId === s.id ? 'var(--accent)' : 'var(--bg-card)',
                  color: activeSetId === s.id ? '#fff' : 'var(--text-secondary)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>
                {s.name} <span style={{ opacity: 0.6, marginLeft: 4 }}>({s.symbols.length})</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* ── Institutional comparison table ─────────────────────────────────── */}
      {active ? (
        <PeerSelectedTable
          key={active.id}
          setId={active.id}
          subject={SYM}
          title={`Selected Peers · ${active.name}`}
          subtitle={active.description || `${active.symbols.length} member${active.symbols.length === 1 ? '' : 's'}, anchored on ${SYM}`}
          editable={isOwner}
          ownedSetId={isOwner ? active.id : null}
          csvBaseName={`${SYM.toLowerCase()}-peers`}
        />
      ) : (
        <PeerSelectedTable
          key="suggested"
          subject={SYM}
          symbols={[SYM, ...suggested]}
          title="Selected Peers · Suggested"
          subtitle={`Heuristic basket (no saved peer set contains ${SYM} yet)`}
          csvBaseName={`${SYM.toLowerCase()}-peers-suggested`}
        />
      )}
    </div>
  )
}
