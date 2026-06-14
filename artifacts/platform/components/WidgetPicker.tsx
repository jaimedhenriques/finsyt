'use client'
import { useState } from 'react'
import { useWorkspace, WIDGET_CATALOGUE } from '@/lib/workspace'

export default function WidgetPicker() {
  const { pickerOpen, pickerPage, closePicker, addWidget } = useWorkspace()
  const [cat, setCat] = useState('All')
  const [search, setSearch] = useState('')

  const cats = ['All', ...Array.from(new Set(WIDGET_CATALOGUE.map(w => w.category)))]
  const filtered = WIDGET_CATALOGUE
    .filter(w => cat === 'All' || w.category === cat)
    .filter(w => !search || w.label.toLowerCase().includes(search.toLowerCase()) || w.description.toLowerCase().includes(search.toLowerCase()))

  if (!pickerOpen) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,0.6)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={closePicker}>
      <div data-theme="white" style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 640, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #E8EDF4' }}>
          <button onClick={closePicker} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7D8FA9', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0A1628' }}>Widget Library</div>
            <div style={{ fontSize: 12, color: '#7D8FA9' }}>Pick widgets to add to this page</div>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 20px 8px' }}>
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search widgets..." style={{ width: '100%', padding: '8px 12px 8px 32px', background: 'var(--bg-page)', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* Category pills */}
        <div style={{ display: 'flex', gap: 6, padding: '0 20px 12px', overflowX: 'auto' }}>
          {cats.map(c => (
            <button key={c} onClick={() => setCat(c)} style={{ padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: cat === c ? 'var(--accent)' : 'var(--bg-elevated)', color: cat === c ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>{c}</button>
          ))}
        </div>

        {/* Widget grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {filtered.map(w => (
              <button key={w.id} onClick={() => { addWidget(pickerPage, w.id); closePicker() }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'var(--bg-page)', border: '1.5px solid #E8EDF4', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.12s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-dim)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-page)' }}
              >
                <span style={{ fontSize: 20, flexShrink: 0 }}>{w.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0A1628', marginBottom: 3 }}>{w.label}</div>
                  <div style={{ fontSize: 11, color: '#7D8FA9', lineHeight: 1.4 }}>{w.description}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#B0BCD0', marginTop: 4 }}>{w.category}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
