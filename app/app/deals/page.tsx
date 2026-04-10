'use client'
import { useState } from 'react'
import { fmtLarge } from '@/lib/utils'

const DEALS = [
  { type: 'M&A', acquirer: 'Microsoft', target: 'Activision Blizzard', value: 68700000000, status: 'Closed', date: '2023-10-13', sector: 'Technology', premium: '45%' },
  { type: 'M&A', acquirer: 'Broadcom', target: 'VMware', value: 69000000000, status: 'Closed', date: '2023-11-22', sector: 'Technology', premium: '44%' },
  { type: 'IPO', acquirer: 'Reddit', target: '', value: 6400000000, status: 'Closed', date: '2024-03-21', sector: 'Technology', premium: '' },
  { type: 'M&A', acquirer: 'Synopsys', target: 'Ansys', value: 35000000000, status: 'Pending', date: '2024-01-16', sector: 'Technology', premium: '35%' },
  { type: 'M&A', acquirer: 'Capital One', target: 'Discover Financial', value: 35300000000, status: 'Pending', date: '2024-02-19', sector: 'Financials', premium: '27%' },
  { type: 'Funding', acquirer: 'OpenAI', target: '', value: 6600000000, status: 'Closed', date: '2024-10-02', sector: 'Technology', premium: '' },
  { type: 'M&A', acquirer: 'Hewlett Packard', target: 'Juniper Networks', value: 14000000000, status: 'Pending', date: '2024-01-09', sector: 'Technology', premium: '32%' },
  { type: 'Funding', acquirer: 'Stripe', target: '', value: 6500000000, status: 'Closed', date: '2024-02-15', sector: 'Fintech', premium: '' },
  { type: 'IPO', acquirer: 'Astera Labs', target: '', value: 5500000000, status: 'Closed', date: '2024-03-20', sector: 'Technology', premium: '' },
  { type: 'M&A', acquirer: 'Mars', target: "Kellanova", value: 36000000000, status: 'Closed', date: '2024-08-14', sector: 'Consumer Staples', premium: '33%' },
]

const typeColor: Record<string, string> = { 'M&A': 'badge-blue', 'IPO': 'badge-amber', 'Funding': 'badge-green' }
const statusColor: Record<string, string> = { 'Closed': 'badge-green', 'Pending': 'badge-amber', 'Rumoured': 'badge-gray' }

export default function DealsPage() {
  const [filter, setFilter] = useState('')

  const filtered = DEALS.filter(d =>
    !filter || d.acquirer.toLowerCase().includes(filter.toLowerCase()) ||
    d.target.toLowerCase().includes(filter.toLowerCase()) ||
    d.sector.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="page-content">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="page-title">Deals & M&A</h1>
          <p className="text-sm mt-0.5" style={{ color: '#7D8FA9' }}>Mergers, acquisitions, IPOs & funding rounds</p>
        </div>
        <input className="input" style={{ width: 200, height: 38 }} placeholder="Search deals..." value={filter} onChange={e => setFilter(e.target.value)} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Deal Value (2024)', value: '$2.1T', sub: '+18% vs 2023' },
          { label: 'M&A Transactions', value: '847', sub: 'YTD 2024' },
          { label: 'Largest Deal', value: '$69B', sub: 'MSFT / Activision' },
          { label: 'Avg Premium', value: '34%', sub: 'Over last price' },
        ].map(m => (
          <div key={m.label} className="metric-card">
            <div className="label mb-2">{m.label}</div>
            <div className="font-black text-xl mb-1" style={{ color: '#0A1628', letterSpacing: '-0.02em' }}>{m.value}</div>
            <div className="text-xs" style={{ color: '#7D8FA9' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Type</th><th>Acquirer / Company</th><th>Target</th><th>Sector</th><th className="right">Value</th><th className="right">Premium</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={i}>
                  <td><span className={`badge ${typeColor[d.type] || 'badge-gray'}`}>{d.type}</span></td>
                  <td className="font-semibold text-sm" style={{ color: '#0A1628' }}>{d.acquirer}</td>
                  <td className="text-sm" style={{ color: '#3D4F6E' }}>{d.target || '—'}</td>
                  <td><span className="badge badge-gray">{d.sector}</span></td>
                  <td className="right font-semibold text-sm">{fmtLarge(d.value)}</td>
                  <td className="right text-sm" style={{ color: '#7D8FA9' }}>{d.premium || '—'}</td>
                  <td className="text-sm" style={{ color: '#7D8FA9' }}>{d.date}</td>
                  <td><span className={`badge ${statusColor[d.status] || 'badge-gray'}`}>{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
