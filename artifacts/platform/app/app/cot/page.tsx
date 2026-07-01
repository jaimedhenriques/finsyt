'use client'
import { PageHero, ContextualAskBar } from '@/components/ui'
import CotView from '@/components/positioning/CotView'

export default function CotPage() {
  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <PageHero
        eyebrow="Positioning"
        title="Commitment of Traders"
        accentWord="Traders"
        subtitle="Track how commercial hedgers and non-commercial speculators are positioned across futures markets, straight from the CFTC's weekly report. Pick a market to see net positioning over the last year."
      />

      <div style={{ padding: '0 1.75rem 2.5rem', display: 'grid', gap: 18, maxWidth: 980 }}>
        <ContextualAskBar
          context="Commitment of Traders"
          contextData={{ page: 'cot' }}
          chips={[
            { label: 'Explain COT positioning', prompt: 'Explain how to read the CFTC Commitment of Traders report — commercial vs non-commercial net positioning — and what it signals.' },
            { label: 'Gold positioning now', prompt: 'Pull the latest CFTC Commitment of Traders positioning for Gold and tell me whether speculators are net long or short.' },
          ]}
          placeholder="Ask Finsyt about futures positioning…"
          style={{ margin: '0 0 4px' }}
        />
        <CotView />
      </div>
    </div>
  )
}
