'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

type ClientId = 'claude' | 'chatgpt' | 'cursor' | 'claudecode' | 'windsurf' | 'openai' | 'api'

const CLIENTS = [
  { id: 'claude'    as ClientId, icon: '🤖', name: 'Claude Desktop', badge: 'Official' },
  { id: 'chatgpt'   as ClientId, icon: '💬', name: 'ChatGPT',        badge: 'Plus / Pro' },
  { id: 'cursor'    as ClientId, icon: '⌨️', name: 'Cursor',         badge: undefined },
  { id: 'claudecode'as ClientId, icon: '🖥️', name: 'Claude Code',    badge: undefined },
  { id: 'windsurf'  as ClientId, icon: '🌊', name: 'Windsurf',       badge: undefined },
  { id: 'openai'    as ClientId, icon: '⚙️', name: 'OpenAI Agents',  badge: undefined },
  { id: 'api'       as ClientId, icon: '🔌', name: 'Raw JSON-RPC',   badge: undefined },
]

const TOOLS = [
  { name: 'finsyt_quote',      desc: 'Real-time price, market cap, fundamentals overlay for any ticker' },
  { name: 'finsyt_financials', desc: 'Income / balance / cash flow / KPIs — single mnemonic, batch, or snapshot' },
  { name: 'finsyt_news',       desc: 'AI-tagged news with sentiment scores' },
  { name: 'finsyt_filings',    desc: 'SEC EDGAR filings: 10-K, 10-Q, 8-K, S-1' },
  { name: 'finsyt_search',     desc: 'Symbol & company search across global exchanges' },
  { name: 'finsyt_screener',   desc: 'Filter the universe by sector, mcap, P/E, etc.' },
  { name: 'finsyt_insider',    desc: 'Recent insider buy / sell transactions' },
  { name: 'finsyt_census_datasets',     desc: 'Browse U.S. Census Bureau datasets (ACS, Decennial, BDS, etc.)' },
  { name: 'finsyt_census_aggregate',    desc: 'Query Census Bureau data: variables × geography × vintage' },
  { name: 'finsyt_census_search_tables', desc: 'Search Census variable groups (tables) by concept' },
  { name: 'finsyt_census_variables',    desc: 'List variables in a Census dataset / group' },
  { name: 'finsyt_census_resolve_fips', desc: 'Geocode an address → lat/lon + FIPS state/county/tract' },
]

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ position: 'relative', background: 'var(--bg-elevated, #0F1A2E)', borderRadius: 10, overflow: 'hidden', marginTop: 10 }}>
      <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
        style={{ position: 'absolute', top: 8, right: 10, fontSize: 11, fontWeight: 700, color: copied ? 'var(--pos)' : 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>
        {copied ? '✓ Copied' : 'Copy'}
      </button>
      <pre style={{ margin: 0, padding: '14px 60px 14px 16px', fontSize: 12, color: '#C9D1D9', fontFamily: 'monospace', overflowX: 'auto', whiteSpace: 'pre' }}>{code}</pre>
    </div>
  )
}

function ClientSetup({ id, mcpUrl, apiKey }: { id: ClientId; mcpUrl: string; apiKey: string }) {
  const k = apiKey || 'YOUR_FINSYT_API_KEY'
  // Claude Desktop & Claude Code use mcp-remote bridge for streamable-http with auth header.
  const claudeDesktop = `{
  "mcpServers": {
    "finsyt": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "${mcpUrl}",
        "--header",
        "Authorization:\${FINSYT_AUTH}"
      ],
      "env": {
        "FINSYT_AUTH": "Bearer ${k}"
      }
    }
  }
}`
  const claudeCode = `claude mcp add --transport http finsyt ${mcpUrl} \\
  --header "Authorization: Bearer ${k}"`

  const cursor = `{
  "mcpServers": {
    "finsyt": {
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer ${k}" }
    }
  }
}`

  const windsurf = `{
  "mcpServers": {
    "finsyt": {
      "serverUrl": "${mcpUrl}",
      "headers": { "Authorization": "Bearer ${k}" }
    }
  }
}`

  const openai = `from openai import OpenAI

client = OpenAI()
res = client.responses.create(
    model="gpt-4o",
    tools=[{
        "type": "mcp",
        "server_label": "finsyt",
        "server_url": "${mcpUrl}",
        "headers": {"Authorization": "Bearer ${k}"},
        "require_approval": "never",
    }],
    input="What is NVDA's latest price and forward P/E?",
)
print(res.output_text)`

  const rawCall = `curl -X POST "${mcpUrl}" \\
  -H "Authorization: Bearer ${k}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"finsyt_quote","arguments":{"symbol":"AAPL"}}}'`

  if (id === 'claude') return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary, #7D8FA9)', marginBottom: 12 }}>
        Claude Desktop uses the <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4 }}>mcp-remote</code> bridge to talk to remote HTTP servers, forwarding your API key as a header.
      </p>
      <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13 }}>1. Edit your Claude Desktop config:</div>
      <div style={{ fontSize: 11, color: '#7D8FA9', marginBottom: 4 }}>macOS: <code>~/Library/Application Support/Claude/claude_desktop_config.json</code><br/>Windows: <code>%APPDATA%\Claude\claude_desktop_config.json</code></div>
      <CodeBlock code={claudeDesktop} />
      <div style={{ marginTop: 16, fontWeight: 600, fontSize: 13 }}>2. Restart Claude Desktop. All <code>finsyt_*</code> tools will appear in the tools tray.</div>
    </div>
  )

  if (id === 'claudecode') return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Run in your terminal:</div>
      <CodeBlock code={claudeCode} />
      <div style={{ marginTop: 16, fontWeight: 600, fontSize: 13 }}>Then call it from any session:</div>
      <CodeBlock code={`claude "Use finsyt to fetch the latest 10-K filing date for AAPL"`} />
    </div>
  )

  if (id === 'cursor') return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Add to <code>~/.cursor/mcp.json</code> (or Cursor → Settings → MCP):</div>
      <CodeBlock code={cursor} />
    </div>
  )

  if (id === 'windsurf') return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Add to your Windsurf MCP config:</div>
      <CodeBlock code={windsurf} />
    </div>
  )

  if (id === 'chatgpt') return (
    <div>
      <p style={{ fontSize: 13, color: '#3D4F6E', marginBottom: 12 }}>
        ChatGPT Plus/Pro supports remote MCP. Open <strong>Settings → Connectors → Add MCP server</strong>:
      </p>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Server URL:</div>
      <CodeBlock code={mcpUrl} />
      <div style={{ marginTop: 14, fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Authentication header:</div>
      <CodeBlock code={`Authorization: Bearer ${k}`} />
    </div>
  )

  if (id === 'openai') return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>OpenAI Responses API with the MCP tool type:</div>
      <CodeBlock code={openai} />
    </div>
  )

  if (id === 'api') return (
    <div>
      <p style={{ fontSize: 13, color: '#3D4F6E', marginBottom: 12 }}>
        The MCP endpoint is a JSON-RPC 2.0 server over HTTP POST. Discover the protocol with <code>initialize</code>, list tools with <code>tools/list</code>, and call them with <code>tools/call</code>.
      </p>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Direct call:</div>
      <CodeBlock code={rawCall} />
    </div>
  )
  return null
}

export default function MCPPage() {
  const [activeClient, setActiveClient] = useState<ClientId>('claude')
  const [apiKey, setApiKey] = useState('')
  const [mcpUrl, setMcpUrl] = useState('https://finsyt.com/platform/api/v1/mcp')
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setMcpUrl(`${window.location.origin}/platform/api/v1/mcp`)
    }
  }, [])

  useEffect(() => {
    fetch('/platform/api/v1/mcp').then(r => setServerStatus(r.ok ? 'online' : 'offline')).catch(() => setServerStatus('offline'))
  }, [])

  return (
    <div className="page-content" style={{ padding: '32px clamp(20px, 4vw, 56px)', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Link href="/app/developer" style={{ fontSize: 12, color: '#7D8FA9', textDecoration: 'none' }}>Developer</Link>
          <span style={{ color: '#C5CFDF' }}>/</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>MCP Server</span>
        </div>
        <h1 className="page-title" style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', margin: 0 }}>MCP Server</h1>
        <p style={{ fontSize: 14, color: '#7D8FA9', marginTop: 6, lineHeight: 1.5, maxWidth: 760 }}>
          Plug Finsyt's live financial data into any AI assistant via the Model Context Protocol.
          Same <code>fsk_</code> key as the REST API. JSON-RPC 2.0 over HTTP POST (Streamable HTTP transport).
        </p>
      </div>

      <div className="card p-5 mb-6" style={{ borderLeft: '4px solid var(--accent)', padding: 18, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#7D8FA9', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>MCP Server URL</div>
            <code style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{mcpUrl}</code>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: serverStatus === 'online' ? 'rgba(34,197,94,0.15)' : serverStatus === 'offline' ? 'rgba(220,38,38,0.15)' : 'rgba(255,255,255,0.08)', color: serverStatus === 'online' ? '#86EFAC' : serverStatus === 'offline' ? '#FCA5A5' : '#fff' }}>
              {serverStatus === 'checking' ? '◌ Checking' : serverStatus === 'online' ? '🟢 Online' : '🔴 Offline'}
            </span>
            <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'rgba(27,79,255,0.15)', color: '#93C5FD' }}>Streamable HTTP</span>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 24, padding: 16, borderRadius: 10, background: 'rgba(27,79,255,0.04)', border: '1px solid rgba(27,79,255,0.18)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Personalize the configs below</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="fsk_… (paste your API key — generated on the Developer page)" style={{ flex: 1, minWidth: 280, padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 12, fontFamily: 'monospace' }} />
          <Link href="/app/developer" style={{ padding: '8px 14px', borderRadius: 7, background: 'var(--accent)', color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 700 }}>Generate a key →</Link>
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <div className="section-title" style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>Available Tools ({TOOLS.length})</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
          {TOOLS.map(t => (
            <div key={t.name} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>🔧</span>
              <div>
                <code style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{t.name}</code>
                <div style={{ fontSize: 12, color: '#7D8FA9', marginTop: 2 }}>{t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: 20, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="section-title" style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.5)', marginBottom: 14 }}>Connect your AI client</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 0 }}>
          {CLIENTS.map(c => (
            <button key={c.id} onClick={() => setActiveClient(c.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              color: activeClient === c.id ? 'var(--accent)' : '#7D8FA9',
              borderBottom: `2px solid ${activeClient === c.id ? 'var(--accent)' : 'transparent'}`,
              transition: 'all 0.12s', whiteSpace: 'nowrap',
            }}>
              <span>{c.icon}</span>
              <span>{c.name}</span>
              {c.badge && (
                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'rgba(27,79,255,0.18)', color: '#93C5FD', fontWeight: 700 }}>
                  {c.badge}
                </span>
              )}
            </button>
          ))}
        </div>
        <ClientSetup id={activeClient} mcpUrl={mcpUrl} apiKey={apiKey} />
      </div>

      <div style={{ marginTop: 20, padding: 20, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="section-title" style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>Example prompts</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {[
            'Use finsyt to get the current price and P/E for NVDA',
            'Fetch Apple\'s revenue from finsyt for the last 4 quarters',
            'Find the latest 10-K filing for Microsoft via finsyt',
            'Show recent insider transactions for Tesla',
            'Screen technology stocks above $100B mcap',
            'Search finsyt for "Anthropic"',
          ].map((p, i) => (
            <div key={i} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#7D8FA9', fontStyle: 'italic' }}>
              "{p}"
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 20, padding: '16px 0', display: 'flex', gap: 16 }}>
        <Link href="/app/developer" style={{ fontSize: 13, color: '#7D8FA9', textDecoration: 'none' }}>← Back to Developer</Link>
        <a href="https://spec.modelcontextprotocol.io" target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#7D8FA9', textDecoration: 'none' }}>MCP spec →</a>
      </div>
    </div>
  )
}
