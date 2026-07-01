'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface MemberDto {
  id: string
  userId: string
  role: string
  addedByUserId: string
  createdAt: string
}

interface LinkDto {
  id: string
  resourceType: string
  resourceId: string
  resourceLabel: string
  linkedByUserId: string
  createdAt: string
}

interface ActivityEventDto {
  id: string
  actorUserId: string
  action: string
  resourceType: string | null
  resourceId: string | null
  resourceLabel: string | null
  payload: unknown
  createdAt: string
}

interface ProjectDetail {
  id: string
  name: string
  description: string
  color: string
  status: string
  metadata: Record<string, unknown>
  authorUserId: string
  mine: boolean
  createdAt: string
  updatedAt: string
}

type Tab = 'context' | 'members' | 'activity'

const RESOURCE_ICONS: Record<string, string> = {
  workspace: '📂',
  note: '📝',
  peer_set: '👥',
}

const ACTION_LABELS: Record<string, string> = {
  created_project: 'created this project',
  updated_project: 'updated project settings',
  archived_project: 'archived this project',
  added_workspace: 'linked a workspace',
  removed_workspace: 'unlinked a workspace',
  added_note: 'linked a note',
  removed_note: 'unlinked a note',
  added_peer_set: 'linked a peer set',
  removed_peer_set: 'unlinked a peer set',
  added_member: 'added a teammate',
  removed_member: 'removed a teammate',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso)
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function shortUserId(id: string): string {
  return id.replace(/^user_/, '').slice(0, 8) + '…'
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    owner: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
    admin: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
    member: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    viewer: 'bg-white/5 text-white/40 border-white/10',
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border capitalize ${colors[role] ?? colors.viewer}`}>
      {role}
    </span>
  )
}

function AddMemberRow({ projectId, onAdded }: { projectId: string; onAdded: (m: MemberDto) => void }) {
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState('member')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/platform/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim(), role }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError((j as { error?: string }).error ?? 'Failed to add member')
        return
      }
      const j = await res.json() as { member: MemberDto }
      onAdded(j.member)
      setUserId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 mt-3">
      <input
        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-blue-500/50"
        placeholder="Clerk user ID (user_…)"
        value={userId}
        onChange={e => setUserId(e.target.value)}
      />
      <select
        value={role}
        onChange={e => setRole(e.target.value)}
        className="bg-[#0d1526] border border-white/10 rounded-lg px-2 py-2 text-white/70 text-xs focus:outline-none"
      >
        <option value="viewer">viewer</option>
        <option value="member">member</option>
        <option value="admin">admin</option>
      </select>
      <button
        type="submit"
        disabled={saving || !userId.trim()}
        className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium transition-colors"
      >
        {saving ? '…' : 'Add'}
      </button>
      {error && <span className="text-red-300 text-xs">{error}</span>}
    </form>
  )
}

function LinkResourceRow({
  projectId,
  onLinked,
}: {
  projectId: string
  onLinked: (l: LinkDto) => void
}) {
  const [resourceType, setResourceType] = useState<'workspace' | 'note' | 'peer_set'>('workspace')
  const [resourceId, setResourceId] = useState('')
  const [resourceLabel, setResourceLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!resourceId.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/platform/api/projects/${projectId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceType, resourceId: resourceId.trim(), resourceLabel: resourceLabel.trim() || undefined }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError((j as { error?: string }).error ?? 'Failed to link')
        return
      }
      const j = await res.json() as { link: LinkDto }
      onLinked(j.link)
      setResourceId('')
      setResourceLabel('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 mt-3">
      <select
        value={resourceType}
        onChange={e => setResourceType(e.target.value as typeof resourceType)}
        className="bg-[#0d1526] border border-white/10 rounded-lg px-2 py-2 text-white/70 text-xs focus:outline-none"
      >
        <option value="workspace">workspace</option>
        <option value="note">note</option>
        <option value="peer_set">peer set</option>
      </select>
      <input
        className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-blue-500/50"
        placeholder="Resource UUID"
        value={resourceId}
        onChange={e => setResourceId(e.target.value)}
      />
      <input
        className="w-36 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-blue-500/50"
        placeholder="Label (optional)"
        value={resourceLabel}
        onChange={e => setResourceLabel(e.target.value)}
      />
      <button
        type="submit"
        disabled={saving || !resourceId.trim()}
        className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium transition-colors"
      >
        {saving ? '…' : 'Link'}
      </button>
      {error && <span className="text-red-300 text-xs w-full">{error}</span>}
    </form>
  )
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [members, setMembers] = useState<MemberDto[]>([])
  const [links, setLinks] = useState<LinkDto[]>([])
  const [activity, setActivity] = useState<ActivityEventDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('context')
  const [archiving, setArchiving] = useState(false)

  const loadProject = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [detailRes, activityRes] = await Promise.all([
        fetch(`/platform/api/projects/${id}`),
        fetch(`/platform/api/projects/${id}/activity`),
      ])
      if (!detailRes.ok) {
        if (detailRes.status === 403) {
          setError('You do not have access to this project.')
          return
        }
        throw new Error('Failed to load project')
      }
      const detail = await detailRes.json() as {
        project: ProjectDetail
        members: MemberDto[]
        links: LinkDto[]
      }
      setProject(detail.project)
      setMembers(detail.members ?? [])
      setLinks(detail.links ?? [])

      if (activityRes.ok) {
        const act = await activityRes.json() as { events: ActivityEventDto[] }
        setActivity(act.events ?? [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadProject() }, [loadProject])

  async function handleArchive() {
    if (!project) return
    setArchiving(true)
    try {
      const newStatus = project.status === 'archived' ? 'active' : 'archived'
      const res = await fetch(`/platform/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        setProject(p => p ? { ...p, status: newStatus } : p)
      }
    } finally {
      setArchiving(false)
    }
  }

  async function handleUnlink(link: LinkDto) {
    const res = await fetch(`/platform/api/projects/${id}/link`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resourceType: link.resourceType, resourceId: link.resourceId }),
    })
    if (res.ok) {
      setLinks(prev => prev.filter(l => l.id !== link.id))
    }
  }

  async function handleRemoveMember(m: MemberDto) {
    const res = await fetch(`/platform/api/projects/${id}/members?userId=${encodeURIComponent(m.userId)}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      setMembers(prev => prev.filter(x => x.id !== m.id))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080f1e] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500/40 border-t-blue-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-[#080f1e] flex items-center justify-center text-center px-4">
        <div>
          <p className="text-red-300/80 text-sm mb-3">{error ?? 'Project not found.'}</p>
          <Link href="/app/projects" className="text-blue-400 hover:text-blue-300 text-sm">← Back to Projects</Link>
        </div>
      </div>
    )
  }

  const isVar = project.color.startsWith('var(')
  const linksByType = links.reduce<Record<string, LinkDto[]>>((acc, l) => {
    ;(acc[l.resourceType] ??= []).push(l)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-[#080f1e] text-white">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-white/30 mb-6">
          <Link href="/app/projects" className="hover:text-white/60 transition-colors">Projects</Link>
          <span>/</span>
          <span className="text-white/60">{project.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-xl font-bold text-white shadow"
              style={{ background: isVar ? 'var(--accent)' : project.color }}
            >
              {project.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white truncate">{project.name}</h1>
                {project.status === 'archived' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/30 border border-white/10">archived</span>
                )}
              </div>
              {project.description && (
                <p className="text-white/40 text-sm mt-1 line-clamp-2">{project.description}</p>
              )}
              <p className="text-white/25 text-xs mt-1">
                {members.length} member{members.length !== 1 ? 's' : ''} · Created {relativeTime(project.createdAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="px-3 py-2 rounded-xl border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 text-xs transition-colors disabled:opacity-40"
            >
              {archiving ? '…' : project.status === 'archived' ? 'Restore' : 'Archive'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-white/5 mb-6">
          {([
            { key: 'context', label: 'Context & Sources' },
            { key: 'members', label: `Members (${members.length})` },
            { key: 'activity', label: 'Activity' },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? 'border-blue-500 text-blue-300'
                  : 'border-transparent text-white/40 hover:text-white/70'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Context & Sources tab ───────────────────────────────────────── */}
        {tab === 'context' && (
          <div>
            {(['workspace', 'note', 'peer_set'] as const).map(rt => {
              const items = linksByType[rt] ?? []
              return (
                <div key={rt} className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <span>{RESOURCE_ICONS[rt]}</span>
                    <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wider">
                      {rt === 'peer_set' ? 'Peer Sets' : rt === 'workspace' ? 'Workspaces' : 'Notes'}
                      <span className="ml-2 text-white/25 font-normal normal-case tracking-normal">({items.length})</span>
                    </h3>
                  </div>

                  {items.length > 0 ? (
                    <div className="space-y-1.5">
                      {items.map(l => {
                        const dest =
                          rt === 'workspace' ? `/app/workspaces?id=${l.resourceId}` :
                          rt === 'note' ? `/app/research` :
                          `/app/peers`
                        return (
                          <div
                            key={l.id}
                            className="flex items-center gap-3 px-4 py-2.5 bg-[#0d1526] border border-blue-500/10 rounded-xl group"
                          >
                            <Link
                              href={dest}
                              className="flex-1 min-w-0 hover:text-blue-300 transition-colors"
                            >
                              <span className="text-white/80 text-sm truncate">
                                {l.resourceLabel || l.resourceId.slice(0, 12) + '…'}
                              </span>
                            </Link>
                            <span className="text-white/25 text-xs flex-shrink-0">
                              Linked {relativeTime(l.createdAt)}
                            </span>
                            <button
                              onClick={() => handleUnlink(l)}
                              className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 text-xs transition-opacity ml-1"
                              title="Unlink"
                            >✕</button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-white/25 text-xs py-3 pl-1">No linked {rt === 'peer_set' ? 'peer sets' : rt + 's'} yet.</p>
                  )}
                </div>
              )
            })}

            <div className="pt-2 border-t border-white/5">
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">Link a resource</p>
              <LinkResourceRow
                projectId={id}
                onLinked={l => {
                  setLinks(prev => [...prev.filter(x => !(x.resourceType === l.resourceType && x.resourceId === l.resourceId)), l])
                  setActivity(prev => [{
                    id: crypto.randomUUID(),
                    actorUserId: 'you',
                    action: `added_${l.resourceType}`,
                    resourceType: l.resourceType,
                    resourceId: l.resourceId,
                    resourceLabel: l.resourceLabel,
                    payload: null,
                    createdAt: new Date().toISOString(),
                  }, ...prev])
                }}
              />
            </div>
          </div>
        )}

        {/* ── Members tab ─────────────────────────────────────────────────── */}
        {tab === 'members' && (
          <div>
            <div className="space-y-2">
              {members.map(m => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-4 py-3 bg-[#0d1526] border border-blue-500/10 rounded-xl group"
                >
                  <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-300 flex-shrink-0">
                    {shortUserId(m.userId).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/80 text-sm font-mono truncate">{m.userId}</p>
                    <p className="text-white/25 text-xs">Added {relativeTime(m.createdAt)}</p>
                  </div>
                  <RoleBadge role={m.role} />
                  {project.mine && m.userId !== project.authorUserId && (
                    <button
                      onClick={() => handleRemoveMember(m)}
                      className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 text-xs transition-opacity ml-2"
                      title="Remove member"
                    >✕</button>
                  )}
                </div>
              ))}
            </div>

            {project.mine && (
              <div className="pt-4 border-t border-white/5 mt-4">
                <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">Add teammate</p>
                <AddMemberRow
                  projectId={id}
                  onAdded={m => setMembers(prev => [...prev.filter(x => x.userId !== m.userId), m])}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Activity tab ─────────────────────────────────────────────────── */}
        {tab === 'activity' && (
          <div>
            {activity.length === 0 ? (
              <p className="text-white/30 text-sm py-6 text-center">No activity yet.</p>
            ) : (
              <div className="relative pl-5">
                {/* timeline line */}
                <div className="absolute left-1.5 top-2 bottom-2 w-px bg-white/5" />
                <div className="space-y-3">
                  {activity.map(e => (
                    <div key={e.id} className="relative flex items-start gap-3">
                      <div className="absolute -left-[14px] top-1.5 w-2 h-2 rounded-full bg-blue-500/40 border border-blue-400/40 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-white/70 text-xs">
                          <span className="font-mono text-white/40">{shortUserId(e.actorUserId)}</span>
                          {' '}
                          <span>{ACTION_LABELS[e.action] ?? e.action}</span>
                          {e.resourceLabel && (
                            <span className="text-white/50"> — <span className="text-white/70">{e.resourceLabel}</span></span>
                          )}
                        </p>
                        <p className="text-white/25 text-[11px] mt-0.5">{relativeTime(e.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
