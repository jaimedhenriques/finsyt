'use client'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

const INDICATORS = [
  { label: 'US GDP Growth', value: '2.8%', prev: '2.1%', period: 'Q3 2024', trend: 'up' },
  { label: 'US CPI (YoY)', value: '3.2%', prev: '3.7%', period: 'Nov 2024', trend: 'down' },
  { label: 'Fed Funds Rate', value: '5.25%', prev: '5.50%', period: 'Dec 2024', trend: 'down' },
  { label: 'US Unemployment', value: '3.7%', prev: '3.9%', period: 'Nov 2024', trend: 'down' },
  { label: 'US 10Y Yield', value: '4.38%', prev: '4.60%', period: 'Live', trend: 'down' },
  { label: 'DXY Index', value: '104.2', prev: '106.1', period: 'Live', trend: 'down' },
  { label: 'Gold (XAU)', value: '$2,074', prev: '$1,998', period: 'Live', trend: 'up' },
  { label: 'WTI Crude Oil', value: '$71.4', prev: '$78.2', period: 'Live', trend: 'down' },
]

const cpiData = [
  { month: 'Jan', cpi: 6.4 }, { month: 'Feb', cpi: 6.0 }, { month: 'Mar', cpi: 5.0 },
  { month: 'Apr', cpi: 4.9 }, { month: 'May', cpi: 4.0 }, { month: 'Jun', cpi: 3.0 },
  { month: 'Jul', cpi: 3.2 }, { month: 'Aug', cpi: 3.7 }, { month: 'Sep', cpi: 3.7 },
  { month: 'Oct', cpi: 3.2 }, { month: 'Nov', cpi: 3.1 }, { month: 'Dec', cpi: 3.2 },
]

const yieldData = [
  { label: '1M', yield: 5.42 }, { label: '3M', yield: 5.38 }, { label: '6M', yield: 5.21 },
  { label: '1Y', yield: 4.98 }, { label: '2Y', yield: 4.72 }, { label: '5Y', yield: 4.52 },
  { label: '10Y', yield: 4.38 }, { label: '20Y', yield: 4.62 }, { label: '30Y', yield: 4.55 },
]

const gdpData = [
  { q: 'Q1 23', gdp: 2.0 }, { q: 'Q2 23', gdp: 2.1 }, { q: 'Q3 23', gdp: 4.9 },
  { q: 'Q4 23', gdp: 3.4 }, { q: 'Q1 24', gdp: 1.6 }, { q: 'Q2 24', gdp: 3.0 },
  { q: 'Q3 24', gdp: 2.8 },
]

export default function MacroPage() {
  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="page-title">Macro Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: '#7D8FA9' }}>Global economic indicators & yield curves</p>
        </div>
      </div>

      {/* Indicators grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {INDICATORS.map(ind => (
          <div key={ind.label} className="metric-card">
            <div className="label mb-2">{ind.label}</div>
            <div className="flex items-end gap-2">
              <span className="font-black text-xl" style={{ color: '#0A1628', letterSpacing: '-0.02em' }}>{ind.value}</span>
              <span className={`text-sm font-semibold mb-0.5 ${ind.trend === 'up' ? 'pos' : 'neg'}`}>{ind.trend === 'up' ? '↑' : '↓'}</span>
            </div>
            <div className="text-xs mt-1" style={{ color: '#7D8FA9' }}>Prev: {ind.prev} · {ind.period}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* CPI Chart */}
        <div className="card p-5">
          <div className="section-title">US CPI Inflation (2023)</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cpiData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="cpiGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1B4FFF" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#1B4FFF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#7D8FA9' }} />
                <YAxis tick={{ fontSize: 11, fill: '#7D8FA9' }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: any) => [`${v}%`, 'CPI']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F2' }} />
                <Area type="monotone" dataKey="cpi" stroke="#1B4FFF" strokeWidth={2} fill="url(#cpiGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Yield Curve */}
        <div className="card p-5">
          <div className="section-title">US Treasury Yield Curve</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={yieldData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#7D8FA9' }} />
                <YAxis tick={{ fontSize: 11, fill: '#7D8FA9' }} tickFormatter={v => `${v}%`} domain={[4, 6]} />
                <Tooltip formatter={(v: any) => [`${v}%`, 'Yield']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F2' }} />
                <Line type="monotone" dataKey="yield" stroke="#059669" strokeWidth={2.5} dot={{ fill: '#059669', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GDP */}
        <div className="card p-5">
          <div className="section-title">US GDP Growth (QoQ %)</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gdpData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" />
                <XAxis dataKey="q" tick={{ fontSize: 11, fill: '#7D8FA9' }} />
                <YAxis tick={{ fontSize: 11, fill: '#7D8FA9' }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: any) => [`${v}%`, 'GDP Growth']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F2' }} />
                <Bar dataKey="gdp" fill="#1B4FFF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
