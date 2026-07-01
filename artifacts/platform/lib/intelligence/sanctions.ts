/**
 * Sanctions Screening Provider
 * ─────────────────────────────
 * Screens entities (companies, persons) against public consolidated sanctions lists:
 *
 *   1. OFAC SDN (US Treasury) — search API:
 *      https://sanctions.ofac.treas.gov/api/search
 *
 *   2. EU Consolidated Financial Sanctions List — XML download:
 *      https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content
 *
 *   3. UN Security Council Consolidated List — XML endpoint:
 *      https://scsanctions.un.org/resources/xml/en/consolidated.xml
 *
 * Results: hit / no-hit / unknown per list, with match detail.
 * Source attribution: "OFAC SDN / EU FSF / UN Security Council"
 * Cache: 1 h (lists update infrequently but we want near-real-time sensitivity)
 */

export interface SanctionsHit {
  listName: string
  listCode: 'OFAC' | 'EU_FSF' | 'UN_SC'
  entityName: string
  entityType: string
  programs?: string[]
  listedDate?: string
  remarks?: string
  score: number
}

export interface SanctionsResult {
  query: string
  queryNormalized: string
  overallStatus: 'HIT' | 'NO_HIT' | 'UNKNOWN'
  hits: SanctionsHit[]
  listsChecked: string[]
  listErrors: string[]
  source: string
  fetchedAt: string
  unavailable?: boolean
  unavailableReason?: string
}

const CACHE = new Map<string, { data: SanctionsResult; expiresAt: number }>()
const TTL_MS = 60 * 60 * 1000

function normalizeName(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreSimilarity(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (na === nb) return 1.0
  if (nb.includes(na) || na.includes(nb)) return 0.85
  const aWords = new Set(na.split(' ').filter(w => w.length > 2))
  const bWords = nb.split(' ').filter(w => w.length > 2)
  if (!aWords.size || !bWords.length) return 0
  const matches = bWords.filter(w => aWords.has(w)).length
  return matches / Math.max(aWords.size, bWords.length)
}

async function checkOFAC(query: string): Promise<{ hits: SanctionsHit[]; error?: string }> {
  try {
    const url = `https://sanctions.ofac.treas.gov/api/search?Name=${encodeURIComponent(query)}&Type=Entity&SearchType=Fuzzy&apiKey=&format=json`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Finsyt Compliance Agent contact@finsyt.dev', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { hits: [], error: `OFAC HTTP ${res.status}` }
    const json = await res.json() as {
      sdnList?: { sdnEntry?: Array<{
        lastName?: string; firstName?: string; sdnType?: string;
        programList?: { program?: string[] };
        akaList?: { aka?: Array<{ lastName?: string; firstName?: string }> }
      }> }
    }

    const entries = json?.sdnList?.sdnEntry || []
    const hits: SanctionsHit[] = []
    for (const entry of entries) {
      const name = [entry.firstName, entry.lastName].filter(Boolean).join(' ')
      const score = scoreSimilarity(query, name)
      if (score >= 0.6) {
        hits.push({
          listName: 'OFAC Specially Designated Nationals (SDN)',
          listCode: 'OFAC',
          entityName: name,
          entityType: entry.sdnType || 'Entity',
          programs: (entry.programList?.program || []).slice(0, 5),
          score,
        })
      }
      for (const aka of (entry.akaList?.aka || [])) {
        const akaName = [aka.firstName, aka.lastName].filter(Boolean).join(' ')
        if (!akaName) continue
        const akaScore = scoreSimilarity(query, akaName)
        if (akaScore >= 0.6 && akaScore > score) {
          hits.push({
            listName: 'OFAC Specially Designated Nationals (SDN)',
            listCode: 'OFAC',
            entityName: `${name} (a/k/a ${akaName})`,
            entityType: entry.sdnType || 'Entity',
            programs: (entry.programList?.program || []).slice(0, 5),
            score: akaScore,
          })
        }
      }
    }
    return { hits: hits.sort((a, b) => b.score - a.score).slice(0, 3) }
  } catch (err) {
    return { hits: [], error: (err as Error).message }
  }
}

async function checkEUList(query: string): Promise<{ hits: SanctionsHit[]; error?: string }> {
  try {
    const url = 'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content'
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Finsyt Compliance Agent contact@finsyt.dev' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return { hits: [], error: `EU FSF HTTP ${res.status}` }
    const xml = await res.text()

    const namePattern = /<nameAlias[^>]*lastName="([^"]*)"[^>]*firstName="([^"]*)"/gi
    const hits: SanctionsHit[] = []
    let match: RegExpExecArray | null
    namePattern.lastIndex = 0
    while ((match = namePattern.exec(xml)) !== null && hits.length < 3) {
      const name = [match[2], match[1]].filter(Boolean).join(' ')
      const score = scoreSimilarity(query, name)
      if (score >= 0.7) {
        hits.push({
          listName: 'EU Consolidated Financial Sanctions List',
          listCode: 'EU_FSF',
          entityName: name,
          entityType: 'Entity',
          score,
        })
      }
    }
    return { hits: hits.sort((a, b) => b.score - a.score).slice(0, 3) }
  } catch (err) {
    return { hits: [], error: (err as Error).message }
  }
}

async function checkUNList(query: string): Promise<{ hits: SanctionsHit[]; error?: string }> {
  try {
    const url = 'https://scsanctions.un.org/resources/xml/en/consolidated.xml'
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Finsyt Compliance Agent contact@finsyt.dev' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return { hits: [], error: `UN SC HTTP ${res.status}` }
    const xml = await res.text()

    const namePattern = /<FIRST_NAME>([^<]*)<\/FIRST_NAME>[\s\S]*?<SECOND_NAME>([^<]*)<\/SECOND_NAME>/gi
    const entityPattern = /<ENTITY_ALIAS[^>]*>[^<]*<ALIAS_NAME>([^<]+)<\/ALIAS_NAME>/gi
    const hits: SanctionsHit[] = []

    let match: RegExpExecArray | null
    namePattern.lastIndex = 0
    while ((match = namePattern.exec(xml)) !== null && hits.length < 3) {
      const name = [match[1], match[2]].filter(Boolean).join(' ').trim()
      const score = scoreSimilarity(query, name)
      if (score >= 0.7) {
        hits.push({
          listName: 'UN Security Council Consolidated Sanctions List',
          listCode: 'UN_SC',
          entityName: name,
          entityType: 'Individual',
          score,
        })
      }
    }

    entityPattern.lastIndex = 0
    while ((match = entityPattern.exec(xml)) !== null && hits.length < 3) {
      const name = match[1].trim()
      const score = scoreSimilarity(query, name)
      if (score >= 0.65) {
        hits.push({
          listName: 'UN Security Council Consolidated Sanctions List',
          listCode: 'UN_SC',
          entityName: name,
          entityType: 'Entity',
          score,
        })
      }
    }
    return { hits: hits.sort((a, b) => b.score - a.score).slice(0, 3) }
  } catch (err) {
    return { hits: [], error: (err as Error).message }
  }
}

export async function screenSanctions(entityName: string): Promise<SanctionsResult> {
  const cacheKey = normalizeName(entityName)
  const cached = CACHE.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const listsChecked: string[] = []
  const listErrors: string[] = []
  const allHits: SanctionsHit[] = []

  const [ofac, eu, un] = await Promise.all([
    checkOFAC(entityName),
    checkEUList(entityName),
    checkUNList(entityName),
  ])

  listsChecked.push('OFAC SDN')
  if (ofac.error) listErrors.push(`OFAC: ${ofac.error}`)
  else allHits.push(...ofac.hits)

  listsChecked.push('EU Consolidated Sanctions')
  if (eu.error) listErrors.push(`EU: ${eu.error}`)
  else allHits.push(...eu.hits)

  listsChecked.push('UN Security Council Consolidated')
  if (un.error) listErrors.push(`UN SC: ${un.error}`)
  else allHits.push(...un.hits)

  const overallStatus: SanctionsResult['overallStatus'] =
    allHits.length > 0 ? 'HIT'
    : listErrors.length === listsChecked.length ? 'UNKNOWN'
    : 'NO_HIT'

  const result: SanctionsResult = {
    query: entityName,
    queryNormalized: cacheKey,
    overallStatus,
    hits: allHits.sort((a, b) => b.score - a.score).slice(0, 10),
    listsChecked,
    listErrors,
    source: 'OFAC SDN / EU FSF / UN Security Council',
    fetchedAt: new Date().toISOString(),
  }

  CACHE.set(cacheKey, { data: result, expiresAt: Date.now() + TTL_MS })
  return result
}
