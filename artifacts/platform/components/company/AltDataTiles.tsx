'use client'
/**
 * AltDataTiles — Company workspace alt-data section (Task #322, refactored #326)
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin composer that renders the reusable Insider Activity and People &
 * Culture cards (now living under components/alt-data) side-by-side on the
 * Company / Overview tab. The shared cards self-detect the workspace's
 * Apify Actors connection through the cached altDataCache, so the same
 * ticker viewed here and on the screener / portfolio / peers pages reuses a
 * single Apify run.
 */
import { InsiderCard, PeopleCard, type CiteFn } from '@/components/alt-data/cards'

interface Props {
  symbol: string
  companyName: string
  /** Existing FMP insider transactions (already loaded by the page). */
  insiders: any[]
  /** Page-level citation drawer opener — chips trigger this with the raw row body. */
  onCite: CiteFn
}

export default function AltDataTiles({ symbol, companyName, insiders, onCite }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
      <InsiderCard symbol={symbol} companyName={companyName} insiders={insiders} onCite={onCite} />
      <PeopleCard symbol={symbol} companyName={companyName} onCite={onCite} />
    </div>
  )
}
