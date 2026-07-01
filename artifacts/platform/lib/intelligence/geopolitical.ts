/**
 * Geopolitical Intelligence Provider
 * ────────────────────────────────────
 * Derives a Country Instability Index (CII) from public free-to-use data:
 *
 *   1. World Bank Worldwide Governance Indicators (WGI) — 6 sub-scores:
 *      Political Stability, Government Effectiveness, Rule of Law,
 *      Regulatory Quality, Control of Corruption, Voice & Accountability.
 *      API: https://api.worldbank.org/v2/country/{iso}/indicator/{code}
 *
 *   2. GDELT GKG Goldstein Scale summary — average event conflict intensity
 *      for recent news involving the country.
 *      API: https://api.gdeltproject.org/api/v2/tv/tv (doc endpoint)
 *
 * The CII is calculated as:
 *   CII = 100 − (normalised WGI composite score × 100)
 * A higher CII = higher instability.
 *
 * Source attribution: "World Bank WGI / GDELT"
 * Cache: 24 h (WGI is annual; GDELT every 15 min but daily is sufficient)
 */

export interface GeopoliticalResult {
  isoCode: string
  countryName: string
  cii: number
  ciiLabel: 'Low' | 'Moderate' | 'Elevated' | 'High' | 'Very High'
  wgiComposite: number | null
  wgiBreakdown: Record<string, number | null>
  gdeltIntensity: number | null
  latestYear: number | null
  source: string
  fetchedAt: string
  unavailable?: boolean
  unavailableReason?: string
}

const WGI_INDICATORS: Record<string, string> = {
  politicalStability:      'PV.EST',
  governmentEffectiveness: 'GE.EST',
  ruleOfLaw:              'RL.EST',
  regulatoryQuality:      'RQ.EST',
  controlCorruption:      'CC.EST',
  voiceAccountability:    'VA.EST',
}

const CACHE = new Map<string, { data: GeopoliticalResult; expiresAt: number }>()
const TTL_MS = 24 * 60 * 60 * 1000

async function fetchWGI(iso: string): Promise<{ composite: number | null; breakdown: Record<string, number | null>; year: number | null }> {
  const breakdown: Record<string, number | null> = {}
  let total = 0
  let count = 0
  let latestYear: number | null = null

  await Promise.all(
    Object.entries(WGI_INDICATORS).map(async ([key, code]) => {
      try {
        const url = `https://api.worldbank.org/v2/country/${iso}/indicator/${code}?format=json&mrv=1&per_page=1`
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Finsyt Intelligence Agent contact@finsyt.dev' },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) { breakdown[key] = null; return }
        const json = await res.json() as [unknown, Array<{ value: number | null; date: string }>]
        const row = json?.[1]?.[0]
        const val = row?.value ?? null
        breakdown[key] = val
        if (val != null) {
          total += val
          count++
          const yr = parseInt(row?.date ?? '0', 10)
          if (yr > (latestYear ?? 0)) latestYear = yr
        }
      } catch {
        breakdown[key] = null
      }
    })
  )

  return {
    composite: count > 0 ? total / count : null,
    breakdown,
    year: latestYear,
  }
}

async function fetchGDELTIntensity(countryName: string): Promise<number | null> {
  try {
    const encoded = encodeURIComponent(`"${countryName}" conflict instability`)
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encoded}&mode=artlist&maxrecords=10&timespan=1d&format=json`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Finsyt Intelligence Agent contact@finsyt.dev' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const json = await res.json() as { articles?: Array<{ tone?: string }> }
    const articles = json?.articles || []
    if (!articles.length) return null
    const tones = articles
      .map(a => parseFloat(a.tone?.split(',')?.[0] ?? 'NaN'))
      .filter(n => !isNaN(n))
    if (!tones.length) return null
    const avg = tones.reduce((s, v) => s + v, 0) / tones.length
    return parseFloat(avg.toFixed(2))
  } catch {
    return null
  }
}

function normalizeCII(wgiComposite: number | null, gdeltIntensity: number | null): number {
  let score = 50

  if (wgiComposite != null) {
    const clipped = Math.max(-2.5, Math.min(2.5, wgiComposite))
    const wgiNorm = ((clipped + 2.5) / 5) * 100
    score = 100 - wgiNorm
  }

  if (gdeltIntensity != null) {
    const gdeltAdjust = Math.max(-5, Math.min(5, gdeltIntensity / 2))
    score = Math.max(0, Math.min(100, score + gdeltAdjust))
  }

  return Math.round(score)
}

function ciiLabel(cii: number): GeopoliticalResult['ciiLabel'] {
  if (cii < 20) return 'Low'
  if (cii < 40) return 'Moderate'
  if (cii < 60) return 'Elevated'
  if (cii < 80) return 'High'
  return 'Very High'
}

const ISO_TO_NAME: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', EU: 'European Union',
  DE: 'Germany', FR: 'France', JP: 'Japan', CN: 'China',
  TW: 'Taiwan', KR: 'South Korea', IN: 'India', BR: 'Brazil',
  RU: 'Russia', SA: 'Saudi Arabia', AE: 'United Arab Emirates',
  SG: 'Singapore', HK: 'Hong Kong', AU: 'Australia', CA: 'Canada',
  MX: 'Mexico', ZA: 'South Africa', NG: 'Nigeria', EG: 'Egypt',
  IR: 'Iran', IQ: 'Iraq', SY: 'Syria', UA: 'Ukraine', IL: 'Israel',
  PK: 'Pakistan', AF: 'Afghanistan', VN: 'Vietnam', ID: 'Indonesia',
  TH: 'Thailand', MY: 'Malaysia', PH: 'Philippines', TR: 'Turkey',
  PL: 'Poland', SE: 'Sweden', NO: 'Norway', CH: 'Switzerland',
  NL: 'Netherlands', BE: 'Belgium', ES: 'Spain', IT: 'Italy',
  PT: 'Portugal', GR: 'Greece', AR: 'Argentina', CL: 'Chile',
  CO: 'Colombia', PE: 'Peru', VE: 'Venezuela', CU: 'Cuba',
}

export async function getGeopoliticalRisk(iso: string): Promise<GeopoliticalResult> {
  const isoUp = iso.toUpperCase()
  const cached = CACHE.get(isoUp)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const countryName = ISO_TO_NAME[isoUp] || isoUp

  try {
    const [wgi, gdelt] = await Promise.all([
      fetchWGI(isoUp),
      fetchGDELTIntensity(countryName),
    ])

    const cii = normalizeCII(wgi.composite, gdelt)
    const result: GeopoliticalResult = {
      isoCode: isoUp,
      countryName,
      cii,
      ciiLabel: ciiLabel(cii),
      wgiComposite: wgi.composite,
      wgiBreakdown: wgi.breakdown,
      gdeltIntensity: gdelt,
      latestYear: wgi.year,
      source: 'World Bank WGI / GDELT',
      fetchedAt: new Date().toISOString(),
    }

    CACHE.set(isoUp, { data: result, expiresAt: Date.now() + TTL_MS })
    return result
  } catch (err) {
    const result: GeopoliticalResult = {
      isoCode: isoUp,
      countryName,
      cii: 50,
      ciiLabel: 'Moderate',
      wgiComposite: null,
      wgiBreakdown: {},
      gdeltIntensity: null,
      latestYear: null,
      source: 'World Bank WGI / GDELT',
      fetchedAt: new Date().toISOString(),
      unavailable: true,
      unavailableReason: (err as Error).message || 'Upstream unavailable',
    }
    return result
  }
}

export async function getGeopoliticalRiskMulti(isoCodes: string[]): Promise<GeopoliticalResult[]> {
  return Promise.all(isoCodes.map(iso => getGeopoliticalRisk(iso)))
}
