'use client'
import { getNodeType, type NodeField } from '@/lib/workflows/catalog'
import {
  WORKFLOW_STATUSES, WORKFLOW_FREQUENCIES, WORKFLOW_WEEKDAYS,
} from './constants'
import type { Workflow, WorkflowNode, WorkflowSchedule, WorkflowStatus } from './types'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 9px', borderRadius: 7,
  border: '1px solid var(--border)', background: 'var(--bg)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4,
}

export default function PropertiesPanel({
  workflow,
  node,
  onChangeNode,
  onDeleteNode,
  onChangeWorkflow,
}: {
  workflow: Workflow
  node: WorkflowNode | null
  onChangeNode: (patch: Partial<WorkflowNode>) => void
  onDeleteNode: () => void
  onChangeWorkflow: (patch: Partial<Workflow>) => void
}) {
  if (node) {
    const def = getNodeType(node.type)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
            {def?.label ?? node.type}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{def?.description}</p>
        </div>

        <div>
          <label style={labelStyle}>Node label</label>
          <input
            style={inputStyle}
            value={node.label ?? ''}
            placeholder={def?.label}
            onChange={(e) => onChangeNode({ label: e.target.value })}
          />
        </div>

        {def?.fields.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            value={node.config?.[field.key]}
            onChange={(v) => onChangeNode({ config: { ...node.config, [field.key]: v } })}
          />
        ))}

        <button
          type="button"
          onClick={onDeleteNode}
          style={{
            marginTop: 4, padding: '8px 10px', borderRadius: 7,
            border: '1px solid #ef444455', background: 'transparent',
            color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Delete node
        </button>
      </div>
    )
  }

  // No node selected → workflow-level settings.
  const schedule = workflow.schedule
  function setSchedule(next: WorkflowSchedule | null) {
    onChangeWorkflow({ schedule: next })
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        Workflow settings
      </div>
      <div>
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={workflow.name} onChange={(e) => onChangeWorkflow({ name: e.target.value })} />
      </div>
      <div>
        <label style={labelStyle}>Description</label>
        <textarea
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          value={workflow.description}
          onChange={(e) => onChangeWorkflow({ description: e.target.value })}
        />
      </div>
      <div>
        <label style={labelStyle}>Status</label>
        <select style={inputStyle} value={workflow.status} onChange={(e) => onChangeWorkflow({ status: e.target.value as WorkflowStatus })}>
          {WORKFLOW_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!schedule}
            onChange={(e) => setSchedule(e.target.checked ? { frequency: 'Daily', time: '09:00' } : null)}
          />
          Run on a schedule
        </label>
        {schedule && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            <div>
              <label style={labelStyle}>Frequency</label>
              <select
                style={inputStyle}
                value={schedule.frequency}
                onChange={(e) => setSchedule({ ...schedule, frequency: e.target.value as WorkflowSchedule['frequency'] })}
              >
                {WORKFLOW_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            {schedule.frequency === 'Weekly' && (
              <div>
                <label style={labelStyle}>Day of week</label>
                <select
                  style={inputStyle}
                  value={schedule.day ?? 'Mon'}
                  onChange={(e) => setSchedule({ ...schedule, day: e.target.value })}
                >
                  {WORKFLOW_WEEKDAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={labelStyle}>Time (UTC, HH:MM)</label>
              <input
                style={inputStyle}
                value={schedule.time ?? '09:00'}
                placeholder="09:00"
                onChange={(e) => setSchedule({ ...schedule, time: e.target.value })}
              />
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
              Scheduled runs require status <strong>Active</strong>.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function FieldInput({ field, value, onChange }: { field: NodeField; value: unknown; onChange: (v: string | number) => void }) {
  const v = value === undefined || value === null ? (field.defaultValue ?? '') : value
  return (
    <div>
      <label style={labelStyle}>
        {field.label}{field.required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
      {field.type === 'longtext' ? (
        <textarea
          style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: field.key.toLowerCase().includes('json') ? 'monospace' : undefined }}
          value={String(v)}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === 'select' ? (
        <select style={inputStyle} value={String(v)} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          style={inputStyle}
          type={field.type === 'number' ? 'number' : 'text'}
          value={String(v)}
          placeholder={field.placeholder}
          onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
        />
      )}
      {field.helpText && <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>{field.helpText}</p>}
    </div>
  )
}
