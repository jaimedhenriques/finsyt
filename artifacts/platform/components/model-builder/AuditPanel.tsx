'use client'
import type { AuditResult, AuditFinding, AuditSeverity } from './types'

const SEVERITY_COLOR: Record<AuditSeverity, string> = {
  error:   'var(--neg)',
  warning: 'var(--warn)',
  info:    '#6366f1',
}
const SEVERITY_BG: Record<AuditSeverity, string> = {
  error:   'rgba(239,68,68,0.06)',
  warning: 'rgba(245,158,11,0.06)',
  info:    'rgba(99,102,241,0.06)',
}
const SEVERITY_ICON: Record<AuditSeverity, string> = {
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
}
const SEVERITY_LABEL: Record<AuditSeverity, string> = {
  error:   'Error',
  warning: 'Warning',
  info:    'Info',
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? 'var(--pos)' : score >= 60 ? 'var(--warn)' : 'var(--neg)'
  const r = 32, cx = 40, cy = 40, strokeW = 6
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ

  return (
    <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
      <svg width={80} height={80} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={strokeW} />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={strokeW}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>score</div>
      </div>
    </div>
  )
}

function FindingCard({ finding }: { finding: AuditFinding }) {
  const color = SEVERITY_COLOR[finding.severity]
  const bg    = SEVERITY_BG[finding.severity]

  return (
    <div style={{ border: `1px solid ${color}44`, borderRadius: 8, padding: '12px 14px', background: bg, display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{
          width: 22, height: 22, borderRadius: 99, background: color, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 900, flexShrink: 0, marginTop: 1,
        }}>
          {SEVERITY_ICON[finding.severity]}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{finding.label}</span>
            <span style={{ padding: '1px 7px', borderRadius: 999, background: color + '22', color, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {SEVERITY_LABEL[finding.severity]}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>{finding.field}</span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{finding.message}</p>
        </div>
      </div>
      {(finding.observed || finding.benchmark || finding.suggestion) && (
        <div style={{ marginLeft: 32, display: 'grid', gap: 4, borderTop: `1px solid ${color}22`, paddingTop: 8 }}>
          {finding.observed && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
              <span style={{ fontWeight: 700, color }}>Observed:</span>
              <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{finding.observed}</span>
            </div>
          )}
          {finding.benchmark && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Benchmark:</span>
              <span>{finding.benchmark}</span>
            </div>
          )}
          {finding.suggestion && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ fontWeight: 700, flexShrink: 0 }}>Fix:</span>
              <span style={{ color: 'var(--text-secondary)' }}>{finding.suggestion}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AuditPanel({ audit }: { audit: AuditResult }) {
  if (audit.error) {
    return (
      <div style={{ padding: '14px 18px', borderRadius: 10, border: '1px solid var(--neg)', background: 'var(--neg-dim)', color: 'var(--neg)', fontSize: 13 }}>
        <strong>Audit Error:</strong> {audit.error}
      </div>
    )
  }

  if (audit.skipped || !audit.findings) {
    return (
      <div style={{ padding: '28px 24px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center' }}>
        No model data available to audit. Build a DCF or LBO model first.
      </div>
    )
  }

  const findings = audit.findings
  const errors   = findings.filter(f => f.severity === 'error')
  const warnings = findings.filter(f => f.severity === 'warning')
  const infos    = findings.filter(f => f.severity === 'info')
  const score    = audit.score ?? 100

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Header: score + summary */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <ScoreRing score={score} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
            Model Audit · {(audit.modelType ?? 'dcf').toUpperCase()} {audit.ticker ? `· ${audit.ticker}` : ''}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: audit.hasErrors ? 'var(--neg)' : warnings.length > 0 ? 'var(--warn)' : 'var(--pos)', marginBottom: 6 }}>
            {audit.summary}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {errors.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--neg)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 16, height: 16, borderRadius: 99, background: 'var(--neg)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900 }}>✕</span>
                {errors.length} error{errors.length > 1 ? 's' : ''}
              </span>
            )}
            {warnings.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 16, height: 16, borderRadius: 99, background: 'var(--warn)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900 }}>⚠</span>
                {warnings.length} warning{warnings.length > 1 ? 's' : ''}
              </span>
            )}
            {infos.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 16, height: 16, borderRadius: 99, background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900 }}>ℹ</span>
                {infos.length} note{infos.length > 1 ? 's' : ''}
              </span>
            )}
            {findings.length === 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--pos)' }}>✓ All checks passed</span>
            )}
          </div>
        </div>
      </div>

      {/* Finding cards */}
      {findings.length === 0 && (
        <div style={{ padding: '20px 18px', borderRadius: 10, border: '1px solid var(--pos)', background: 'rgba(34,197,94,0.05)', color: 'var(--pos)', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
          ✓ No issues detected. The model passes all standard structural and assumption checks.
        </div>
      )}

      {errors.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--neg)', textTransform: 'uppercase' }}>Critical Errors</div>
          {errors.map(f => <FindingCard key={f.id} finding={f} />)}
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--warn)', textTransform: 'uppercase' }}>Warnings</div>
          {warnings.map(f => <FindingCard key={f.id} finding={f} />)}
        </div>
      )}

      {infos.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#6366f1', textTransform: 'uppercase' }}>Notes</div>
          {infos.map(f => <FindingCard key={f.id} finding={f} />)}
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Audit checks: WACC vs terminal growth consistency, growth rate plausibility (sector norms), terminal value concentration (&gt;80%),
        leverage multiples, equity cushion, IRR/MOIC vs typical PE hurdles, and precedent comp set completeness.
        Checks are based on standard IB/PE practice (Damodaran, Harrison/Rosenbaum).
      </div>
    </div>
  )
}
