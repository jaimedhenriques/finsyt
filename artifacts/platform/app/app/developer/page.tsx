'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────
interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  scope: 'read' | 'read_write'
  tier: 'free' | 'paid' | 'enterprise'
  rateLimitPerMinute: number
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

interface EndpointDef {
  method: 'GET'
  path: string
  name: string
  description: string
  params: { name: string; required?: boolean; placeholder: string; help?: string }[]
}

const ENDPOINTS: EndpointDef[] = [
  { method: 'GET', path: '/quote', name: 'Quote', description: 'Live / delayed price + company overlay.',
    params: [{ name: 'symbol', required: true, placeholder: 'AAPL' }] },
  { method: 'GET', path: '/aggs', name: 'Aggregates (OHLCV)', description: 'Historical bars across timespans.',
    params: [
      { name: 'symbol', required: true, placeholder: 'AAPL' },
      { name: 'from', placeholder: '2024-01-01' },
      { name: 'to', placeholder: '2024-12-31' },
      { name: 'timespan', placeholder: 'day', help: 'minute|hour|day|week|month' },
    ] },
  { method: 'GET', path: '/financials', name: 'Financials', description: 'Income, balance, cash flow, ratios. Single metric or batch.',
    params: [
      { name: 'symbol', required: true, placeholder: 'AAPL' },
      { name: 'metric', placeholder: 'iq_total_rev' },
      { name: 'period', placeholder: 'A', help: 'A=annual, Q=quarterly' },
      { name: 'limit', placeholder: '5' },
    ] },
  { method: 'GET', path: '/news', name: 'News', description: 'AI-tagged news with sentiment scores.',
    params: [
      { name: 'symbol', placeholder: 'TSLA' },
      { name: 'limit', placeholder: '20' },
    ] },
  { method: 'GET', path: '/filings', name: 'SEC Filings', description: 'EDGAR 10-K, 10-Q, 8-K, S-1, Form 4.',
    params: [
      { name: 'symbol', required: true, placeholder: 'NVDA' },
      { name: 'type', placeholder: '10-K' },
      { name: 'limit', placeholder: '10' },
    ] },
  { method: 'GET', path: '/insider', name: 'Insider Trades', description: 'Insider buy / sell activity.',
    params: [
      { name: 'symbol', placeholder: 'AAPL' },
      { name: 'type', placeholder: 'buy' },
      { name: 'limit', placeholder: '20' },
    ] },
  { method: 'GET', path: '/search', name: 'Search', description: 'Symbol & company search across global exchanges.',
    params: [
      { name: 'q', required: true, placeholder: 'apple' },
      { name: 'limit', placeholder: '10' },
    ] },
  { method: 'GET', path: '/screener', name: 'Screener', description: 'Filter the universe by sector, mcap, P/E, etc.',
    params: [
      { name: 'sector', placeholder: 'Technology' },
      { name: 'minMcap', placeholder: '1e9' },
      { name: 'limit', placeholder: '25' },
      { name: 'sort', placeholder: 'marketCap' },
    ] },
  { method: 'GET', path: '/census/datasets', name: 'Census · Datasets', description: 'U.S. Census Bureau dataset catalog (ACS, Decennial, BDS, …).',
    params: [
      { name: 'q', placeholder: 'acs5' },
      { name: 'vintage', placeholder: '2022' },
      { name: 'limit', placeholder: '25' },
    ] },
  { method: 'GET', path: '/census/aggregate', name: 'Census · Aggregate', description: 'Run a Census Data API query: pick variables, geography, vintage.',
    params: [
      { name: 'dataset', required: true, placeholder: 'acs/acs5', help: 'e.g. acs/acs5, dec/pl, timeseries/bds' },
      { name: 'vintage', required: true, placeholder: '2022' },
      { name: 'get', required: true, placeholder: 'NAME,B19013_001E', help: 'comma-separated variables' },
      { name: 'for', placeholder: 'state:*', help: 'geography clause' },
      { name: 'in', placeholder: 'state:48' },
    ] },
  { method: 'GET', path: '/census/groups', name: 'Census · Tables', description: 'List variable groups (tables) for a dataset.',
    params: [
      { name: 'dataset', required: true, placeholder: 'acs/acs5' },
      { name: 'vintage', required: true, placeholder: '2022' },
      { name: 'q', placeholder: 'income' },
    ] },
  { method: 'GET', path: '/census/variables', name: 'Census · Variables', description: 'List variables for a dataset / group with concept + label.',
    params: [
      { name: 'dataset', required: true, placeholder: 'acs/acs5' },
      { name: 'vintage', required: true, placeholder: '2022' },
      { name: 'group', placeholder: 'B19013' },
      { name: 'q', placeholder: 'median income' },
    ] },
  { method: 'GET', path: '/census/geocode', name: 'Census · Geocoder', description: 'Resolve an address to lat/lon + FIPS state/county/tract/block.',
    params: [
      { name: 'address', placeholder: '1600 Pennsylvania Ave NW, Washington DC' },
      { name: 'lat', placeholder: '37.7749' },
      { name: 'lon', placeholder: '-122.4194' },
    ] },
]

// ─────────────────────────────────────────────────────────────────────────────
//  Snippet generators
// ─────────────────────────────────────────────────────────────────────────────
function snippets(key: string, baseUrl: string): Record<string, string> {
  const k = key || 'YOUR_API_KEY'
  return {
    cURL: `curl "${baseUrl}/quote?symbol=AAPL" \\
  -H "Authorization: Bearer ${k}"`,
    JavaScript: `const res = await fetch("${baseUrl}/quote?symbol=AAPL", {
  headers: { Authorization: "Bearer ${k}" }
});
const data = await res.json();
console.log(data);`,
    TypeScript: `import { z } from "zod";

const Quote = z.object({
  symbol: z.string(), price: z.number(), changePct: z.number().nullable(),
  marketCap: z.number().nullable(), source: z.string().optional(),
});

export async function getQuote(symbol: string) {
  const r = await fetch(\`${baseUrl}/quote?symbol=\${symbol}\`, {
    headers: { Authorization: "Bearer ${k}" },
  });
  if (!r.ok) throw new Error(\`Finsyt \${r.status}\`);
  return Quote.parse(await r.json());
}`,
    Python: `import os, requests

API = "${baseUrl}"
HEADERS = {"Authorization": f"Bearer ${k}"}

def quote(symbol: str):
    r = requests.get(f"{API}/quote", params={"symbol": symbol}, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()

print(quote("AAPL"))`,
    Go: `package main

import (
    "encoding/json"
    "fmt"
    "io"
    "net/http"
)

func main() {
    req, _ := http.NewRequest("GET", "${baseUrl}/quote?symbol=AAPL", nil)
    req.Header.Set("Authorization", "Bearer ${k}")
    res, _ := http.DefaultClient.Do(req)
    defer res.Body.Close()
    body, _ := io.ReadAll(res.Body)
    var out map[string]any
    _ = json.Unmarshal(body, &out)
    fmt.Println(out)
}`,
    Excel: `=FINSYT.QUOTE("AAPL")
=FINSYT.METRIC("AAPL","revenue","annual",-1)
=FINSYT.HISTORY("AAPL","2024-01-01","2024-12-31")
=FINSYT.SEARCH("apple", 5)`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Atoms
// ─────────────────────────────────────────────────────────────────────────────
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.35)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontWeight: 600 }}>{lang}</span>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400) }}
          style={{ fontSize: 11, fontWeight: 600, color: copied ? 'var(--pos)' : 'rgba(255,255,255,0.45)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '14px 16px', fontSize: 12.5, lineHeight: 1.65, color: '#E2E8F0', overflowX: 'auto', fontFamily: "'JetBrains Mono', monospace" }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', background: color || 'rgba(255,255,255,0.08)', color: '#fff' }}>
      {children}
    </span>
  )
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  const d = new Date(s); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ─────────────────────────────────────────────────────────────────────────────
//  Page
// ─────────────────────────────────────────────────────────────────────────────
type Tab = 'quickstart' | 'keys' | 'endpoints' | 'snippets' | 'excel' | 'spec'

export default function DeveloperPage() {
  const [tab, setTab] = useState<Tab>('quickstart')
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // newly-issued plaintext (shown once)
  const [newPlaintext, setNewPlaintext] = useState<{ keyId: string; plaintext: string; name: string } | null>(null)
  const [activeKeyForSnippets, setActiveKeyForSnippets] = useState<string>('')

  const baseUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://finsyt.com/platform/api/v1'
    return `${window.location.origin}/platform/api/v1`
  }, [])

  const loadKeys = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/platform/api/v1/keys')
      if (!r.ok) throw new Error(await r.text())
      const j = await r.json()
      setKeys(j.keys || [])
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadKeys() }, [loadKeys])

  return (
    <div style={{ padding: '32px clamp(20px, 4vw, 56px)', maxWidth: 1280, margin: '0 auto', color: 'var(--text)' }}>
      {/* ── Header ───────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Badge color="linear-gradient(135deg,var(--accent),#06B6D4)">v1 · Live</Badge>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{baseUrl}</span>
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.02em', margin: 0, color: '#fff' }}>Developer Console</h1>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', marginTop: 6, maxWidth: 760, lineHeight: 1.5 }}>
          Issue keys, explore endpoints, and ship in minutes. Same data that powers the Finsyt platform — exposed as REST, MCP, and Excel custom functions.
        </p>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div role="tablist" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 24, width: 'fit-content', overflowX: 'auto' }}>
        {([
          ['quickstart', 'Quickstart'],
          ['keys', `Keys${keys.length ? ` (${keys.filter(k => !k.revokedAt).length})` : ''}`],
          ['endpoints', 'Endpoints'],
          ['snippets', 'Snippets'],
          ['excel', 'Excel Add-in'],
          ['spec', 'OpenAPI'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '8px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: tab === id ? 'rgba(27,79,255,0.18)' : 'transparent',
            color: tab === id ? '#fff' : 'rgba(255,255,255,0.6)',
            fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>{label}</button>
        ))}
      </div>

      {error && <div style={{ padding: 12, borderRadius: 8, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#FCA5A5', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {tab === 'quickstart' && <QuickstartTab baseUrl={baseUrl} firstKey={keys.find(k => !k.revokedAt)} onGoToKeys={() => setTab('keys')} />}
      {tab === 'keys' && <KeysTab keys={keys} loading={loading} onChange={loadKeys} newPlaintext={newPlaintext} setNewPlaintext={setNewPlaintext} />}
      {tab === 'endpoints' && <EndpointsTab baseUrl={baseUrl} keys={keys} />}
      {tab === 'snippets' && <SnippetsTab baseUrl={baseUrl} keys={keys} activeKey={activeKeyForSnippets} setActiveKey={setActiveKeyForSnippets} />}
      {tab === 'excel' && <ExcelTab baseUrl={baseUrl} />}
      {tab === 'spec' && <SpecTab baseUrl={baseUrl} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Quickstart
// ─────────────────────────────────────────────────────────────────────────────
function QuickstartTab({ baseUrl, firstKey, onGoToKeys }: { baseUrl: string; firstKey: ApiKeyRow | undefined; onGoToKeys: () => void }) {
  const sn = snippets('YOUR_API_KEY', baseUrl)
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 32 }}>
        {[
          { n: 1, title: 'Generate a key', body: firstKey ? `You have ${firstKey.tier} key "${firstKey.name}".` : 'Create a key on the Keys tab. Free tier gives 60 req/min.', cta: firstKey ? null : 'Create Key', onClick: onGoToKeys },
          { n: 2, title: 'Make a call', body: 'Send GET /v1/quote?symbol=AAPL with Authorization: Bearer fsk_…', cta: null, onClick: undefined },
          { n: 3, title: 'Hit production scale', body: 'Upgrade to paid for 600 req/min, or enterprise for 6000.', cta: null, onClick: undefined },
        ].map(s => (
          <div key={s.n} style={{ padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 6 }}>STEP {s.n}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{s.title}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 10, lineHeight: 1.5 }}>{s.body}</div>
            {s.cta && <button onClick={s.onClick} style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{s.cta}</button>}
          </div>
        ))}
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 0, marginBottom: 12 }}>Make your first request</h2>
      <CodeBlock lang="curl" code={sn.cURL} />
      <div style={{ marginTop: 24, padding: 18, borderRadius: 12, border: '1px solid rgba(27,79,255,0.2)', background: 'rgba(27,79,255,0.04)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Three surfaces, one set of credentials</div>
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
          The same <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: 4 }}>fsk_</code> key authenticates the public REST API,
          the hosted MCP server (for Claude / Cursor / ChatGPT), and the Finsyt Excel Add-in's custom functions.
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Keys
// ─────────────────────────────────────────────────────────────────────────────
function KeysTab({ keys, loading, onChange, newPlaintext, setNewPlaintext }: {
  keys: ApiKeyRow[]; loading: boolean; onChange: () => void;
  newPlaintext: { keyId: string; plaintext: string; name: string } | null;
  setNewPlaintext: (v: { keyId: string; plaintext: string; name: string } | null) => void;
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'read' | 'read_write'>('read')
  const [tier, setTier] = useState<'free' | 'paid' | 'enterprise'>('free')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function create() {
    if (!name.trim()) { setErr('Name is required'); return }
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/platform/api/v1/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), scope, tier }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed')
      setNewPlaintext({ keyId: j.id, plaintext: j.plaintextKey, name: j.name })
      setName(''); setScope('read'); setTier('free'); setShowCreate(false)
      onChange()
    } catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }

  async function revoke(id: string, n: string) {
    if (!confirm(`Revoke "${n}"? This cannot be undone — apps using this key will start receiving 401.`)) return
    const r = await fetch(`/platform/api/v1/keys/${id}`, { method: 'DELETE' })
    if (r.ok) onChange()
  }

  async function rotate(id: string, n: string) {
    if (!confirm(`Rotate "${n}"? The current key will stop working immediately and be replaced with a new one.`)) return
    const r = await fetch(`/platform/api/v1/keys/${id}/rotate`, { method: 'POST' })
    const j = await r.json()
    if (r.ok) { setNewPlaintext({ keyId: j.id, plaintext: j.plaintextKey, name: j.name }); onChange() }
  }

  return (
    <div>
      {newPlaintext && (
        <div style={{ padding: 18, borderRadius: 12, border: '1.5px solid var(--pos)', background: 'rgba(34,197,94,0.06)', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>New key for "{newPlaintext.name}" — copy now, this is shown only once</div>
            <button onClick={() => setNewPlaintext(null)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 18, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, padding: '10px 12px', borderRadius: 7, background: 'rgba(0,0,0,0.4)', fontSize: 13, color: '#fff', fontFamily: 'monospace', overflowX: 'auto', userSelect: 'all' }}>{newPlaintext.plaintext}</code>
            <button onClick={() => navigator.clipboard.writeText(newPlaintext.plaintext)} style={{ padding: '10px 16px', borderRadius: 7, background: 'var(--pos)', color: '#000', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Copy</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
          {keys.length === 0 ? 'No API keys yet. Create one to start making requests.' :
            `${keys.filter(k => !k.revokedAt).length} active · ${keys.filter(k => k.revokedAt).length} revoked · max 10 active per workspace`}
        </div>
        {!showCreate && <button onClick={() => setShowCreate(true)} style={{ padding: '8px 16px', borderRadius: 7, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>+ Create key</button>}
      </div>

      {showCreate && (
        <div style={{ padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontWeight: 700 }}>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Production backend" style={{ width: '100%', padding: '8px 10px', borderRadius: 7, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 13, fontFamily: 'inherit' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontWeight: 700 }}>Scope</label>
              <select value={scope} onChange={e => setScope(e.target.value as 'read' | 'read_write')} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 13, fontFamily: 'inherit' }}>
                <option value="read">read</option>
                <option value="read_write">read_write</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontWeight: 700 }}>Tier</label>
              <select value={tier} onChange={e => setTier(e.target.value as 'free' | 'paid' | 'enterprise')} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 13, fontFamily: 'inherit' }}>
                <option value="free">free — 60 req/min</option>
                <option value="paid">paid — 600 req/min</option>
                <option value="enterprise">enterprise — 6000 req/min</option>
              </select>
            </div>
          </div>
          {err && <div style={{ marginTop: 10, padding: 8, borderRadius: 6, background: 'rgba(220,38,38,0.12)', color: '#FCA5A5', fontSize: 12 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={create} disabled={busy} style={{ padding: '8px 16px', borderRadius: 7, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>{busy ? 'Creating…' : 'Create'}</button>
            <button onClick={() => { setShowCreate(false); setErr(null) }} style={{ padding: '8px 16px', borderRadius: 7, background: 'transparent', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              {['Name', 'Prefix', 'Scope', 'Tier', 'Limit', 'Last used', 'Created', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Loading…</td></tr>}
            {!loading && keys.length === 0 && <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>No keys yet</td></tr>}
            {keys.map(k => (
              <tr key={k.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', opacity: k.revokedAt ? 0.45 : 1 }}>
                <td style={{ padding: '12px 14px', color: '#fff', fontWeight: 600 }}>
                  {k.name}
                  {k.revokedAt && <span style={{ marginLeft: 8 }}><Badge color="rgba(220,38,38,0.6)">Revoked</Badge></span>}
                </td>
                <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)' }}>{k.prefix}…</td>
                <td style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.7)' }}>{k.scope}</td>
                <td style={{ padding: '12px 14px' }}><Badge color={k.tier === 'enterprise' ? 'linear-gradient(135deg,#8B5CF6,#06B6D4)' : k.tier === 'paid' ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}>{k.tier}</Badge></td>
                <td style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.6)' }}>{k.rateLimitPerMinute}/min</td>
                <td style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.5)' }}>{fmtDate(k.lastUsedAt)}</td>
                <td style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.5)' }}>{fmtDate(k.createdAt)}</td>
                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                  {!k.revokedAt && (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <button onClick={() => rotate(k.id, k.name)} style={{ padding: '4px 10px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Rotate</button>
                      <button onClick={() => revoke(k.id, k.name)} style={{ padding: '4px 10px', borderRadius: 5, background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', color: '#FCA5A5', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Revoke</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Endpoints (with try-it)
// ─────────────────────────────────────────────────────────────────────────────
function EndpointsTab({ baseUrl, keys }: { baseUrl: string; keys: ApiKeyRow[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {ENDPOINTS.map((ep, i) => (
        <EndpointCard key={ep.path} endpoint={ep} baseUrl={baseUrl} keys={keys} open={openIdx === i} onToggle={() => setOpenIdx(openIdx === i ? null : i)} />
      ))}
    </div>
  )
}

function EndpointCard({ endpoint, baseUrl, keys, open, onToggle }: {
  endpoint: EndpointDef; baseUrl: string; keys: ApiKeyRow[]; open: boolean; onToggle: () => void
}) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(endpoint.params.map(p => [p.name, ''])))
  const [resp, setResp] = useState<{ status: number; ms: number; body: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const activeKeys = keys.filter(k => !k.revokedAt)

  async function tryIt() {
    setBusy(true); setResp(null)
    const qp = new URLSearchParams()
    for (const p of endpoint.params) {
      const v = vals[p.name]?.trim()
      if (v) qp.set(p.name, v)
      else if (p.required) { setResp({ status: 400, ms: 0, body: JSON.stringify({ error: `${p.name} is required` }, null, 2) }); setBusy(false); return }
    }
    const t0 = Date.now()
    try {
      // Use cookie-auth (Clerk) for "try it" so users don't need to copy a key.
      // The internal route handlers underneath require Clerk session, which is
      // already established. (Public callers from outside use Bearer on the
      // /api/v1/* routes.)
      const url = `/platform/api${endpoint.path}?${qp.toString()}`
      const r = await fetch(url)
      const txt = await r.text()
      let body = txt
      try { body = JSON.stringify(JSON.parse(txt), null, 2) } catch { /* not json */ }
      setResp({ status: r.status, ms: Date.now() - t0, body })
    } catch (e) {
      setResp({ status: 0, ms: Date.now() - t0, body: (e as Error).message })
    } finally { setBusy(false) }
  }

  return (
    <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', textAlign: 'left' }}>
        <span style={{ padding: '3px 10px', borderRadius: 5, background: 'rgba(34,197,94,0.15)', color: '#86EFAC', fontSize: 11, fontWeight: 800, fontFamily: 'monospace' }}>{endpoint.method}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#fff', fontWeight: 600 }}>/v1{endpoint.path}</span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', flex: 1 }}>{endpoint.description}</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 14 }}>
            {endpoint.params.map(p => (
              <div key={p.name}>
                <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4, fontWeight: 600 }}>
                  {p.name}{p.required && <span style={{ color: 'var(--neg)' }}> *</span>}
                  {p.help && <span style={{ marginLeft: 6, color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>{p.help}</span>}
                </label>
                <input value={vals[p.name]} onChange={e => setVals(v => ({ ...v, [p.name]: e.target.value }))} placeholder={p.placeholder} style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, fontFamily: 'monospace' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
            <button onClick={tryIt} disabled={busy} style={{ padding: '8px 18px', borderRadius: 7, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>{busy ? 'Calling…' : 'Try it'}</button>
            {activeKeys.length > 0 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Console uses your session — public clients send <code>Authorization: Bearer {activeKeys[0].prefix}…</code></span>}
            {activeKeys.length === 0 && <span style={{ fontSize: 11, color: 'var(--amber)' }}>No active key yet — generate one for production use</span>}
          </div>
          {resp && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Badge color={resp.status >= 200 && resp.status < 300 ? 'var(--pos)' : resp.status === 0 ? 'rgba(255,255,255,0.2)' : 'var(--neg)'}>
                  {resp.status === 0 ? 'NETWORK' : resp.status}
                </Badge>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{resp.ms}ms</span>
              </div>
              <CodeBlock lang="json" code={resp.body.slice(0, 8000) + (resp.body.length > 8000 ? '\n…(truncated)' : '')} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Snippets
// ─────────────────────────────────────────────────────────────────────────────
function SnippetsTab({ baseUrl, keys, activeKey, setActiveKey }: { baseUrl: string; keys: ApiKeyRow[]; activeKey: string; setActiveKey: (k: string) => void }) {
  const [lang, setLang] = useState<string>('cURL')
  const langs = ['cURL', 'JavaScript', 'TypeScript', 'Python', 'Go', 'Excel']
  const sn = snippets(activeKey, baseUrl)
  const activeKeys = keys.filter(k => !k.revokedAt)
  return (
    <div>
      <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6, fontWeight: 600 }}>Insert API key</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={activeKey} onChange={e => setActiveKey(e.target.value)} placeholder="fsk_… (paste a freshly created key)" style={{ flex: 1, minWidth: 240, padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, fontFamily: 'monospace' }} />
          {activeKeys.length === 0 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>No keys yet — go to the Keys tab</span>}
        </div>
      </div>
      <div role="tablist" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 12, width: 'fit-content', overflowX: 'auto' }}>
        {langs.map(l => (
          <button key={l} onClick={() => setLang(l)} style={{ padding: '6px 12px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: lang === l ? 'rgba(27,79,255,0.18)' : 'transparent', color: lang === l ? '#fff' : 'rgba(255,255,255,0.55)', fontFamily: 'inherit' }}>{l}</button>
        ))}
      </div>
      <CodeBlock lang={lang} code={sn[lang]} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Excel Add-in
// ─────────────────────────────────────────────────────────────────────────────
function ExcelTab({ baseUrl }: { baseUrl: string }) {
  // Origin (no /api/v1 suffix) — manifest + static files live at /platform/excel-addin/*.
  const origin = baseUrl.replace(/\/platform\/api\/v1$/, '')
  const manifestUrl = `${origin}/platform/excel-addin/manifest.xml`
  const devManifestUrl = `${origin}/platform/excel-addin/dev-manifest.xml`

  const fns: { name: string; sig: string; desc: string }[] = [
    { name: 'QUOTE',      sig: '=FINSYT.QUOTE("AAPL")',                                          desc: 'Latest price + change for a symbol.' },
    { name: 'METRIC',     sig: '=FINSYT.METRIC("AAPL","revenue","annual",-1)',                   desc: 'Single fundamental metric (offset 0=most recent).' },
    { name: 'HISTORY',    sig: '=FINSYT.HISTORY("AAPL","2024-01-01","2024-12-31")',              desc: 'Daily OHLCV range as a spilling array.' },
    { name: 'FINANCIALS', sig: '=FINSYT.FINANCIALS("AAPL","income","revenue","FY-1")',           desc: 'Single line item from income / balance / cash for a given period.' },
    { name: 'ESTIMATE',   sig: '=FINSYT.ESTIMATE("AAPL","eps","next_q","consensus")',            desc: 'Forward analyst estimate (consensus | high | low | median).' },
    { name: 'TRANSCRIPT', sig: '=FINSYT.TRANSCRIPT("AAPL","2025Q2","summary")',                  desc: 'Earnings call text spilled as a 2-D range (summary | prepared | qa | full).' },
    { name: 'FILINGS',    sig: '=FINSYT.FILINGS("AAPL","10-K",3)',                               desc: 'Recent SEC filings table.' },
    { name: 'NEWS',       sig: '=FINSYT.NEWS("AAPL",10)',                                        desc: 'Recent news headlines + sentiment.' },
    { name: 'MACRO',      sig: '=FINSYT.MACRO("CPI","2020-01-01","2024-12-31")',                 desc: 'Macro indicator series between two dates (CPI, GDP, unemployment, yields, …).' },
    { name: 'MACRO_LATEST', sig: '=FINSYT.MACRO_LATEST("YIELD_10Y")',                            desc: 'Scalar latest reading for a macro indicator (used by the WACC builder for the risk-free rate).' },
    { name: 'DIVIDEND',   sig: '=FINSYT.DIVIDEND("AAPL","yield")',                               desc: 'Dividend metric: yield | payout | nextExDate | amount | frequency.' },
    { name: 'SEARCH',     sig: '=FINSYT.SEARCH("apple",5)',                                      desc: 'Symbol / company search.' },
    { name: 'ASK',        sig: '=FINSYT.ASK("Compare gross margin","AAPL")',                     desc: 'One-shot natural language answer with optional ticker context.' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Hero */}
      <div style={{ padding: 22, borderRadius: 14, border: '1px solid rgba(27,79,255,0.25)', background: 'linear-gradient(135deg, rgba(27,79,255,0.12), rgba(6,182,212,0.04))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Badge color="linear-gradient(135deg,#1B4FFF,#06B6D4)">Excel Add-in</Badge>
          <Badge>v1.1</Badge>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 0 6px 0' }}>Finsyt for Microsoft Excel</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.55, maxWidth: 720 }}>
          A Finsyt Agent task pane, a Builder ribbon with one-click DCF / Comps / Sensitivity / WACC templates, and 12 native worksheet
          functions. Sign in with your Finsyt account or paste an <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: 4 }}>fsk_</code> key — same data as the REST API and MCP.
        </p>
      </div>

      {/* Install */}
      <section>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: '0 0 10px 0' }}>Install (sideload)</h3>
        <ol style={{ margin: 0, paddingLeft: 20, color: 'rgba(255,255,255,0.75)', fontSize: 13.5, lineHeight: 1.7 }}>
          <li>Download the manifest below.</li>
          <li>In Excel, go to <strong>Insert → Office Add-ins → My Add-ins → Upload My Add-in</strong> and select the file.</li>
          <li>Click the <strong>Finsyt</strong> button on the Home ribbon to open the task pane and sign in.</li>
        </ol>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <a href={manifestUrl} download style={{ padding: '8px 14px', borderRadius: 7, background: 'var(--accent)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>Download manifest.xml</a>
          <a href={devManifestUrl} download style={{ padding: '8px 14px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' }}>Download dev-manifest.xml</a>
          <a href={`${origin}/platform/excel-addin/`} target="_blank" rel="noreferrer" style={{ padding: '8px 14px', borderRadius: 7, background: 'transparent', color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: 13, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' }}>Browse files →</a>
        </div>
      </section>

      {/* Finsyt Agent + Builder */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <div style={{ padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 8 }}>FINSYT AGENT</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>AI chat that sees your sheet</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>
            The task pane reads your current selection, streams responses with tool steps and citations, and proposes formula or
            template inserts that you apply with one click via <code>Excel.run</code>.
          </div>
        </div>
        <div style={{ padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 8 }}>BUILDER</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>One-click models</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>
            DCF, Comps, Sensitivity, and WACC scaffolds insert at your active cell, pre-wired to <code>=FINSYT.*</code> calls — edit
            assumptions, not boilerplate.
          </div>
        </div>
        <div style={{ padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 8 }}>AUTH</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Clerk popup or API key</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>
            Sign in with your Finsyt account through an Office dialog popup, or paste an <code>fsk_</code> key. Tokens are scoped
            per workbook via <code>Office.context.document.settings</code>.
          </div>
        </div>
      </section>

      {/* Functions */}
      <section>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: '0 0 10px 0' }}>Worksheet functions</h3>
        <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px', color: 'rgba(255,255,255,0.55)', fontWeight: 600, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', color: 'rgba(255,255,255,0.55)', fontWeight: 600, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Example</th>
                <th style={{ textAlign: 'left', padding: '10px 14px', color: 'rgba(255,255,255,0.55)', fontWeight: 600, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {fns.map((f) => (
                <tr key={f.name} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '10px 14px', color: '#fff', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, whiteSpace: 'nowrap' }}>FINSYT.{f.name}</td>
                  <td style={{ padding: '10px 14px', color: '#9DB1FF', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, whiteSpace: 'nowrap' }}>{f.sig}</td>
                  <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.7)' }}>{f.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sample */}
      <section>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: '0 0 10px 0' }}>Sample formulas</h3>
        <CodeBlock
          lang="excel"
          code={fns.slice(0, 6).map(f => f.sig).join('\n')}
        />
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Spec
// ─────────────────────────────────────────────────────────────────────────────
function SpecTab({ baseUrl }: { baseUrl: string }) {
  const [spec, setSpec] = useState<string>('Loading…')
  useEffect(() => {
    fetch('/platform/api/v1/openapi.json').then(r => r.json()).then(j => setSpec(JSON.stringify(j, null, 2))).catch(e => setSpec('Failed: ' + e.message))
  }, [])
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <a href="/platform/api/v1/openapi.json" target="_blank" style={{ padding: '8px 14px', borderRadius: 7, background: 'var(--accent)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>Download openapi.json</a>
        <a href={`https://editor.swagger.io/?url=${encodeURIComponent(`${baseUrl}/openapi.json`)}`} target="_blank" rel="noreferrer" style={{ padding: '8px 14px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' }}>Open in Swagger Editor</a>
      </div>
      <CodeBlock lang="openapi.json" code={spec.slice(0, 12000) + (spec.length > 12000 ? '\n…(truncated)' : '')} />
    </div>
  )
}
