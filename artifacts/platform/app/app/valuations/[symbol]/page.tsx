'use client'
import Link from 'next/link'
import { use } from 'react'
import { Card, PageHero, ContextualAskBar } from '@/components/ui'
import ValuationsView from '@/components/valuations/ValuationsView'

export default function ValuationsSymbolPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params)
  const SYM = (symbol || '').toUpperCase()

  if (!SYM) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>No ticker provided</div>
        <Link href="/app/valuations" style={{ color: 'var(--accent-text)', fontWeight: 700 }}>← Back to Valuations</Link>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <PageHero
        eyebrow="Valuation · Football Field"
        title={SYM}
        subtitle={`Side-by-side valuation ranges for ${SYM} from the 52-week stock price band, peer comps, transaction comps and DCF, plotted on a shared price axis.`}
        actions={
          <Link
            href={`/app/company/${SYM}`}
            style={{
              padding: '8px 14px', borderRadius: 8,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Open {SYM} company page →
          </Link>
        }
      />

      <div style={{ padding: '0 1.75rem 2.5rem', display: 'grid', gap: 16 }}>
        <ContextualAskBar
          context={`Valuations · ${SYM}`}
          contextData={{ page: 'valuations', symbol: SYM }}
          chips={[
            { label: 'Explain the football field', prompt: `Explain the Football Field chart for ${SYM} — what each band means, where ${SYM} trades vs the median ticks, and what the weighted valuation implies.` },
            { label: "What's driving the DCF?",     prompt: `Walk me through what's driving the DCF range for ${SYM} given the WACC and terminal growth on screen. Highlight which sensitivity cells are pulling the high and low.` },
            { label: 'Peer pulling multiples up',   prompt: `Which peer in the current peer set is pulling ${SYM}'s peer-comps multiples up the most, and why?` },
            { label: 'Suggest better peers',        prompt: `Suggest a tighter peer set for ${SYM} based on business model, growth, and capital intensity.` },
          ]}
          placeholder={`Ask Finsyt about ${SYM}'s valuation…`}
          style={{ margin: '0 0 8px' }}
        />

        <Card padding={0} style={{ background: 'transparent', border: 'none' }}>
          <ValuationsView symbol={SYM} />
        </Card>

        <Card padding="14px 18px" style={{ background: 'var(--bg-card)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            <strong style={{ color: 'var(--text-primary)' }}>About this chart:</strong>{' '}
            The 52-week range is taken straight from <code>/api/quote</code>. Peer Comps multiply each peer&rsquo;s
            multiple by {SYM}&rsquo;s per-share metric and report the inter-quartile range. The DCF range comes from{' '}
            <code>/api/dcf?sensitivity=true</code> using the WACC and terminal-growth on the inputs strip. Transaction
            Comps render as honest placeholders — we have not wired up an M&amp;A deal source yet. The Weighted Valuation
            line is an equal-weighted average of every populated band&rsquo;s median tick.
          </div>
        </Card>
      </div>
    </div>
  )
}
