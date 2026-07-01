'use client'
/**
 * IntelligenceTiles — Company workspace intelligence section
 * ──────────────────────────────────────────────────────────
 * Composer that renders geopolitical risk, sanctions screening,
 * cyber threat signals, and a news intelligence brief for a single
 * ticker/company in a 2×2 grid layout.
 *
 * Used on the Company page overview tab, mirroring the AltDataTiles
 * pattern from the Apify alt-data section.
 */
import GeopoliticalTile from './GeopoliticalTile'
import SanctionsTile from './SanctionsTile'
import CyberTile from './CyberTile'
import NewsBriefTile from './NewsBriefTile'

interface Props {
  symbol: string
  companyName?: string
  hqCountryIso?: string
  sector?: string
}

export default function IntelligenceTiles({ symbol, companyName, hqCountryIso, sector }: Props) {
  const iso = hqCountryIso || 'US'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 0 12px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Global Intelligence</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>World Bank WGI · CISA KEV · OFAC SDN · GDELT</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        <GeopoliticalTile iso={iso} countryName={iso === 'US' ? 'United States (HQ)' : undefined} compact />
        <SanctionsTile entityName={companyName || symbol} compact />
        <CyberTile ticker={symbol} companyName={companyName} sector={sector} compact />
        <NewsBriefTile ticker={symbol} companyName={companyName} compact title={`News Brief · ${symbol}`} />
      </div>
    </div>
  )
}
