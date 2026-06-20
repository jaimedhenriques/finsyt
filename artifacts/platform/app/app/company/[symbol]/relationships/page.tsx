'use client'
import { use } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui'
import RelationshipsTab from '@/components/company/RelationshipsTab'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

export default function CompanyRelationshipsPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params)
  const SYM = (symbol || '').toUpperCase()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link href={`${BASE}/app/company/${SYM}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textDecoration: 'none' }}>← {SYM}</Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{SYM} · Relationships</h1>
        <Badge tone="violet">entity map</Badge>
        <Link href={`${BASE}/app/company/${SYM}?tab=relationships`} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
          Open on company page →
        </Link>
      </header>
      <RelationshipsTab symbol={SYM} />
    </div>
  )
}
