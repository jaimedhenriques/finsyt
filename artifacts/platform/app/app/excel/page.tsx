'use client'
/**
 * Finsyt for Excel — in-app install / landing page.
 *
 * Reachable from the Platform section of the sidebar. Gives the hosted
 * manifest URL with a copy button, sideload steps, the four capabilities
 * (Agent / Build / Templates / Functions), a preview-and-approve safety
 * note, and both auth paths (Clerk SSO popup + fsk_ API key with a link to
 * Developer settings). Content mirrors the Excel tab in /app/developer.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

const CAPABILITIES: { tag: string; title: string; body: React.ReactNode }[] = [
  {
    tag: 'AGENT',
    title: 'AI chat that sees your sheet',
    body: (
      <>The task pane reads your current selection, streams responses with tool steps and
      citations, and proposes formula or template inserts you apply with one click via{' '}
      <code>Excel.run</code>.</>
    ),
  },
  {
    tag: 'BUILD',
    title: 'Autonomous model builder',
    body: (
      <>Describe the model you want and the Build loop scaffolds it end-to-end — pulling data,
      wiring formulas, and laying out the sheet. Every step is previewed before it writes a
      cell.</>
    ),
  },
  {
    tag: 'TEMPLATES',
    title: 'One-click DCF, Comps, WACC',
    body: (
      <>DCF, Comps, Sensitivity, and WACC scaffolds insert at your active cell, pre-wired to{' '}
      <code>=FINSYT.*</code> calls — edit assumptions, not boilerplate.</>
    ),
  },
  {
    tag: 'FUNCTIONS',
    title: 'Live =FINSYT.* worksheet functions',
    body: (
      <>Native custom functions stream real quotes, financials, estimates, transcripts, filings,
      news, and macro data into any cell — the same data behind the platform, REST API, and
      MCP.</>
    ),
  },
]

const SAMPLE_FUNCTIONS = [
  '=FINSYT.QUOTE("AAPL")',
  '=FINSYT.METRIC("AAPL","revenue","annual",-1)',
  '=FINSYT.FINANCIALS("AAPL","income","revenue","FY-1")',
  '=FINSYT.ESTIMATE("AAPL","eps","next_q","consensus")',
  '=FINSYT.HISTORY("AAPL","2024-01-01","2024-12-31")',
  '=FINSYT.ASK("Compare gross margin","AAPL")',
]

export default function ExcelPage() {
  const [origin, setOrigin] = useState('https://finsyt.com')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin)
  }, [])

  const manifestUrl = useMemo(() => `${origin}/platform/excel-addin/manifest.xml`, [origin])
  const devManifestUrl = useMemo(() => `${origin}/platform/excel-addin/dev-manifest.xml`, [origin])

  async function copyManifest() {
    try {
      await navigator.clipboard.writeText(manifestUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable — the input is selectable as a fallback */
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px 64px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Hero */}
      <div style={{ padding: 24, borderRadius: 16, border: '1px solid rgba(27,79,255,0.25)', background: 'linear-gradient(135deg, rgba(27,79,255,0.14), rgba(6,182,212,0.05))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ padding: '3px 10px', borderRadius: 6, background: 'linear-gradient(135deg,#1B4FFF,#06B6D4)', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em' }}>EXCEL ADD-IN</span>
          <span style={{ padding: '3px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 700 }}>v1.1</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: '0 0 8px 0' }}>Finsyt for Microsoft Excel</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.72)', lineHeight: 1.6, maxWidth: 720 }}>
          An agentic research copilot in your task pane: chat that sees your sheet, an autonomous
          Build loop, one-click DCF / Comps / Sensitivity / WACC templates, and live{' '}
          <code style={cx}>=FINSYT.*</code> worksheet functions. Sign in with your Finsyt account or
          paste an <code style={cx}>fsk_</code> key — same data as the REST API and MCP.
        </p>
      </div>

      {/* Manifest URL + copy */}
      <section>
        <h2 style={h2}>Manifest URL</h2>
        <p style={pMuted}>Sideload this hosted manifest — no local build, npm, or dev server required.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <input
            readOnly
            value={manifestUrl}
            onFocus={(e) => e.currentTarget.select()}
            style={{ flex: 1, minWidth: 280, padding: '10px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 13, fontFamily: 'monospace' }}
          />
          <button onClick={copyManifest} style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <a href={manifestUrl} download style={btnPrimary}>Download manifest.xml</a>
          <a href={devManifestUrl} download style={btnGhost}>Download dev-manifest.xml</a>
          <a href={`${origin}/platform/excel-addin/`} target="_blank" rel="noreferrer" style={btnOutline}>Browse files →</a>
        </div>
      </section>

      {/* Sideload steps */}
      <section>
        <h2 style={h2}>Install (sideload)</h2>
        <ol style={{ margin: 0, paddingLeft: 20, color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 1.8 }}>
          <li>Copy the manifest URL above (or download the file).</li>
          <li>In Excel, open <strong>Insert → Office Add-ins → My Add-ins → Upload My Add-in</strong> and select the manifest.</li>
          <li>Click the <strong>Finsyt</strong> button on the Home ribbon to open the task pane.</li>
          <li>Sign in and start chatting, building, and inserting <code style={cx}>=FINSYT.*</code> functions.</li>
        </ol>
      </section>

      {/* Four capabilities */}
      <section>
        <h2 style={h2}>What you get</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 12 }}>
          {CAPABILITIES.map((c) => (
            <div key={c.tag} style={{ padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 800, letterSpacing: '0.09em', marginBottom: 8 }}>{c.tag}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{c.title}</div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>{c.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Preview / approve safety note */}
      <section style={{ padding: 18, borderRadius: 12, border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.06)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#86EFAC', letterSpacing: '0.04em', marginBottom: 6 }}>PREVIEW &amp; APPROVE</div>
        <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
          Nothing writes to your workbook without your approval. The agent and Build loop preview
          every formula and template insert before it touches a cell, and each{' '}
          <code style={cx}>=FINSYT.*</code> value carries source attribution so you can trace any
          number back to the provider that answered it.
        </p>
      </section>

      {/* Auth paths */}
      <section>
        <h2 style={h2}>Authentication</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 12 }}>
          <div style={{ padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Clerk SSO popup</div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>
              Sign in with your Finsyt account through an Office dialog popup. Tokens are minted
              server-side and scoped per workbook via <code style={cx}>Office.context.document.settings</code>.
            </p>
          </div>
          <div style={{ padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>fsk_ API key</div>
            <p style={{ margin: '0 0 12px 0', fontSize: 12.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>
              Paste an <code style={cx}>fsk_</code> key in the task pane — the same key that powers the
              REST API and MCP. Create or manage keys in Developer settings.
            </p>
            <Link href="/app/developer" style={{ ...btnOutline, display: 'inline-block' }}>Open Developer settings →</Link>
          </div>
        </div>
      </section>

      {/* Sample formulas */}
      <section>
        <h2 style={h2}>Sample formulas</h2>
        <pre style={{ margin: '12px 0 0 0', padding: 16, borderRadius: 12, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', color: '#9DB1FF', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, lineHeight: 1.7, overflowX: 'auto' }}>
          {SAMPLE_FUNCTIONS.join('\n')}
        </pre>
        <p style={{ ...pMuted, marginTop: 10 }}>
          See the full function reference on the <Link href="/app/developer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Developer</Link> page.
        </p>
      </section>
    </div>
  )
}

// ── Shared inline style tokens ──────────────────────────────────────────────
const cx: React.CSSProperties = { background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace' }
const h2: React.CSSProperties = { fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 4px 0' }
const pMuted: React.CSSProperties = { margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }
const btnPrimary: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700 }
const btnGhost: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' }
const btnOutline: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.75)', textDecoration: 'none', fontSize: 13, fontWeight: 600, border: '1px solid rgba(255,255,255,0.15)' }
