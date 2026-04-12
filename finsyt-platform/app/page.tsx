import Link from 'next/link'

const FEATURES = [
  { icon: '🧠', title: 'AI Research', desc: 'Ask anything about any company. Inline citations. Agentic step tracing.' },
  { icon: '🔍', title: 'Screener', desc: 'Filter equities, M&A, and funding deals in real time.' },
  { icon: '⚡', title: 'Formula Engine', desc: 'Capital IQ-style mnemonics. Pull any metric into Excel.' },
  { icon: '📡', title: 'Live Data', desc: 'Real-time quotes, indices, forex, and commodities from institutional providers.' },
  { icon: '📑', title: 'SEC Filings', desc: '10-K, 10-Q, 8-K filings with XBRL extraction and KPI summaries.' },
  { icon: '🌐', title: 'Macro Dashboard', desc: 'GDP, CPI, rates, unemployment — all FRED indicators, charted.' },
]

const PROVIDERS = ['Polygon.io', 'EODHD', 'FMP', 'SEC EDGAR', 'FRED', 'CoreSignal', 'Finnhub']

export default function LandingPage() {
  return (
    <div style={{ background: '#0A1628', color: '#fff', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>

      {/* Navbar */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 32px',
        background: 'rgba(10,22,40,0.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(27,79,255,0.1)',
      }}>
        <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: '-0.03em', color: '#fff' }}>
          finsyt<span style={{ color: '#1B4FFF' }}>.</span>
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/app" style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            color: '#C5CFDF', border: '1px solid rgba(197,207,223,0.2)', textDecoration: 'none',
          }}>Sign in</Link>
          <Link href="/app" style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            background: '#1B4FFF', color: '#fff', textDecoration: 'none',
          }}>Get started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        position: 'relative', overflow: 'hidden',
        padding: '100px 32px 80px', maxWidth: 1100, margin: '0 auto', textAlign: 'center',
      }}>
        {/* Dot grid background */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'radial-gradient(#1B4FFF18 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />
        {/* Radial glow */}
        <div style={{
          position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)',
          width: 800, height: 600,
          background: 'radial-gradient(ellipse at center, rgba(27,79,255,0.12) 0%, transparent 70%)',
          zIndex: 0,
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', color: '#1B4FFF',
            textTransform: 'uppercase', marginBottom: 16,
          }}>
            Financial Intelligence Platform
          </div>
          <h1 style={{
            fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 900,
            letterSpacing: '-0.03em', lineHeight: 1.08, marginBottom: 24, color: '#fff',
          }}>
            The AI-native workspace<br />for serious investors
          </h1>
          <p style={{
            fontSize: 18, lineHeight: 1.6, color: '#7D8FA9', maxWidth: 600, margin: '0 auto 36px',
          }}>
            Stop context-switching between Bloomberg, ChatGPT, and spreadsheets.<br />
            Finsyt gives analysts and operators one workspace to research, screen, and act — powered by live market data.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/app" style={{
              padding: '14px 32px', borderRadius: 10, fontSize: 16, fontWeight: 700,
              background: '#1B4FFF', color: '#fff', textDecoration: 'none',
              boxShadow: '0 4px 24px rgba(27,79,255,0.35)',
            }}>
              Start for free →
            </Link>
            <Link href="/app" style={{
              padding: '14px 32px', borderRadius: 10, fontSize: 16, fontWeight: 700,
              color: '#C5CFDF', border: '1px solid rgba(197,207,223,0.25)', textDecoration: 'none',
            }}>
              Explore live demo
            </Link>
          </div>

          {/* Trust line */}
          <div style={{ marginTop: 40, fontSize: 12, color: '#4A6080', display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <span>Connecting to</span>
            {['Polygon', 'EODHD', 'FMP', 'SEC EDGAR', 'FRED'].map(p => (
              <span key={p} style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                fontFamily: 'monospace', background: '#1B2F4A', color: '#4A7FBD', border: '1px solid #1B3A5C',
              }}>{p}</span>
            ))}
          </div>
        </div>

        {/* Mock dashboard card */}
        <div style={{
          marginTop: 60, borderRadius: 16, overflow: 'hidden',
          border: '1px solid rgba(27,79,255,0.15)',
          background: 'linear-gradient(145deg, #0D1E3A 0%, #0A1628 100%)',
          padding: 24,           maxWidth: 800, margin: '60px auto 0',
          boxShadow: '0 8px 48px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {[{ s: 'SPY', v: '5,254', c: '+0.42%', up: true }, { s: 'QQQ', v: '18,391', c: '+0.61%', up: true }, { s: 'DIA', v: '39,150', c: '+0.18%', up: true }, { s: 'GLD', v: '2,374', c: '+0.8%', up: true }].map(d => (
              <div key={d.s} style={{ flex: 1, background: '#0A1628', border: '1px solid #1B3A5C', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: '#4A6080' }}>{d.s}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{d.v}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: d.up ? '#059669' : '#EF4444' }}>{d.c}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 2, background: '#0A1628', border: '1px solid #1B3A5C', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#4A6080', marginBottom: 8 }}>AAPL — Apple Inc.</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: '#fff' }}>$192.35</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>+1.24%</span>
              </div>
              <div style={{ marginTop: 12, height: 48, background: 'linear-gradient(180deg, rgba(5,150,105,0.15) 0%, transparent 100%)', borderRadius: 6, display: 'flex', alignItems: 'end', padding: '0 4px 4px' }}>
                <svg viewBox="0 0 200 40" style={{ width: '100%', height: 40 }}>
                  <polyline points="0,35 20,30 40,28 60,32 80,25 100,20 120,22 140,15 160,12 180,10 200,8" fill="none" stroke="#059669" strokeWidth="2" />
                </svg>
              </div>
            </div>
            <div style={{ flex: 1, background: '#0A1628', border: '1px solid #1B3A5C', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#4A6080', marginBottom: 8 }}>Watchlist</div>
              {['AAPL', 'MSFT', 'NVDA', 'TSLA'].map(s => (
                <div key={s} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1B2F4A', fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: '#C5CFDF' }}>{s}</span>
                  <span style={{ color: '#059669', fontWeight: 600 }}>+{(Math.random() * 3).toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Social proof strip */}
      <section style={{
        background: '#0D1E3A', padding: '20px 32px',
        borderTop: '1px solid rgba(27,79,255,0.08)', borderBottom: '1px solid rgba(27,79,255,0.08)',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
          {['20+ data sources', 'Sub-500ms quotes', '10K+ SEC filings indexed', 'Built in public'].map(m => (
            <span key={m} style={{ fontSize: 13, color: '#4A7FBD', fontWeight: 600, letterSpacing: '-0.01em' }}>{m}</span>
          ))}
        </div>
      </section>

      {/* Feature grid */}
      <section style={{ padding: '80px 32px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12 }}>
            Everything you need in one terminal
          </h2>
          <p style={{ fontSize: 16, color: '#7D8FA9' }}>Institutional-grade tools, none of the $24k/year terminal fee.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              background: '#0D1E3A', borderRadius: 12, padding: 24,
              border: '1px solid rgba(27,79,255,0.1)',
              transition: 'border-color 0.2s',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'rgba(27,79,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, marginBottom: 14,
              }}>{f.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#fff' }}>{f.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: '#7D8FA9', margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Data providers */}
      <section style={{ padding: '48px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', color: '#4A6080', textTransform: 'uppercase', marginBottom: 20 }}>
          Powered by
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          {PROVIDERS.map(p => (
            <span key={p} style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              fontFamily: 'monospace', background: '#1B2F4A', color: '#4A7FBD',
              border: '1px solid #1B3A5C',
            }}>{p}</span>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: '80px 32px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12 }}>Simple pricing</h2>
          <p style={{ fontSize: 16, color: '#7D8FA9' }}>Start free. Upgrade when you need real-time data and unlimited research.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Free */}
          <div style={{
            background: '#0D1E3A', borderRadius: 16, padding: 32,
            border: '1px solid rgba(197,207,223,0.1)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#7D8FA9', marginBottom: 4 }}>Free</div>
            <div style={{ fontSize: 40, fontWeight: 900, marginBottom: 24 }}>$0<span style={{ fontSize: 16, fontWeight: 500, color: '#7D8FA9' }}>/month</span></div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {['5 AI research queries/day', '20 API calls/day', 'Basic screener', 'Delayed data'].map(f => (
                <li key={f} style={{ fontSize: 14, color: '#C5CFDF', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#059669' }}>✓</span> {f}
                </li>
              ))}
            </ul>
            <Link href="/app" style={{
              display: 'block', textAlign: 'center', padding: '12px 0', borderRadius: 10,
              fontSize: 15, fontWeight: 700, color: '#C5CFDF',
              border: '1px solid rgba(197,207,223,0.2)', textDecoration: 'none',
            }}>Get started</Link>
          </div>
          {/* Pro */}
          <div style={{
            background: '#0D1E3A', borderRadius: 16, padding: 32, position: 'relative',
            border: '1.5px solid #1B4FFF',
            boxShadow: '0 0 0 1.5px #1B4FFF, 0 4px 32px rgba(27,79,255,0.15)',
          }}>
            <div style={{
              position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
              background: '#1B4FFF', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 14px',
              borderRadius: 20, letterSpacing: '0.05em',
            }}>MOST POPULAR</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1B4FFF', marginBottom: 4 }}>Pro</div>
            <div style={{ fontSize: 40, fontWeight: 900, marginBottom: 24 }}>$49<span style={{ fontSize: 16, fontWeight: 500, color: '#7D8FA9' }}>/month</span></div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {['Unlimited AI research', 'Real-time data', 'Full screener (M&A, funding)', 'SEC filings + XBRL extraction', 'Formula Engine', 'Priority support'].map(f => (
                <li key={f} style={{ fontSize: 14, color: '#C5CFDF', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#1B4FFF' }}>✓</span> {f}
                </li>
              ))}
            </ul>
            <Link href="/app" style={{
              display: 'block', textAlign: 'center', padding: '12px 0', borderRadius: 10,
              fontSize: 15, fontWeight: 700, background: '#1B4FFF', color: '#fff', textDecoration: 'none',
              boxShadow: '0 4px 20px rgba(27,79,255,0.3)',
            }}>Start Pro trial →</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid rgba(27,79,255,0.08)', padding: '32px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        maxWidth: 1100, margin: '0 auto', flexWrap: 'wrap', gap: 16,
      }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: '#4A6080' }}>finsyt<span style={{ color: '#1B4FFF' }}>.</span> <span style={{ fontWeight: 400, fontSize: 13 }}>© 2025</span></span>
        <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
          {[
            { label: 'Product', href: '/app' },
            { label: 'Pricing', href: '#' },
          ].map(l => (
            <Link key={l.label} href={l.href} style={{ color: '#4A6080', textDecoration: 'none', fontWeight: 500 }}>{l.label}</Link>
          ))}
        </div>
        <span style={{ fontSize: 12, color: '#3D5578' }}>Built with institutional data providers</span>
      </footer>
    </div>
  )
}
