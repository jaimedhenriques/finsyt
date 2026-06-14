'use client'
/**
 * Connector Hub
 * ─────────────
 * Three tabs:
 *   1. Catalog       — browse curated connectors and "+ Connect"
 *   2. My Connections — list workspace connections, test, view ops, delete
 *   3. Custom        — add a custom REST endpoint or custom MCP server
 *
 * All browser fetches go through the workspace base path `/platform/api/...`
 * so they survive the proxy. Errors surface inline rather than as toasts so
 * the page is readable when the network panel is closed.
 */
import { useEffect, useMemo, useState, useCallback } from 'react'

const API = '/platform/api/connectors'

// ── Shared types (kept loose to avoid a duplicate of the server schema) ─────
interface CatalogCredentialField {
  key: string
  label: string
  placeholder?: string
  help?: string
  secret?: boolean
}

interface CatalogEntry {
  slug: string
  name: string
  category: string
  description: string
  authType: string
  baseUrl: string
  docUrl: string
  isFirstParty?: boolean
  /** Premium / institutional data feed (FactSet, CapIQ, Refinitiv, Bloomberg DL, PitchBook). */
  isPremium?: boolean
  oauth?: { authorizeUrl: string; tokenUrl: string; scopes: string }
  operationTemplates?: Array<{ name: string; description: string; method: string; path: string }>
  /** Per-connector credential prompts; overrides the auth-type defaults when present. */
  credentialFields?: CatalogCredentialField[]
  /** Friendly explanation of where to obtain the credentials. */
  credentialNotes?: string | null
  /** Operation invoked by the connect/test flow as a lightweight credential check. */
  validateOperation?: string | null
}

interface Connection {
  id: string
  kind: 'rest' | 'mcp' | 'first_party'
  status: 'pending' | 'active' | 'error' | 'disabled'
  displayName: string
  baseUrl: string | null
  mcpUrl: string | null
  authType: string
  category: string
  lastTestAt: string | null
  lastTestOk: boolean | null
  lastTestError: string | null
  /** True when the linked catalog entry is a premium institutional feed. */
  isPremium?: boolean
  /** Most-recent rate-limit headers from the upstream (premium connectors). */
  quotaRemaining: number | null
  quotaLimit: number | null
  quotaResetAt: string | null
  quotaUpdatedAt: string | null
  createdAt: string
}

interface Operation {
  id: string
  name: string
  description: string
  method: string
  path: string
  enabled: boolean
  cacheTtlSeconds: number
  paramSchema: Record<string, unknown>
}

type Tab = 'catalog' | 'connections' | 'custom'

const CATEGORY_ORDER = [
  'markets', 'fundamentals', 'macro', 'filings', 'news',
  'sentiment', 'crypto', 'fx', 'ai_nlp', 'geocoding',
  'calendars', 'comms', 'search',
]

export default function ConnectorHubPage() {
  const [tab, setTab] = useState<Tab>('catalog')
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── Modal state ───────────────────────────────────────────────────────────
  const [connectingTo, setConnectingTo] = useState<CatalogEntry | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Surfaced after the connect modal closes — shows whether the upstream
  // accepted the credentials. Auto-clears after 8s so it does not pile up
  // when the user connects several premium tiles in a row.
  const [validationFlash, setValidationFlash] = useState<
    // `detail` carries the connector-specific copy from the server —
    // "Connected as <username>" on success when the catalog supplied a
    // `successIdentityPath`, or provider-specific failure copy like
    // "Invalid Apify token" on 401/403. We prefer it over the generic
    // "credentials accepted/rejected" template when present.
    | { ok: boolean; status: number; error?: string; detail?: string; latencyMs: number; name: string }
    | null
  >(null)
  useEffect(() => {
    if (!validationFlash) return
    const t = setTimeout(() => setValidationFlash(null), 8000)
    return () => clearTimeout(t)
  }, [validationFlash])

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [catRes, conRes] = await Promise.all([
        fetch(`${API}/catalog`),
        fetch(`${API}/connections`),
      ])
      if (!catRes.ok) throw new Error(`catalog: ${catRes.status}`)
      if (!conRes.ok) throw new Error(`connections: ${conRes.status}`)
      const catBody = await catRes.json()
      const conBody = await conRes.json()
      setCatalog(Array.isArray(catBody.entries) ? catBody.entries : Array.isArray(catBody) ? catBody : [])
      setConnections(Array.isArray(conBody.connections) ? conBody.connections : Array.isArray(conBody) ? conBody : [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // ── Deep-link auto-open ──────────────────────────────────────────────────
  // Marketing's Solutions page links here as `…/connectors?source=<slug>` for
  // each premium tile (Coming from FactSet/CapIQ/Refinitiv/Bloomberg/PitchBook).
  // When that param matches a catalog entry, jump the user straight into the
  // Connect modal and clear the param from the URL so a back-nav refresh
  // doesn't reopen it. We only run after the catalog has populated and only
  // once — `consumedDeepLink` prevents an infinite loop with `setConnectingTo`.
  const [consumedDeepLink, setConsumedDeepLink] = useState(false)
  useEffect(() => {
    if (consumedDeepLink || catalog.length === 0 || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const source = params.get('source')
    if (!source) { setConsumedDeepLink(true); return }
    const match = catalog.find(c => c.slug === source)
    if (match && !match.isFirstParty) {
      setTab('catalog')
      setConnectingTo(match)
      // Scroll the matched tile into view so closing the modal lands the
      // visitor on the right card. We wait one frame for the catalog grid
      // to render before resolving the element by its slug-keyed id.
      requestAnimationFrame(() => {
        const el = document.getElementById(`connector-tile-${match.slug}`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }
    // Clear the query param either way so the modal does not re-open on
    // tab switches and refreshes.
    params.delete('source')
    const next = params.toString()
    const url = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash}`
    window.history.replaceState(null, '', url)
    setConsumedDeepLink(true)
  }, [catalog, consumedDeepLink])

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connector Hub</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Connect any REST API or MCP server. Connections become tools in Finsyt Agent, scheduled workflows,
            the unified <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">/api/v1/connectors</code> endpoint,
            and the <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">/api/mcp</code> server.
          </p>
        </div>
      </header>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {([
          ['catalog',     `Catalog (${catalog.length})`],
          ['connections', `My Connections (${connections.length})`],
          ['custom',      'Add Custom'],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === k
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200'
            }`}
          >{label}</button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}
      {validationFlash && (
        <div
          className={
            validationFlash.ok
              ? 'mb-4 flex items-start justify-between gap-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'mb-4 flex items-start justify-between gap-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
          }
        >
          <span>
            {validationFlash.ok
              ? validationFlash.detail
                // Server-side "Connected as <username>" (or generic "Validated
                // via …") — surfaced verbatim so the user sees connector-
                // specific identity when the catalog declared a path.
                ? `${validationFlash.name}: ${validationFlash.detail} (HTTP ${validationFlash.status}, ${validationFlash.latencyMs}ms).`
                : `${validationFlash.name}: credentials accepted (HTTP ${validationFlash.status}, ${validationFlash.latencyMs}ms).`
              : `${validationFlash.name}: ${validationFlash.detail || validationFlash.error || `credentials rejected (HTTP ${validationFlash.status})`}.`}
          </span>
          <button
            onClick={() => setValidationFlash(null)}
            className="text-xs underline opacity-80 hover:opacity-100"
          >Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-zinc-500">Loading…</div>
      ) : tab === 'catalog' ? (
        <CatalogTab entries={catalog} onConnect={setConnectingTo} />
      ) : tab === 'connections' ? (
        <ConnectionsTab
          connections={connections}
          catalog={catalog}
          expandedId={expandedId}
          onExpand={setExpandedId}
          onChanged={refresh}
        />
      ) : (
        <CustomTab onCreated={() => { refresh(); setTab('connections') }} />
      )}

      {connectingTo && (
        <ConnectModal
          entry={connectingTo}
          onClose={() => setConnectingTo(null)}
          onCreated={(validation) => {
            const entryName = connectingTo.name
            setConnectingTo(null)
            refresh()
            setTab('connections')
            if (validation) {
              setValidationFlash({ ...validation, name: entryName })
            }
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Catalog tab
// ─────────────────────────────────────────────────────────────────────────────
function CatalogTab({ entries, onConnect }: { entries: CatalogEntry[]; onConnect: (e: CatalogEntry) => void }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>('all')

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return entries.filter(e =>
      (cat === 'all' || e.category === cat) &&
      (!term || e.name.toLowerCase().includes(term) || e.description.toLowerCase().includes(term))
    )
  }, [entries, q, cat])

  const grouped = useMemo(() => {
    const buckets = new Map<string, CatalogEntry[]>()
    for (const e of filtered) {
      const arr = buckets.get(e.category) ?? []
      arr.push(e); buckets.set(e.category, arr)
    }
    const order = [...CATEGORY_ORDER, ...Array.from(buckets.keys()).filter(k => !CATEGORY_ORDER.includes(k))]
    return order.filter(k => buckets.has(k)).map(k => [k, buckets.get(k)!] as const)
  }, [filtered])

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search catalog…"
          className="w-64 rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          value={cat}
          onChange={e => setCat(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="all">All categories</option>
          {CATEGORY_ORDER.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {grouped.map(([category, items]) => (
        <section key={category} className="mb-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{category}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(e => (
              <article
                key={e.slug}
                id={`connector-tile-${e.slug}`}
                className="rounded-lg border border-zinc-200 bg-white p-4 transition hover:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold">{e.name}</h3>
                  {e.isFirstParty ? (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Built-in
                    </span>
                  ) : e.isPremium ? (
                    // Premium tiles indicate the user must already license the
                    // upstream feed (FactSet, CapIQ, Refinitiv, Bloomberg DL,
                    // PitchBook) and bring their own credentials.
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      Premium
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{e.description}</p>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500">
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">{e.authType}</span>
                  {e.operationTemplates?.length ? (
                    <span>{e.operationTemplates.length} op{e.operationTemplates.length === 1 ? '' : 's'}</span>
                  ) : null}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    disabled={e.isFirstParty}
                    onClick={() => onConnect(e)}
                    className="flex-1 rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
                  >
                    {e.isFirstParty ? 'Always on' : 'Connect'}
                  </button>
                  <a
                    href={e.docUrl}
                    target="_blank" rel="noreferrer"
                    className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:border-emerald-400 hover:text-emerald-600 dark:border-zinc-700 dark:text-zinc-300"
                  >Docs</a>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {filtered.length === 0 && (
        <div className="py-12 text-center text-sm text-zinc-500">No connectors match your search.</div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Connect modal (creates a connection from a catalog entry)
// ─────────────────────────────────────────────────────────────────────────────
function ConnectModal({ entry, onClose, onCreated }: { entry: CatalogEntry; onClose: () => void; onCreated: (validation?: { ok: boolean; status: number; error?: string; detail?: string; latencyMs: number } | null) => void }) {
  const [displayName, setDisplayName] = useState(entry.name)
  const [creds, setCreds] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Prefer per-connector field definitions from the catalog when supplied
  // (premium tiles and any future hand-tuned entry). Fall back to the
  // generic auth-type defaults so legacy / first-party tiles still work.
  const credFields = useMemo(() => {
    if (entry.credentialFields && entry.credentialFields.length > 0) return entry.credentialFields
    return credFieldsForAuth(entry.authType)
  }, [entry.authType, entry.credentialFields])

  async function handleSubmit() {
    setBusy(true); setErr(null)
    try {
      if (entry.authType === 'oauth2') {
        // Server pre-creates a draft connection then redirects to the
        // upstream authorize URL. The user is bounced back to the hub.
        const url = `${API}/oauth/start?slug=${encodeURIComponent(entry.slug)}`
        window.location.href = url
        return
      }
      const res = await fetch(`${API}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          definitionSlug: entry.slug,
          kind: 'rest',
          displayName,
          baseUrl: entry.baseUrl,
          authType: entry.authType,
          category: entry.category,
          credentials: creds,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      // Pass the inline validation result up to the page so the connections
      // tab can flash the upstream's accept/reject signal in-line. The
      // connection itself is persisted either way; rejected creds land it
      // in the connections list with status="error" + the upstream error
      // visible on the row, so the user can fix and re-test or delete.
      const body = await res.json().catch(() => ({}))
      onCreated(body.validation ?? null)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} title={`Connect ${entry.name}`}>
      <p className="mb-4 text-sm text-zinc-500">{entry.description}</p>
      {entry.credentialNotes && (
        <p className="mb-3 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300">
          {entry.credentialNotes}
        </p>
      )}
      <Field label="Connection name">
        <input
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          className="w-full rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </Field>
      {credFields.map(f => (
        <Field key={f.key} label={f.label}>
          <input
            type={f.secret ? 'password' : 'text'}
            value={creds[f.key] || ''}
            onChange={e => setCreds({ ...creds, [f.key]: e.target.value })}
            placeholder={f.placeholder}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          {f.help && <p className="mt-1 text-xs text-zinc-500">{f.help}</p>}
        </Field>
      ))}
      {entry.authType === 'oauth2' && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          You will be redirected to {entry.name} to grant access. Server-side OAuth client must be configured.
        </p>
      )}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
          Cancel
        </button>
        <button
          disabled={busy || !displayName.trim()}
          onClick={handleSubmit}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? 'Connecting…' : entry.authType === 'oauth2' ? 'Continue with OAuth' : 'Save connection'}
        </button>
      </div>
    </Modal>
  )
}

function credFieldsForAuth(t: string): { key: string; label: string; placeholder?: string; help?: string; secret?: boolean }[] {
  switch (t) {
    case 'api_key_header': return [{ key: 'api_key', label: 'API key', secret: true, help: 'Sent as the configured header.' }]
    case 'api_key_query':  return [{ key: 'api_key', label: 'API key', secret: true, help: 'Appended to every request URL.' }]
    case 'bearer':         return [{ key: 'token', label: 'Bearer token', secret: true }]
    case 'basic':          return [
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password', secret: true },
    ]
    case 'none':
    case 'oauth2':
    default:               return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  My Connections tab
// ─────────────────────────────────────────────────────────────────────────────
function ConnectionsTab(props: {
  connections: Connection[]
  catalog: CatalogEntry[]
  expandedId: string | null
  onExpand: (id: string | null) => void
  onChanged: () => void
}) {
  const { connections, expandedId, onExpand, onChanged } = props
  if (!connections.length) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
        <p className="text-sm text-zinc-500">No connections yet — pick something from the catalog or add a custom one.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {connections.map(c => (
        <ConnectionRow
          key={c.id}
          connection={c}
          expanded={expandedId === c.id}
          onToggle={() => onExpand(expandedId === c.id ? null : c.id)}
          onChanged={onChanged}
        />
      ))}
    </div>
  )
}

interface HealthSummary {
  callCount: number
  errorCount: number
  errorRate: number
  p50LatencyMs: number | null
  p95LatencyMs: number | null
  lastCallAt: string | null
  lastErrorAt: string | null
  rateLimit: { remaining: number | null; limit: number | null; resetAt: string | null } | null
  recentEvents: Array<{
    kind: string; operation: string | null; status: number | null;
    latencyMs: number | null; error: string | null; occurredAt: string;
  }>
}

function ConnectionRow({ connection, expanded, onToggle, onChanged }: {
  connection: Connection
  expanded: boolean
  onToggle: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [ops, setOps] = useState<Operation[] | null>(null)
  const [health, setHealth] = useState<HealthSummary | null>(null)

  async function loadOps() {
    setOps(null)
    const res = await fetch(`${API}/connections/${connection.id}/operations`)
    if (res.ok) {
      const body = await res.json()
      setOps(Array.isArray(body.operations) ? body.operations : [])
    } else setOps([])
  }

  async function loadHealth() {
    const res = await fetch(`${API}/connections/${connection.id}/health`)
    if (res.ok) {
      const body = await res.json()
      setHealth(body as HealthSummary)
    }
  }

  useEffect(() => { if (expanded) { loadOps(); loadHealth() } }, [expanded]) // eslint-disable-line react-hooks/exhaustive-deps

  async function test() {
    setBusy('test'); setTestResult(null)
    try {
      const res = await fetch(`${API}/connections/${connection.id}/test`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      const quotaSuffix = body.quota && body.quota.remaining != null
        ? ` · ${body.quota.remaining}${body.quota.limit ? `/${body.quota.limit}` : ''} remaining`
        : ''
      // Prefer the connector-specific `detail` from the test endpoint —
      // surfaces "Connected as <username>" on success and provider-specific
      // copy ("Invalid Apify token") on failure. Falls back to the generic
      // OK / Failed template when no detail was supplied.
      setTestResult(
        body.ok
          ? `${body.detail || 'OK'}${body.status ? ` · HTTP ${body.status}` : ''}${quotaSuffix}`
          : `Failed: ${body.detail || body.error || res.status}`
      )
      onChanged()
    } finally { setBusy(null) }
  }

  async function discover() {
    setBusy('discover')
    try {
      await fetch(`${API}/connections/${connection.id}/discover`, { method: 'POST' })
      await loadOps()
    } finally { setBusy(null) }
  }

  async function remove() {
    if (!confirm(`Delete connection "${connection.displayName}"? This cannot be undone.`)) return
    setBusy('delete')
    try {
      await fetch(`${API}/connections/${connection.id}`, { method: 'DELETE' })
      onChanged()
    } finally { setBusy(null) }
  }

  const statusColor = connection.status === 'active' ? 'text-emerald-600 dark:text-emerald-400'
    : connection.status === 'error' ? 'text-red-600 dark:text-red-400'
    : 'text-zinc-500'

  // Premium connector quota — shown inline on the collapsed card so users can
  // see daily headroom without expanding the row. Only rendered for premium
  // tiles that have responded with `x-ratelimit-*` at least once; non-premium
  // and never-called connections fall back to the hidden state to keep the
  // list scan-able.
  const showQuota =
    !!connection.isPremium && connection.quotaRemaining != null
  const quotaPct =
    showQuota && connection.quotaLimit && connection.quotaLimit > 0
      ? Math.max(0, Math.min(100, (connection.quotaRemaining! / connection.quotaLimit) * 100))
      : null
  const quotaTone =
    quotaPct == null ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
      : quotaPct < 10 ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
      : quotaPct < 25 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
  const quotaTitle = showQuota
    ? `${connection.quotaRemaining}${connection.quotaLimit ? ` of ${connection.quotaLimit}` : ''} calls remaining` +
      (connection.quotaResetAt ? ` · resets ${new Date(connection.quotaResetAt).toLocaleString()}` : '') +
      (connection.quotaUpdatedAt ? ` · seen ${new Date(connection.quotaUpdatedAt).toLocaleString()}` : '')
    : ''

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold uppercase tracking-wider ${statusColor}`}>{connection.status}</span>
          <div>
            <div className="text-sm font-medium">{connection.displayName}</div>
            <div className="text-xs text-zinc-500">
              {connection.kind} · {connection.authType} · {connection.category}
              {connection.lastTestAt && ` · last test ${new Date(connection.lastTestAt).toLocaleString()}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {showQuota && (
            <span
              title={quotaTitle}
              className={`rounded px-2 py-0.5 text-[11px] font-medium tabular-nums ${quotaTone}`}
            >
              {connection.quotaLimit
                ? `${connection.quotaRemaining} / ${connection.quotaLimit} today`
                : `${connection.quotaRemaining} remaining`}
            </span>
          )}
          <span className="text-xs text-zinc-400">{expanded ? '▴' : '▾'}</span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <div className="mb-3 flex flex-wrap gap-2">
            <button onClick={test} disabled={!!busy} className="rounded border border-zinc-300 px-3 py-1 text-xs hover:border-emerald-400 dark:border-zinc-700">
              {busy === 'test' ? 'Testing…' : 'Test connection'}
            </button>
            {connection.kind === 'mcp' && (
              <button onClick={discover} disabled={!!busy} className="rounded border border-zinc-300 px-3 py-1 text-xs hover:border-emerald-400 dark:border-zinc-700">
                {busy === 'discover' ? 'Discovering…' : 'Discover MCP tools'}
              </button>
            )}
            <button onClick={remove} disabled={!!busy} className="ml-auto rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40">
              {busy === 'delete' ? 'Deleting…' : 'Delete'}
            </button>
          </div>
          {testResult && <div className="mb-3 text-xs text-zinc-600 dark:text-zinc-300">{testResult}</div>}
          {connection.lastTestError && !testResult && (
            <div className="mb-3 text-xs text-red-600">Last error: {connection.lastTestError}</div>
          )}
          <HealthPanel health={health} onRefresh={loadHealth} />
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Operations</h4>
            {ops === null ? (
              <div className="text-xs text-zinc-500">Loading…</div>
            ) : ops.length === 0 ? (
              <div className="text-xs text-zinc-500">No operations yet. {connection.kind === 'mcp' ? 'Click "Discover MCP tools".' : 'Add operations via API or seed from the catalog.'}</div>
            ) : (
              <ul className="space-y-1">
                {ops.map(o => (
                  <li key={o.id} className="rounded border border-zinc-100 px-2 py-1.5 text-xs dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-zinc-800">{o.method}</span>
                      <span className="font-medium">{o.name}</span>
                      <span className="text-zinc-500">{o.path}</span>
                      {!o.enabled && <span className="ml-auto text-amber-600">disabled</span>}
                    </div>
                    {o.description && <div className="mt-0.5 text-zinc-500">{o.description}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Custom tab — REST or MCP
// ─────────────────────────────────────────────────────────────────────────────
/**
 * One operation row in the custom-REST builder. The shape mirrors what
 * `connection_operations` accepts; `paramSchema` is keyed off the simple
 * `{ paramName: { type, required, description } }` form documented in the
 * catalog, which the executor's `normalizeParamSchema` understands.
 */
type OpDraft = {
  name: string
  description: string
  method: string
  path: string
  params: { name: string; type: string; required: boolean; description: string }[]
  cacheTtlSeconds: number
}

function emptyOp(): OpDraft {
  return { name: '', description: '', method: 'GET', path: '/', params: [], cacheTtlSeconds: 0 }
}

function CustomTab({ onCreated }: { onCreated: () => void }) {
  const [kind, setKind] = useState<'rest' | 'mcp'>('rest')
  const [displayName, setDisplayName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [mcpUrl, setMcpUrl] = useState('')
  const [authType, setAuthType] = useState('none')
  const [creds, setCreds] = useState<Record<string, string>>({})
  const [ops, setOps] = useState<OpDraft[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const credFields = credFieldsForAuth(authType)

  function paramSchemaFor(op: OpDraft): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const p of op.params) {
      if (!p.name.trim()) continue
      out[p.name.trim()] = {
        type: p.type || 'string',
        required: !!p.required,
        description: p.description || '',
      }
    }
    return out
  }

  async function submit() {
    setBusy(true); setErr(null); setOkMsg(null)
    try {
      const res = await fetch(`${API}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          displayName,
          baseUrl: kind === 'rest' ? baseUrl : '',
          mcpUrl:  kind === 'mcp' ? mcpUrl : '',
          authType,
          category: 'custom',
          credentials: creds,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error || `HTTP ${res.status}`)
      }
      const created = (await res.json()) as { id?: string }
      const newId = created?.id

      // For custom REST connections, persist any operations the admin
      // sketched out so the new connection is immediately useful (the
      // catalog flow gets ops auto-seeded; custom needs this round-trip).
      if (newId && kind === 'rest') {
        const valid = ops.filter((o) => o.name.trim() && o.path.trim())
        if (valid.length > 0) {
          for (const op of valid) {
            const opRes = await fetch(`${API}/connections/${newId}/operations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: op.name.trim(),
                description: op.description.trim(),
                method: op.method.toUpperCase(),
                path: op.path.trim(),
                paramSchema: paramSchemaFor(op),
                cacheTtlSeconds: Number(op.cacheTtlSeconds) || 0,
              }),
            })
            if (!opRes.ok) {
              const b = await opRes.json().catch(() => ({}))
              throw new Error(`Operation '${op.name}': ${b.error || opRes.status}`)
            }
          }
          setOkMsg(`Created connection with ${valid.length} operation${valid.length > 1 ? 's' : ''}.`)
        }
      }
      onCreated()
    } catch (e) {
      setErr((e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <div className="max-w-xl rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex gap-2">
        {(['rest', 'mcp'] as const).map(k => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              kind === k ? 'bg-emerald-600 text-white' : 'border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'
            }`}
          >
            {k === 'rest' ? 'Custom REST API' : 'Custom MCP Server'}
          </button>
        ))}
      </div>
      <Field label="Display name">
        <input
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="e.g. Internal pricing API"
          className="w-full rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </Field>
      {kind === 'rest' ? (
        <>
          <Field label="Base URL">
            <input
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com"
              className="w-full rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </Field>
          <Field label="Auth type">
            <select
              value={authType}
              onChange={e => { setAuthType(e.target.value); setCreds({}) }}
              className="w-full rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="none">None</option>
              <option value="api_key_header">API key (header)</option>
              <option value="api_key_query">API key (query)</option>
              <option value="bearer">Bearer token</option>
              <option value="basic">Basic auth</option>
            </select>
          </Field>
          {credFields.map(f => (
            <Field key={f.key} label={f.label}>
              <input
                type={f.secret ? 'password' : 'text'}
                value={creds[f.key] || ''}
                onChange={e => setCreds({ ...creds, [f.key]: e.target.value })}
                className="w-full rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </Field>
          ))}
          <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Operations</p>
                <p className="text-xs text-zinc-500">
                  Define the endpoints the agent + public API can call. Use{' '}
                  <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{'{param}'}</code>{' '}
                  in the path for variables (e.g. <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/customers/{'{id}'}</code>).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOps([...ops, emptyOp()])}
                className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                + Add operation
              </button>
            </div>
            {ops.length === 0 && (
              <p className="rounded border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700">
                No operations yet. You can add some now or come back later via &ldquo;My connections&rdquo;.
              </p>
            )}
            {ops.map((op, i) => (
              <div key={i} className="mb-3 rounded border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-500">Operation #{i + 1}</span>
                  <button
                    type="button"
                    onClick={() => setOps(ops.filter((_, j) => j !== i))}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Field label="Name (snake_case)">
                    <input
                      value={op.name}
                      onChange={e => setOps(ops.map((o, j) => j === i ? { ...o, name: e.target.value } : o))}
                      placeholder="get_customer"
                      className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </Field>
                  <Field label="HTTP method">
                    <select
                      value={op.method}
                      onChange={e => setOps(ops.map((o, j) => j === i ? { ...o, method: e.target.value } : o))}
                      className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Path (relative to base URL)">
                  <input
                    value={op.path}
                    onChange={e => setOps(ops.map((o, j) => j === i ? { ...o, path: e.target.value } : o))}
                    placeholder="/v1/customers/{id}"
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </Field>
                <Field label="Description (shown to the agent)">
                  <input
                    value={op.description}
                    onChange={e => setOps(ops.map((o, j) => j === i ? { ...o, description: e.target.value } : o))}
                    placeholder="Fetch a customer by id"
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </Field>
                {op.method === 'GET' && (
                  <Field label="Cache TTL (seconds, 0 = none)">
                    <input
                      type="number"
                      min={0}
                      value={op.cacheTtlSeconds}
                      onChange={e => setOps(ops.map((o, j) => j === i ? { ...o, cacheTtlSeconds: Number(e.target.value) || 0 } : o))}
                      className="w-32 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </Field>
                )}
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Parameters</span>
                    <button
                      type="button"
                      onClick={() => setOps(ops.map((o, j) => j === i ? { ...o, params: [...o.params, { name: '', type: 'string', required: false, description: '' }] } : o))}
                      className="text-xs text-emerald-600 hover:underline"
                    >
                      + Add parameter
                    </button>
                  </div>
                  {op.params.length === 0 && (
                    <p className="text-xs text-zinc-400">No parameters.</p>
                  )}
                  {op.params.map((p, pi) => (
                    <div key={pi} className="mb-1 flex flex-wrap items-center gap-2">
                      <input
                        value={p.name}
                        onChange={e => setOps(ops.map((o, j) => j === i ? { ...o, params: o.params.map((pp, ppi) => ppi === pi ? { ...pp, name: e.target.value } : pp) } : o))}
                        placeholder="param name"
                        className="w-32 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      />
                      <select
                        value={p.type}
                        onChange={e => setOps(ops.map((o, j) => j === i ? { ...o, params: o.params.map((pp, ppi) => ppi === pi ? { ...pp, type: e.target.value } : pp) } : o))}
                        className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        {['string', 'number', 'boolean'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <label className="flex items-center gap-1 text-xs text-zinc-500">
                        <input
                          type="checkbox"
                          checked={p.required}
                          onChange={e => setOps(ops.map((o, j) => j === i ? { ...o, params: o.params.map((pp, ppi) => ppi === pi ? { ...pp, required: e.target.checked } : pp) } : o))}
                        />
                        required
                      </label>
                      <input
                        value={p.description}
                        onChange={e => setOps(ops.map((o, j) => j === i ? { ...o, params: o.params.map((pp, ppi) => ppi === pi ? { ...pp, description: e.target.value } : pp) } : o))}
                        placeholder="description"
                        className="min-w-[120px] flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      />
                      <button
                        type="button"
                        onClick={() => setOps(ops.map((o, j) => j === i ? { ...o, params: o.params.filter((_, ppi) => ppi !== pi) } : o))}
                        className="text-xs text-red-600 hover:underline"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <Field label="MCP server URL">
            <input
              value={mcpUrl}
              onChange={e => setMcpUrl(e.target.value)}
              placeholder="https://mcp.example.com/sse"
              className="w-full rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </Field>
          <Field label="Auth type">
            <select
              value={authType}
              onChange={e => { setAuthType(e.target.value); setCreds({}) }}
              className="w-full rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="none">None</option>
              <option value="bearer">Bearer token</option>
              <option value="api_key_header">API key (header)</option>
            </select>
          </Field>
          {credFields.map(f => (
            <Field key={f.key} label={f.label}>
              <input
                type={f.secret ? 'password' : 'text'}
                value={creds[f.key] || ''}
                onChange={e => setCreds({ ...creds, [f.key]: e.target.value })}
                className="w-full rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </Field>
          ))}
        </>
      )}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      {okMsg && <p className="mt-2 text-sm text-emerald-600">{okMsg}</p>}
      <div className="mt-4 flex justify-end">
        <button
          disabled={busy || !displayName.trim() || (kind === 'rest' ? !baseUrl.trim() : !mcpUrl.trim())}
          onClick={submit}
          className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create connection'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Health panel — surfaces last call / error rate / p50 / rate-limit headroom
// ─────────────────────────────────────────────────────────────────────────────
function HealthPanel({ health, onRefresh }: {
  health: HealthSummary | null
  onRefresh: () => void
}) {
  if (!health) {
    return (
      <div className="mb-3 rounded border border-zinc-100 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800">
        Loading health…
      </div>
    )
  }
  const errPct = (health.errorRate * 100).toFixed(1)
  const errColor =
    health.errorRate >= 0.10 ? 'text-red-600 dark:text-red-400' :
    health.errorRate >  0    ? 'text-amber-600 dark:text-amber-400' :
                               'text-emerald-600 dark:text-emerald-400'
  const rl = health.rateLimit
  const rlPct = (rl && rl.remaining != null && rl.limit && rl.limit > 0)
    ? Math.max(0, Math.min(100, (rl.remaining / rl.limit) * 100))
    : null
  return (
    <div className="mb-3 rounded border border-zinc-100 p-3 dark:border-zinc-800">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Health · last 24h</h4>
        <button onClick={onRefresh} className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">refresh</button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="Calls" value={String(health.callCount)} />
        <Stat label="Errors" value={`${health.errorCount} (${errPct}%)`} valueClassName={errColor} />
        <Stat label="p50 latency" value={health.p50LatencyMs != null ? `${health.p50LatencyMs} ms` : '—'} />
        <Stat label="p95 latency" value={health.p95LatencyMs != null ? `${health.p95LatencyMs} ms` : '—'} />
        <Stat
          label="Last call"
          value={health.lastCallAt ? new Date(health.lastCallAt).toLocaleString() : '—'}
        />
        <Stat
          label="Last error"
          value={health.lastErrorAt ? new Date(health.lastErrorAt).toLocaleString() : '—'}
          valueClassName={health.lastErrorAt ? 'text-red-600 dark:text-red-400' : ''}
        />
        <Stat
          label="Rate-limit remaining"
          value={
            rl && rl.remaining != null
              ? (rl.limit ? `${rl.remaining} / ${rl.limit}` : String(rl.remaining))
              : 'n/a'
          }
          valueClassName={rlPct != null && rlPct < 20 ? 'text-amber-600 dark:text-amber-400' : ''}
        />
        <Stat
          label="Rate-limit reset"
          value={rl && rl.resetAt ? new Date(rl.resetAt).toLocaleTimeString() : '—'}
        />
      </div>
      {health.recentEvents.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
            Recent events ({health.recentEvents.length})
          </summary>
          <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs">
            {health.recentEvents.map((ev, i) => (
              <li key={i} className="flex items-center gap-2 font-mono">
                <span className="text-zinc-400">{new Date(ev.occurredAt).toLocaleTimeString()}</span>
                <span className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{ev.kind}</span>
                {ev.operation && <span className="text-zinc-500">{ev.operation}</span>}
                {ev.status != null && (
                  <span className={ev.status >= 400 ? 'text-red-600' : 'text-emerald-600'}>
                    {ev.status}
                  </span>
                )}
                {ev.latencyMs != null && <span className="text-zinc-400">{ev.latencyMs}ms</span>}
                {ev.error && <span className="truncate text-red-500">{ev.error}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Stat({ label, value, valueClassName = '' }: {
  label: string; value: string; valueClassName?: string
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-400">{label}</div>
      <div className={`font-medium ${valueClassName}`}>{value}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Generic UI helpers
// ─────────────────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">{label}</label>
      {children}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900" onClick={e => e.stopPropagation()}>
        <h2 className="mb-4 text-base font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}
