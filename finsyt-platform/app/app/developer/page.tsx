'use client'
import { useState } from 'react'

// ── Code block ────────────────────────────────────────────────────────────────
function Code({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)
  function copy() { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600) }
  return (
    <div style={{ position:'relative', marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 14px', background:'#1A2436', borderRadius:'8px 8px 0 0' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', letterSpacing:'0.06em', textTransform:'uppercase' }}>{lang}</span>
        <button onClick={copy} style={{ fontSize:11, fontWeight:600, color:copied?'#10B981':'#7D8FA9', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:4 }}>
          {copied ? '✓ Copied' : '⎘ Copy'}
        </button>
      </div>
      <pre style={{ margin:0, padding:'14px 16px', background:'#0D1117', borderRadius:'0 0 8px 8px', fontSize:12, lineHeight:1.65, color:'#E2E8F0', overflowX:'auto', whiteSpace:'pre' }}><code>{code}</code></pre>
    </div>
  )
}

// ── Endpoint card ─────────────────────────────────────────────────────────────
function EndpointCard({ method, path, description, params, example }: { method:'GET'|'POST'; path:string; description:string; params:{name:string;type:string;req:boolean;desc:string}[]; example:string }) {
  const [open, setOpen] = useState(false)
  const mc: Record<string,string> = { GET:'#059669', POST:'#1B4FFF' }
  return (
    <div style={{ border:'1px solid #E8EDF4', borderRadius:10, overflow:'hidden', marginBottom:8 }}>
      <button onClick={() => setOpen(o=>!o)} style={{ display:'flex', alignItems:'center', gap:12, width:'100%', padding:'12px 16px', background:'#fff', border:'none', cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
        <span style={{ fontSize:11, fontWeight:800, padding:'3px 8px', borderRadius:5, background:mc[method]+'18', color:mc[method], flexShrink:0, minWidth:40, textAlign:'center' }}>{method}</span>
        <code style={{ fontSize:13, fontWeight:700, color:'#0A1628', flex:1 }}>{path}</code>
        <span style={{ fontSize:12, color:'#7D8FA9', flex:2, textAlign:'left' }}>{description}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B0BCD0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform:open?'rotate(180deg)':'none', transition:'transform 0.2s', flexShrink:0 }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div style={{ padding:'0 16px 16px', borderTop:'1px solid #F0F4FA', background:'#F9FAFB' }}>
          <div style={{ marginTop:12, marginBottom:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Parameters</div>
            <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
              <thead><tr style={{ background:'#F0F4FA' }}>
                {['Name','Type','Required','Description'].map(h=><th key={h} style={{ padding:'6px 10px', textAlign:'left', fontWeight:700, color:'#7D8FA9', fontSize:11 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {params.map(p=>(
                  <tr key={p.name} style={{ borderTop:'1px solid #E8EDF4' }}>
                    <td style={{ padding:'7px 10px' }}><code style={{ fontSize:11, color:'#1B4FFF', fontWeight:700 }}>{p.name}</code></td>
                    <td style={{ padding:'7px 10px' }}><span style={{ fontSize:11, color:'#7D8FA9' }}>{p.type}</span></td>
                    <td style={{ padding:'7px 10px' }}>{p.req ? <span style={{ fontSize:10, fontWeight:700, color:'#DC2626', background:'#FEF2F2', padding:'1px 6px', borderRadius:4 }}>required</span> : <span style={{ fontSize:10, color:'#B0BCD0' }}>optional</span>}</td>
                    <td style={{ padding:'7px 10px', fontSize:12, color:'#3D4F6E' }}>{p.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Example Response</div>
          <pre style={{ background:'#0D1117', borderRadius:8, padding:'12px 14px', fontSize:11.5, color:'#E2E8F0', overflowX:'auto', margin:0, lineHeight:1.65 }}><code>{example}</code></pre>
        </div>
      )}
    </div>
  )
}

const API_ENDPOINTS = [
  { method:'GET' as const, path:'/api/quote?symbol=NVDA', description:'Real-time stock quote + profile + key metrics',
    params:[{name:'symbol',type:'string',req:true,desc:'Ticker symbol (e.g. NVDA, AAPL)'}],
    example:`{\n  "symbol": "NVDA",\n  "price": 924.80,\n  "change": 23.45,\n  "changePct": 2.60,\n  "name": "NVIDIA Corporation",\n  "marketCap": 2270000000000,\n  "pe": 42.3,\n  "grossMargin": 0.759,\n  "source": "finnhub"\n}` },
  { method:'GET' as const, path:'/api/financials?symbol=NVDA&type=income', description:'Income statement, balance sheet, cash flow, earnings, ratios',
    params:[{name:'symbol',type:'string',req:true,desc:'Ticker symbol'},{name:'type',type:'string',req:false,desc:'income | balance | cashflow | earnings | ratios | growth | dcf'},{name:'limit',type:'number',req:false,desc:'Periods to return (default 8)'}],
    example:`{\n  "statements": [\n    {\n      "date": "2026-01-26",\n      "period": "Q4",\n      "revenue": 39327000000,\n      "grossMargin": 0.759,\n      "netIncome": 19311000000,\n      "eps": 0.78\n    }\n  ]\n}` },
  { method:'GET' as const, path:'/api/news?symbol=NVDA&limit=10', description:'Company or market news with source and sentiment',
    params:[{name:'symbol',type:'string',req:false,desc:'Ticker for company news'},{name:'topics',type:'string',req:false,desc:'general | technology | economy | forex | crypto'},{name:'limit',type:'number',req:false,desc:'Max articles (default 20)'}],
    example:`{\n  "articles": [\n    {\n      "title": "NVIDIA Blackwell B300 Shipments Ahead of Schedule",\n      "publishedAt": "2026-04-10T09:14:00Z",\n      "source": "Bloomberg",\n      "sentiment": "Bullish",\n      "tickers": ["NVDA"]\n    }\n  ]\n}` },
  { method:'GET' as const, path:'/api/macro?series=dashboard', description:'Macroeconomic indicators from FRED (Fed, CPI, GDP, yields, VIX)',
    params:[{name:'series',type:'string',req:false,desc:'dashboard | fed_rate | cpi | gdp_growth | yield_curve | vix | unemployment | ...'},{name:'limit',type:'number',req:false,desc:'History depth'}],
    example:`{\n  "indicators": [\n    {\n      "key": "fed_rate",\n      "label": "Fed Funds Rate",\n      "latest": { "date": "2026-03-01", "value": 4.33 },\n      "change": -0.25\n    }\n  ]\n}` },
  { method:'GET' as const, path:'/api/transcripts?symbol=NVDA&year=2026&quarter=4', description:'Earnings call transcripts with speaker segmentation',
    params:[{name:'symbol',type:'string',req:true,desc:'Ticker symbol'},{name:'year',type:'string',req:false,desc:'Year (omit to list available)'},{name:'quarter',type:'string',req:false,desc:'Quarter 1-4'}],
    example:`{\n  "symbol": "NVDA",\n  "year": 2026,\n  "quarter": 4,\n  "segments": [\n    {\n      "speaker": "Jensen Huang",\n      "role": "CEO",\n      "text": "Blackwell demand continues to exceed supply..."\n    }\n  ]\n}` },
  { method:'GET' as const, path:'/api/filings?symbol=NVDA&type=10-K', description:'SEC filings with direct document URLs',
    params:[{name:'symbol',type:'string',req:true,desc:'Ticker symbol'},{name:'type',type:'string',req:false,desc:'10-K | 10-Q | 8-K | DEF 14A'},{name:'limit',type:'number',req:false,desc:'Max results'}],
    example:`{\n  "filings": [\n    {\n      "form": "10-K",\n      "date": "2026-02-21",\n      "description": "Annual Report",\n      "documentUrl": "https://sec.gov/..."\n    }\n  ]\n}` },
  { method:'GET' as const, path:'/api/search?q=nvidia', description:'Search companies by name or ticker',
    params:[{name:'q',type:'string',req:true,desc:'Company name or ticker fragment'}],
    example:`{\n  "results": [\n    { "symbol": "NVDA", "name": "NVIDIA Corporation", "type": "Common Stock" }\n  ]\n}` },
  { method:'POST' as const, path:'/api/ai-research', description:'AI research — live data-grounded answers via Groq + Perplexity',
    params:[{name:'query',type:'string',req:true,desc:'Natural language research question'},{name:'symbol',type:'string',req:false,desc:'Optional ticker for context injection'},{name:'messages',type:'array',req:false,desc:'Prior conversation messages for multi-turn'}],
    example:`{\n  "bullets": ["Revenue +73% YoY to $39.3B ...", "Gross margin 75.9% ..."],\n  "content": "NVIDIA Q4 FY2026 summary...",\n  "sources": [...],\n  "modelUsed": "groq/llama-3.3-70b",\n  "hasLiveData": true\n}` },
  { method:'POST' as const, path:'/api/mcp', description:'MCP server — connect to Claude Desktop, Cursor, any LLM client',
    params:[{name:'method',type:'string',req:true,desc:'MCP method: initialize | tools/list | tools/call'},{name:'params',type:'object',req:false,desc:'Tool name and arguments for tools/call'},{name:'id',type:'string',req:false,desc:'Request ID for JSON-RPC'}],
    example:`// tools/list response:\n{\n  "result": {\n    "tools": [\n      { "name": "get_stock_quote", "description": "..." },\n      { "name": "get_financials", "description": "..." },\n      ...\n    ]\n  }\n}` },
]

const MCP_CONFIG = `{
  "mcpServers": {
    "finsyt": {
      "url": "https://finsyt-platform.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`

const MCP_PYTHON = `import anthropic

client = anthropic.Anthropic()

# Finsyt tools are automatically available
result = client.beta.messages.create(
    model="claude-opus-4-5",
    max_tokens=1024,
    mcp_servers=[{
        "type": "url",
        "url": "https://finsyt-platform.vercel.app/api/mcp",
        "authorization_token": "YOUR_API_KEY",
    }],
    messages=[{
        "role": "user",
        "content": "What is NVIDIA's gross margin trend over the last 4 quarters?"
    }]
)`

const CURL_QUOTE = `curl -X GET \\
  "https://finsyt-platform.vercel.app/api/quote?symbol=NVDA" \\
  -H "Authorization: Bearer YOUR_API_KEY"`

const CURL_AI = `curl -X POST \\
  "https://finsyt-platform.vercel.app/api/ai-research" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "Summarise NVIDIA Q4 earnings", "symbol": "NVDA"}'`

const JS_EXAMPLE = `import Finsyt from '@finsyt/js'

const finsyt = new Finsyt({ apiKey: 'YOUR_API_KEY' })

// Real-time quote
const quote = await finsyt.quote('NVDA')
console.log(quote.price, quote.changePct)

// Financials
const income = await finsyt.financials('NVDA', { type: 'income' })

// AI research
const research = await finsyt.research({
  query: 'What drove NVDA margin expansion?',
  symbol: 'NVDA',
})`

const PYTHON_EXAMPLE = `import finsyt

client = finsyt.Client(api_key="YOUR_API_KEY")

# Real-time quote
quote = client.quote("NVDA")
print(f"Price: " + str(quote.price) + ", Change: " + str(quote.change_pct) + "%")

# Income statement
income = client.financials("NVDA", type="income", limit=8)

# AI research (Groq + live data)
result = client.research(
    query="What drove NVDA margin expansion this quarter?",
    symbol="NVDA"
)
print(result.bullets)`

export default function DeveloperPage() {
  const [activeTab, setActiveTab] = useState<'rest'|'mcp'|'sdks'|'keys'>('rest')
  const [apiKey] = useState('fsy_live_••••••••••••••••••••••••••••••••')
  const [copied, setCopied] = useState(false)
  const tabs = [
    { id:'rest',  label:'REST API',    icon:'⚡' },
    { id:'mcp',   label:'MCP Server',  icon:'🔗' },
    { id:'sdks',  label:'SDKs',        icon:'📦' },
    { id:'keys',  label:'API Keys',    icon:'🔑' },
  ]

  return (
    <div style={{ minHeight:'calc(100vh - 60px)', background:'#F7F9FC' }}>
      {/* Header */}
      <div style={{ background:'#0D1117', borderBottom:'1px solid rgba(255,255,255,0.06)', padding:'28px 32px 0' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:20 }}>
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>DEVELOPER</p>
              <h1 style={{ fontSize:'1.625rem', fontWeight:900, color:'#fff', letterSpacing:'-0.03em', marginBottom:6 }}>Finsyt API & MCP</h1>
              <p style={{ fontSize:13.5, color:'rgba(255,255,255,0.5)', lineHeight:1.5, maxWidth:500 }}>
                Access institutional financial data via REST API, connect directly to Claude and other LLMs via MCP, and build on top of the same data powering Finsyt.
              </p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <div style={{ padding:'6px 14px', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:8, fontSize:12, fontWeight:600, color:'#10B981', display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#10B981', display:'inline-block' }} />
                API Operational
              </div>
            </div>
          </div>
          {/* Tab nav */}
          <div style={{ display:'flex', gap:0 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id as any)} style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 18px', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:600, color:activeTab===t.id?'#fff':'rgba(255,255,255,0.4)', borderBottom:`2px solid ${activeTab===t.id?'#1B4FFF':'transparent'}`, transition:'all 0.15s', marginBottom:-1 }}>
                <span>{t.icon}</span><span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'28px 32px' }}>

        {/* ── REST API ── */}
        {activeTab === 'rest' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:24 }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                <h2 style={{ fontSize:16, fontWeight:800, color:'#0A1628' }}>Endpoints</h2>
                <span style={{ fontSize:11, padding:'2px 8px', borderRadius:999, background:'#EEF3FF', color:'#1B4FFF', fontWeight:700 }}>{API_ENDPOINTS.length} endpoints</span>
              </div>
              {API_ENDPOINTS.map((e,i) => <EndpointCard key={i} {...e} />)}
            </div>
            <div>
              <div style={{ background:'#0D1117', borderRadius:12, padding:'16px', marginBottom:16, position:'sticky', top:20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Quick Start</div>
                <Code lang="curl" code={CURL_QUOTE} />
                <Code lang="curl — AI Research" code={CURL_AI} />
                <div style={{ background:'rgba(27,79,255,0.1)', border:'1px solid rgba(27,79,255,0.3)', borderRadius:8, padding:'10px 12px', marginTop:8 }}>
                  <p style={{ fontSize:11.5, color:'rgba(255,255,255,0.6)', lineHeight:1.5, margin:0 }}>
                    Replace <code style={{ color:'#93B4FF' }}>YOUR_API_KEY</code> with your key from the API Keys tab. Base URL: <code style={{ color:'#93B4FF' }}>https://finsyt-platform.vercel.app</code>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MCP ── */}
        {activeTab === 'mcp' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:24 }}>
            <div>
              <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'20px 22px', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                  <span style={{ fontSize:22 }}>🔗</span>
                  <h2 style={{ fontSize:15, fontWeight:800, color:'#0A1628' }}>Model Context Protocol (MCP)</h2>
                </div>
                <p style={{ fontSize:13, color:'#7D8FA9', lineHeight:1.6 }}>
                  Connect Finsyt data directly into Claude, Cursor, Windsurf, and any MCP-compatible LLM client. Your AI gets live stock quotes, financials, transcripts, filings, and macro data — no copy-paste required.
                </p>
              </div>

              {/* MCP Tools */}
              <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'20px 22px', marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:800, color:'#0A1628', marginBottom:14 }}>Available MCP Tools</div>
                {[
                  { name:'get_stock_quote',        icon:'📈', desc:'Real-time price, change, PE, margin, market cap' },
                  { name:'get_financials',          icon:'📊', desc:'Income statement, balance sheet, cash flow, ratios' },
                  { name:'get_news',                icon:'📰', desc:'Company or market news with sentiment tags' },
                  { name:'get_macro_data',          icon:'🌍', desc:'Fed rate, CPI, GDP, yield curve, VIX from FRED' },
                  { name:'get_earnings_transcript', icon:'📋', desc:'Earnings call transcript with speaker segmentation' },
                  { name:'get_filings',             icon:'📄', desc:'SEC 10-K, 10-Q, 8-K with direct document URLs' },
                  { name:'search_companies',        icon:'🔍', desc:'Search by name or ticker fragment' },
                  { name:'screen_stocks',           icon:'⚙️', desc:'Filter by sector, market cap, exchange, beta' },
                ].map(t => (
                  <div key={t.name} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 0', borderBottom:'1px solid #F5F7FB' }}>
                    <span style={{ fontSize:16 }}>{t.icon}</span>
                    <div>
                      <code style={{ fontSize:12, fontWeight:700, color:'#1B4FFF' }}>{t.name}</code>
                      <p style={{ fontSize:11.5, color:'#7D8FA9', margin:0, marginTop:1 }}>{t.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Claude API example */}
              <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'20px 22px' }}>
                <div style={{ fontSize:13, fontWeight:800, color:'#0A1628', marginBottom:12 }}>Use in Claude API (Python)</div>
                <Code lang="python" code={MCP_PYTHON} />
              </div>
            </div>

            <div>
              {/* Claude Desktop config */}
              <div style={{ background:'#0D1117', borderRadius:12, padding:'16px', marginBottom:16, position:'sticky', top:20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Claude Desktop — claude_desktop_config.json</div>
                <Code lang="json" code={MCP_CONFIG} />
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:8 }}>
                  {[
                    { app:'Claude Desktop', icon:'🤖', path:'~/Library/Application Support/Claude/claude_desktop_config.json' },
                    { app:'Cursor',         icon:'⌨️', path:'.cursor/mcp.json in project root' },
                    { app:'Windsurf',       icon:'🏄', path:'~/.codeium/windsurf/mcp_config.json' },
                    { app:'Cline',          icon:'🖥', path:'VS Code settings → MCP Servers' },
                  ].map(item => (
                    <div key={item.app} style={{ display:'flex', gap:10, padding:'8px 10px', background:'rgba(255,255,255,0.04)', borderRadius:7 }}>
                      <span style={{ fontSize:14 }}>{item.icon}</span>
                      <div>
                        <div style={{ fontSize:11.5, fontWeight:700, color:'rgba(255,255,255,0.75)' }}>{item.app}</div>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', fontFamily:'monospace' }}>{item.path}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:12, padding:'10px 12px', background:'rgba(27,79,255,0.12)', border:'1px solid rgba(27,79,255,0.25)', borderRadius:8 }}>
                  <p style={{ fontSize:11.5, color:'rgba(255,255,255,0.55)', lineHeight:1.5, margin:0 }}>MCP endpoint: <code style={{ color:'#93B4FF' }}>https://finsyt-platform.vercel.app/api/mcp</code></p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SDKs ── */}
        {activeTab === 'sdks' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'20px 22px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                <span style={{ fontSize:20 }}>📦</span>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:'#0A1628' }}>JavaScript / TypeScript</div>
                  <code style={{ fontSize:11, color:'#7D8FA9' }}>npm install @finsyt/js</code>
                </div>
                <span style={{ marginLeft:'auto', fontSize:11, padding:'2px 8px', borderRadius:5, background:'#EEF3FF', color:'#1B4FFF', fontWeight:700 }}>Coming soon</span>
              </div>
              <Code lang="javascript" code={JS_EXAMPLE} />
            </div>
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'20px 22px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                <span style={{ fontSize:20 }}>🐍</span>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:'#0A1628' }}>Python</div>
                  <code style={{ fontSize:11, color:'#7D8FA9' }}>pip install finsyt</code>
                </div>
                <span style={{ marginLeft:'auto', fontSize:11, padding:'2px 8px', borderRadius:5, background:'#EEF3FF', color:'#1B4FFF', fontWeight:700 }}>Coming soon</span>
              </div>
              <Code lang="python" code={PYTHON_EXAMPLE} />
            </div>
            <div style={{ gridColumn:'1/-1', background:'#F0F7F4', border:'1px solid #A7F3D0', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', gap:16 }}>
              <span style={{ fontSize:24 }}>📬</span>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#065F46' }}>Join the SDK waitlist</div>
                <p style={{ fontSize:12, color:'#047857', margin:0 }}>We are building native SDKs for Python, JS/TS, and a Langchain integration. Sign up to get early access.</p>
              </div>
              <button style={{ marginLeft:'auto', padding:'8px 18px', background:'#059669', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>Join waitlist</button>
            </div>
          </div>
        )}

        {/* ── API Keys ── */}
        {activeTab === 'keys' && (
          <div style={{ maxWidth:700 }}>
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'20px 22px', marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:800, color:'#0A1628', marginBottom:14 }}>Your API Keys</div>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', background:'#F7F9FC', border:'1.5px solid #E8EDF4', borderRadius:9, marginBottom:8 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:'#059669', flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#0A1628', marginBottom:2 }}>Production Key</div>
                  <code style={{ fontSize:12, color:'#7D8FA9', fontFamily:'monospace' }}>{apiKey}</code>
                </div>
                <button onClick={() => { navigator.clipboard.writeText('fsy_live_demo_key'); setCopied(true); setTimeout(()=>setCopied(false),1400) }} style={{ padding:'5px 12px', background:copied?'#059669':'#F0F4FA', color:copied?'#fff':'#3D4F6E', border:'1.5px solid #E8EDF4', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s' }}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                <button style={{ padding:'5px 12px', background:'#FEF2F2', color:'#DC2626', border:'1.5px solid #FECACA', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Revoke</button>
              </div>
              <button style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'#1B4FFF', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                + Generate new key
              </button>
            </div>

            {/* Rate limits */}
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'20px 22px', marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:800, color:'#0A1628', marginBottom:14 }}>Rate Limits & Quotas</div>
              {[
                { plan:'Free',         rpm:10,    monthly:'1,000',   endpoints:'Quote, Search, News' },
                { plan:'Growth',       rpm:60,    monthly:'50,000',  endpoints:'All REST endpoints' },
                { plan:'Pro',          rpm:300,   monthly:'500,000', endpoints:'All REST + MCP + AI Research' },
                { plan:'Enterprise',   rpm:'∞',   monthly:'Custom',  endpoints:'All + Priority + SLA' },
              ].map((p,i) => (
                <div key={p.plan} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:i<3?'1px solid #F5F7FB':'none' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#0A1628' }}>{p.plan}</div>
                    <div style={{ fontSize:11, color:'#B0BCD0' }}>{p.endpoints}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#0A1628' }}>{p.rpm} req/min</div>
                    <div style={{ fontSize:11, color:'#B0BCD0' }}>{p.monthly}/mo</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Usage */}
            <div style={{ background:'#F0F7F4', border:'1px solid #A7F3D0', borderRadius:12, padding:'14px 18px' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#065F46', marginBottom:6 }}>Current Usage — April 2026</div>
              <div style={{ display:'flex', gap:20 }}>
                {[{label:'API Calls',val:'3,127',delta:'+135 today'},{label:'Active Keys',val:'1',delta:''},{label:'Avg Latency',val:'112ms',delta:''}].map(s=>(
                  <div key={s.label}>
                    <div style={{ fontSize:18, fontWeight:900, color:'#0A1628' }}>{s.val}</div>
                    <div style={{ fontSize:11, color:'#059669', fontWeight:600 }}>{s.delta||s.label}</div>
                    {s.delta && <div style={{ fontSize:10, color:'#7D8FA9' }}>{s.label}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
