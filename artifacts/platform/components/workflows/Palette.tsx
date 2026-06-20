'use client'
import { NODE_TYPES, CATEGORY_META, type NodeCategory, type NodeTypeDef } from '@/lib/workflows/catalog'

const CATEGORY_ORDER: NodeCategory[] = ['source', 'transform', 'agent', 'output']

export default function Palette({ onAdd }: { onAdd: (def: NodeTypeDef) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {CATEGORY_ORDER.map((cat) => {
        const meta = CATEGORY_META[cat]
        const types = NODE_TYPES.filter((n) => n.category === cat)
        return (
          <div key={cat}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--text-muted)',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: meta.color }} />
              {meta.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {types.map((def) => (
                <button
                  key={def.type}
                  type="button"
                  onClick={() => onAdd(def)}
                  title={def.description}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left',
                    fontSize: 13, transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = meta.color }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1 }}>{def.icon}</span>
                  <span style={{ fontWeight: 600 }}>{def.label}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
