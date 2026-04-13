'use client'
import { useState } from 'react'

type Section = 'account' | 'data' | 'notifications' | 'appearance' | 'api'

const NAV: { id: Section; label: string; icon: string }[] = [
  { id:'account',       label:'Account',          icon:'◎' },
  { id:'data',          label:'Data & Sources',   icon:'◈' },
  { id:'notifications', label:'Notifications',    icon:'◉' },
  { id:'appearance',    label:'Appearance',       icon:'◫' },
  { id:'api',           label:'Developer API',    icon:'◧' },
]

interface Toggle { label: string; desc: string; key: string; value: boolean }

export default function SettingsPage() {
  const [section, setSection] = useState<Section>('account')
  const [saved, setSaved]     = useState(false)
  const [saving, setSaving]   = useState(false)

  // Account
  const [name, setName]   = useState('Jaime D\'Henriques')
  const [email, setEmail] = useState('jaime@helixholdings.com')
  const [role, setRole]   = useState('CEO')
  const [org, setOrg]     = useState('Helix Holdings')

  // Notifications
  const [notifs, setNotifs] = useState<Toggle[]>([
    { label:'Alert triggers',        desc:'Get notified when a price/volume alert fires',          key:'alerts',    value:true  },
    { label:'Earnings calendar',     desc:'Reminders before companies you follow report earnings', key:'earnings',  value:true  },
    { label:'News digest',           desc:'Daily morning summary of market-moving news',           key:'news',      value:false },
    { label:'Platform updates',      desc:'Feature announcements and changelogs',                  key:'platform',  value:true  },
    { label:'AutoPMF feedback loop', desc:'Notify when AutoPMF completes a cycle',                key:'autopmf',   value:true  },
  ])

  // Appearance
  const [theme, setTheme]       = useState<'dark'|'light'|'system'>('dark')
  const [density, setDensity]   = useState<'compact'|'normal'|'spacious'>('normal')
  const [currency, setCurrency] = useState('USD')
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY')

  // Data sources (display only — actual keys are env vars)
  const DATA_SOURCES = [
    { name:'Financial Modeling Prep', key:'FMP_API_KEY',     status:'connected', tier:'Primary — equities, financials, estimates' },
    { name:'EODHD',                   key:'EODHD_API_KEY',   status:'connected', tier:'Secondary — fundamentals, international' },
    { name:'Finnhub',                 key:'FINNHUB_API_KEY', status:'connected', tier:'Real-time quotes, news, sentiment' },
    { name:'FRED (St. Louis Fed)',    key:'FRED_API_KEY',    status:'connected', tier:'Macro indicators, economic data' },
    { name:'Polygon / Massive',       key:'MASSIVE_API_KEY', status:'connected', tier:'Aggregates, technicals, options' },
    { name:'Alpha Vantage',           key:'ALPHAV_API_KEY',  status:'partial',   tier:'Forex, technical indicators' },
    { name:'CoreSignal',              key:'CORESIGNAL_API_KEY', status:'connected', tier:'Private company data' },
    { name:'Perplexity',              key:'PERPLEXITY_API_KEY', status:'connected', tier:'AI Research — web grounding' },
    { name:'Groq',                    key:'GROQ_API_KEY',    status:'connected', tier:'AI Research — fast inference' },
  ]

  function toggleNotif(key: string) {
    setNotifs(prev => prev.map(n => n.key === key ? { ...n, value: !n.value } : n))
  }

  async function save() {
    setSaving(true)
    await new Promise(r => setTimeout(r, 800))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="page-content" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom:24 }}>
        <h1 className="page-title">Settings</h1>
        <p style={{ fontSize:13, marginTop:2, color:'#7D8FA9' }}>Manage your account, preferences, and data sources</p>
      </div>

      <div style={{ display:'flex', gap:24, alignItems:'flex-start' }}>
        {/* Sidebar nav */}
        <div style={{ width:180, flexShrink:0 }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setSection(n.id)}
              style={{ width:'100%', textAlign:'left', padding:'9px 12px', borderRadius:8, border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:8, marginBottom:2, transition:'all 0.1s', fontFamily:'inherit',
                background: section===n.id ? 'rgba(27,79,255,0.08)' : 'transparent',
                color:      section===n.id ? '#1B4FFF' : '#4A5568',
                fontWeight: section===n.id ? 700 : 500, fontSize:13,
              }}>
              <span style={{ fontSize:14 }}>{n.icon}</span> {n.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1 }}>

          {/* ── ACCOUNT ──────────────────────────────────────────────────── */}
          {section === 'account' && (
            <div className="card" style={{ padding:24 }}>
              <h2 style={{ fontWeight:800, fontSize:16, color:'#0A1628', marginBottom:20 }}>Account</h2>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
                {[
                  { label:'Full Name',        val:name,  set:setName  },
                  { label:'Email Address',    val:email, set:setEmail },
                  { label:'Role / Title',     val:role,  set:setRole  },
                  { label:'Organisation',     val:org,   set:setOrg   },
                ].map(field => (
                  <div key={field.label}>
                    <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>{field.label}</label>
                    <input value={field.val} onChange={e => field.set(e.target.value)}
                      style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
                  </div>
                ))}
              </div>

              {/* Plan */}
              <div style={{ padding:'16px 20px', borderRadius:12, background:'linear-gradient(135deg,rgba(27,79,255,0.05),rgba(13,159,232,0.05))', border:'1.5px solid rgba(27,79,255,0.15)', marginBottom:20 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:14, color:'#0A1628' }}>Pro Plan</div>
                    <div style={{ fontSize:12, color:'#7D8FA9', marginTop:2 }}>$29/month · renews May 14, 2026</div>
                  </div>
                  <button style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #1B4FFF', background:'transparent', color:'#1B4FFF', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    Manage Plan
                  </button>
                </div>
              </div>

              {/* Danger zone */}
              <div style={{ borderTop:'1px solid #F0F4FA', paddingTop:20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#DC2626', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:12 }}>Danger Zone</div>
                <div style={{ display:'flex', gap:10 }}>
                  <button style={{ padding:'7px 14px', borderRadius:8, border:'1px solid rgba(220,38,38,0.3)', background:'rgba(220,38,38,0.04)', color:'#DC2626', fontSize:12, fontWeight:600, cursor:'pointer' }}>Export Data</button>
                  <button style={{ padding:'7px 14px', borderRadius:8, border:'1px solid rgba(220,38,38,0.3)', background:'rgba(220,38,38,0.04)', color:'#DC2626', fontSize:12, fontWeight:600, cursor:'pointer' }}>Delete Account</button>
                </div>
              </div>
            </div>
          )}

          {/* ── DATA SOURCES ─────────────────────────────────────────────── */}
          {section === 'data' && (
            <div className="card" style={{ overflow:'hidden' }}>
              <div style={{ padding:'16px 20px', borderBottom:'1px solid #E2E8F2' }}>
                <div style={{ fontWeight:800, fontSize:16, color:'#0A1628' }}>Data Sources</div>
                <div style={{ fontSize:12, color:'#7D8FA9', marginTop:4 }}>Live waterfall: FMP → EODHD → Finnhub → FRED → Polygon. API keys are server-side environment variables.</div>
              </div>
              <div>
                {DATA_SOURCES.map((src, i) => (
                  <div key={src.name} style={{ padding:'14px 20px', borderBottom: i < DATA_SOURCES.length - 1 ? '1px solid #F0F4FA' : 'none', display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background: src.status === 'connected' ? '#059669' : src.status === 'partial' ? '#D97706' : '#DC2626', boxShadow: src.status === 'connected' ? '0 0 5px #059669' : '' }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:'#0A1628' }}>{src.name}</div>
                      <div style={{ fontSize:11, color:'#7D8FA9', marginTop:1 }}>{src.tier}</div>
                    </div>
                    <div style={{ fontSize:11, fontWeight:600, fontFamily:'monospace', color:'#B0BCD0' }}>{src.key}</div>
                    <span style={{ fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:20,
                      background: src.status === 'connected' ? 'rgba(5,150,105,0.08)' : 'rgba(217,119,6,0.08)',
                      color:      src.status === 'connected' ? '#059669' : '#D97706' }}>
                      {src.status}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ padding:'12px 20px', background:'#F8FAFD', borderTop:'1px solid #F0F4FA' }}>
                <div style={{ fontSize:12, color:'#7D8FA9' }}>
                  API keys are configured as Vercel environment variables and never exposed client-side.
                  To update, go to your <strong>Vercel dashboard → Project → Settings → Environment Variables</strong>.
                </div>
              </div>
            </div>
          )}

          {/* ── NOTIFICATIONS ────────────────────────────────────────────── */}
          {section === 'notifications' && (
            <div className="card" style={{ padding:24 }}>
              <h2 style={{ fontWeight:800, fontSize:16, color:'#0A1628', marginBottom:20 }}>Notifications</h2>
              <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                {notifs.map((n, i) => (
                  <div key={n.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom: i < notifs.length - 1 ? '1px solid #F0F4FA' : 'none' }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:13, color:'#0A1628' }}>{n.label}</div>
                      <div style={{ fontSize:12, color:'#7D8FA9', marginTop:2 }}>{n.desc}</div>
                    </div>
                    <button onClick={() => toggleNotif(n.key)}
                      style={{ width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', transition:'all 0.2s', position:'relative', flexShrink:0,
                        background: n.value ? '#1B4FFF' : '#E2E8F2' }}>
                      <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', position:'absolute', top:3, transition:'left 0.2s', left: n.value ? 23 : 3, boxShadow:'0 1px 4px rgba(0,0,0,0.15)' }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── APPEARANCE ───────────────────────────────────────────────── */}
          {section === 'appearance' && (
            <div className="card" style={{ padding:24 }}>
              <h2 style={{ fontWeight:800, fontSize:16, color:'#0A1628', marginBottom:20 }}>Appearance</h2>

              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:10 }}>Theme</label>
                <div style={{ display:'flex', gap:8 }}>
                  {(['dark','light','system'] as const).map(t => (
                    <button key={t} onClick={() => setTheme(t)}
                      style={{ flex:1, padding:'10px', borderRadius:10, border:'1.5px solid', cursor:'pointer', textTransform:'capitalize', fontFamily:'inherit', fontSize:13, fontWeight:600, transition:'all 0.1s',
                        borderColor: theme===t ? '#1B4FFF' : '#E2E8F2',
                        background:  theme===t ? 'rgba(27,79,255,0.06)' : '#fff',
                        color:       theme===t ? '#1B4FFF' : '#4A5568',
                      }}>
                      {t === 'dark' ? '🌙 Dark' : t === 'light' ? '☀️ Light' : '⚙️ System'}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:10 }}>Table Density</label>
                <div style={{ display:'flex', gap:8 }}>
                  {(['compact','normal','spacious'] as const).map(d => (
                    <button key={d} onClick={() => setDensity(d)}
                      style={{ flex:1, padding:'10px', borderRadius:10, border:'1.5px solid', cursor:'pointer', textTransform:'capitalize', fontFamily:'inherit', fontSize:13, fontWeight:600, transition:'all 0.1s',
                        borderColor: density===d ? '#1B4FFF' : '#E2E8F2',
                        background:  density===d ? 'rgba(27,79,255,0.06)' : '#fff',
                        color:       density===d ? '#1B4FFF' : '#4A5568',
                      }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                <div>
                  <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', color:'#1C2B4A', background:'#fff', cursor:'pointer' }}>
                    {['USD','GBP','EUR','JPY','CHF','CAD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>Date Format</label>
                  <select value={dateFormat} onChange={e => setDateFormat(e.target.value)}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', color:'#1C2B4A', background:'#fff', cursor:'pointer' }}>
                    {['DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD'].map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── DEVELOPER API ────────────────────────────────────────────── */}
          {section === 'api' && (
            <div>
              <div className="card" style={{ padding:24, marginBottom:16 }}>
                <h2 style={{ fontWeight:800, fontSize:16, color:'#0A1628', marginBottom:8 }}>Developer API</h2>
                <p style={{ fontSize:13, color:'#7D8FA9', lineHeight:1.6, marginBottom:20 }}>
                  Access Finsyt's financial data programmatically. Your API key authenticates all requests.
                </p>
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>Your API Key</label>
                  <div style={{ display:'flex', gap:8 }}>
                    <input type="password" value="fsy_live_•••••••••••••••••••••••••••••••"
                      readOnly style={{ flex:1, padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'monospace', outline:'none', background:'#F8FAFD', color:'#7D8FA9' }} />
                    <button style={{ padding:'9px 14px', borderRadius:8, border:'1.5px solid #E2E8F2', background:'#fff', color:'#1C2B4A', fontSize:12, fontWeight:600, cursor:'pointer' }}>Copy</button>
                    <button style={{ padding:'9px 14px', borderRadius:8, border:'none', background:'#1B4FFF', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>Regenerate</button>
                  </div>
                </div>
                <div style={{ padding:14, borderRadius:10, background:'#F8FAFD', border:'1px solid #E2E8F2', fontFamily:'monospace', fontSize:12, color:'#4A5568', lineHeight:1.8 }}>
                  <div style={{ marginBottom:4, color:'#B0BCD0' }}># Example request</div>
                  <div>curl -H "Authorization: Bearer YOUR_API_KEY" \</div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;https://finsyt.com/api/quote?symbol=AAPL</div>
                </div>
              </div>
              <div className="card" style={{ padding:'14px 20px' }}>
                <div style={{ fontWeight:700, fontSize:13, color:'#0A1628', marginBottom:4 }}>Usage this month</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginTop:12 }}>
                  {[{ label:'API Calls', value:'2,847', limit:'10,000' },{ label:'Data Points', value:'84.2K', limit:'500K' },{ label:'AI Queries', value:'143', limit:'500' }].map(s => (
                    <div key={s.label} style={{ textAlign:'center', padding:'12px', borderRadius:10, background:'#F8FAFD', border:'1px solid #E2E8F2' }}>
                      <div style={{ fontWeight:900, fontSize:'1.25rem', color:'#0A1628', letterSpacing:'-0.02em' }}>{s.value}</div>
                      <div style={{ fontSize:11, color:'#B0BCD0', marginTop:2 }}>of {s.limit}</div>
                      <div style={{ fontSize:11, fontWeight:600, color:'#7D8FA9', marginTop:1 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Save button (show for relevant sections) */}
          {(section === 'account' || section === 'notifications' || section === 'appearance') && (
            <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end', alignItems:'center', gap:10 }}>
              {saved && <span style={{ fontSize:13, color:'#059669', fontWeight:600 }}>✓ Saved</span>}
              <button onClick={save} disabled={saving}
                style={{ padding:'10px 24px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
