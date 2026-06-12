'use client'
import Link from 'next/link'
import { Card, PageHero, ContextualAskBar } from '@/components/ui'

const C = {
  bg:     'var(--bg-page)',
  card:   'var(--bg-card)',
  cardA:  'var(--bg-elevated)',
  border: 'var(--border)',
  borderS:'var(--border-strong)',
  p:      'var(--text-primary)',
  s:      'var(--text-secondary)',
  m:      'var(--text-muted)',
  acc:    'var(--accent)',
  accT:   'var(--accent-text)',
  accD:   'var(--accent-dim)',
  pos:    'var(--pos)',
  neg:    'var(--neg)',
  amb:    'var(--amber)',
}

// Capabilities the modelling agent will eventually offer. Listed only as a
// roadmap so the user knows what the page will become — we never show
// fabricated runs, audit trails, or mistake counts.
const CAPABILITIES = [
  { id: 'build',   icon: '⊟', label: 'Modelling',         desc: 'Build DCFs, LBOs, and trading comps from natural-language briefs.' },
  { id: 'extract', icon: '⊙', label: 'Data Extraction',   desc: 'Pull structured financials from IMs, CIMs, and 10-Ks.' },
  { id: 'mistake', icon: '◎', label: 'Mistake Detection', desc: 'End-to-end formula validation across linked workbooks.' },
  { id: 'format',  icon: '◫', label: 'Formatting',        desc: 'Apply institutional formatting standards in one click.' },
]

export default function ModelsPage() {
  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>
      <PageHero
        eyebrow="Modelling agent"
        title="Models"
        subtitle="Generate, audit, and reformat institutional Excel models from natural language. Live model runs aren\u2019t wired up yet — when they ship, your runs and audit trail will land here."
      />

      <div style={{ padding: '0 1.75rem 2rem', display: 'grid', gap: 18 }}>
        <ContextualAskBar
          context="Models"
          contextData={{ page: 'models' }}
          chips={[
            { label: '3-statement model', prompt: 'Build me a 3-statement model for AAPL with FY26-FY28 projections.' },
            { label: 'DCF for NVDA',      prompt: 'Run a DCF on NVDA — show key assumptions, sensitivity to WACC and terminal growth.' },
            { label: 'Sensitivity grid',  prompt: 'Generate a sensitivity table for revenue growth × operating margin on a model I open.' },
            { label: 'Comp set',          prompt: 'Pull a clean comp set for a name I name and produce trading and transaction multiples.' },
          ]}
          placeholder="Describe a model and Finsyt will build it…"
          style={{ margin: '0 0 8px' }}
        />
        {/* Empty state — replaces the previous demo chat / audit / mistakes panes
            so the page never shows fabricated edits or coverage numbers. */}
        <Card padding={0}>
          <div style={{ padding: '40px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: C.accD, color: C.accT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800 }}>⊟</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.p }}>No model runs yet</div>
            <div style={{ fontSize: 13, color: C.s, maxWidth: 540, lineHeight: 1.6 }}>
              The modelling agent is still being wired up. Until then this page deliberately stays empty rather than showing demo runs, audit trails, or mistake counts.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Link href="/app/research" className="btn btn-primary btn-sm">Open Research</Link>
              <Link href="/app/screener" className="btn btn-outline btn-sm">Browse Screener</Link>
            </div>
          </div>
        </Card>

        {/* Capability roadmap */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.m, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, padding: '0 4px' }}>Roadmap</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {CAPABILITIES.map(c => (
              <Card key={c.id} padding="16px 18px">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: C.cardA, color: C.accT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800 }}>{c.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.p }}>{c.label}</div>
                </div>
                <div style={{ fontSize: 12, color: C.s, lineHeight: 1.55 }}>{c.desc}</div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
