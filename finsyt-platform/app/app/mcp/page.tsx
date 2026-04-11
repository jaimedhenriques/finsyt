'use client'
import { useState } from 'react'
import Link from 'next/link'

const MCP_URL = 'https://api.finsyt.com/mcp/sse'

type ClientId = 'claude' | 'chatgpt' | 'cursor' | 'claudecode' | 'windsurf' | 'api'

const CLIENTS = [
  { id: 'claude'    as ClientId, icon: '🤖', name: 'Claude Desktop', badge: 'Official' },
  { id: 'chatgpt'   as ClientId, icon: '💬', name: 'ChatGPT',        badge: 'Plus / Pro' },
  { id: 'cursor'    as ClientId, icon: '⌨️', name: 'Cursor',         badge: undefined },
  { id: 'claudecode'as ClientId, icon: '🖥️', name: 'Claude Code',    badge: undefined },
  { id: 'windsurf'  as ClientId, icon: '🌊', name: 'Windsurf',       badge: undefined },
  { id: 'api'       as ClientId, icon: '⚙️', name: 'REST API / SDK', badge: undefined },
]

const TOOLS = [
  { name: 'get_quote',            desc: 'Real-time price, volume, market cap for any ticker' },
  { name: 'get_financials',       desc: 'Income statement, balance sheet, cash flow (annual/quarterly)' },
  { name: 'get_news',             desc: 'Latest news with AI sentiment scoring' },
  { name: 'search_symbol',        desc: 'Search for a ticker by company name or keyword' },
  { name: 'get_macro_indicator',  desc: 'GDP, CPI, unemployment and other macro data by country' },
  { name: 'get_insider_trades',   desc: 'Recent insider buy/sell transactions' },
  { name: 'get_earnings_calendar',desc: 'Upcoming earnings dates and estimates' },
  { name: 'get_sec_filings',      desc: 'SEC EDGAR filings: 10-K, 10-Q, 8-K, S-1 and more' },
]

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div style={{ position: 'relative', background: '#0D1117', borderRadius: 10, overflow: 'hidden', marginTop: 10 }}>
      <button onClick={copy} style={{
        position: 'absolute', top: 8, right: 10, fontSize: 11, fontWeight: 700,
        color: copied ? '#4ADE80' : 'rgba(255,255,255,0.45)', background: 'none', border: 'none', cursor: 'pointer',
      }}>
        {copied ? '✓ Copied' : 'Copy'}
      </button>
      <pre style={{ margin: 0, padding: '16px 48px 16px 16px', fontSize: 12, color: '#C9D1D9', fontFamily: 'monospace', overflowX: 'auto', whiteSpace: 'pre' }}>
        {code}
      </pre>
    </div>
  )
}

function ClientSetup({ id }: { id: ClientId }) {
  const cursorConfig = `{\n  "mcpServers": {\n    "finsyt": {\n      "url": "${MCP_URL}"\n    }\n  }\n}`
  const windsurfConfig = `{\n  "mcpServers": {\n    "finsyt": {\n      "serverUrl": "${MCP_URL}"\n    }\n  }\n}`
  const claudeDesktopConfig = `{\n  "mcpServers": {\n    "finsyt": {\n      "command": "npx",\n      "args": ["-y", "mcp-remote@latest", "${MCP_URL}"]\n    }\n  }\n}`
  const claudeCodeCmd = `claude mcp add --transport sse finsyt ${MCP_URL}`

  if (id === 'claude') return (
    <div>
      <p style={{ fontSize: 13, color: '#3D4F6E', marginBottom: 12 }}>
        Claude Desktop does not yet support remote MCP servers natively. Use the <code style={{ background: '#F1F5F9', padding: '1px 5px', borderRadius: 4 }}>mcp-remote</code> bridge.
      </p>
      <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13, color: '#0A1628' }}>1. Paste into your Claude Desktop config:</div>
      <div style={{ fontSize: 11, color: '#7D8FA9', marginBottom: 4 }}>~/Library/Application Support/Claude/claude_desktop_config.json</div>
      <CodeBlock code={claudeDesktopConfig} />
      <div style={{ marginTop: 16, marginBottom: 8, fontWeight: 600, fontSize: 13, color: '#0A1628' }}>2. Restart Claude Desktop — Finsyt tools will appear automatically.</div>
    </div>
  )

  if (id === 'claudecode') return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#0A1628', marginBottom: 8 }}>Run this command in your terminal:</div>
      <CodeBlock code={claudeCodeCmd} />
      <div style={{ marginTop: 12, fontWeight: 600, fontSize: 13, color: '#0A1628' }}>Then test it:</div>
      <CodeBlock code={`claude "Get the latest earnings for NVDA"`} />
    </div>
  )

  if (id === 'cursor') return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#0A1628', marginBottom: 8 }}>Add to ~/.cursor/mcp.json (or Cursor → Settings → MCP):</div>
      <CodeBlock code={cursorConfig} />
    </div>
  )

  if (id === 'windsurf') return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#0A1628', marginBottom: 8 }}>Add to your Windsurf MCP config:</div>
      <CodeBlock code={windsurfConfig} />
    </div>
  )

  if (id === 'chatgpt') return (
    <div>
      <p style={{ fontSize: 13, color: '#3D4F6E', marginBottom: 12 }}>
        ChatGPT Plus/Pro supports remote MCP servers. Go to <strong>Settings → Connectors → Add MCP Server</strong> and paste:
      </p>
      <CodeBlock code={MCP_URL} />
    </div>
  )

  if (id === 'api') return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#0A1628', marginBottom: 8 }}>REST endpoint (GET):</div>
      <CodeBlock code={`GET https://api.finsyt.com/v1/quote?symbol=AAPL\nAuthorization: Bearer YOUR_API_KEY`} />
      <div style={{ marginTop: 16, fontWeight: 600, fontSize: 13, color: '#0A1628', marginBottom: 8 }}>Python SDK:</div>
      <CodeBlock code={`import finsyt\n\nclient = finsyt.Client(api_key="YOUR_API_KEY")\nquote = client.quote("AAPL")\nprint(quote.price, quote.change_pct)`} />
    </div>
  )

  return null
}

export default function MCPPage() {
  const [activeClient, setActiveClient] = useState<ClientId>('claude')

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Link href="/app/developer" style={{ fontSize: 12, color: '#7D8FA9', textDecoration: 'none' }}>Developer</Link>
          <span style={{ color: '#C5CFDF' }}>/</span>
          <span style={{ fontSize: 12, color: '#0A1628', fontWeight: 600 }}>MCP Integration</span>
        </div>
        <h1 className="page-title">MCP Server</h1>
        <p style={{ fontSize: 13, color: '#7D8FA9', marginTop: 4 }}>
          Connect any AI assistant to Finsyt's live financial data via the Model Context Protocol
        </p>
      </div>

      {/* Server URL card */}
      <div className="card p-5 mb-6" style={{ borderLeft: '4px solid #1B4FFF' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#7D8FA9', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>MCP Server URL</div>
            <code style={{ fontSize: 15, fontWeight: 700, color: '#1B4FFF' }}>{MCP_URL}</code>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="badge badge-green">🟢 Online</span>
            <span className="badge badge-blue">SSE Transport</span>
          </div>
        </div>
      </div>

      {/* Tools grid */}
      <div style={{ marginBottom: 28 }}>
        <div className="section-title mb-3">Available Tools ({TOOLS.length})</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
          {TOOLS.map(t => (
            <div key={t.name} style={{ background: '#F8FAFF', border: '1px solid #E8EDF5', borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>🔧</span>
              <div>
                <code style={{ fontSize: 12, fontWeight: 700, color: '#0A1628' }}>{t.name}</code>
                <div style={{ fontSize: 12, color: '#7D8FA9', marginTop: 2 }}>{t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Client setup */}
      <div className="card p-5">
        <div className="section-title mb-4">Connect Your AI Client</div>

        {/* Client tabs */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20, borderBottom: '1px solid #E8EDF5', paddingBottom: 0 }}>
          {CLIENTS.map(c => (
            <button key={c.id} onClick={() => setActiveClient(c.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              color: activeClient === c.id ? '#1B4FFF' : '#7D8FA9',
              borderBottom: `2px solid ${activeClient === c.id ? '#1B4FFF' : 'transparent'}`,
              transition: 'all 0.12s', whiteSpace: 'nowrap',
            }}>
              <span>{c.icon}</span>
              <span>{c.name}</span>
              {c.badge && (
                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: '#EEF2FF', color: '#1B4FFF', fontWeight: 700 }}>
                  {c.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <ClientSetup id={activeClient} />
      </div>

      {/* Example prompts */}
      <div className="card p-5 mt-5">
        <div className="section-title mb-3">Example Prompts to Try</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {[
            'Get the current price and P/E ratio for NVDA',
            'Show me Apple\'s revenue growth over the last 4 quarters',
            'What is the current US inflation rate?',
            'Find the latest 10-K filing for Microsoft',
            'Show recent insider transactions for Tesla',
            'What are the upcoming earnings this week?',
          ].map((p, i) => (
            <div key={i} style={{ background: '#F8FAFF', border: '1px solid #E8EDF5', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#3D4F6E', fontStyle: 'italic' }}>
              "{p}"
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 20, padding: '16px 0', borderTop: '1px solid #E8EDF5', display: 'flex', gap: 16 }}>
        <Link href="/app/developer" className="btn btn-ghost btn-sm">← Back to Developer Portal</Link>
        <Link href="/app/docs" className="btn btn-ghost btn-sm">API Documentation →</Link>
      </div>
    </div>
  )
}
