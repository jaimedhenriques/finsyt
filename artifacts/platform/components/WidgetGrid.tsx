'use client'
import { useState, useRef } from 'react'
import { useWorkspace, PlacedWidget, WIDGET_CATALOGUE } from '@/lib/workspace'
import { WIDGET_REGISTRY } from '@/components/widgets/index'

interface Props {
  page: string
}

const MAX_SPAN = 4
function clampSpan(n: number) { return Math.max(1, Math.min(MAX_SPAN, Math.round(n))) }
function nextSpan(n: number) { return n >= MAX_SPAN ? 1 : n + 1 }

/** Floating edit controls (drag handle · resize · remove) used by both
 *  carded and chromeless widgets. */
function EditControls({ span, onResize, onRemove, floating }: {
  span: number
  onResize: () => void
  onRemove: () => void
  floating?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      ...(floating ? {
        position: 'absolute', top: 8, right: 8, zIndex: 3,
        background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
        padding: '4px 6px', boxShadow: '0 2px 8px rgba(10,22,40,0.12)',
      } : {}),
    }}>
      <span title="Drag to reorder" style={{ color: '#B0BCD0', fontSize: 14, cursor: 'grab', lineHeight: 1 }}>⠿</span>
      <button
        onClick={(e) => { e.stopPropagation(); onResize() }}
        title="Resize (cycle width)"
        style={{ background: 'var(--accent-dim)', border: 'none', cursor: 'pointer', color: 'var(--accent)', height: 22, padding: '0 7px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, fontFamily: 'inherit' }}
      >↔ {span}</button>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        title="Remove widget"
        style={{ background: 'var(--neg-dim)', border: 'none', cursor: 'pointer', color: 'var(--neg)', width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}
      >×</button>
    </div>
  )
}

function WidgetShell({ w, editMode, onRemove, onResize, onDragStart, onDragOver, onDrop, isDragging }: {
  w: PlacedWidget
  editMode: boolean
  onRemove: () => void
  onResize: () => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  isDragging: boolean
}) {
  const def = WIDGET_CATALOGUE.find(c => c.id === w.widgetId)
  const Component = WIDGET_REGISTRY[w.widgetId]
  const [hovered, setHovered] = useState(false)
  const span = clampSpan(w.w ?? def?.defaultW ?? MAX_SPAN)
  const chromeless = !!def?.chromeless

  const dragProps = {
    draggable: editMode,
    onDragStart,
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); onDragOver(e) },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); onDrop() },
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  }

  const content = Component
    ? <Component />
    : <div style={{ padding: 16, color: '#B0BCD0', fontSize: 12 }}>Widget not found: {w.widgetId}</div>

  // Chromeless: render the self-contained component directly. In edit mode we
  // overlay a floating toolbar + outline so it stays customisable.
  if (chromeless && !editMode) {
    return <div style={{ gridColumn: `span ${span}`, minWidth: 0 }}>{content}</div>
  }

  if (chromeless) {
    return (
      <div
        {...dragProps}
        style={{
          gridColumn: `span ${span}`, minWidth: 0, position: 'relative',
          borderRadius: 12,
          outline: `2px dashed ${isDragging ? 'var(--accent)' : hovered ? 'var(--accent)' : 'var(--border)'}`,
          outlineOffset: 4,
          cursor: 'grab', opacity: isDragging ? 0.5 : 1,
          transition: 'outline-color 0.15s, opacity 0.15s',
        }}
      >
        <EditControls span={span} onResize={onResize} onRemove={onRemove} floating />
        <div style={{ pointerEvents: 'none' }}>{content}</div>
      </div>
    )
  }

  // Carded widgets (extra widgets not part of the default Overview).
  return (
    <div
      {...dragProps}
      style={{
        gridColumn: `span ${span}`, minWidth: 0,
        background: 'var(--bg-card)',
        border: `1.5px solid ${isDragging ? 'var(--accent)' : editMode && hovered ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: editMode ? 'grab' : 'default',
        opacity: isDragging ? 0.5 : 1,
        transition: 'border-color 0.15s, opacity 0.15s, box-shadow 0.15s',
        boxShadow: editMode && hovered ? '0 0 0 3px rgba(27,79,255,0.1)' : 'none',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
          {def?.icon} {def?.label}
        </span>
        {editMode && <EditControls span={span} onResize={onResize} onRemove={onRemove} />}
      </div>
      <div style={{ minHeight: 80 }}>{content}</div>
    </div>
  )
}

export default function WidgetGrid({ page }: Props) {
  const { layouts, editMode, removeWidget, resizeWidget, openPicker, reorderWidgets } = useWorkspace()
  const widgets = layouts[page] || []
  const dragIdx = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  function handleDragStart(idx: number) { dragIdx.current = idx }
  function handleDrop(targetIdx: number) {
    if (dragIdx.current === null || dragIdx.current === targetIdx) return
    const reordered = [...widgets]
    const [moved] = reordered.splice(dragIdx.current, 1)
    reordered.splice(targetIdx, 0, moved)
    reorderWidgets(page, reordered.map((w, i) => ({ ...w, order: i })))
    dragIdx.current = null
    setDragOver(null)
  }

  return (
    <div>
      {editMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--accent-dim)', borderRadius: 10, marginBottom: 16, border: '1.5px dashed var(--accent)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', flex: 1 }}>Edit mode — drag to reorder, ↔ to resize, × to remove</span>
          <button onClick={() => openPicker(page)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Add Widget
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, alignItems: 'start' }}>
        {widgets.map((w, i) => (
          <WidgetShell
            key={w.id}
            w={w}
            editMode={editMode}
            onRemove={() => removeWidget(page, w.id)}
            onResize={() => resizeWidget(page, w.id, nextSpan(clampSpan(w.w ?? WIDGET_CATALOGUE.find(c => c.id === w.widgetId)?.defaultW ?? MAX_SPAN)))}
            onDragStart={() => handleDragStart(i)}
            onDragOver={() => setDragOver(i)}
            onDrop={() => handleDrop(i)}
            isDragging={dragOver === i && dragIdx.current !== null && dragIdx.current !== i}
          />
        ))}

        {widgets.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px 24px', border: '2px dashed var(--border)', borderRadius: 12, color: '#B0BCD0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🧩</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>No widgets yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Add widgets to customise this page</div>
            <button onClick={() => openPicker(page)} style={{ padding: '8px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add Widget</button>
          </div>
        )}
      </div>
    </div>
  )
}
