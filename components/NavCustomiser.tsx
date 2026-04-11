'use client'
import { useState, useRef } from 'react'
import { useWorkspace, NavItem } from '@/lib/workspace'
import { useLocale } from '@/lib/i18n/LocaleContext'
import { t } from '@/lib/i18n/translations'

export default function NavCustomiser({ onClose }: { onClose: () => void }) {
  const { nav, setNav } = useWorkspace()
  const { locale } = useLocale()
  const [items, setItems] = useState([...nav])
  const dragIdx = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  function toggle(id: string) {
    setItems(prev => prev.map(n => n.id === id && !n.pinned ? { ...n, visible: !n.visible } : n))
  }
  function handleDragStart(i: number) { dragIdx.current = i }
  function handleDrop(target: number) {
    if (dragIdx.current === null || dragIdx.current === target) return
    const reordered = [...items]
    const [moved] = reordered.splice(dragIdx.current, 1)
    reordered.splice(target, 0, moved)
    setItems(reordered)
    dragIdx.current = null
    setDragOver(null)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,0.6)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 400, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #E8EDF4' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7D8FA9', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0A1628' }}>Customise Navigation</div>
          <button onClick={() => setItems([...nav])} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#1B4FFF', fontFamily: 'inherit' }}>Reset</button>
        </div>
        <p style={{ fontSize: 12, color: '#7D8FA9', padding: '10px 20px 6px' }}>Drag to reorder, toggle to show/hide items</p>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 16px' }}>
          {items.map((item, i) => (
            <div key={item.id}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={e => { e.preventDefault(); setDragOver(i) }}
              onDrop={() => handleDrop(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid #F5F7FB', background: dragOver === i ? '#F0F4FF' : '#fff', transition: 'background 0.1s', cursor: 'grab' }}
            >
              <span style={{ color: '#B0BCD0', fontSize: 16 }}>⠿</span>
              <span style={{ flex: 1, fontSize: 14, color: item.visible ? '#0A1628' : '#B0BCD0' }}>{t(locale, item.labelKey)}</span>
              {item.pinned
                ? <span style={{ fontSize: 11, color: '#B0BCD0', fontStyle: 'italic' }}>Always shown</span>
                : <button onClick={() => toggle(item.id)} style={{ width: 40, height: 22, borderRadius: 999, background: item.visible ? '#1B4FFF' : '#E8EDF4', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: item.visible ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </button>
              }
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #E8EDF4' }}>
          <button onClick={() => { setNav(items); onClose() }} style={{ width: '100%', padding: 12, background: '#1B4FFF', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Save Navigation</button>
        </div>
      </div>
    </div>
  )
}
