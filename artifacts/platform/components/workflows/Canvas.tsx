'use client'
import { useCallback, useRef, useState } from 'react'
import { getNodeType, CATEGORY_META } from '@/lib/workflows/catalog'
import type { WorkflowGraph, WorkflowNode, WorkflowEdge, NodeResult } from './types'

const NODE_W = 210
const PORT_Y = 30 // vertical offset of the in/out ports from the node top
const CANVAS_W = 2600
const CANVAS_H = 1700

interface Pt { x: number; y: number }

function outPort(n: WorkflowNode): Pt { return { x: n.position.x + NODE_W, y: n.position.y + PORT_Y } }
function inPort(n: WorkflowNode): Pt { return { x: n.position.x, y: n.position.y + PORT_Y } }

function edgePath(a: Pt, b: Pt): string {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5)
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}

export default function Canvas({
  graph,
  selectedId,
  results,
  onSelect,
  onMoveNode,
  onConnect,
  onDeleteEdge,
}: {
  graph: WorkflowGraph
  selectedId: string | null
  results: Record<string, NodeResult>
  onSelect: (id: string | null) => void
  onMoveNode: (id: string, pos: Pt) => void
  onConnect: (source: string, target: string) => void
  onDeleteEdge: (id: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [cursor, setCursor] = useState<Pt | null>(null)

  const toCanvas = useCallback((clientX: number, clientY: number): Pt => {
    const wrap = wrapRef.current
    if (!wrap) return { x: clientX, y: clientY }
    const r = wrap.getBoundingClientRect()
    return { x: clientX - r.left + wrap.scrollLeft, y: clientY - r.top + wrap.scrollTop }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const p = toCanvas(e.clientX, e.clientY)
    if (connectFrom) setCursor(p)
    const drag = dragRef.current
    if (drag) {
      onMoveNode(drag.id, { x: Math.max(0, p.x - drag.dx), y: Math.max(0, p.y - drag.dy) })
    }
  }, [connectFrom, onMoveNode, toCanvas])

  const endDrag = useCallback(() => { dragRef.current = null }, [])

  const startNodeDrag = useCallback((e: React.PointerEvent, n: WorkflowNode) => {
    e.stopPropagation()
    onSelect(n.id)
    const p = toCanvas(e.clientX, e.clientY)
    dragRef.current = { id: n.id, dx: p.x - n.position.x, dy: p.y - n.position.y }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }, [onSelect, toCanvas])

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))

  return (
    <div
      ref={wrapRef}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onClick={() => { onSelect(null); setConnectFrom(null); setCursor(null) }}
      style={{
        position: 'relative', width: '100%', height: '100%', overflow: 'auto',
        background:
          'radial-gradient(circle, var(--border) 1px, transparent 1px) 0 0 / 22px 22px, var(--bg)',
        cursor: connectFrom ? 'crosshair' : 'default',
      }}
    >
      <div style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H }}>
        <svg width={CANVAS_W} height={CANVAS_H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {graph.edges.map((edge) => {
            const s = nodeById.get(edge.source)
            const t = nodeById.get(edge.target)
            if (!s || !t) return null
            return (
              <g key={edge.id}>
                <path d={edgePath(outPort(s), inPort(t))} fill="none" stroke="var(--accent-text)" strokeWidth={2} opacity={0.55} />
                <path
                  d={edgePath(outPort(s), inPort(t))}
                  fill="none" stroke="transparent" strokeWidth={14}
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); onDeleteEdge(edge.id) }}
                />
              </g>
            )
          })}
          {connectFrom && cursor && nodeById.get(connectFrom) && (
            <path
              d={edgePath(outPort(nodeById.get(connectFrom)!), cursor)}
              fill="none" stroke="var(--accent-text)" strokeWidth={2} strokeDasharray="5 4" opacity={0.7}
            />
          )}
        </svg>

        {graph.nodes.map((node) => {
          const def = getNodeType(node.type)
          const cat = def?.category ?? 'source'
          const color = CATEGORY_META[cat].color
          const hasInput = (def?.inputs.length ?? 0) > 0
          const hasOutput = (def?.outputs.length ?? 0) > 0
          const res = results[node.id]
          const selected = node.id === selectedId
          return (
            <div
              key={node.id}
              onPointerDown={(e) => startNodeDrag(e, node)}
              onClick={(e) => { e.stopPropagation(); onSelect(node.id) }}
              style={{
                position: 'absolute', left: node.position.x, top: node.position.y, width: NODE_W,
                background: 'var(--surface)',
                border: `1px solid ${selected ? color : 'var(--border)'}`,
                boxShadow: selected ? `0 0 0 2px ${color}40` : '0 1px 4px rgba(0,0,0,0.18)',
                borderRadius: 10, cursor: 'grab', userSelect: 'none',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                borderBottom: '1px solid var(--border)', borderTop: `3px solid ${color}`,
                borderTopLeftRadius: 10, borderTopRightRadius: 10,
              }}>
                <span style={{ fontSize: 15 }}>{def?.icon ?? '⬚'}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {node.label || def?.label || node.type}
                </span>
              </div>
              <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-muted)', minHeight: 18 }}>
                {res ? (
                  <span style={{
                    color: res.status === 'ok' ? '#22c55e' : res.status === 'error' ? '#ef4444' : 'var(--text-muted)',
                    fontWeight: 600,
                  }}>
                    {res.status === 'ok' ? '✓ ' : res.status === 'error' ? '✕ ' : '· '}
                    {res.status === 'error' ? (res.errorMessage || 'failed') : `${res.latencyMs}ms`}
                  </span>
                ) : (
                  summarizeConfig(node)
                )}
              </div>

              {/* Input port */}
              {hasInput && (
                <button
                  type="button"
                  title="Drop a connection here"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (connectFrom && connectFrom !== node.id) {
                      onConnect(connectFrom, node.id)
                      setConnectFrom(null); setCursor(null)
                    }
                  }}
                  style={portStyle(-7, color, !!connectFrom)}
                />
              )}
              {/* Output port */}
              {hasOutput && (
                <button
                  type="button"
                  title="Drag to connect"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setConnectFrom(node.id)
                    setCursor(outPort(node))
                  }}
                  style={{ ...portStyle(NODE_W - 7, color, false), background: connectFrom === node.id ? color : 'var(--surface)' }}
                />
              )}
            </div>
          )
        })}
      </div>

      {graph.nodes.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', fontSize: 14, pointerEvents: 'none',
        }}>
          Add nodes from the palette, then click an output dot → an input dot to wire them.
        </div>
      )}
    </div>
  )
}

function portStyle(left: number, color: string, active: boolean): React.CSSProperties {
  return {
    position: 'absolute', top: PORT_Y - 7, left, width: 14, height: 14, borderRadius: '50%',
    border: `2px solid ${color}`, background: active ? `${color}30` : 'var(--surface)',
    cursor: 'crosshair', padding: 0,
  }
}

function summarizeConfig(node: WorkflowNode): string {
  const def = getNodeType(node.type)
  if (!def) return ''
  const parts: string[] = []
  for (const f of def.fields) {
    const v = node.config?.[f.key]
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      parts.push(`${f.label}: ${String(v).slice(0, 22)}`)
      if (parts.length >= 2) break
    }
  }
  return parts.join(' · ') || def.description.slice(0, 48)
}
