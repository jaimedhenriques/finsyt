'use client'
import { useState } from 'react'
import Link from 'next/link'

// ── Code block ────────────────────────────────────────────────────────────────
function Code({ lang, code, title }: { lang: string; code: string; title?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ marginBottom: 12, borderRadius: 10, overflow: 'hidden', border: '1px solid #1E2D42' }}>
      {(title || lang) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px', background: '#141D2B' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {title && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>{title}</span>}
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'rgba(27,79,255,0.3)', color: '#93B4FF', fontWeight: 700, textTransform: 'uppercase' }}>{lang}</span>
          </div>
          <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            style={{ fontSize: 11, fontWeight: 600, color: copied ? '#10B981' : 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
            {copied ? '✓ Copied' : '⎘ Copy'}
          </button>
        </div>
      )}
      <pre style={{ margin: 0, padding: '13px 16px', background: '#0D1117', fontSize: 12.5, lineHeight: 1.7, color: '#E2E8F0', overflowX: 'auto' }}><code>{code}</code></pre>
    </div>
  )
}

// ── Step chip ─────────────────────────────────────────────────────────────────
function Step({ n, text }: { n: number; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0' }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#EEF3FF', border: '2px solid #C7D7FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: '#1B4FFF', flexShrink: 0, marginTop: 1 }}>{n}</div>
      <p style={{ fontSize: 13.5, color: '#3D4F6E', lineHeight: 1.6, margin: 0 }} dangerouslySetInnerHTML={{ __html: text }} />
    </div>
  )
}

// ── Client card ───────────────────────────────────────────────────────────────
function ClientCard({ icon, name, badge, children, active, onClick }: any) {
  return (
    <button onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0, padding: '14px 16px', background: active ? '#EEF3FF' : '#fff', border: `2px solid ${active ? '#1B4FFF' : '#E8EDF4'}`, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: active ? '#1B4FFF' : '#0A1628' }}>{name}</span>
        {badge && <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 999, background: badge === 'Official' ? '#ECFDF5' : '#EEF3FF', color: badge === 'Official' ? '#059669' : '#1B4FFF', fontWeight: 700, border: `1px solid ${badge === 'Official' ? '#A7F3D0' : '#C7D7FF'}` }}>{badge}</span>}
      </div>
    </button>
  )
}

// ── Tool row ──────────────────────────────────────────────────────────────────
function Tool({ name, desc, plan }: { name: string; desc: string; plan: 'all' | 'pro' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '9px 0', borderBottom: '1px solid #F5F7FB' }}>
      <code style={{ fontSize: 12.5, fontWeight: 700, color: '#1B4FFF', minWidth: 220, flexShrink: 0 }}>{name}</code>
      <span style={{ fontSize: 12.5, color: '#7D8FA9', flex: 1 }}>{desc}</span>
      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: plan === 'pro' ? '#EEF3FF' : '#F0FFF4', color: plan === 'pro' ? '#1B4FFF' : '#059669', fontWeight: 700, flexShrink: 0 }}>{plan === 'pro' ? 'Pro+' : 'All plans'}</span>
    </div>
  )
}

// ── Trouble item ──────────────────────────────────────────────────────────────
function TroubleItem({ title, items }: { title: string; items: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid #E8EDF4' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '13px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: '#0A1628' }}>{title}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B0BCD0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div style={{ paddingBottom: 14 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0' }}>
              <span style={{ fontSize: 13, color: '#B0BCD0', flexShrink: 0 }}>→</span>
              <p style={{ fontSize: 13, color: '#7D8FA9', lineHeight: 1.55, margin: 0 }} dangerouslySetInnerHTML={{ __html: item }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const MCP_URL = 'https://api.finsyt.com/mcp/sse'

const CONFIGS: Record<string, string> = {
  cursor: `{
  "mcpServers": {
    "finsyt": {
      "url": "${MCP_URL}"
    }
  }
}`,
  cursor_stdio: `{
  "mcpServers": {
    "finsyt": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "${MCP_URL}"]
    }
  }
}`,
  claude_desktop: `// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "finsyt": {
      "url": "${MCP_URL}"
    }
  }
}`,
  claude_desktop_stdio: `// Use mcp-remote bridge if Claude Desktop doesn't support remote MCP
{
  "mcpServers": {
    "finsyt": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "${MCP_URL}"]
    }
  }
}`,
  claude_code: `claude mcp add --transport sse finsyt ${MCP_URL}`,
  windsurf: `{
  "mcpServers": {
    "finsyt": {
      "serverUrl": "${MCP_URL}"
    }
  }
}`,
  python_sdk: `import anthropic

client = anthropic.Anthropic()

# Finsyt tools available automatically in every message
response = client.beta.messages.create(
    model="claude-opus-4-5",
    max_tokens=1024,
    mcp_servers=[{
        "type": "url",
        "url": "${MCP_URL}",
        "authorization_token": "YOUR_FINSYT_API_KEY",
    }],
    messages=[{
        "role": "user",
        "content": "What is NVIDIA's gross margin trend over the last 4 quarters?"
    }],
    betas=["mcp-client-2025-04-04"],
)
print(response.content)`,
  node_sdk: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.beta.messages.create({
  model: "claude-opus-4-5",
  max_tokens: 1024,
  mcp_servers: [{
    type: "url",
    url: "${MCP_URL}",
    authorization_token: "YOUR_FINSYT_API_KEY",
  }],
  messages: [{
    role: "user",
    content: "Compare Apple and Microsoft revenue growth over 2 years",
  }],
  betas: ["mcp-client-2025-04-04"],
});`,
}

type ClientId = 'claude' | 'chatgpt' | 'cursor' | 'claudecode' | 'windsurf' | 'api'

export default function MCPPage() {
  const [activeClient, setActiveClient] = useState<ClientId>('claude')
  const [apiLang, setApiLang] = useState<'python' | 'node'>('python')

  const CLIENTS = [
    { id: 'claude' as ClientId, icon: '🤖', name: 'Claude Desktop', badge: 'Official' },
    { id: 'chatgpt' as ClientId, icon: '💬', name: 'ChatGPT', badge: 'Plus / Pro' },
    { id: 'cursor' as ClientId, icon: '⌨️', name: 'Cursor', badge: undefined },
    { id: 'claudecode' as ClientId, icon: '🖥️', name: 'Claude Code CLI', badge: undefined },
    { id: 'windsurf' as ClientId, icon: '🌊', name: 'Windsurf', badge: undefined },
    { id: 'api' as ClientId, icon: '⚙️', name: 'API / SDK', badge: undefined },
  ]

  return (
    <div style={{ background: '#F7F9FC', minHeight: 'calc(100vh - 60px)' }}>
      {/* ── Dark hero ── */}
      <div style={{ background: 'linear-gradient(180deg, #070E1A 0%, #0A1628 100%)', padding: '48px 32px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
            <Link href="/app/developer" style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'none', fontWeight: 600 }}>Developer</Link>
            <span>/</span>
            <span style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>MCP Integration</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 32, alignItems: 'flex-end', paddingBottom: 0 }}>
            <div>
              {/* Official badge */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 999, marginBottom: 16 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981' }}>Official MCP Server · Anthropic + OpenAI partner</span>
              </div>
              <h1 style={{ fontSize: '2.25rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 14 }}>
                MCP Integration
              </h1>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, maxWidth: 560, marginBottom: 28 }}>
                Power AI assistants with real-time financial data. Connect Claude, ChatGPT, Cursor, or any MCP client to Finsyt in minutes — no API key config needed in the client.
              </p>
              {/* MCP URL pill */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '9px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, marginBottom: 32 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>MCP Server URL</span>
                <code style={{ fontSize: 13, fontWeight: 700, color: '#93B4FF' }}>{MCP_URL}</code>
                <button onClick={() => navigator.clipboard.writeText(MCP_URL)} style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.07)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 8px', borderRadius: 4 }}>Copy</button>
              </div>
            </div>

            {/* Quick stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 32 }}>
              {[
                { n: '11', label: 'MCP tools available' },
                { n: '6', label: 'Supported clients' },
                { n: '<50ms', label: 'Avg tool latency' },
                { n: 'OAuth', label: 'Authentication' },
              ].map(s => (
                <div key={s.n} style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>{s.n}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Client tabs */}
          <div style={{ display: 'flex', gap: 0, marginTop: 4 }}>
            {CLIENTS.map(c => (
              <button key={c.id} onClick={() => setActiveClient(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: activeClient === c.id ? '#fff' : 'rgba(255,255,255,0.38)', borderBottom: `2px solid ${activeClient === c.id ? '#1B4FFF' : 'transparent'}`, transition: 'all 0.12s', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 15 }}>{c.icon}</span> {c.name}
                {c.badge && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: c.badge === 'Official' ? 'rgba(16,185,129,0.2)' : 'rgba(27,79,255,0.2)', color: c.badge === 'Official' ? '#34D399' : '#93B4FF', fontWeight: 700, marginLeft: 2 }}>{c.badge}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24 }}>

          {/* ── MAIN CONTENT ── */}
          <div>

            {/* CLAUDE DESKTOP */}
            {activeClient === 'claude' && (
              <div>
                {/* Official connector card */}
                <div style={{ background: 'linear-gradient(135deg, #0A3828 0%, #0A1628 100%)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🤖</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>Finsyt is an official Claude Connector</span>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.2)', color: '#34D399', fontWeight: 700, border: '1px solid rgba(16,185,129,0.3)' }}>Official</span>
                      </div>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 14px', lineHeight: 1.55 }}>
                        Click the link below, hit <strong style={{ color: 'rgba(255,255,255,0.75)' }}>Add</strong>, and sign in with your Finsyt account — that's it. No config files needed.
                      </p>
                      <a href="https://claude.ai/settings/connectors" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: '#10B981', color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
                        Install Finsyt Connector →
                      </a>
                    </div>
                  </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 12, padding: '20px 22px', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0A1628', marginBottom: 14 }}>Setup via config file (Claude Desktop app)</h3>
                  <Step n={1} text='Open <strong>Claude Desktop</strong> and go to <strong>Settings → Developer → Edit Config</strong>' />
                  <Step n={2} text='Add the Finsyt server to your <code style="background:#F0F4FA;padding:2px 5px;borderRadius:3px;fontSize:12px">claude_desktop_config.json</code>:' />
                  <div style={{ marginLeft: 38, marginTop: 8, marginBottom: 4 }}>
                    <Code lang="json" title="claude_desktop_config.json" code={CONFIGS.claude_desktop} />
                  </div>
                  <Step n={3} text='<strong>Completely quit</strong> Claude Desktop (Cmd+Q on Mac, not just close the window)' />
                  <Step n={4} text='Reopen Claude — you\'ll be prompted to authenticate with your Finsyt account via OAuth' />
                  <Step n={5} text='Test: ask Claude <em>"Get the company profile for NASDAQ_NVDA"</em>' />

                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', marginTop: 14, marginLeft: 38 }}>
                    <p style={{ fontSize: 12.5, color: '#92400E', margin: 0, lineHeight: 1.5 }}>
                      <strong>Older Claude Desktop versions</strong> may not support remote MCP servers natively. Use the <code style={{ background: '#FEF3C7', padding: '1px 4px', borderRadius: 3, fontSize: 11 }}>mcp-remote</code> bridge instead:
                    </p>
                  </div>
                  <div style={{ marginLeft: 38, marginTop: 8 }}>
                    <Code lang="json" title="Using mcp-remote bridge" code={CONFIGS.claude_desktop_stdio} />
                  </div>
                </div>

                {/* Set as default memory tip */}
                <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 12, padding: '18px 22px' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0A1628', marginBottom: 10 }}>
                    💡 Make Claude always use Finsyt by default
                  </h3>
                  <p style={{ fontSize: 13, color: '#7D8FA9', lineHeight: 1.6, marginBottom: 12 }}>
                    Once connected, enable Memory in Claude (<strong>Settings → Memory → On</strong>) and send this prompt once:
                  </p>
                  <Code lang="prompt" code={`Always use the Finsyt MCP connector every time I ask for financial data, stock quotes, earnings, or company analysis. Save this to your memory.`} />
                  <p style={{ fontSize: 12, color: '#B0BCD0', margin: 0 }}>Claude will now reach for Finsyt automatically across all future conversations.</p>
                </div>
              </div>
            )}

            {/* CHATGPT */}
            {activeClient === 'chatgpt' && (
              <div>
                <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 12, padding: '20px 22px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0A1628' }}>ChatGPT Setup</h3>
                    <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 5, background: '#FFF7ED', color: '#C2410C', fontWeight: 700, border: '1px solid #FED7AA' }}>Requires Plus, Pro, or Business</span>
                  </div>
                  <div style={{ background: '#F9FAFB', border: '1px solid #E8EDF4', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                    <p style={{ fontSize: 12.5, color: '#7D8FA9', margin: 0, lineHeight: 1.55 }}>
                      MCP is only available on <strong>chatgpt.com</strong> (web). Not available in the desktop app or mobile. Requires ChatGPT Plus, Pro, or Business plan.
                    </p>
                  </div>
                  <Step n={1} text='Go to <strong>chatgpt.com</strong> → <strong>Settings → Apps</strong>' />
                  <Step n={2} text='Scroll to <strong>Advanced settings</strong> → toggle <strong>Developer Mode on</strong>' />
                  <Step n={3} text='Click the <strong>Create</strong> button that appears' />
                  <Step n={4} text={`Enter a name (<em>e.g. "Finsyt"</em>), a description, and paste the server URL:`} />
                  <div style={{ marginLeft: 38, marginTop: 8, marginBottom: 4 }}>
                    <Code lang="url" code={MCP_URL} />
                  </div>
                  <Step n={5} text='Check <strong>"I trust this provider"</strong>, then click <strong>Create</strong>' />
                  <Step n={6} text='In a new chat, click <strong>+</strong> → <strong>More</strong> → <strong>Developer Mode</strong> → enable <strong>"Finsyt"</strong>' />
                  <Step n={7} text='Test: ask <em>"Get NVDA company profile"</em>' />
                </div>
              </div>
            )}

            {/* CURSOR */}
            {activeClient === 'cursor' && (
              <div>
                <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 12, padding: '20px 22px', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0A1628', marginBottom: 14 }}>Cursor Setup</h3>
                  <Step n={1} text='Open Cursor → <strong>Settings → MCP Servers</strong> (or edit <code style="background:#F0F4FA;padding:2px 5px;borderRadius:3px;fontSize:11px">.cursor/mcp.json</code> in your project root)' />
                  <Step n={2} text='Add the Finsyt server (SSE transport — recommended):' />
                  <div style={{ marginLeft: 38, marginTop: 8, marginBottom: 4 }}>
                    <Code lang="json" title=".cursor/mcp.json (SSE)" code={CONFIGS.cursor} />
                  </div>
                  <Step n={3} text='If Cursor only supports stdio, use the mcp-remote bridge:' />
                  <div style={{ marginLeft: 38, marginTop: 8, marginBottom: 4 }}>
                    <Code lang="json" title=".cursor/mcp.json (stdio bridge)" code={CONFIGS.cursor_stdio} />
                  </div>
                  <Step n={4} text='<strong>Reload the Cursor window</strong> (Cmd+Shift+P → "Reload Window")' />
                  <Step n={5} text='Authenticate via OAuth when prompted' />
                  <Step n={6} text='Use <code style="background:#F0F4FA;padding:2px 5px;borderRadius:3px;fontSize:11px">@finsyt</code> in any Cursor chat to invoke Finsyt tools' />
                </div>
              </div>
            )}

            {/* CLAUDE CODE CLI */}
            {activeClient === 'claudecode' && (
              <div>
                <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 12, padding: '20px 22px', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0A1628', marginBottom: 14 }}>Claude Code (CLI) Setup</h3>
                  <Step n={1} text='Run the following command in your terminal:' />
                  <div style={{ marginLeft: 38, marginTop: 8, marginBottom: 4 }}>
                    <Code lang="bash" code={CONFIGS.claude_code} />
                  </div>
                  <Step n={2} text='When you first use a Finsyt tool, you\'ll be prompted to authenticate via <strong>OAuth</strong> in your browser' />
                  <Step n={3} text='Test the connection:' />
                  <div style={{ marginLeft: 38, marginTop: 8, marginBottom: 4 }}>
                    <Code lang="bash" code={`claude "Get the company profile for NASDAQ_NVDA"`} />
                  </div>
                  <Step n={4} text='List installed MCP servers:' />
                  <div style={{ marginLeft: 38, marginTop: 8 }}>
                    <Code lang="bash" code={`claude mcp list`} />
                  </div>
                </div>
              </div>
            )}

            {/* WINDSURF */}
            {activeClient === 'windsurf' && (
              <div>
                <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 12, padding: '20px 22px', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0A1628', marginBottom: 14 }}>Windsurf Setup</h3>
                  <Step n={1} text='Open Windsurf → <strong>Settings → MCP</strong>' />
                  <Step n={2} text='Add the Finsyt server:' />
                  <div style={{ marginLeft: 38, marginTop: 8, marginBottom: 4 }}>
                    <Code lang="json" title="windsurf mcp config" code={CONFIGS.windsurf} />
                  </div>
                  <Step n={3} text='Restart Windsurf and authenticate via OAuth' />
                  <Step n={4} text='Finsyt tools will appear in the Cascade panel' />
                </div>
              </div>
            )}

            {/* API / SDK */}
            {activeClient === 'api' && (
              <div>
                <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 12, padding: '20px 22px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0A1628' }}>Use Finsyt MCP in your own application</h3>
                  </div>
                  <p style={{ fontSize: 13, color: '#7D8FA9', lineHeight: 1.6, marginBottom: 16 }}>
                    Call Finsyt tools programmatically via the Anthropic SDK's MCP client support. Pass your Finsyt API key as the <code style={{ fontSize: 12, color: '#1B4FFF', background: '#F0F4FA', padding: '1px 5px', borderRadius: 3 }}>authorization_token</code>.
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    {(['python', 'node'] as const).map(l => (
                      <button key={l} onClick={() => setApiLang(l)} style={{ padding: '5px 14px', borderRadius: 7, border: '1.5px solid', borderColor: apiLang === l ? '#1B4FFF' : '#E8EDF4', background: apiLang === l ? '#EEF3FF' : '#fff', color: apiLang === l ? '#1B4FFF' : '#7D8FA9', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{l === 'python' ? 'Python' : 'Node.js'}</button>
                    ))}
                  </div>
                  <Code lang={apiLang === 'python' ? 'python' : 'typescript'} code={apiLang === 'python' ? CONFIGS.python_sdk : CONFIGS.node_sdk} />
                  <div style={{ background: '#F0FFF4', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 14px', marginTop: 4 }}>
                    <p style={{ fontSize: 12.5, color: '#065F46', margin: 0, lineHeight: 1.5 }}>
                      <strong>Authentication note:</strong> OAuth maps the MCP session back to your existing Finsyt account and plan limits. No separate entitlement tier is created — every tool call is checked against the same rate limits and company access as your API key.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── TOOLS TABLE ── always visible ── */}
            <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 12, padding: '20px 22px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0A1628' }}>Available MCP Tools</h3>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: '#EEF3FF', color: '#1B4FFF', fontWeight: 700 }}>11 tools</span>
              </div>
              <Tool name="get_stock_quote"          desc="Real-time price, change %, market cap, P/E, gross margin, next earnings date"       plan="all" />
              <Tool name="get_financials"           desc="Income statement, balance sheet, cash flow — standardised or as-reported"           plan="all" />
              <Tool name="get_segments_and_kpis"   desc="Proprietary business segment revenue + KPIs for 2,300+ companies, source-linked"    plan="pro" />
              <Tool name="get_ratios"               desc="P/E, EV/EBITDA, P/S, P/B, FCF yield, ROE, ROIC and 50+ more"                       plan="all" />
              <Tool name="get_analyst_estimates"   desc="Consensus revenue / EPS estimates, revisions, ratings, price targets"               plan="pro" />
              <Tool name="get_earnings_transcript" desc="Earnings call transcript with speaker segmentation, chapters"                       plan="all" />
              <Tool name="get_filings"              desc="SEC 10-K, 10-Q, 8-K, DEF 14A with PDF and filing-image links"                       plan="all" />
              <Tool name="get_stock_prices"         desc="30+ years EOD price history + 15-min delayed intraday"                              plan="all" />
              <Tool name="get_macro_data"           desc="Fed rate, CPI, GDP, yield curve, VIX, unemployment from FRED"                      plan="all" />
              <Tool name="search_companies"         desc="Search by name or ticker fragment — returns companyKey identifiers"                 plan="all" />
              <Tool name="screen_stocks"            desc="Filter by sector, exchange, market cap, revenue growth, margins, PE"               plan="pro" />
              <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#F0FFF4', color: '#059669', fontWeight: 700 }}>All plans</span>
                  <span style={{ fontSize: 11, color: '#B0BCD0' }}>Available on all plans</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#EEF3FF', color: '#1B4FFF', fontWeight: 700 }}>Pro+</span>
                  <span style={{ fontSize: 11, color: '#B0BCD0' }}>Requires Pro or Enterprise</span>
                </div>
              </div>
            </div>

            {/* ── HOW IT WORKS ── */}
            <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 12, padding: '20px 22px', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0A1628', marginBottom: 14 }}>How it works</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {[
                  { icon: '🔌', title: 'MCP Client connects', desc: 'Claude, ChatGPT, Cursor, or your app connects to the Finsyt MCP SSE endpoint' },
                  { icon: '🔐', title: 'OAuth authentication', desc: 'You sign in with your Finsyt account. The MCP session is tied back to your existing plan — no separate entitlement.' },
                  { icon: '🛠️', title: 'Tool calls routed to REST API', desc: 'Every tool call is routed through Finsyt\'s REST infrastructure. Same company coverage, rate limits, and plan checks apply.' },
                  { icon: '⚡', title: 'Responses streamed back', desc: 'Responses are formatted per MCP standards and streamed back to your AI assistant in real-time.' },
                ].map((s, i, arr) => (
                  <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: i < arr.length - 1 ? 16 : 0, marginBottom: i < arr.length - 1 ? 16 : 0, borderBottom: i < arr.length - 1 ? '1px solid #F5F7FB' : 'none' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: '#F0F4FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{s.icon}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1628', marginBottom: 3 }}>{s.title}</div>
                      <p style={{ fontSize: 12.5, color: '#7D8FA9', lineHeight: 1.55, margin: 0 }}>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── TROUBLESHOOTING ── */}
            <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 12, padding: '20px 22px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0A1628', marginBottom: 14 }}>Troubleshooting</h3>
              <TroubleItem title="OAuth sign-in issues" items={[
                'Make sure you have an active Finsyt account at <strong>finsyt.com</strong>',
                'If the OAuth flow doesn\'t redirect, try clearing your browser cookies for finsyt.com',
                'For Claude Desktop, ensure you\'re on the latest version — older versions may not support remote MCP servers natively. Use the <code style="background:#F5F7FB;padding:1px 4px;borderRadius:3px;fontSize:11px">mcp-remote</code> bridge instead.',
              ]} />
              <TroubleItem title="Server not appearing in Claude Desktop" items={[
                'Verify the JSON config is valid — no trailing commas, proper double quotes',
                '<strong>Completely quit Claude Desktop</strong> (Cmd+Q on Mac, not just closing the window)',
                'Check that <code style="background:#F5F7FB;padding:1px 4px;borderRadius:3px;fontSize:11px">npx</code> is available in your system PATH: run <code style="background:#F5F7FB;padding:1px 4px;borderRadius:3px;fontSize:11px">npx --version</code> in terminal',
                'Try running the npx command manually to verify: <code style="background:#F5F7FB;padding:1px 4px;borderRadius:3px;fontSize:11px">npx -y mcp-remote@latest https://api.finsyt.com/mcp/sse</code>',
              ]} />
              <TroubleItem title="Connection timeouts" items={[
                'Verify you can access <strong>https://api.finsyt.com</strong> from your browser',
                'If behind a corporate firewall, ensure SSE connections are allowed',
                'Try the MCP Inspector to test the connection directly: <code style="background:#F5F7FB;padding:1px 4px;borderRadius:3px;fontSize:11px">npx @modelcontextprotocol/inspector</code>',
              ]} />
              <TroubleItem title="Tools not working as expected" items={[
                'Use valid company identifiers: <code style="background:#F5F7FB;padding:1px 4px;borderRadius:3px;fontSize:11px">NASDAQ_AAPL</code>, <code style="background:#F5F7FB;padding:1px 4px;borderRadius:3px;fontSize:11px">NYSE_JPM</code>, <code style="background:#F5F7FB;padding:1px 4px;borderRadius:3px;fontSize:11px">LSE_SHEL</code>',
                'Date parameters must be in <code style="background:#F5F7FB;padding:1px 4px;borderRadius:3px;fontSize:11px">YYYY-MM-DD</code> format',
                'Period types: <code style="background:#F5F7FB;padding:1px 4px;borderRadius:3px;fontSize:11px">annual</code> | <code style="background:#F5F7FB;padding:1px 4px;borderRadius:3px;fontSize:11px">quarterly</code> | <code style="background:#F5F7FB;padding:1px 4px;borderRadius:3px;fontSize:11px">ltm</code>',
                '<strong>A tool being visible in your client does not mean your plan has access to it.</strong> Check your plan tier — Pro+ tools require Pro or Enterprise.',
              ]} />
              <TroubleItem title="Plan limits and rate limits" items={[
                'Free plan: 25 companies, 250 requests/day, 50 requests/minute',
                'MCP does not bypass plan enforcement — every tool call is checked against your plan',
                'Seeing a tool in Claude/ChatGPT/Cursor does NOT mean your account has unrestricted access',
                'To test your connection without hitting limits: ask for <code style="background:#F5F7FB;padding:1px 4px;borderRadius:3px;fontSize:11px">NASDAQ_MSFT</code> — it\'s available on all plans including free',
              ]} />
            </div>
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div>
            {/* Quick test */}
            <div style={{ background: '#0D1117', borderRadius: 12, padding: '16px', marginBottom: 16, position: 'sticky', top: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Quick connection test</div>
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.55, marginBottom: 10 }}>
                After setup, ask your AI assistant:
              </p>
              <Code lang="prompt" code={`Get the company profile for NASDAQ_MSFT`} />
              <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.3)', lineHeight: 1.55, marginBottom: 14 }}>
                This confirms the server is live and working on a ticker available on all plans.
              </p>

              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Example prompts</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  "What's Apple's P/E vs Microsoft?",
                  "Show TSLA quarterly revenue growth last 2 years",
                  "Compare Netflix and Disney profit margins",
                  "Get NVDA's latest cash flow statement",
                  "Show AAPL balance sheet from latest 10-K",
                  "Has Apple had any stock splits?",
                  "NVDA daily stock price trend this year",
                  "Get page 15 of Tesla's latest 10-K as image",
                ].map((p, i) => (
                  <div key={i} style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, fontSize: 11.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4, border: '1px solid rgba(255,255,255,0.06)' }}>"{p}"</div>
                ))}
              </div>
            </div>

            {/* Plan access note */}
            <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0A1628', marginBottom: 10 }}>Plan access via MCP</div>
              {[
                { plan: 'Free', detail: '25 companies · 250 req/day · basic tools' },
                { plan: 'Plus', detail: '500 companies · 5,000 req/day · all tools' },
                { plan: 'Pro', detail: 'All companies · 50,000 req/day · Pro tools' },
                { plan: 'Enterprise', detail: 'Custom · unlimited · priority routing' },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < 3 ? '1px solid #F5F7FB' : 'none' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, minWidth: 72, color: i === 2 ? '#1B4FFF' : '#0A1628' }}>{r.plan}</span>
                  <span style={{ fontSize: 11.5, color: '#7D8FA9' }}>{r.detail}</span>
                </div>
              ))}
              <Link href="/app/pricing" style={{ display: 'block', marginTop: 12, fontSize: 12, fontWeight: 700, color: '#1B4FFF', textDecoration: 'none' }}>Upgrade plan →</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
