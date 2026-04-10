import { useState } from 'react'
import AppLayout from '../layouts/AppLayout'

const WATCHLIST = [
  { ticker:'SPY', name:'S&P 500 ETF', price:'521.34', change:'+1.2%', up:true },
  { ticker:'BTC', name:'Bitcoin', price:'68,420', change:'+3.4%', up:true },
  { ticker:'EURUSD', name:'EUR/USD', price:'1.0842', change:'-0.3%', up:false },
  { ticker:'GLD', name:'Gold ETF', price:'218.56', change:'+0.8%', up:true },
  { ticker:'TLT', name:'20yr Treasury', price:'94.12', change:'-0.5%', up:false },
]

const INSIGHTS = [
  { time:'2m ago', tag:'MACRO', color:'#3b82f6', title:'US CPI beats expectations — markets reprice rate cuts', summary:'Core CPI came in at 3.1% YoY vs 3.0% expected. Treasury yields ticked up 8bps. Equities dipped then recovered.', impact:'High' },
  { time:'18m ago', tag:'EARNINGS', color:'#8b5cf6', title:'NVIDIA Q1 beat: revenue +262% YoY', summary:'Data center revenue of $22.6B led the beat. Guidance for Q2 above consensus. Stock +8% AH.', impact:'High' },
  { time:'1h ago', tag:'GLOBAL', color:'#0d9488', title:'ECB signals pause in rate cuts amid sticky inflation', summary:"Lagarde indicated the ECB will hold rates steady at June, citing services inflation remaining elevated.", impact:'Medium' },
  { time:'3h ago', tag:'SIGNAL', color:'#f59e0b', title:'USD/JPY approaching 158 — intervention risk elevated', summary:'The pair has moved 2.3% this week. BOJ officials have issued verbal warnings.', impact:'Medium' },
]

const ALERTS = [
  { icon:'📈', label:'SPY crossed $520', time:'4m ago', color:'#22c55e' },
  { icon:'🌍', label:'US Jobs report in 2 days', time:'1h ago', color:'#3b82f6' },
  { icon:'⚠️', label:'Volatility spike: VIX > 20', time:'3h ago', color:'#f59e0b' },
]

const BARS = [38,42,39,51,48,62,58,70,65,78,74,88,84,92,89,96,91,100]

export default function Dashboard() {
  const [period, setPeriod] = useState('1M')

  return (
    <AppLayout>
      {/* Topbar */}
      <div className="sticky top-0 z-10 bg-navy-950/80 backdrop-blur-xl border-b border-border px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight">Good afternoon, Jaime 👋</h1>
          <p className="text-xs text-muted mt-0.5">Friday, 10 April 2026 · Markets open</p>
        </div>
        <div className="flex gap-3 items-center">
          <div className="relative">
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-[9px] flex items-center justify-center font-bold">3</div>
            <button className="w-9 h-9 rounded-xl bg-navy-800 border border-border flex items-center justify-center text-base hover:border-blue-500/30 transition-colors">🔔</button>
          </div>
          <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center font-bold text-sm">J</div>
        </div>
      </div>

      <div className="p-8">
        {/* Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label:'Portfolio Value', value:'$2.41M', change:'+$28.4K today', up:true, icon:'💼' },
            { label:'Active Signals', value:'47', change:'+12 since yesterday', up:true, icon:'📡' },
            { label:'AI Insights', value:'18 new', change:'Last updated 2m ago', up:null, icon:'🤖' },
            { label:'Alerts', value:'3 active', change:'2 high priority', up:false, icon:'🔔' },
          ].map((m,i) => (
            <div key={i} className="card">
              <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] text-muted uppercase tracking-widest font-semibold">{m.label}</span>
                <span className="text-lg">{m.icon}</span>
              </div>
              <div className="text-2xl font-black tracking-tight mb-1.5">{m.value}</div>
              <div className={`text-xs ${m.up===true?'text-green-400':m.up===false?'text-red-400':'text-muted'}`}>{m.change}</div>
            </div>
          ))}
        </div>

        {/* Chart + Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          <div className="lg:col-span-2 card">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="font-bold text-base">Portfolio Performance</div>
                <div className="text-xs text-muted mt-0.5">Last 30 days</div>
              </div>
              <div className="flex gap-1">
                {['1W','1M','3M','1Y'].map(t => (
                  <button key={t} onClick={() => setPeriod(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${period===t ? 'bg-blue-600 border-blue-600 text-white' : 'border-border text-muted hover:text-gray-300'}`}>{t}</button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-1 h-40">
              {BARS.map((h, i) => (
                <div key={i} className="flex-1 rounded-t-sm transition-all hover:opacity-100" style={{height:`${h}%`, background: i===BARS.length-1 ? 'linear-gradient(180deg,#3b82f6,#0d9488)' : 'linear-gradient(180deg,rgba(59,130,246,0.5),rgba(13,148,136,0.5))', opacity: 0.85}} />
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-700">
              <span>Mar 10</span><span>Mar 20</span><span>Apr 1</span><span>Apr 10</span>
            </div>
          </div>

          <div className="card">
            <div className="font-bold text-base mb-4">Active Alerts</div>
            {ALERTS.map((a, i) => (
              <div key={i} className={`flex gap-3 items-start py-3.5 ${i < ALERTS.length-1 ? 'border-b border-border/50' : ''}`}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0" style={{background:`${a.color}15`,border:`1px solid ${a.color}30`}}>{a.icon}</div>
                <div>
                  <div className="text-sm font-semibold mb-0.5">{a.label}</div>
                  <div className="text-xs text-muted">{a.time}</div>
                </div>
              </div>
            ))}
            <button className="w-full mt-4 py-2.5 text-sm text-muted border border-border rounded-xl hover:border-blue-500/30 hover:text-gray-300 transition-all">View all alerts →</button>
          </div>
        </div>

        {/* Watchlist + Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2 card">
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-base">Watchlist</div>
              <button className="btn-primary text-xs py-1.5 px-3">+ Add</button>
            </div>
            {WATCHLIST.map((s, i) => (
              <div key={i} className={`flex items-center justify-between py-3 ${i < WATCHLIST.length-1 ? 'border-b border-border/40' : ''}`}>
                <div className="flex gap-3 items-center">
                  <div className="w-9 h-9 rounded-lg bg-navy-950 border border-border flex items-center justify-center text-[9px] font-black text-blue-400">{s.ticker}</div>
                  <div>
                    <div className="text-sm font-semibold">{s.ticker}</div>
                    <div className="text-xs text-muted">{s.name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold">{s.price}</div>
                  <div className={`text-xs ${s.up ? 'text-green-400' : 'text-red-400'}`}>{s.change}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-3 card">
            <div className="font-bold text-base mb-4">AI Insights Feed</div>
            <div className="flex flex-col gap-3">
              {INSIGHTS.map((ins, i) => (
                <div key={i} className="p-4 bg-navy-950 border border-border rounded-xl cursor-pointer hover:border-blue-600/20 transition-colors">
                  <div className="flex gap-2 items-center mb-2.5 flex-wrap">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{background:`${ins.color}15`,color:ins.color}}>{ins.tag}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ins.impact==='High' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>{ins.impact} impact</span>
                    <span className="text-xs text-gray-600 ml-auto">{ins.time}</span>
                  </div>
                  <div className="text-sm font-semibold mb-1.5">{ins.title}</div>
                  <div className="text-xs text-muted leading-relaxed">{ins.summary}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
