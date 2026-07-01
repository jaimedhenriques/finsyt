'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface ProjectDto {
  id: string
  name: string
  description: string
  color: string
  status: string
  metadata: Record<string, unknown>
  authorUserId: string
  mine: boolean
  memberCount: number
  createdAt: string
  updatedAt: string
}

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso)
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function ColorDot({ color }: { color: string }) {
  const isVar = color.startsWith('var(')
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
      style={{ background: isVar ? undefined : color, backgroundColor: isVar ? undefined : color }}
      aria-hidden
    >
      {isVar && (
        <span
          className="block w-2.5 h-2.5 rounded-full bg-[--accent]"
          style={{ background: 'var(--accent)' }}
        />
      )}
    </span>
  )
}

function NewProjectModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (p: ProjectDto) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/platform/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), color }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError((j as { error?: string }).error ?? 'Failed to create project')
        return
      }
      const j = await res.json() as { project: ProjectDto }
      onCreate(j.project)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <form
        className="relative w-full max-w-md bg-[#0d1526] border border-blue-500/20 rounded-2xl p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
        onSubmit={submit}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-white/30 hover:text-white/70 text-lg"
        >✕</button>
        <h2 className="text-white font-semibold text-base mb-5">New Project</h2>

        <label className="block mb-4">
          <span className="text-white/50 text-xs uppercase tracking-wider mb-1 block">Name *</span>
          <input
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-blue-500/50"
            placeholder="e.g. Acme Acquisition"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={120}
            required
            autoFocus
          />
        </label>

        <label className="block mb-4">
          <span className="text-white/50 text-xs uppercase tracking-wider mb-1 block">Description</span>
          <textarea
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 resize-none"
            placeholder="Brief context for the deal team…"
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
          />
        </label>

        <label className="flex items-center gap-3 mb-6">
          <span className="text-white/50 text-xs uppercase tracking-wider">Color</span>
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="w-8 h-8 rounded-lg cursor-pointer border border-white/10 bg-transparent"
          />
          <span className="text-white/40 text-xs font-mono">{color}</span>
        </label>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">{error}</div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-white/50 hover:text-white/80 text-sm transition-colors"
          >Cancel</button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >{saving ? 'Creating…' : 'Create Project'}</button>
        </div>
      </form>
    </div>
  )
}

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [filter, setFilter] = useState<'active' | 'archived' | 'all'>('active')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/platform/api/projects')
      if (!res.ok) throw new Error('Failed to load projects')
      const j = await res.json() as { projects: ProjectDto[] }
      setProjects(j.projects ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const displayed = projects.filter(p => {
    if (filter === 'all') return true
    return p.status === filter
  })

  return (
    <div className="min-h-screen bg-[#080f1e] text-white">
      {showNew && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreate={p => {
            setProjects(prev => [p, ...prev])
            setShowNew(false)
            router.push(`/app/projects/${p.id}`)
          }}
        />
      )}

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Projects</h1>
            <p className="text-white/40 text-sm mt-1">
              Shared deal-team spaces — bundle sources, agents, and notes for your whole team.
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors shadow-lg"
          >
            <span className="text-base leading-none">+</span>
            New Project
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-6">
          {(['active', 'archived', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === f
                  ? 'bg-blue-600/25 text-blue-300 border border-blue-500/30'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-500/40 border-t-blue-400 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-red-300/80 text-sm">{error}</p>
            <button onClick={load} className="mt-3 text-blue-400 hover:text-blue-300 text-sm">Retry</button>
          </div>
        ) : displayed.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-4">📁</div>
            <p className="text-white/50 text-sm mb-2">
              {filter === 'archived' ? 'No archived projects.' : 'No projects yet.'}
            </p>
            {filter === 'active' && (
              <button
                onClick={() => setShowNew(true)}
                className="mt-2 text-blue-400 hover:text-blue-300 text-sm underline"
              >
                Create your first project
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayed.map(p => (
              <Link
                key={p.id}
                href={`/app/projects/${p.id}`}
                className="group block bg-[#0d1526] hover:bg-[#111d35] border border-blue-500/10 hover:border-blue-500/25 rounded-2xl p-5 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <ColorDot color={p.color} />
                    <h3 className="text-white font-semibold text-sm truncate group-hover:text-blue-200 transition-colors">
                      {p.name}
                    </h3>
                  </div>
                  {p.status === 'archived' && (
                    <span className="ml-2 flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/30 border border-white/10">
                      archived
                    </span>
                  )}
                </div>

                {p.description && (
                  <p className="text-white/45 text-xs leading-relaxed line-clamp-2 mb-4">
                    {p.description}
                  </p>
                )}

                <div className="flex items-center justify-between text-[11px] text-white/30">
                  <span>
                    {p.memberCount} member{p.memberCount !== 1 ? 's' : ''}
                  </span>
                  <span>Updated {relativeTime(p.updatedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
