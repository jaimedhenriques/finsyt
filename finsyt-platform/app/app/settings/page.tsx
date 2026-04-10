'use client'
import { useState } from 'react'

export default function SettingsPage() {
  const [openaiKey, setOpenaiKey] = useState('')
  const [polygonKey, setPolygonKey] = useState('')
  const [saved, setSaved] = useState(false)

  function save() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="page-content" style={{ maxWidth: 700 }}>
      <div className="mb-6">
        <h1 className="page-title">Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: '#7D8FA9' }}>Configure your API keys and preferences</p>
      </div>

      {/* API Keys */}
      <div className="card p-6 mb-5">
        <div className="section-title">API Keys</div>
        <p className="text-sm mb-5" style={{ color: '#7D8FA9' }}>Connect data providers to unlock full platform features</p>

        <div className="space-y-5">
          {[
            { label: 'Alpha Vantage', key: 'alpha', value: '✓ Connected', hint: 'Market data, fundamentals, news — alphavantage.co', status: 'connected' },
            { label: 'OpenAI (GPT-4o)', key: 'openai', value: openaiKey, setter: setOpenaiKey, hint: 'Enables AI research engine with full reasoning — platform.openai.com', placeholder: 'sk-...' },
            { label: 'Polygon.io', key: 'polygon', value: polygonKey, setter: setPolygonKey, hint: 'Real-time tick data, options, websockets — polygon.io', placeholder: 'Your Polygon key' },
          ].map(item => (
            <div key={item.key}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-sm" style={{ color: '#1C2B4A' }}>{item.label}</label>
                {item.status === 'connected' && <span className="badge badge-green">✓ Active</span>}
              </div>
              {item.status === 'connected' ? (
                <div className="input" style={{ background: '#F5FFF8', border: '1.5px solid #D1FAE5', color: '#059669', fontWeight: 600 }}>{item.value}</div>
              ) : (
                <input type="password" className="input" placeholder={item.placeholder}
                  value={item.value as string} onChange={e => item.setter?.(e.target.value)} />
              )}
              <p className="text-xs mt-1.5" style={{ color: '#7D8FA9' }}>{item.hint}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-6 pt-5" style={{ borderTop: '1px solid #E2E8F2' }}>
          <button onClick={save} className="btn btn-primary">{saved ? '✓ Saved' : 'Save Keys'}</button>
        </div>
      </div>

      {/* About */}
      <div className="card p-6">
        <div className="section-title">About Finsyt</div>
        <div className="space-y-2 text-sm" style={{ color: '#3D4F6E' }}>
          <p>Version <strong>1.0.0-beta</strong></p>
          <p>Data sources: Alpha Vantage · SEC EDGAR · News Sentiment API</p>
          <p>AI Engine: GPT-4o (when OpenAI key is connected)</p>
          <p>Built for founders, operators, and analysts who need institutional-quality intelligence without the institutional price tag.</p>
        </div>
      </div>
    </div>
  )
}
