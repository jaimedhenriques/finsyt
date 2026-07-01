/**
 * Trade Flow Intelligence Provider
 * ──────────────────────────────────
 * Aggregates maritime & trade flow signals from public free-to-use APIs:
 *
 *   1. UN Comtrade Public API (free, rate-limited):
 *      https://comtradeapi.un.org/public/v1/preview/C/A/HS
 *      Returns latest annual import/export data by commodity and reporter country.
 *
 *   2. World Bank Trade Indicators (already in Finsyt for macro):
 *      NE.EXP.GNFS.ZS — Exports of goods & services (% of GDP)
 *      NE.IMP.GNFS.ZS — Imports of goods & services (% of GDP)
 *      TM.VAL.MANF.ZS — Manufactures imports (% merchandise imports)
 *
 *   3. UNCTAD maritime trade — public dataset:
 *      https://unctadstat.unctad.org/api/
 *
 * Source attribution: "UN Comtrade / World Bank Trade"
 * Cache: 6 h
 */

export interface TradeFlowResult {
  query: string
  reporterCountry?: string
  partnerCountry?: string
  commodity?: string
  latestYear?: number
  exportValueUsd?: number | null
  importValueUsd?: number | null
  tradeBalanceUsd?: number | null
  exportsGdpPct?: number | null
  importsGdpPct?: number | null
  topPartners?: Array<{ name: string; tradeValueUsd: number }>
  signals?: string[]
  source: string
  fetchedAt: string
  unavailable?: boolean
  unavailableReason?: string
}

const CACHE = new Map<string, { data: TradeFlowResult; expiresAt: number }>()
const TTL_MS = 6 * 60 * 60 * 1000

const HS_COMMODITY_CODES: Record<string, string> = {
  semiconductors: '854231',
  oil: '2709',
  lng: '2711',
  steel: '7208',
  aluminum: '7601',
  copper: '7403',
  wheat: '1001',
  corn: '1005',
  soybeans: '1201',
  gold: '7108',
  lithium: '2825',
  rare_earths: '2846',
  pharmaceuticals: '3004',
}

const ISO_TO_UN: Record<string, string> = {
  US: '842', GB: '826', CN: '156', JP: '392', DE: '276', FR: '251',
  IN: '356', KR: '410', CA: '124', AU: '036', TW: '158', SG: '702',
  MX: '484', BR: '076', RU: '643', SA: '682', AE: '784', NL: '528',
  IT: '380', ES: '724', CH: '756', SE: '752', BE: '056', PL: '616',
  VN: '704', ID: '360', TH: '764', MY: '458',
}

async function fetchComtrade(reporterCode: string, commodity: string): Promise<{
  exportVal?: number; importVal?: number; year?: number; error?: string
}> {
  try {
    const hsCode = HS_COMMODITY_CODES[commodity.toLowerCase()] || '999999'
    const url = `https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=${reporterCode}&cmdCode=${hsCode}&flowCode=X,M&period=2022`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Finsyt Intelligence Agent contact@finsyt.dev', Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { error: `Comtrade HTTP ${res.status}` }
    const json = await res.json() as {
      data?: Array<{ flowCode: string; primaryValue: number; period: number }>
    }
    const rows = json?.data || []
    const exportRow = rows.find(r => r.flowCode === 'X')
    const importRow = rows.find(r => r.flowCode === 'M')
    return {
      exportVal: exportRow?.primaryValue,
      importVal: importRow?.primaryValue,
      year: exportRow?.period || importRow?.period,
    }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

async function fetchWorldBankTrade(iso: string): Promise<{
  exportsGdpPct?: number | null; importsGdpPct?: number | null; error?: string
}> {
  try {
    const indicators = ['NE.EXP.GNFS.ZS', 'NE.IMP.GNFS.ZS']
    const results: Record<string, number | null> = {}
    await Promise.all(indicators.map(async (ind) => {
      try {
        const url = `https://api.worldbank.org/v2/country/${iso}/indicator/${ind}?format=json&mrv=1&per_page=1`
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Finsyt Intelligence Agent contact@finsyt.dev' },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) return
        const json = await res.json() as [unknown, Array<{ value: number | null }>]
        results[ind] = json?.[1]?.[0]?.value ?? null
      } catch { results[ind] = null }
    }))
    return {
      exportsGdpPct: results['NE.EXP.GNFS.ZS'] ?? null,
      importsGdpPct: results['NE.IMP.GNFS.ZS'] ?? null,
    }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

function deriveSignals(result: Partial<TradeFlowResult>): string[] {
  const signals: string[] = []
  if (result.tradeBalanceUsd != null) {
    if (result.tradeBalanceUsd > 0) signals.push('Trade surplus — net exporter')
    else if (result.tradeBalanceUsd < 0) signals.push('Trade deficit — net importer')
  }
  if (result.exportsGdpPct != null) {
    if (result.exportsGdpPct > 40) signals.push('High export dependency (>40% GDP)')
    else if (result.exportsGdpPct < 10) signals.push('Low export intensity (<10% GDP)')
  }
  if (result.importsGdpPct != null && result.exportsGdpPct != null) {
    const openness = result.exportsGdpPct + result.importsGdpPct
    if (openness > 80) signals.push('Highly open trade regime (trade >80% GDP)')
  }
  return signals
}

export async function getTradeFlows(params: {
  reporterIso?: string
  commodity?: string
  partnerIso?: string
}): Promise<TradeFlowResult> {
  const cacheKey = JSON.stringify(params)
  const cached = CACHE.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const { reporterIso = 'US', commodity = 'semiconductors' } = params
  const unCode = ISO_TO_UN[reporterIso.toUpperCase()] || '842'

  try {
    type ComtradeResult = { exportVal?: number; importVal?: number; year?: number; error?: string }
    const [comtrade, wb] = await Promise.all([
      commodity !== 'general'
        ? fetchComtrade(unCode, commodity)
        : Promise.resolve({} as ComtradeResult),
      fetchWorldBankTrade(reporterIso),
    ])

    const tradeBalance = comtrade.exportVal != null && comtrade.importVal != null
      ? comtrade.exportVal - comtrade.importVal
      : null

    const partial: Partial<TradeFlowResult> = {
      exportValueUsd: comtrade.exportVal ?? null,
      importValueUsd: comtrade.importVal ?? null,
      tradeBalanceUsd: tradeBalance,
      latestYear: comtrade.year,
      exportsGdpPct: wb.exportsGdpPct ?? null,
      importsGdpPct: wb.importsGdpPct ?? null,
    }

    const result: TradeFlowResult = {
      query: `${reporterIso} · ${commodity}`,
      reporterCountry: reporterIso.toUpperCase(),
      commodity,
      ...partial,
      signals: deriveSignals(partial),
      source: 'UN Comtrade / World Bank Trade',
      fetchedAt: new Date().toISOString(),
      unavailable: !!(comtrade.error && wb.error),
      unavailableReason: comtrade.error && wb.error
        ? [comtrade.error, wb.error].join('; ')
        : undefined,
    }

    CACHE.set(cacheKey, { data: result, expiresAt: Date.now() + TTL_MS })
    return result
  } catch (err) {
    const result: TradeFlowResult = {
      query: `${reporterIso} · ${commodity}`,
      source: 'UN Comtrade / World Bank Trade',
      fetchedAt: new Date().toISOString(),
      unavailable: true,
      unavailableReason: (err as Error).message,
    }
    return result
  }
}
