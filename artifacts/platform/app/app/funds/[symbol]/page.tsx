'use client'
import Link from 'next/link'
import { use } from 'react'
import { Card, PageHero, ContextualAskBar } from '@/components/ui'
import FundProfile from '@/components/company/FundProfile'

export default function FundSymbolPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params)
  const SYM = (symbol || '').toUpperCase()

  if (!SYM) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>No ticker provided</div>
        <Link href="/app/funds" style={{ color: 'var(--accent-text)', fontWeight: 700 }}>← Back to Funds</Link>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <PageHero
        eyebrow="Fund / ETF"
        title={SYM}
        subtitle={`Profile, top holdings, sector and asset weightings for ${SYM}. Supplementary data sourced from Yahoo Finance.`}
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
          context={`Funds · ${SYM}`}
          contextData={{ page: 'funds', symbol: SYM }}
          chips={[
            { label: 'Summarise this fund', prompt: `Summarise ${SYM} — its strategy, top holdings, sector tilt, and expense ratio.` },
            { label: 'Top concentration risk', prompt: `What is the concentration risk in ${SYM} given its top holdings and sector weightings?` },
          ]}
          placeholder={`Ask Finsyt about ${SYM}…`}
          style={{ margin: '0 0 8px' }}
        />

        <Card padding={0} style={{ background: 'transparent', border: 'none' }}>
          <FundProfile symbol={SYM} />
        </Card>
      </div>
    </div>
  )
}
