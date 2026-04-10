import { useState } from 'react'
import AppLayout from '../layouts/AppLayout'

const INDICATORS = [
  { id:1, name:'GDP Growth Rate', cat:'Macro', source:'World Bank', countries:190, freq:'Annual', updated:'2024 Q4' },
  { id:2, name:'Inflation (CPI)', cat:'Macro', source:'IMF', countries:185, freq:'Monthly', updated:'Mar 2026' },
  { id:3, name:'Unemployment Rate', cat:'Labor', source:'World Bank', countries:170, freq:'Monthly', updated:'Feb 2026' },
  { id:4, name:'Current Account Balance', cat:'Trade', source:'World Bank Data360', countries:175, freq:'Annual', updated:'2024' },
  { id:5, name:'Foreign Direct Investment', cat:'Trade', source:'World Bank Data360', countries:180, freq:'Annual', updated:'2024' },
  { id:6, name:'Government Debt (% GDP)', cat:'Fiscal', source:'IMF', countries:180, freq:'Annual', updated:'2025 Q1' },
  { id:7, name:'Central Bank Rate', cat:'Monetary', source:'BIS', countries:45, freq:'Monthly', updated:'Apr 2026' },
  { id:8, name:'Stock Market Index', cat:'Markets', source:'Bloomberg', countries:60, freq:'Daily', updated:'Apr 10, 2026' },
]

const CATS = ['All','Macro','Labor','Trade','Fiscal','Monetary','Markets']
const REGIONS = ['Global','Americas','Europe','Asia-Pacific','Middle East','Africa']
const YEARS = [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025]
const CHART = { US:[2.3,2.9,2.3,-2.8,5.9,2.1,2.5,2.8,1.9,2.5], EU:[1.8,1.9,1.6,-5.9,5.2,3.4,0.5,0.4,1.1,1.4], CN:[6.8,6.7,6.1,2.3,8.1,3.0,5.2,4.6,4.9,5.0] }
const COLORS = { US:'#3b82f6', EU:'#14b8a6', CN:'#f59e0b' }
const MAX = Math.max(...Object.values(CHART).flat().map(Math.abs))

export default function DataExplorer() {
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('All')
  const [region, setRegion] = useState('Global')
  const [selected, setSelected] = useState(INDICATORS[0])

  const filtered = INDICATORS.filter(i => {
    const s = i.name.toLowerCase().includes(search.toLowerCase())
    const c = cat === 'All' || i.cat === cat
    return s && c
  })

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-7">
          <h1 className="text-2xl font-black tracking-tight mb-1">Data Explorer</h1>
          <p className="text-sm text-muted">Search and visualise 50+ global economic and financial indicators.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-5">
          {/* Left */}
          <div className="flex flex-col gap-4">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">🔍</span>
              <input placeholder="Search indicators..." value={search} onChange={e => setSearch(e.target.value)} className="input w-full pl-9" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CATS.map(c => (
                <button key={c} onClick={() => setCat(c)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${cat===c ? 'bg-blue-600/10 border-blue-600/30 text-blue-400' : 'border-border text-muted hover:text-gray-300'}`}>{c}</button>
              ))}
            </div>
            <div className="bg-navy-800 border border-border rounded-xl overflow-hidden">
              {filtered.map((ind, i) => (
                <div key={ind.id} onClick={() => setSelected(ind)}
                  className={`px-4 py-3.5 cursor-pointer transition-all border-l-2 ${i < filtered.length-1 ? 'border-b border-border/50' : ''} ${selected.id===ind.id ? 'border-l-blue-500 bg-blue-600/5' : 'border-l-transparent hover:bg-navy-700/50'}`}>
                  <div className="text-sm font-semibold mb-1">{ind.name}</div>
                  <div className="flex gap-2">
                    <span className="text-[10px] bg-blue-600/10 text-blue-400 px-2 py-0.5 rounded font-bold">{ind.cat}</span>
                    <span className="text-[10px] text-muted">{ind.source}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right */}
          <div className="flex flex-col gap-5">
            {/* Detail header */}
            <div className="card">
              <div className="flex items-start justify-between mb-5 flex-wrap gap-4">
                <div>
                  <h2 className="text-xl font-black tracking-tight mb-2">{selected.name}</h2>
                  <div className="flex flex-wrap gap-4 text-xs text-muted">
                    <span>Source: <span className="text-blue-400">{selected.source}</span></span>
                    <span>Frequency: {selected.freq}</span>
                    <span>Updated: {selected.updated}</span>
                    <span>{selected.countries} countries</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-outline text-xs py-2 px-4">📥 Export</button>
                  <button className="btn-primary text-xs py-2 px-4">+ Watchlist</button>
                </div>
              </div>
              <div className="mb-4">
                <div className="text-[10px] text-muted uppercase tracking-widest font-semibold mb-2">Region</div>
                <div className="flex flex-wrap gap-1.5">
                  {REGIONS.map(r => (
                    <button key={r} onClick={() => setRegion(r)}
                      className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-all ${region===r ? 'bg-blue-600/10 border-blue-600/30 text-blue-400' : 'border-border text-muted hover:text-gray-300'}`}>{r}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted uppercase tracking-widest font-semibold mb-2">Countries</div>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(COLORS).map(([c, col]) => (
                    <div key={c} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold" style={{borderColor:`${col}30`,background:`${col}10`,color:col}}>
                      <div className="w-2 h-2 rounded-full" style={{background:col}} /> {c}
                    </div>
                  ))}
                  <button className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-border text-muted hover:text-gray-300 transition-colors">+ Add</button>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="card">
              <div className="font-bold text-sm mb-5">GDP Growth Rate (% YoY) — 2016–2025</div>
              <div className="flex items-stretch gap-2 h-44 relative">
                <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-border" />
                {YEARS.map((yr, yi) => (
                  <div key={yr} className="flex-1 flex flex-col items-center justify-center gap-0.5 relative">
                    <div className="flex-1 flex flex-col justify-end w-full gap-px pb-0.5">
                      {Object.entries(CHART).map(([country, vals]) => {
                        const v = vals[yi]
                        const h = Math.abs(v)/MAX*80
                        return <div key={country} title={`${country}: ${v}%`} className="w-full rounded-[2px]" style={{height:`${h}%`,minHeight:2,background:COLORS[country],opacity:0.85}} />
                      })}
                    </div>
                    <div className="text-[9px] text-gray-700 mt-1">{yr}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-5 mt-4">
                {Object.entries(COLORS).map(([c, col]) => (
                  <div key={c} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{background:col}} />
                    <span className="text-xs text-muted">{c==='US'?'United States':c==='EU'?'Eurozone':'China'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="card overflow-x-auto">
              <div className="font-bold text-sm mb-4">Data Table</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-[10px] text-muted uppercase tracking-widest font-semibold">Year</th>
                    {Object.keys(COLORS).map(c => <th key={c} className="text-right py-2 px-3 text-[10px] uppercase tracking-widest font-bold" style={{color:COLORS[c]}}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {YEARS.map((yr, i) => (
                    <tr key={yr} className={`border-b border-border/30 ${i%2===1 ? 'bg-navy-950/30' : ''}`}>
                      <td className="py-2.5 px-3 font-semibold">{yr}</td>
                      {Object.entries(CHART).map(([c, vals]) => (
                        <td key={c} className={`py-2.5 px-3 text-right font-semibold ${vals[i]>=0?'text-green-400':'text-red-400'}`}>{vals[i]>0?'+':''}{vals[i]}%</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
