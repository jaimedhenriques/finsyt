import { useState } from 'react'
import AppLayout from '../layouts/AppLayout'

const SOURCES = [
  { id:1, name:'World Bank Data360', cat:'Economic', icon:'🌍', desc:'1,600+ global development indicators across 190+ countries.', datasets:'1,600+', lastSync:'2 minutes ago', color:'#3b82f6' },
  { id:2, name:'IMF Data', cat:'Economic', icon:'🏛', desc:'World Economic Outlook, IFS, and more from the IMF.', datasets:'400+', lastSync:'5 minutes ago', color:'#0d9488' },
  { id:3, name:'BIS Statistics', cat:'Monetary', icon:'🏦', desc:'Bank for International Settlements — credit, derivatives, FX.', datasets:'120+', lastSync:'1 hour ago', color:'#8b5cf6' },
  { id:4, name:'Bloomberg Terminal', cat:'Markets', icon:'📈', desc:'Real-time market data, news, and analytics.', datasets:'Millions', color:'#f59e0b' },
  { id:5, name:'Refinitiv Eikon', cat:'Markets', icon:'📊', desc:'Financial market data and infrastructure from LSEG.', datasets:'Extensive', color:'#ef4444' },
  { id:6, name:'FRED (St. Louis Fed)', cat:'Economic', icon:'🇺🇸', desc:'800,000+ US economic time series from the Federal Reserve.', datasets:'800K+', color:'#22c55e' },
  { id:7, name:'Eurostat', cat:'Economic', icon:'🇪🇺', desc:'Statistical data for the EU and member states.', datasets:'3,000+', color:'#6366f1' },
  { id:8, name:'Alpha Vantage', cat:'Markets', icon:'⚡', desc:'Stock, forex, and crypto market data via API.', datasets:'Global equities', color:'#14b8a6' },
]

const CATS = ['All','Economic','Markets','Monetary']

export default function Integrations() {
  const [cat, setCat] = useState('All')
  const [connecting, setConnecting] = useState(null)
  const [connected, setConnected] = useState([1,2,3])

  const connect = (id) => {
    setConnecting(id)
    setTimeout(() => { setConnected(p => [...p, id]); setConnecting(null) }, 2000)
  }

  const filtered = SOURCES.filter(s => cat==='All' || s.cat===cat)
  const connectedSources = SOURCES.filter(s => connected.includes(s.id))

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-7">
          <h1 className="text-2xl font-black tracking-tight mb-1">Integrations & Sources</h1>
          <p className="text-sm text-muted">Connect data sources to power Finsyt's intelligence engine.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[{label:'Connected',value:connected.length,icon:'🔗',color:'#22c55e'},{label:'Available',value:SOURCES.length-connected.length,icon:'⚡',color:'#3b82f6'},{label:'Data Points/Day',value:'2.4M+',icon:'📊',color:'#0d9488'}].map((m,i) => (
            <div key={i} className="card flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{background:`${m.color}15`,border:`1px solid ${m.color}25`}}>{m.icon}</div>
              <div>
                <div className="text-2xl font-black">{m.value}</div>
                <div className="text-xs text-muted">{m.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Connected */}
        {connectedSources.length > 0 && (
          <div className="mb-8">
            <div className="text-[10px] text-muted uppercase tracking-widest font-semibold mb-4">Active connections</div>
            <div className="flex flex-col gap-3">
              {connectedSources.map(src => (
                <div key={src.id} className="card flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{background:`${src.color}15`,border:`1px solid ${src.color}25`}}>{src.icon}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2.5 mb-1">
                      <span className="font-bold text-sm">{src.name}</span>
                      <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full font-bold">● Connected</span>
                    </div>
                    <div className="text-xs text-muted">{src.datasets} datasets · Last synced {src.lastSync}</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-ghost text-xs py-1.5 px-3 border border-border rounded-lg">⚙ Configure</button>
                    <button className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted hover:text-gray-300 transition-colors">Disconnect</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available */}
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="text-[10px] text-muted uppercase tracking-widest font-semibold">Available sources</div>
            <div className="flex gap-1.5">
              {CATS.map(c => (
                <button key={c} onClick={() => setCat(c)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${cat===c ? 'bg-blue-600/10 border-blue-600/30 text-blue-400' : 'border-border text-muted hover:text-gray-300'}`}>{c}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.filter(s => !connected.includes(s.id)).map(src => (
              <div key={src.id} className="card-hover flex flex-col">
                <div className="flex gap-3 items-start mb-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{background:`${src.color}15`,border:`1px solid ${src.color}25`}}>{src.icon}</div>
                  <div>
                    <div className="font-bold text-sm mb-1">{src.name}</div>
                    <span className="text-[10px] bg-navy-700 text-muted px-2 py-0.5 rounded-full font-semibold">{src.cat}</span>
                  </div>
                </div>
                <p className="text-xs text-muted leading-relaxed mb-4 flex-1">{src.desc}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">{src.datasets} datasets</span>
                  <button className="btn-primary text-xs py-2 px-4" onClick={() => connect(src.id)} disabled={connecting===src.id}>
                    {connecting===src.id ? 'Connecting...' : 'Connect →'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
