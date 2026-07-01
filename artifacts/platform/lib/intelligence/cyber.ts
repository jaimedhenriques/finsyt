/**
 * Cyber Threat Intelligence Provider
 * ────────────────────────────────────
 * Aggregates public cyber threat signals from:
 *
 *   1. CISA Known Exploited Vulnerabilities (KEV) catalog — free JSON feed:
 *      https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json
 *      Filtered by vendor/product to find CVEs relevant to a company's tech stack.
 *
 *   2. NVD NIST CVE API (free, no key required):
 *      https://services.nvd.nist.gov/rest/json/cves/2.0
 *      Recent CVSS 9.0+ vulnerabilities in the last 30 days for vendor search.
 *
 *   3. CIRCL CVE search (free public):
 *      https://cve.circl.lu/api/search/{vendor}/{product}
 *      Product-specific CVE history with severity distributions.
 *
 * Source attribution: "CISA KEV / NVD NIST / CIRCL CVE"
 * Cache: 4 h
 */

export interface CyberVulnerability {
  cveId: string
  product: string
  vendor: string
  shortDescription: string
  cvssScore?: number
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  publishedDate?: string
  isKevCatalog: boolean
  kevDueDate?: string
  source: string
}

export interface CyberThreatResult {
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

const CACHE = new Map<string, { data: CyberThreatResult; expiresAt: number }>()
const TTL_MS = 4 * 60 * 60 * 1000

const TICKER_TO_VENDOR: Record<string, string[]> = {
  MSFT: ['microsoft'], AAPL: ['apple'], GOOGL: ['google'], AMZN: ['amazon'],
  META: ['meta', 'facebook'], NVDA: ['nvidia'], INTC: ['intel'], AMD: ['amd'],
  CSCO: ['cisco'], ORCL: ['oracle'], SAP: ['sap'], CRM: ['salesforce'],
  IBM: ['ibm'], VMW: ['vmware'], PANW: ['paloalto', 'palo_alto'],
  CRWD: ['crowdstrike'], FTNT: ['fortinet'], ZS: ['zscaler'],
  OKTA: ['okta'], SNOW: ['snowflake'], SPLK: ['splunk'],
  DELL: ['dell'], HPE: ['hewlett_packard'], AMAT: ['applied_materials'],
  MU: ['micron'], QCOM: ['qualcomm'], AVGO: ['broadcom'],
  TSMC: ['tsmc', 'taiwan_semiconductor'], ASML: ['asml'],
  JNJ: ['johnson_johnson'], PFE: ['pfizer'], MRK: ['merck'],
  GS: ['goldman_sachs'], JPM: ['jpmorgan'], BAC: ['bank_of_america'],
  NFLX: ['netflix'], DIS: ['disney'], T: ['att'],
}

const SECTOR_VENDOR_KEYWORDS: Record<string, string[]> = {
  Technology: ['microsoft', 'apple', 'google', 'apache', 'linux', 'cisco', 'oracle'],
  Finance: ['swift', 'fiserv', 'fidelity'],
  Healthcare: ['meditech', 'epic', 'cerner'],
  Energy: ['scada', 'ics', 'honeywell', 'siemens'],
  Manufacturing: ['rockwell', 'siemens', 'ge'],
}

interface KevEntry {
  cveID: string
  vendorProject: string
  product: string
  vulnerabilityName: string
  dateAdded: string
  dueDate: string
  shortDescription: string
}

let kevCache: { data: KevEntry[]; fetchedAt: number } | null = null
const KEV_TTL = 4 * 60 * 60 * 1000

async function getKevCatalog(): Promise<KevEntry[]> {
  if (kevCache && Date.now() - kevCache.fetchedAt < KEV_TTL) return kevCache.data
  try {
    const res = await fetch(
      'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
      {
        headers: { 'User-Agent': 'Finsyt Cyber Intel Agent contact@finsyt.dev' },
        signal: AbortSignal.timeout(15000),
      }
    )
    if (!res.ok) return kevCache?.data || []
    const json = await res.json() as { vulnerabilities: KevEntry[] }
    kevCache = { data: json.vulnerabilities || [], fetchedAt: Date.now() }
    return kevCache.data
  } catch {
    return kevCache?.data || []
  }
}

async function fetchNvdRecent(vendor: string): Promise<CyberVulnerability[]> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19) + '.000'
    const now = new Date().toISOString().slice(0, 19) + '.000'
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(vendor)}&pubStartDate=${thirtyDaysAgo}&pubEndDate=${now}&cvssV3Severity=CRITICAL&resultsPerPage=5`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Finsyt Cyber Intel Agent contact@finsyt.dev', Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const json = await res.json() as {
      vulnerabilities?: Array<{
        cve: {
          id: string
          descriptions: Array<{ lang: string; value: string }>
          published: string
          metrics?: {
            cvssMetricV31?: Array<{ cvssData: { baseScore: number; baseSeverity: string } }>
          }
        }
      }>
    }
    return (json?.vulnerabilities || []).map(v => {
      const desc = v.cve.descriptions.find(d => d.lang === 'en')?.value || ''
      const metric = v.cve.metrics?.cvssMetricV31?.[0]
      return {
        cveId: v.cve.id,
        product: vendor,
        vendor,
        shortDescription: desc.slice(0, 200),
        cvssScore: metric?.cvssData.baseScore,
        severity: (metric?.cvssData.baseSeverity as CyberVulnerability['severity']) || undefined,
        publishedDate: v.cve.published,
        isKevCatalog: false,
        source: 'NVD NIST',
      }
    })
  } catch {
    return []
  }
}

function riskFromCounts(kevCount: number, criticalCount: number): CyberThreatResult['overallRisk'] {
  if (kevCount >= 3 || criticalCount >= 5) return 'CRITICAL'
  if (kevCount >= 1 || criticalCount >= 2) return 'HIGH'
  if (criticalCount >= 1) return 'MEDIUM'
  if (kevCount === 0 && criticalCount === 0) return 'LOW'
  return 'UNKNOWN'
}

function buildSignals(result: Partial<CyberThreatResult>): string[] {
  const signals: string[] = []
  if (result.activeKevCount && result.activeKevCount > 0) {
    signals.push(`${result.activeKevCount} active CISA KEV-listed exploit(s) requiring immediate remediation`)
  }
  if (result.recentCriticalCount && result.recentCriticalCount > 0) {
    signals.push(`${result.recentCriticalCount} critical CVE(s) disclosed in past 30 days`)
  }
  if (result.overallRisk === 'LOW') signals.push('No active exploited vulnerabilities found in public catalogs')
  if (result.overallRisk === 'UNKNOWN') signals.push('Insufficient public CVE data — manual review recommended')
  return signals
}

export async function getCyberThreats(params: {
  ticker?: string
  companyName?: string
  sector?: string
}): Promise<CyberThreatResult> {
  const { ticker, companyName, sector } = params
  const queryKey = ticker || companyName || sector || 'general'
  const cacheKey = queryKey.toLowerCase()

  const cached = CACHE.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const vendors = ticker
    ? (TICKER_TO_VENDOR[ticker.toUpperCase()] || [])
    : sector
    ? (SECTOR_VENDOR_KEYWORDS[sector] || [])
    : []

  if (!vendors.length && companyName) {
    vendors.push(companyName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20))
  }

  try {
    const [kevCatalog, nvdResults] = await Promise.all([
      getKevCatalog(),
      vendors.length > 0
        ? fetchNvdRecent(vendors[0])
        : Promise.resolve([]),
    ])

    const vulnerabilities: CyberVulnerability[] = []
    let activeKevCount = 0

    for (const kev of kevCatalog) {
      const matchesVendor = vendors.some(v =>
        kev.vendorProject.toLowerCase().includes(v) ||
        kev.product.toLowerCase().includes(v)
      )
      if (matchesVendor) {
        activeKevCount++
        vulnerabilities.push({
          cveId: kev.cveID,
          product: kev.product,
          vendor: kev.vendorProject,
          shortDescription: kev.shortDescription.slice(0, 200),
          publishedDate: kev.dateAdded,
          isKevCatalog: true,
          kevDueDate: kev.dueDate,
          source: 'CISA KEV',
        })
        if (vulnerabilities.length >= 5) break
      }
    }

    const recentCritical = nvdResults.filter(v => v.severity === 'CRITICAL')
    for (const v of recentCritical.slice(0, 5)) {
      if (!vulnerabilities.some(ev => ev.cveId === v.cveId)) {
        vulnerabilities.push(v)
      }
    }

    const overallRisk = vendors.length === 0
      ? 'UNKNOWN'
      : riskFromCounts(activeKevCount, recentCritical.length)

    const partial: Partial<CyberThreatResult> = {
      activeKevCount,
      recentCriticalCount: recentCritical.length,
      overallRisk,
      vulnerabilities: vulnerabilities.slice(0, 10),
    }

    const result: CyberThreatResult = {
      query: queryKey,
      sector,
      overallRisk,
      activeKevCount,
      recentCriticalCount: recentCritical.length,
      vulnerabilities: vulnerabilities.slice(0, 10),
      signals: buildSignals(partial),
      source: 'CISA KEV / NVD NIST',
      fetchedAt: new Date().toISOString(),
      unavailable: vendors.length === 0,
      unavailableReason: vendors.length === 0 ? 'No vendor mapping found for this entity — use known ticker or sector' : undefined,
    }

    CACHE.set(cacheKey, { data: result, expiresAt: Date.now() + TTL_MS })
    return result
  } catch (err) {
    const result: CyberThreatResult = {
      query: queryKey,
      overallRisk: 'UNKNOWN',
      activeKevCount: 0,
      recentCriticalCount: 0,
      vulnerabilities: [],
      signals: [],
      source: 'CISA KEV / NVD NIST',
      fetchedAt: new Date().toISOString(),
      unavailable: true,
      unavailableReason: (err as Error).message,
    }
    return result
  }
}
