'use client'
import { useEffect, useState } from 'react'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

interface CyberVulnerability {
  cveId: string
  product: string
  vendor: string
  shortDescription: string
  cvssScore?: number
  severity?: string
  publishedDate?: string
  isKevCatalog: boolean
  kevDueDate?: string
  source: string
}

interface CyberThreatResult {
  query: string
  overallRisk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'
  activeKevCount: number
  recentCriticalCount: number
  vulnerabilities: CyberVulnerability[]
  sector?: string
  signals: string[]
  source: string
  fetchedAt: string
  unavailable?: boolean
  unavailableReason?: string
}

const RISK_COLORS: Record<string, { bg: string; fg: string }> = {
  CRITICAL: { bg: 'rgba(127,29,29,0.10)', fg: '#7F1D1D' },
  HIGH:     { bg: 'rgba(239,68,68,0.08)', fg: '#DC2626' },
  MEDIUM:   { bg: 'rgba(251,191,36,0.10)', fg: '#B45309' },
  LOW:      { bg: 'rgba(14,159,110,0.08)', fg: '#0E9F6E' },
  UNKNOWN:  { bg: 'rgba(90,106,130,0.08)', fg: '#5A6A82' },
}

const SEV_COLORS: Record<string, string> = {
  CRITICAL: '#7F1D1D', HIGH: '#DC2626', MEDIUM: '#B45309', LOW: '#0E9F6E',
}

interface Props {
  ticker?: string
  companyName?: string
  sector?: string
  compact?: boolean
}

export default function CyberTile({ ticker, companyName, sector, compact }: Props) {
  const [data, setData] = useState<CyberThreatResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const qs = new URLSearchParams()
    if (ticker) qs.set('ticker', ticker)
    if (companyName) qs.set('company', companyName)
    if (sector) qs.set('sector', sector)
    fetch(`${BASE}/api/intelligence/cyber?${qs.toString()}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticker, companyName, sector])

  const label = companyName || ticker || sector || 'General'

  if (loading) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Cyber Threat Signals · {label}</div>
        <div style={{ height: 40, background: 'var(--bg-secondary)', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />
      </div>
    )
  }

  if (!data || (data.unavailable && !data.vulnerabilities.length)) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Cyber Threat Signals · {label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {data?.unavailableReason || 'No vendor mapping available for this entity'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Source: CISA KEV / NVD NIST</div>
      </div>
    )
  }

  const riskColors = RISK_COLORS[data.overallRisk] || RISK_COLORS.UNKNOWN

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cyber Threat Signals</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{label}</div>
        </div>
        <div style={{
          padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: riskColors.bg, color: riskColors.fg,
        }}>
          {data.overallRisk} RISK
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--bg-secondary)', textAlign: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: '1.4rem', color: data.activeKevCount > 0 ? '#DC2626' : 'var(--text-primary)' }}>
            {data.activeKevCount}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Active KEV Exploits</div>
        </div>
        <div style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--bg-secondary)', textAlign: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: '1.4rem', color: data.recentCriticalCount > 0 ? '#B45309' : 'var(--text-primary)' }}>
            {data.recentCriticalCount}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Critical CVEs (30d)</div>
        </div>
      </div>

      {data.signals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {data.signals.map((s, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ color: riskColors.fg, flexShrink: 0, marginTop: 1 }}>•</span>
              {s}
            </div>
          ))}
        </div>
      )}

      {!compact && data.vulnerabilities.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', padding: 0, marginBottom: 8 }}
          >
            {expanded ? '▲ Hide' : '▼ Show'} {data.vulnerabilities.length} CVE{data.vulnerabilities.length !== 1 ? 's' : ''}
          </button>
          {expanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.vulnerabilities.slice(0, 5).map((v, i) => (
                <div key={i} style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{v.cveId}</span>
                    {v.isKevCatalog && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(220,38,38,0.1)', color: '#DC2626' }}>
                        CISA KEV
                      </span>
                    )}
                    {v.severity && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, color: SEV_COLORS[v.severity] || '#666', background: (SEV_COLORS[v.severity] || '#666') + '15' }}>
                        {v.severity}
                      </span>
                    )}
                    {v.cvssScore != null && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>CVSS {v.cvssScore.toFixed(1)}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{v.shortDescription}</div>
                  {v.isKevCatalog && v.kevDueDate && (
                    <div style={{ fontSize: 10, color: '#DC2626', marginTop: 4 }}>Remediation due: {v.kevDueDate}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8 }}>
        Source: {data.source} · {data.fetchedAt ? new Date(data.fetchedAt).toLocaleDateString() : ''}
      </div>
    </div>
  )
}
