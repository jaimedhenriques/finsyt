/**
 * Finsyt Data Provider Registry
 * ─────────────────────────────
 * Central waterfall config — all API routes import from here.
 *
 * Priority by data type:
 *   Real-time quotes  : Massive → FMP → Yahoo → EODHD → Finnhub → Alpha Vantage
 *   Historical bars   : Massive → FMP → EODHD → Marketstack → Alpha Vantage → Yahoo
 *   Fundamentals      : FMP → Massive (XBRL) → EODHD → Alpha Vantage
 *   News              : Massive → FMP → EODHD → Finnhub
 *   Search/tickers    : Massive → FMP → EODHD → Finnhub → Yahoo
 *   Forex/Crypto      : Massive → Alpha Vantage → EODHD → Yahoo
 *   International     : EODHD → Marketstack → Yahoo → Alpha Vantage
 *   Macro / FRED      : FRED → Alpha Vantage (forex/econ) → EODHD
 */

import { recordKeyAccepted, recordKeyConfigured, recordKeyMissing, recordKeyRejection } from './credential-health'

// Operators can explicitly retire a provider — even if a (possibly dead) key is
// still present in the environment — by listing its name in DROPPED_PROVIDERS
// (comma-separated). A dropped provider resolves to an empty key, so every
// `if (!PROVIDERS.<name>) return null` guard skips it cleanly: no upstream call,
// no repeated 401s, and no credential-health rejection noise. This is the
// sanctioned way to drop a provider; do NOT add an automatic rejected-key
// circuit-breaker (that would suppress recovery detection on a rotated key).
const DROPPED_PROVIDERS = new Set(
  (process.env.DROPPED_PROVIDERS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
)
const keyFor = (name: string, raw: string) => (DROPPED_PROVIDERS.has(name) ? '' : raw)

export const PROVIDERS = {
  massive:          keyFor('massive', process.env.MASSIVE_API_KEY || process.env.massive_key_api || process.env.POLYGON_API_KEY || ''),
  fmp:              process.env.FMP_API_KEY                || '',
  eodhd:            process.env.EODHD_API_KEY              || process.env.eodhd_api          || '',
  finnhub:          process.env.FINNHUB_API_KEY            || '',
  fred:             process.env.FRED_API_KEY               || '',
  alphav:           process.env.ALPHA_VANTAGE_API_KEY      || process.env.ALPHAV_API_KEY     || '',
  marketstack:      process.env.MARKETSTACK_API_KEY        || '',
  yahoo:            process.env.YAHOO_FINANCE_API_KEY      || process.env.RAPIDAPI_KEY       || '',
  own:              process.env.OPENWEBNINJA_API_KEY       || process.env.openwebninja_key_api || '',
  sec:              process.env.SEC_API_KEY                || '',
  coresignal:       process.env.CORESIGNAL_API_KEY         || process.env.coresignal_key_api || '',
  twelvedata:       process.env.TWELVEDATA_API_KEY         || process.env.twelvedata_API_KEY || '',
  financialdatasets:process.env.FINANCIAL_DATASETS_API_KEY || process.env.financialdatasets_API_Key || '',
  financeflow:      process.env.FINANCEFLOW_API_KEY        || '',
  databento:        keyFor('databento', process.env.DATABENTO_API_KEY || ''),
  fiscalai:         process.env.FISCAL_AI_API_KEY          || '',
  // Alpaca uses a key-pair (KEY-ID + SECRET-KEY) sent as headers. The
  // KEY-ID is what other code reads as `PROVIDERS.alpaca` (it's the
  // public half — safe to surface in keyPreview). The secret is held
  // separately and only joined inside `alpacaFetch` below.
  alpaca:           process.env.ALPACA_API_KEY_ID          || '',
  alpacaSecret:     process.env.ALPACA_API_SECRET_KEY      || '',
  twentyfirst:      process.env.API_KEY_21ST               || process.env._21st_api          || process.env.TWENTY_FIRST_API_KEY || '',
  census:           process.env.CENSUS_API_KEY             || '',
  worldbank:        'public',
  imf:              'public',
  dbnomics:         'public',
  polymarket:       'public',
  kalshi:           'public',
  gdelt:            'public',
  cftc:             'public',
  finra:            'public',
  openai:           process.env.OPENAI_API_KEY             || '',
  anthropic:        process.env.ANTHROPIC_API_KEY          || '',
  groq:             process.env.GROQ_API_KEY               || '',
  perplexity:       process.env.PERPLEXITY_API_KEY         || '',
}

/** Rich metadata for the admin Provider Health page */
export const PROVIDER_META: Record<string, {
  label:    string
  category: 'fundamentals' | 'quotes' | 'news' | 'macro' | 'alt' | 'ai' | 'private' | 'design' | 'intelligence'
  tier:     'primary' | 'secondary' | 'fallback' | 'specialty'
  coverage: string
  fields:   string[]
  docs:     string
  envName:  string
}> = {
  fmp: {
    label:'Financial Modeling Prep', category:'fundamentals', tier:'primary',
    coverage:'70k+ tickers, 50+ exchanges, 30 yrs financials',
    fields:['quotes','income','balance','cash flow','ratios','estimates','transcripts','SEC filings','insider','dividends','splits','segments','news'],
    docs:'https://site.financialmodelingprep.com/developer/docs', envName:'FMP_API_KEY',
  },
  massive: {
    label:'Massive (Polygon.io)', category:'quotes', tier:'primary',
    coverage:'US equities, options, FX, crypto — real-time + 20yr history',
    fields:['snapshots','aggregates','tick data','options chains','SMA/RSI/MACD','reference','XBRL financials','dividends','splits','news'],
    docs:'https://polygon.io/docs', envName:'MASSIVE_API_KEY',
  },
  eodhd: {
    label:'EODHD', category:'fundamentals', tier:'secondary',
    coverage:'150k+ tickers across 70 exchanges, strong international',
    fields:['EOD prices','intraday','fundamentals','earnings','insider txns','sentiment news','macro indicators','options','ETFs'],
    docs:'https://eodhd.com/financial-apis/', envName:'EODHD_API_KEY',
  },
  finnhub: {
    label:'Finnhub', category:'quotes', tier:'secondary',
    coverage:'US/EU/Asia equities, real-time WebSocket',
    fields:['quotes','company news','earnings calendar','insider txns','recommendation trends','price targets','social sentiment'],
    docs:'https://finnhub.io/docs/api', envName:'FINNHUB_API_KEY',
  },
  fred: {
    label:'FRED (St. Louis Fed)', category:'macro', tier:'primary',
    coverage:'800k+ economic time series, US + global',
    fields:['GDP','CPI','unemployment','Fed funds','yield curve','PCE','M2','PMI','consumer sentiment'],
    docs:'https://fred.stlouisfed.org/docs/api/fred/', envName:'FRED_API_KEY',
  },
  alphav: {
    label:'Alpha Vantage', category:'quotes', tier:'fallback',
    coverage:'Global equities, FX, crypto, technicals',
    fields:['quotes','intraday','FX','crypto','60+ technical indicators','earnings','overview'],
    docs:'https://www.alphavantage.co/documentation/', envName:'ALPHA_VANTAGE_API_KEY',
  },
  marketstack: {
    label:'Marketstack', category:'quotes', tier:'fallback',
    coverage:'30k+ tickers across 70 exchanges, 30 yrs EOD',
    fields:['EOD','intraday','splits','dividends','exchange directory'],
    docs:'https://marketstack.com/documentation', envName:'MARKETSTACK_API_KEY',
  },
  yahoo: {
    label:'Yahoo Finance (RapidAPI + keyless public)', category:'quotes', tier:'fallback',
    coverage:'Global tickers. Keyless public quoteSummary used for supplementary, additive data (personal-use-only; yfinance-style, not endorsed by Yahoo).',
    fields:[
      'quotes','statistics','holders','recommendations',
      // Keyless quoteSummary additions (source:'yahoo', supplementary):
      'major-holders breakdown','upgrade/downgrade history','ESG / sustainability scores',
      'fund/ETF profile + holdings + sector/asset weightings','earnings dates + surprise',
      'analyst estimate trend',
    ],
    docs:'https://rapidapi.com/apidojo/api/yahoo-finance1', envName:'YAHOO_FINANCE_API_KEY',
  },
  own: {
    label:'OpenWebNinja', category:'quotes', tier:'secondary',
    coverage:'Google/Yahoo Finance proxy — global symbols incl. crypto/forex',
    fields:['real-time quote','time series w/ key events','search','news','overview','income/balance/cash flow','market trends','forex'],
    docs:'https://www.openwebninja.com/api/realtime-finance-data', envName:'OPENWEBNINJA_API_KEY',
  },
  sec: {
    label:'SEC EDGAR (sec-api.io)', category:'fundamentals', tier:'specialty',
    coverage:'Full-text search across all SEC filings since 1993',
    fields:['10-K','10-Q','8-K','13F','Form 4','S-1','proxy','XBRL','executive comp'],
    docs:'https://sec-api.io/docs', envName:'SEC_API_KEY',
  },
  coresignal: {
    label:'CoreSignal', category:'private', tier:'specialty',
    coverage:'17M+ companies (private + public), employee/jobs/funding',
    fields:['company profile','employee count history','job postings','funding rounds','tech stack','employee reviews'],
    docs:'https://docs.coresignal.com/', envName:'CORESIGNAL_API_KEY',
  },
  twelvedata: {
    label:'Twelve Data', category:'quotes', tier:'secondary',
    coverage:'Global equities, ETFs, FX, crypto, indices — WebSocket + REST',
    fields:['real-time quotes','time series (1m–1mo)','100+ technical indicators','fundamentals','earnings','dividends','splits'],
    docs:'https://twelvedata.com/docs', envName:'TWELVEDATA_API_KEY',
  },
  financialdatasets: {
    label:'Financial Datasets', category:'fundamentals', tier:'secondary',
    coverage:'30 yrs financials for 16k+ US tickers, AI-friendly schema',
    fields:['income statements','balance sheets','cash flow','press releases','SEC filings','insider trades','options Greeks','prices'],
    docs:'https://docs.financialdatasets.ai/', envName:'FINANCIAL_DATASETS_API_KEY',
  },
  financeflow: {
    label:'FinanceFlow', category:'news', tier:'secondary',
    coverage:'Real-time news + sentiment + earnings calendar (US-focused)',
    fields:['news with sentiment','earnings calendar','dividend calendar','market movers','watchlist sync'],
    docs:'https://financeflow.io/docs', envName:'FINANCEFLOW_API_KEY',
  },
  databento: {
    label:'Databento', category:'quotes', tier:'specialty',
    coverage:'Tick-level historical + live: equities, options, futures, FX',
    fields:['MBO/MBP order book','trades','quotes','OHLCV','statistics','imbalance'],
    docs:'https://databento.com/docs', envName:'DATABENTO_API_KEY',
  },
  fiscalai: {
    label:'Fiscal.ai', category:'fundamentals', tier:'specialty',
    coverage:'Pre-computed fundamental KPIs (free tier ≈ 45 large-caps)',
    fields:['segment revenue','KPI time series','consensus','dividends','buybacks','margin walk'],
    docs:'https://fiscal.ai/api', envName:'FISCAL_AI_API_KEY',
  },
  alpaca: {
    label:'Alpaca Markets', category:'quotes', tier:'secondary',
    coverage:'US equities + crypto — IEX feed on paper/free, full SIP on paid plans',
    fields:['latest quote (NBBO)','latest trade','OHLCV bars','snapshots','crypto quotes'],
    docs:'https://docs.alpaca.markets/reference/stocklatestquotesingle', envName:'ALPACA_API_KEY_ID',
  },
  twentyfirst: {
    label:'21st.dev', category:'design', tier:'specialty',
    coverage:'AI-generated UI components and design tokens',
    fields:['component search','design generation'],
    docs:'https://21st.dev/docs', envName:'API_KEY_21ST',
  },
  census: {
    label:'U.S. Census Bureau', category:'macro', tier:'specialty',
    coverage:'ACS 1/5-yr, decennial census, economic census, population estimates — geography from US down to block level',
    fields:['population','demographics','income','poverty','employment','housing','education','commuting','industry','business patterns','FIPS resolution','TIGER geographies'],
    docs:'https://www.census.gov/data/developers.html', envName:'CENSUS_API_KEY',
  },
  worldbank: {
    label:'World Bank Open Data', category:'macro', tier:'primary',
    coverage:'~1,500 development & macro indicators across 200+ countries (WDI, ICP, Doing Business, GFDR)',
    fields:['GDP','GDP per capita','population','inflation','unemployment','life expectancy','literacy','FX reserves','gov debt/GDP','trade','CO2 emissions','business climate'],
    docs:'https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation', envName:'',
  },
  imf: {
    label:'IMF DataMapper', category:'macro', tier:'primary',
    coverage:'IMF WEO + Fiscal Monitor annual series across 190+ economies, incl. multi-year forecasts',
    fields:['real GDP growth','nominal GDP','GDP per capita','inflation','unemployment','gov gross debt/GDP','fiscal balance/GDP','current account/GDP','population'],
    docs:'https://www.imf.org/external/datamapper/api/help', envName:'',
  },
  dbnomics: {
    label:'DBnomics', category:'macro', tier:'secondary',
    coverage:'90+ official providers (Eurostat, ECB, BIS, IMF, World Bank, OECD, national stats) via one provider/dataset/series scheme',
    fields:['GDP','inflation/CPI','unemployment','policy rates','PMIs','industrial production','trade','exchange rates','monetary aggregates'],
    docs:'https://db.nomics.world/docs/api/', envName:'',
  },
  polymarket: {
    label:'Polymarket', category:'alt', tier:'specialty',
    coverage:'Active prediction markets + implied odds across politics, macro, crypto, sports & current events (public Gamma API, read-only)',
    fields:['market question','implied probability','outcome prices','24h price change','volume','liquidity','close date'],
    docs:'https://docs.polymarket.com', envName:'',
  },
  kalshi: {
    label:'Kalshi', category:'alt', tier:'specialty',
    coverage:'CFTC-regulated event contracts + implied odds across economics, politics, weather & financials (public market-data API, read-only)',
    fields:['market title','implied probability','last/previous price','volume','open interest','close time'],
    docs:'https://trading-api.readme.io', envName:'',
  },
  gdelt: {
    label:'GDELT Project', category:'alt', tier:'specialty',
    coverage:'Global geopolitical risk & events feed — conflict, political, disaster, economic & geopolitical coverage from worldwide news (public DOC 2.0 API, read-only)',
    fields:['event headline','category','severity (category-derived)','location','published date','outlet','article URL'],
    docs:'https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/', envName:'',
  },
  cftc: {
    label:'CFTC Commitment of Traders', category:'alt', tier:'specialty',
    coverage:'Weekly futures positioning across ~22 curated markets (equity index, rates, metals, energy, currencies, ags, crypto) via the public Socrata reporting API, read-only',
    fields:['commercial long/short/net','non-commercial long/short/net','non-reportable long/short/net','open interest','report date'],
    docs:'https://publicreporting.cftc.gov/stories/s/Commitments-of-Traders/j=87dz', envName:'',
  },
  finra: {
    label:'FINRA Short Sale Volume', category:'alt', tier:'specialty',
    coverage:'Daily consolidated off-exchange short-sale volume per US equity from the public FINRA CDN files, read-only',
    fields:['short volume','short exempt volume','total volume','short volume % of total','multi-day trend'],
    docs:'https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data', envName:'',
  },
  openai:     { label:'OpenAI',     category:'ai', tier:'primary',  coverage:'GPT-5, o-series reasoning, embeddings', fields:['chat','embeddings','vision','tools'], docs:'https://platform.openai.com/docs', envName:'OPENAI_API_KEY' },
  anthropic:  { label:'Anthropic',  category:'ai', tier:'primary',  coverage:'Claude Opus / Sonnet / Haiku',          fields:['chat','tools','vision','prompt caching'], docs:'https://docs.anthropic.com', envName:'ANTHROPIC_API_KEY' },
  groq:       { label:'Groq',       category:'ai', tier:'secondary',coverage:'Sub-second LLM inference (Llama, Mixtral)', fields:['chat','tools'], docs:'https://console.groq.com/docs', envName:'GROQ_API_KEY' },
  perplexity: { label:'Perplexity', category:'ai', tier:'secondary',coverage:'Web-grounded answers + citations',           fields:['sonar chat','citations'], docs:'https://docs.perplexity.ai', envName:'PERPLEXITY_API_KEY' },
  // ── Premium BYO-license connectors ──────────────────────────────────────
  // These providers are not pre-wired into Finsyt — the user brings their
  // own institutional license and connects it through the Connector Hub.
  // `envName` is empty because there is no platform-wide env var; the key
  // lives in the encrypted credential bag attached to the connection row.
  factset: {
    label: 'FactSet', category: 'fundamentals', tier: 'specialty',
    coverage: 'Symbology, Prices, Fundamentals, Estimates — bring your own FactSet license',
    fields: ['symbology', 'EOD prices', 'income', 'balance', 'cash flow', 'EPS estimates', 'revenue estimates'],
    docs: 'https://developer.factset.com/api-catalog', envName: '',
  },
  capiq: {
    label: 'S&P Capital IQ', category: 'fundamentals', tier: 'specialty',
    coverage: 'Quotes, Financials, Transactions, Ownership — bring your own Capital IQ Pro license',
    fields: ['reference quotes', 'income', 'balance', 'cash flow', 'M&A transactions', 'ownership'],
    docs: 'https://www.marketplace.spglobal.com/en/datasets/s-p-capital-iq-pro', envName: '',
  },
  refinitiv: {
    label: 'Refinitiv / LSEG', category: 'fundamentals', tier: 'specialty',
    coverage: 'Symbology, Real-time Pricing, Fundamentals, News — bring your own LSEG license',
    fields: ['symbology', 'real-time snapshots', 'fundamentals', 'news headlines'],
    docs: 'https://developers.lseg.com/en/api-catalog/refinitiv-data-platform', envName: '',
  },
  bloomberg: {
    label: 'Bloomberg Data License', category: 'fundamentals', tier: 'specialty',
    coverage: 'Reference data, history, pricing via BEAP — bring your own Bloomberg DL account',
    fields: ['catalog listing', 'DL request status', 'universe list'],
    docs: 'https://developer.bloomberg.com/portal/products/data-license', envName: '',
  },
  pitchbook: {
    label: 'PitchBook', category: 'private', tier: 'specialty',
    coverage: 'Private companies, funding rounds, M&A, LP/GP records — bring your own PitchBook license',
    fields: ['company search', 'company detail', 'funding rounds', 'M&A deals', 'LP/GP records'],
    docs: 'https://pitchbook.com/data/api', envName: '',
  },
  // ── Global Intelligence (public, no key required) ────────────────────────
  worldbankwgi: {
    label: 'World Bank WGI', category: 'intelligence', tier: 'primary',
    coverage: 'Worldwide Governance Indicators for 200+ countries — 6 annual governance sub-scores',
    fields: ['political stability', 'gov effectiveness', 'rule of law', 'regulatory quality', 'control of corruption', 'voice & accountability'],
    docs: 'https://info.worldbank.org/governance/wgi/', envName: '',
  },
  gdelt: {
    label: 'GDELT Project', category: 'intelligence', tier: 'primary',
    coverage: 'Near-real-time global event database & article analysis — 100+ languages, 24h latency',
    fields: ['conflict events', 'news tone', 'article themes', 'goldstein scale', 'CAMEO events'],
    docs: 'https://www.gdeltproject.org/', envName: '',
  },
  ofac: {
    label: 'OFAC SDN (US Treasury)', category: 'intelligence', tier: 'primary',
    coverage: 'US Specially Designated Nationals & Blocked Persons list — daily updates',
    fields: ['SDN sanctions screening', 'entity names', 'AKAs', 'sanction programs', 'addresses'],
    docs: 'https://sanctionslist.ofac.treas.gov/', envName: '',
  },
  eufsf: {
    label: 'EU Financial Sanctions (EU FSF)', category: 'intelligence', tier: 'secondary',
    coverage: 'EU consolidated financial sanctions list — updated within hours of new designations',
    fields: ['EU sanctions screening', 'entity names', 'nationalities', 'birth dates', 'regulation refs'],
    docs: 'https://webgate.ec.europa.eu/fsd/fsf', envName: '',
  },
  unsc: {
    label: 'UN Security Council Consolidated List', category: 'intelligence', tier: 'secondary',
    coverage: 'UN SC consolidated targeted sanctions — Al-Qaida, Taliban, and other regime lists',
    fields: ['UN sanctions screening', 'individual names', 'entity names', 'aliases', 'UN resolutions'],
    docs: 'https://www.un.org/securitycouncil/sanctions/information', envName: '',
  },
  comtrade: {
    label: 'UN Comtrade', category: 'intelligence', tier: 'primary',
    coverage: 'Annual import/export data by HS commodity code for 200+ reporter countries',
    fields: ['trade value USD', 'import flows', 'export flows', 'HS commodity codes', 'bilateral trade'],
    docs: 'https://comtradeapi.un.org/', envName: '',
  },
  cisakev: {
    label: 'CISA Known Exploited Vulnerabilities', category: 'intelligence', tier: 'primary',
    coverage: 'US CISA KEV catalog — actively exploited CVEs requiring immediate federal agency remediation',
    fields: ['CVE IDs', 'vendor/product', 'vulnerability name', 'CISA due date', 'short description'],
    docs: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', envName: '',
  },
  nvdnist: {
    label: 'NVD NIST CVE Database', category: 'intelligence', tier: 'secondary',
    coverage: 'NIST National Vulnerability Database — CVSS-scored CVEs with 30-day recent search',
    fields: ['CVE IDs', 'CVSS v3 base score', 'severity', 'affected products', 'publish date'],
    docs: 'https://nvd.nist.gov/developers', envName: '',
  },
}

/**
 * On module load, register any **paid** provider whose key is unset as
 * `missing` in the credential-health surface. Without this seed, providers
 * that never get exercised (e.g. nobody hit a Databento route this session)
 * silently disappear from `/api/health.credentialHealth.providers` — which
 * is exactly the visibility hole this task is closing. Providers with no
 * `envName` (e.g. World Bank, which is keyless) are skipped.
 */
for (const [name, meta] of Object.entries(PROVIDER_META)) {
  if (!meta.envName) continue
  const key = (PROVIDERS as Record<string, string>)[name]
  if (!key) recordKeyMissing(name)
  // Configured-but-not-yet-probed providers should still appear in the
  // registry as `unknown` so that a non-401 upstream error (402 from
  // CoreSignal, network blip on FinanceFlow, etc.) doesn't cause them to
  // silently disappear from /api/health.credentialHealth.providers.
  else recordKeyConfigured(name)
}

// Composite-credential override: Alpaca needs BOTH halves of the
// key-pair (`ALPACA_API_KEY_ID` + `ALPACA_API_SECRET_KEY`) to make a
// single authenticated call. The audit loop above keys off
// `PROVIDER_META.alpaca` and only inspects the public KEY-ID half, so
// without this override a half-configured key-pair would surface as
// `unknown` (configured-but-not-probed) and silently 401 every call.
// Re-classify as `missing` so /api/health and the credential-health
// notifier accurately report "Alpaca cannot authenticate".
if (PROVIDERS.alpaca && !PROVIDERS.alpacaSecret) {
  recordKeyMissing('alpaca')
}

/** Health check — which providers are configured */
export function providerStatus() {
  return Object.entries(PROVIDERS).map(([name, key]) => {
    const meta = PROVIDER_META[name] || null
    return {
      name,
      active:     !!key,
      keyPreview: key ? `${key.slice(0, 4)}…${key.slice(-4)}` : null,
      ...(meta || {}),
    }
  })
}

/**
 * Waterfall: run sources in order, return first non-null result.
 * Catches errors per-source so a broken provider never breaks the chain.
 */
export async function waterfall<T>(
  sources: Array<{ name: string; fn: () => Promise<T | null> }>,
  label?: string
): Promise<{ data: T; source: string } | null> {
  for (const { name, fn } of sources) {
    try {
      const result = await fn()
      if (result !== null && result !== undefined) {
        return { data: result, source: name }
      }
    } catch (err) {
      console.warn(`[finsyt:${label ?? '?'}] ${name} failed:`, (err as Error).message)
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Massive (Polygon.io) — primary for US real-time + technicals
// ─────────────────────────────────────────────────────────────────────────────
const MASSIVE_BASE = 'https://api.polygon.io'

export async function massiveFetch(path: string, params: Record<string, string> = {}) {
  if (!PROVIDERS.massive) return null
  const url = new URL(`${MASSIVE_BASE}${path}`)
  url.searchParams.set('apiKey', PROVIDERS.massive)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { next: { revalidate: 60 } })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      recordKeyRejection('massive', `Polygon ${path} HTTP ${res.status} (key rejected)`)
    }
    throw new Error(`Massive ${path} HTTP ${res.status}`)
  }
  recordKeyAccepted('massive')
  return res.json()
}

export async function massiveQuote(symbol: string) {
  const data = await massiveFetch(`/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`)
  const snap = data?.results
  if (!snap) return null
  return {
    symbol,
    price:     snap.day?.c || snap.lastTrade?.p || snap.lastQuote?.P || 0,
    change:    snap.todaysChange     || 0,
    changePct: snap.todaysChangePerc || 0,
    open:      snap.day?.o  || 0,
    high:      snap.day?.h  || 0,
    low:       snap.day?.l  || 0,
    prevClose: snap.prevDay?.c || 0,
    volume:    snap.day?.v  || 0,
    vwap:      snap.day?.vw || 0,
    source:    'massive',
  }
}

export async function massiveAggs(symbol: string, from: string, to: string, multiplier = 1, timespan = 'day') {
  const data = await massiveFetch(
    `/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}`,
    { adjusted: 'true', sort: 'asc', limit: '5000' }
  )
  return data?.results || null
}

export async function massiveTickerDetails(symbol: string) {
  const data = await massiveFetch(`/v3/reference/tickers/${symbol}`)
  return data?.results || null
}

export async function massiveNews(symbol?: string, limit = 20) {
  const p: Record<string, string> = { limit: String(limit), sort: 'published_utc', order: 'desc' }
  if (symbol) p.ticker = symbol
  const data = await massiveFetch('/v2/reference/news', p)
  return data?.results || null
}

export async function massiveFinancials(symbol: string, period: 'annual' | 'quarterly' = 'annual') {
  const data = await massiveFetch('/vX/reference/financials', {
    ticker: symbol, timeframe: period === 'annual' ? 'annual' : 'quarterly',
    include_sources: 'true', limit: '20',
  })
  return data?.results || null
}

export async function massiveDividends(symbol: string) {
  const data = await massiveFetch('/v3/reference/dividends', { ticker: symbol, limit: '20' })
  return data?.results || null
}

export async function massiveSplits(symbol: string) {
  const data = await massiveFetch('/v3/reference/splits', { ticker: symbol })
  return data?.results || null
}

export async function massiveSearch(query: string, limit = 10) {
  const data = await massiveFetch('/v3/reference/tickers', {
    search: query, active: 'true', limit: String(limit), market: 'stocks',
  })
  return data?.results || null
}

export async function massiveOptionsChain(symbol: string) {
  const data = await massiveFetch(`/v3/snapshot/options/${symbol}`, { limit: '250' })
  return data?.results || null
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalized options chain
// ─────────────────────────────────────────────────────────────────────────────
// A provider-agnostic option-chain shape consumed by /api/options and the
// company Options tab. Greeks/IV are surfaced verbatim when the upstream
// supplies them; /api/options fills any gaps via Black–Scholes. `greeksSource`
// records whether a row's Greeks came from the provider or were computed.

export interface NormalizedOptionContract {
  /** OCC-style contract ticker when available (e.g. O:AAPL260116C00150000). */
  contractTicker: string | null
  type: 'call' | 'put'
  /** Expiration as ISO date (YYYY-MM-DD). */
  expiration: string
  strike: number
  bid: number | null
  ask: number | null
  /** Mid of bid/ask, or last trade when quotes are absent. */
  mid: number | null
  last: number | null
  volume: number | null
  openInterest: number | null
  /** Implied volatility (decimal) as reported upstream, if any. */
  impliedVolatility: number | null
  delta: number | null
  gamma: number | null
  theta: number | null
  vega: number | null
  rho: number | null
  /** 'upstream' when the provider supplied Greeks, else 'computed'. */
  greeksSource: 'upstream' | 'computed' | 'none'
}

export interface NormalizedOptionsChain {
  symbol: string
  /** Underlying spot price as reported alongside the chain, if any. */
  underlyingPrice: number | null
  contracts: NormalizedOptionContract[]
  /** Sorted unique expirations present in `contracts`. */
  expirations: string[]
  source: string
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Normalize a Polygon v3 options snapshot row into our chain contract shape. */
function normalizePolygonContract(r: any): NormalizedOptionContract | null {
  const details = r?.details || {}
  const typeRaw = String(details.contract_type || '').toLowerCase()
  const type: 'call' | 'put' | null = typeRaw === 'call' ? 'call' : typeRaw === 'put' ? 'put' : null
  const expiration = details.expiration_date || null
  const strike = num(details.strike_price)
  if (!type || !expiration || strike == null) return null

  const q = r?.last_quote || {}
  const bid = num(q.bid)
  const ask = num(q.ask)
  const last = num(r?.last_trade?.price) ?? num(r?.day?.close)
  const mid = bid != null && ask != null && (bid > 0 || ask > 0) ? (bid + ask) / 2 : last
  const greeks = r?.greeks || {}
  const delta = num(greeks.delta)
  const gamma = num(greeks.gamma)
  const theta = num(greeks.theta)
  const vega = num(greeks.vega)
  const hasUpstream = delta != null || gamma != null || theta != null || vega != null

  return {
    contractTicker: details.ticker || null,
    type,
    expiration,
    strike,
    bid,
    ask,
    mid,
    last,
    volume: num(r?.day?.volume),
    openInterest: num(r?.open_interest),
    impliedVolatility: num(r?.implied_volatility),
    delta,
    gamma,
    theta,
    vega,
    // Polygon does not expose rho; /api/options computes it.
    rho: null,
    greeksSource: hasUpstream ? 'upstream' : 'none',
  }
}

/**
 * Provider-agnostic options chain. Polygon (massive) is the only first-party
 * upstream that returns full chains with Greeks/IV today; the waterfall keeps
 * a single entry so additional providers can be slotted in later without
 * changing callers. Returns `null` when no provider yields data — callers must
 * NOT fabricate a chain.
 */
export async function getOptionsChain(symbol: string): Promise<NormalizedOptionsChain | null> {
  let underlyingPrice: number | null = null
  const result = await waterfall<NormalizedOptionContract[]>([
    {
      name: 'massive',
      fn: async () => {
        const raw = await massiveOptionsChain(symbol)
        if (!Array.isArray(raw) || raw.length === 0) return null
        // Polygon embeds the underlying spot on each row's underlying_asset.
        for (const r of raw) {
          const p = num(r?.underlying_asset?.price)
          if (p != null && p > 0) { underlyingPrice = p; break }
        }
        const contracts = raw
          .map(normalizePolygonContract)
          .filter((c): c is NormalizedOptionContract => c !== null)
        return contracts.length ? contracts : null
      },
    },
  ], 'options-chain')

  if (!result) return null

  const contracts = result.data
  const expirations = Array.from(new Set(contracts.map(c => c.expiration))).sort()

  return {
    symbol: symbol.toUpperCase(),
    underlyingPrice,
    contracts,
    expirations,
    source: result.source,
  }
}

export async function massiveSMA(symbol: string, window = 50, timespan = 'day') {
  const data = await massiveFetch(`/v1/indicators/sma/${symbol}`, {
    timespan, window: String(window), series_type: 'close', limit: '100', adjusted: 'true',
  })
  return data?.results?.values || null
}
export async function massiveEMA(symbol: string, window = 20, timespan = 'day') {
  const data = await massiveFetch(`/v1/indicators/ema/${symbol}`, {
    timespan, window: String(window), series_type: 'close', limit: '100', adjusted: 'true',
  })
  return data?.results?.values || null
}
export async function massiveRSI(symbol: string, window = 14, timespan = 'day') {
  const data = await massiveFetch(`/v1/indicators/rsi/${symbol}`, {
    timespan, window: String(window), series_type: 'close', limit: '100', adjusted: 'true',
  })
  return data?.results?.values || null
}
export async function massiveMACD(symbol: string, timespan = 'day') {
  const data = await massiveFetch(`/v1/indicators/macd/${symbol}`, {
    timespan, series_type: 'close', limit: '100', adjusted: 'true',
  })
  return data?.results?.values || null
}
export async function massiveMarketStatus() {
  return massiveFetch('/v1/marketstatus/now')
}
export async function massiveIndices() {
  const data = await massiveFetch('/v2/snapshot/locale/us/markets/indices/tickers', {
    tickers: 'I:SPX,I:NDX,I:DJI,I:VIX,I:RUT',
  })
  return data?.results || null
}
export async function massiveGrouped(date: string) {
  const data = await massiveFetch(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, {
    adjusted: 'true', include_otc: 'false',
  })
  return data?.results || null
}

// ─────────────────────────────────────────────────────────────────────────────
// Yahoo Finance (via RapidAPI) — best global coverage, free tier 500 req/mo
// ─────────────────────────────────────────────────────────────────────────────
const YAHOO_HOST = 'yahoo-finance166.p.rapidapi.com'

export async function yahooFetch(path: string, params: Record<string, string> = {}) {
  if (!PROVIDERS.yahoo) return null
  const url = new URL(`https://${YAHOO_HOST}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: {
      'x-rapidapi-host': YAHOO_HOST,
      'x-rapidapi-key':  PROVIDERS.yahoo,
    },
    next: { revalidate: 120 },
  })
  if (!res.ok) {
    // RapidAPI returns 401 (invalid x-rapidapi-key) or 403 (subscription
    // expired / not subscribed). Both indicate the key needs operator
    // attention.
    if (res.status === 401 || res.status === 403) {
      recordKeyRejection('yahoo', `Yahoo (RapidAPI) ${path} HTTP ${res.status} (key rejected)`)
    }
    throw new Error(`Yahoo ${path} HTTP ${res.status}`)
  }
  recordKeyAccepted('yahoo')
  return res.json()
}

/** Quote — works for ALL global markets (LSE, TSX, ASX, Tokyo, etc.) */
export async function yahooQuote(symbol: string) {
  const data = await yahooFetch('/api/stock/get-quote', { symbol, region: 'US', lang: 'en-US' })
  const q = data?.quoteResponse?.result?.[0]
  if (!q) return null
  return {
    symbol:    q.symbol,
    price:     q.regularMarketPrice,
    change:    q.regularMarketChange,
    changePct: q.regularMarketChangePercent,
    open:      q.regularMarketOpen,
    high:      q.regularMarketDayHigh,
    low:       q.regularMarketDayLow,
    prevClose: q.regularMarketPreviousClose,
    volume:    q.regularMarketVolume,
    marketCap: q.marketCap,
    name:      q.longName || q.shortName || symbol,
    exchange:  q.fullExchangeName || q.exchange || '',
    currency:  q.currency || 'USD',
    pe:        q.trailingPE,
    eps:       q.epsTrailingTwelveMonths,
    yearHigh:  q.fiftyTwoWeekHigh,
    yearLow:   q.fiftyTwoWeekLow,
    source:    'yahoo',
  }
}

/** Historical bars — free, global */
export async function yahooHistory(symbol: string, period1: number, period2: number, interval = '1d') {
  const data = await yahooFetch('/api/stock/get-chart', {
    symbol, interval, period1: String(period1), period2: String(period2), range: '1y',
  })
  const chart = data?.chart?.result?.[0]
  if (!chart?.timestamp) return null
  const { timestamp, indicators } = chart
  const q = indicators?.quote?.[0] || {}
  return timestamp.map((t: number, i: number) => ({
    t: t * 1000, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i],
  })).filter((b: any) => b.c != null)
}

/** Search — global ticker coverage */
export async function yahooSearch(query: string, limit = 10) {
  const data = await yahooFetch('/api/stock/search', { q: query, quotesCount: String(limit), newsCount: '0' })
  return data?.quotes?.slice(0, limit) || null
}

/** Fundamentals summary */
export async function yahooSummary(symbol: string) {
  const data = await yahooFetch('/api/stock/get-financial-data', { symbol, region: 'US' })
  return data?.financialData || null
}

// ─────────────────────────────────────────────────────────────────────────────
// Yahoo Finance — KEYLESS public quoteSummary (supplementary / fallback)
// ─────────────────────────────────────────────────────────────────────────────
//
// These helpers hit Yahoo's free, public `query1/query2.finance.yahoo.com`
// quoteSummary endpoints — no RapidAPI key required. They power genuinely
// *additive* Finsyt data items (major-holders breakdown, upgrade/downgrade
// history, numeric ESG scores, fund/ETF profile + holdings + weightings,
// earnings dates with surprise, analyst estimate trend) that our primary
// upstreams (FMP/EODHD/Finnhub) do not return today.
//
// Compliance: Yahoo's public endpoints are intended for *personal use only*
// and `yfinance` (the inspiration for these calls) is NOT endorsed by Yahoo.
// Every value returned is tagged `source: 'yahoo'` so the UI can surface that
// attribution + a compliance note, and callers degrade gracefully (return
// null/empty) whenever Yahoo is unreachable.
//
// The modern quoteSummary endpoint requires a cookie + crumb pair. We fetch
// and cache that pair process-wide (TTL ~50 min) and degrade silently if the
// handshake fails.

const YAHOO_QS_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']
const YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

interface YahooCrumb { cookie: string; crumb: string; ts: number }
const YAHOO_CRUMB_TTL_MS = 50 * 60 * 1000
const yahooCrumbCache = (() => {
  const g = globalThis as unknown as { __finsytYahooCrumb?: YahooCrumb | null }
  return g
})()

async function getYahooCrumb(force = false): Promise<YahooCrumb | null> {
  const cached = yahooCrumbCache.__finsytYahooCrumb
  if (!force && cached && Date.now() - cached.ts < YAHOO_CRUMB_TTL_MS) return cached
  try {
    // 1. Hit the consent/landing page to obtain an A1/A3 session cookie.
    const seed = await fetch('https://fc.yahoo.com/', {
      headers: { 'User-Agent': YAHOO_UA, Accept: 'text/html' },
      redirect: 'manual',
      cache: 'no-store',
    }).catch(() => null)
    let cookie = ''
    if (seed) {
      const setCookie = seed.headers.get('set-cookie') || ''
      cookie = setCookie.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ')
    }
    if (!cookie) {
      const alt = await fetch('https://finance.yahoo.com/', {
        headers: { 'User-Agent': YAHOO_UA, Accept: 'text/html' },
        cache: 'no-store',
      }).catch(() => null)
      if (alt) {
        const sc = alt.headers.get('set-cookie') || ''
        cookie = sc.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ')
      }
    }
    // 2. Exchange the cookie for a crumb token.
    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': YAHOO_UA, ...(cookie ? { Cookie: cookie } : {}), Accept: 'text/plain' },
      cache: 'no-store',
    }).catch(() => null)
    if (!crumbRes || !crumbRes.ok) return null
    const crumb = (await crumbRes.text()).trim()
    if (!crumb || crumb.includes('<') || crumb.length > 64) return null
    const fresh: YahooCrumb = { cookie, crumb, ts: Date.now() }
    yahooCrumbCache.__finsytYahooCrumb = fresh
    return fresh
  } catch {
    return null
  }
}

/**
 * Low-level keyless quoteSummary fetch. Returns the first result object for
 * the requested modules, or null on any failure (degrade gracefully). Tries
 * both query hosts and retries once with a fresh crumb on a 401/Unauthorized.
 */
export async function yahooQuoteSummaryModules(
  symbol: string,
  modules: string[],
): Promise<any | null> {
  const sym = (symbol || '').trim().toUpperCase()
  if (!sym || !modules.length) return null
  const attempt = async (force: boolean): Promise<any | null> => {
    const cr = await getYahooCrumb(force)
    for (const host of YAHOO_QS_HOSTS) {
      try {
        const url = new URL(`${host}/v10/finance/quoteSummary/${encodeURIComponent(sym)}`)
        url.searchParams.set('modules', modules.join(','))
        if (cr?.crumb) url.searchParams.set('crumb', cr.crumb)
        const res = await fetch(url.toString(), {
          headers: { 'User-Agent': YAHOO_UA, ...(cr?.cookie ? { Cookie: cr.cookie } : {}), Accept: 'application/json' },
          next: { revalidate: 900 },
        })
        if (res.status === 401 || res.status === 403) return null // signal retry upstream
        if (!res.ok) continue
        const json: any = await res.json()
        const result = json?.quoteSummary?.result?.[0]
        if (result) { recordKeyAccepted('yahoo'); return result }
      } catch { /* try next host */ }
    }
    return null
  }
  let out = await attempt(false)
  if (out == null) out = await attempt(true) // refresh crumb once
  return out
}

const pctOrNull = (n: any): number | null => {
  const v = Number(n)
  if (!isFinite(v)) return null
  // Yahoo reports holder breakdown as fractions (0.61 = 61%).
  return +(v * 100).toFixed(2)
}
const numOrNull = (n: any): number | null => {
  const v = Number(n?.raw ?? n)
  return isFinite(v) ? v : null
}

/**
 * Major-holders breakdown: % held by insiders, % held by institutions, % of
 * float held by institutions, and the number of institutional holders. Not
 * returned by FMP's institutional-holder endpoint, so this is purely additive.
 */
export async function yahooMajorHolders(symbol: string) {
  const r = await yahooQuoteSummaryModules(symbol, ['majorHoldersBreakdown'])
  const b = r?.majorHoldersBreakdown
  if (!b) return null
  const insidersPct = pctOrNull(b.insidersPercentHeld?.raw ?? b.insidersPercentHeld)
  const institutionsPct = pctOrNull(b.institutionsPercentHeld?.raw ?? b.institutionsPercentHeld)
  const institutionsFloatPct = pctOrNull(b.institutionsFloatPercentHeld?.raw ?? b.institutionsFloatPercentHeld)
  const institutionsCount = numOrNull(b.institutionsCount)
  if (insidersPct == null && institutionsPct == null && institutionsFloatPct == null) return null
  return { symbol: symbol.toUpperCase(), insidersPct, institutionsPct, institutionsFloatPct, institutionsCount, source: 'yahoo' as const }
}

/**
 * Upgrade / downgrade history: chronological list of sell-side rating actions
 * (firm, from-grade, to-grade, action). FMP only returns a *consensus*
 * snapshot, so the per-firm action history is additive.
 */
export async function yahooUpgradeHistory(symbol: string, limit = 40) {
  const r = await yahooQuoteSummaryModules(symbol, ['upgradeDowngradeHistory'])
  const hist = r?.upgradeDowngradeHistory?.history
  if (!Array.isArray(hist) || !hist.length) return null
  const rows = hist
    .map((h: any) => ({
      date: h.epochGradeDate ? new Date(Number(h.epochGradeDate) * 1000).toISOString().slice(0, 10) : null,
      firm: h.firm || null,
      toGrade: h.toGrade || null,
      fromGrade: h.fromGrade || null,
      action: h.action || null, // up | down | init | main | reit
    }))
    .filter((h: any) => h.firm && h.date)
    .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
    .slice(0, limit)
  if (!rows.length) return null
  return { symbol: symbol.toUpperCase(), history: rows, source: 'yahoo' as const }
}

/**
 * Numeric ESG / sustainability scores (total + E/S/G sub-scores, percentile,
 * controversy level). Not available from FMP/EODHD on our plans.
 */
export async function yahooEsg(symbol: string) {
  const r = await yahooQuoteSummaryModules(symbol, ['esgScores'])
  const e = r?.esgScores
  if (!e) return null
  const total = numOrNull(e.totalEsg)
  const env = numOrNull(e.environmentScore)
  const soc = numOrNull(e.socialScore)
  const gov = numOrNull(e.governanceScore)
  if (total == null && env == null && soc == null && gov == null) return null
  return {
    symbol: symbol.toUpperCase(),
    totalEsg: total,
    environmentScore: env,
    socialScore: soc,
    governanceScore: gov,
    esgPerformance: e.esgPerformance || null,
    percentile: numOrNull(e.percentile),
    highestControversy: numOrNull(e.highestControversy),
    ratingYear: numOrNull(e.ratingYear),
    ratingMonth: numOrNull(e.ratingMonth),
    peerGroup: e.peerGroup || null,
    source: 'yahoo' as const,
  }
}

/**
 * Fund / ETF profile + top holdings + sector & asset-class weightings + bond
 * ratings. This whole domain is MISSING from Finsyt today.
 */
export async function yahooFundProfile(symbol: string) {
  const r = await yahooQuoteSummaryModules(symbol, [
    'topHoldings', 'fundProfile', 'defaultKeyStatistics', 'assetProfile', 'quoteType',
  ])
  if (!r) return null
  const th = r.topHoldings
  const fp = r.fundProfile
  const qt = r.quoteType
  const ap = r.assetProfile
  const isFund = (qt?.quoteType === 'ETF' || qt?.quoteType === 'MUTUALFUND') || !!th || !!fp
  if (!isFund) return null
  const holdings = Array.isArray(th?.holdings)
    ? th.holdings.map((h: any) => ({ symbol: h.symbol || null, name: h.holdingName || null, pct: pctOrNull(h.holdingPercent?.raw ?? h.holdingPercent) }))
        .filter((h: any) => h.pct != null)
    : []
  const sectorWeightings = Array.isArray(th?.sectorWeightings)
    ? th.sectorWeightings.flatMap((w: any) => Object.entries(w).map(([k, v]) => ({ sector: k, pct: pctOrNull((v as any)?.raw ?? v) })))
        .filter((w: any) => w.pct != null)
    : []
  const assetWeightings = th?.equityHoldings || th?.bondHoldings
    ? {
        stockPosition: pctOrNull(th?.stockPosition?.raw ?? th?.stockPosition),
        bondPosition: pctOrNull(th?.bondPosition?.raw ?? th?.bondPosition),
        cashPosition: pctOrNull(th?.cashPosition?.raw ?? th?.cashPosition),
        otherPosition: pctOrNull(th?.otherPosition?.raw ?? th?.otherPosition),
        preferredPosition: pctOrNull(th?.preferredPosition?.raw ?? th?.preferredPosition),
        convertiblePosition: pctOrNull(th?.convertiblePosition?.raw ?? th?.convertiblePosition),
      }
    : null
  const bondRatings = Array.isArray(th?.bondRatings)
    ? th.bondRatings.flatMap((w: any) => Object.entries(w).map(([k, v]) => ({ rating: k, pct: pctOrNull((v as any)?.raw ?? v) })))
        .filter((w: any) => w.pct != null)
    : []
  return {
    symbol: symbol.toUpperCase(),
    quoteType: qt?.quoteType || null,
    name: qt?.longName || qt?.shortName || null,
    family: fp?.family || null,
    category: fp?.categoryName || null,
    legalType: fp?.legalType || null,
    feesExpensesNet: numOrNull(fp?.feesExpensesInvestment?.netExpRatio),
    feesExpensesGross: numOrNull(fp?.feesExpensesInvestment?.annualReportExpenseRatio),
    summary: ap?.longBusinessSummary || null,
    holdings,
    sectorWeightings,
    assetWeightings,
    bondRatings,
    source: 'yahoo' as const,
  }
}

/**
 * Earnings dates with estimate-vs-actual surprise. Combines the historical
 * earningsHistory rows (per quarter EPS estimate vs actual + surprise %) with
 * the next/upcoming earnings date from calendarEvents.
 */
export async function yahooEarningsDates(symbol: string) {
  const r = await yahooQuoteSummaryModules(symbol, ['earningsHistory', 'calendarEvents'])
  if (!r) return null
  const hist = Array.isArray(r.earningsHistory?.history)
    ? r.earningsHistory.history.map((h: any) => ({
        quarter: h.quarter?.fmt || null,
        epsActual: numOrNull(h.epsActual),
        epsEstimate: numOrNull(h.epsEstimate),
        epsDifference: numOrNull(h.epsDifference),
        surprisePct: h.surprisePercent != null ? pctOrNull(h.surprisePercent?.raw ?? h.surprisePercent) : null,
      })).filter((h: any) => h.epsActual != null || h.epsEstimate != null)
    : []
  const ce = r.calendarEvents?.earnings
  const nextDates: string[] = Array.isArray(ce?.earningsDate)
    ? ce.earningsDate.map((d: any) => (d?.fmt || (d?.raw ? new Date(Number(d.raw) * 1000).toISOString().slice(0, 10) : null))).filter(Boolean)
    : []
  if (!hist.length && !nextDates.length) return null
  return {
    symbol: symbol.toUpperCase(),
    history: hist,
    nextEarningsDate: nextDates[0] || null,
    nextEarningsDateRange: nextDates,
    epsForward: numOrNull(ce?.earningsAverage),
    revenueForward: numOrNull(ce?.revenueAverage),
    source: 'yahoo' as const,
  }
}

/**
 * Analyst estimate *trend* detail: current vs 7/30/60/90-days-ago consensus
 * (EPS + revenue) per period, plus growth and the number of analysts. This
 * "how the consensus is moving" view is additive over FMP's point estimates.
 */
export async function yahooEstimateTrend(symbol: string) {
  const r = await yahooQuoteSummaryModules(symbol, ['earningsTrend'])
  const trend = r?.earningsTrend?.trend
  if (!Array.isArray(trend) || !trend.length) return null
  const rows = trend.map((t: any) => {
    const e = t.earningsEstimate || {}
    const rev = t.revenueEstimate || {}
    const epsT = t.epsTrend || {}
    const epsRev = t.epsRevisions || {}
    return {
      period: t.period || null,        // 0q, +1q, 0y, +1y, +5y, -5y
      endDate: t.endDate || null,
      growth: pctOrNull(t.growth?.raw ?? t.growth),
      epsAvg: numOrNull(e.avg), epsLow: numOrNull(e.low), epsHigh: numOrNull(e.high),
      epsAnalysts: numOrNull(e.numberOfAnalysts), epsYearAgo: numOrNull(e.yearAgoEps),
      revAvg: numOrNull(rev.avg), revLow: numOrNull(rev.low), revHigh: numOrNull(rev.high),
      revAnalysts: numOrNull(rev.numberOfAnalysts),
      epsCurrent: numOrNull(epsT.current), eps7dAgo: numOrNull(epsT['7daysAgo']),
      eps30dAgo: numOrNull(epsT['30daysAgo']), eps60dAgo: numOrNull(epsT['60daysAgo']),
      eps90dAgo: numOrNull(epsT['90daysAgo']),
      upLast30d: numOrNull(epsRev.upLast30days), downLast30d: numOrNull(epsRev.downLast30days),
    }
  }).filter((r2: any) => r2.period)
  if (!rows.length) return null
  return { symbol: symbol.toUpperCase(), trend: rows, source: 'yahoo' as const }
}

// ─────────────────────────────────────────────────────────────────────────────
// Alpha Vantage — real-time + forex + crypto + economic indicators
// ─────────────────────────────────────────────────────────────────────────────
const AV_BASE = 'https://www.alphavantage.co/query'

export async function alphaFetch(params: Record<string, string>) {
  if (!PROVIDERS.alphav) return null
  const url = new URL(AV_BASE)
  url.searchParams.set('apikey', PROVIDERS.alphav)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { next: { revalidate: 300 } })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      recordKeyRejection('alphav', `AlphaVantage HTTP ${res.status} (key rejected)`)
    }
    throw new Error(`AlphaVantage HTTP ${res.status}`)
  }
  const data = await res.json()
  // AV almost never returns 401 — it signals an invalid/exhausted key by
  // returning HTTP 200 with an `Information` or `Error Message` field
  // instead of the usual payload. We deliberately do NOT treat `Note` as a
  // credential rejection: AV uses `Note` for transient rate-limit /
  // frequency throttling on perfectly valid keys, and flipping a healthy
  // key to `rejected` would page the team for a benign 5-call/min limit.
  // `Note` still propagates as an error so the caller can fall back, just
  // without polluting credential-health.
  if (data['Information'] || data['Error Message']) {
    const reason = String(data['Information'] || data['Error Message'])
    recordKeyRejection('alphav', `AlphaVantage body says: ${reason}`)
    throw new Error(reason)
  }
  if (data['Note']) {
    // Rate-limit / throttle — surface the error but treat it as a
    // successful credential round-trip (the key worked, the quota didn't).
    recordKeyAccepted('alphav')
    throw new Error(String(data['Note']))
  }
  recordKeyAccepted('alphav')
  return data
}

export async function alphaQuote(symbol: string) {
  const data = await alphaFetch({ function: 'GLOBAL_QUOTE', symbol })
  const q = data?.['Global Quote']
  if (!q?.['05. price']) return null
  return {
    symbol,
    price:     parseFloat(q['05. price']),
    change:    parseFloat(q['09. change']),
    changePct: parseFloat(q['10. change percent']?.replace('%', '') || '0'),
    open:      parseFloat(q['02. open']),
    high:      parseFloat(q['03. high']),
    low:       parseFloat(q['04. low']),
    prevClose: parseFloat(q['08. previous close']),
    volume:    parseInt(q['06. volume']),
    source:    'alphav',
  }
}

export async function alphaHistory(symbol: string, outputsize = 'compact') {
  const data = await alphaFetch({ function: 'TIME_SERIES_DAILY_ADJUSTED', symbol, outputsize })
  const series = data?.['Time Series (Daily)']
  if (!series) return null
  return Object.entries(series).map(([date, v]: [string, any]) => ({
    t: new Date(date).getTime(),
    o: parseFloat(v['1. open']), h: parseFloat(v['2. high']),
    l: parseFloat(v['3. low']),  c: parseFloat(v['4. close']),
    v: parseInt(v['6. volume']),  adj: parseFloat(v['5. adjusted close']),
  })).sort((a, b) => a.t - b.t)
}

export async function alphaForex(from: string, to: string) {
  const data = await alphaFetch({ function: 'CURRENCY_EXCHANGE_RATE', from_currency: from, to_currency: to })
  const r = data?.['Realtime Currency Exchange Rate']
  if (!r) return null
  return {
    from, to,
    rate:      parseFloat(r['5. Exchange Rate']),
    bid:       parseFloat(r['8. Bid Price']),
    ask:       parseFloat(r['9. Ask Price']),
    timestamp: r['6. Last Refreshed'],
    source:    'alphav',
  }
}

export async function alphaCrypto(symbol: string, market = 'USD') {
  const data = await alphaFetch({ function: 'CURRENCY_EXCHANGE_RATE', from_currency: symbol, to_currency: market })
  const r = data?.['Realtime Currency Exchange Rate']
  if (!r) return null
  return { symbol, market, rate: parseFloat(r['5. Exchange Rate']), source: 'alphav' }
}

// Alpha Vantage fundamental helpers
export async function alphaOverview(symbol: string) {
  return alphaFetch({ function: 'OVERVIEW', symbol })
}
export async function alphaIncomeStatement(symbol: string) {
  return alphaFetch({ function: 'INCOME_STATEMENT', symbol })
}
export async function alphaBalanceSheet(symbol: string) {
  return alphaFetch({ function: 'BALANCE_SHEET', symbol })
}
export async function alphaCashFlow(symbol: string) {
  return alphaFetch({ function: 'CASH_FLOW', symbol })
}
export async function alphaEarnings(symbol: string) {
  return alphaFetch({ function: 'EARNINGS', symbol })
}

// Alpha Vantage technical indicators
export async function alphaSMA(symbol: string, period = 50, interval = 'daily') {
  const data = await alphaFetch({ function: 'SMA', symbol, interval, time_period: String(period), series_type: 'close' })
  const series = data?.['Technical Analysis: SMA']
  return series ? Object.entries(series).map(([date, v]: [string, any]) => ({
    t: new Date(date).getTime(), value: parseFloat(v.SMA),
  })).sort((a, b) => a.t - b.t) : null
}

// Alpha Vantage economic indicators (free)
export async function alphaEconomic(indicator: 'CPI' | 'UNEMPLOYMENT' | 'FEDERAL_FUNDS_RATE' | 'TREASURY_YIELD' | 'REAL_GDP') {
  return alphaFetch({ function: indicator })
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketstack — 60+ global exchanges, great for international
// ─────────────────────────────────────────────────────────────────────────────
const MS_BASE = 'http://api.marketstack.com/v1'

export async function marketstackFetch(path: string, params: Record<string, string> = {}) {
  if (!PROVIDERS.marketstack) return null
  const url = new URL(`${MS_BASE}${path}`)
  url.searchParams.set('access_key', PROVIDERS.marketstack)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { next: { revalidate: 300 } })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      recordKeyRejection('marketstack', `Marketstack ${path} HTTP ${res.status} (key rejected)`)
    }
    throw new Error(`Marketstack ${path} HTTP ${res.status}`)
  }
  const data = await res.json()
  if (data?.error) {
    // Marketstack returns 200 with an `error` envelope on auth failure
    // (codes: invalid_access_key, missing_access_key, inactive_user,
    // usage_limit_reached). Surface those as credential rejections so a
    // dead key shows up on /api/health instead of disappearing into a
    // silent waterfall fallback.
    const code = String(data.error.code || '')
    const authCodes = new Set([
      'invalid_access_key', 'missing_access_key',
      'inactive_user', 'invalid_api_function', 'https_access_restricted',
    ])
    if (authCodes.has(code)) {
      recordKeyRejection('marketstack', `Marketstack ${path} returned error.code=${code}`)
    }
    throw new Error(data.error.message || 'Marketstack error')
  }
  recordKeyAccepted('marketstack')
  return data
}

export async function marketstackQuote(symbol: string) {
  // Marketstack uses EOD data on free tier
  const data = await marketstackFetch('/eod/latest', { symbols: symbol, limit: '1' })
  const q = data?.data?.[0]
  if (!q?.close) return null
  return {
    symbol:    q.symbol,
    price:     q.close,
    open:      q.open,
    high:      q.high,
    low:       q.low,
    prevClose: q.adj_close || q.close,
    volume:    q.volume,
    date:      q.date,
    exchange:  q.exchange,
    source:    'marketstack',
  }
}

export async function marketstackHistory(symbol: string, from: string, to: string, limit = 365) {
  const data = await marketstackFetch('/eod', {
    symbols: symbol, date_from: from, date_to: to, limit: String(limit),
  })
  const bars = data?.data || []
  return bars.map((b: any) => ({
    t: new Date(b.date).getTime(),
    o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume, adj: b.adj_close,
  })).sort((a: any, b: any) => a.t - b.t)
}

export async function marketstackSearch(query: string, limit = 10) {
  const data = await marketstackFetch('/tickers', { search: query, limit: String(limit) })
  return data?.data || null
}

export async function marketstackExchanges() {
  const data = await marketstackFetch('/exchanges', { limit: '50' })
  return data?.data || null
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared currency / exchange detection utility
// ─────────────────────────────────────────────────────────────────────────────

/** Detect if a symbol is likely international (non-US) */
export function isInternationalSymbol(symbol: string): boolean {
  // LSE: .L  TSX: .TO  ASX: .AX  Euronext: .PA .AS  Frankfurt: .DE  etc.
  return /\.(L|TO|AX|PA|AS|DE|HK|T|NS|BO|BR|MC|MI|SW|OL|ST|HE|CO|LS|IR|AT|WA|PR|BU|MX|SA|SN|BA|LM|TL|CR|NZ|SG|KS|TW|SS|SZ)$/i.test(symbol)
    || symbol.includes(':')
}

/** Normalise symbol for EODHD (adds .US if bare US ticker) */
export function toEODSymbol(symbol: string): string {
  return symbol.includes('.') || symbol.includes(':') ? symbol : `${symbol}.US`
}

export interface DailyBar { t: number; o?: number; h?: number; l?: number; c: number; v?: number }

export interface DailyBarsResult { bars: DailyBar[]; source: string }

export async function dailyBarsWaterfall(symbol: string, from: string, to: string): Promise<DailyBarsResult | null> {
  const sym = symbol.toUpperCase()
  const isIntl = isInternationalSymbol(sym)

  if (!isIntl && PROVIDERS.massive) {
    try {
      const bars = await massiveAggs(sym, from, to, 1, 'day')
      if (bars?.length) return { bars: bars.map((b: { t: number; o: number; h: number; l: number; c: number; v: number }) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })), source: 'massive' }
    } catch { /* next provider */ }
  }

  if (PROVIDERS.fmp && !isIntl) {
    try {
      const res = await fetch(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${sym}&from=${from}&to=${to}&apikey=${PROVIDERS.fmp}`, { next: { revalidate: 3600 } })
      const data = await res.json()
      const hist = (data?.historical || []) as Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>
      if (hist.length) return { bars: hist.slice().reverse().map((b) => ({ t: new Date(b.date).getTime(), o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume })), source: 'fmp' }
    } catch { /* next provider */ }
  }

  if (PROVIDERS.twelvedata) {
    try {
      const bars = await twelvedataTimeSeries(sym, '1day', 5000)
      const filtered = (bars || []).filter((b: { t: number }) => b.t >= new Date(from).getTime() && b.t <= new Date(to).getTime() + 86400000)
      if (filtered.length) return { bars: filtered as DailyBar[], source: 'twelvedata' }
    } catch { /* next provider */ }
  }

  if (PROVIDERS.eodhd) {
    try {
      const url = `https://eodhd.com/api/eod/${toEODSymbol(sym)}?api_token=${PROVIDERS.eodhd}&fmt=json&from=${from}&to=${to}`
      const res = await fetch(url, { next: { revalidate: 3600 } })
      const data = await res.json()
      if (Array.isArray(data) && data.length) return { bars: data.map((b: { date: string; open: number; high: number; low: number; close: number; volume: number }) => ({ t: new Date(b.date).getTime(), o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume })), source: 'eodhd' }
    } catch { /* next provider */ }
  }

  if (PROVIDERS.marketstack) {
    try {
      const bars = await marketstackHistory(sym, from, to)
      if (bars?.length) return { bars: bars as DailyBar[], source: 'marketstack' }
    } catch { /* next provider */ }
  }

  if (PROVIDERS.alphav) {
    try {
      const bars = await alphaHistory(sym, 'full')
      const filtered = (bars || []).filter((b: { t: number }) => b.t >= new Date(from).getTime() && b.t <= new Date(to).getTime() + 86400000)
      if (filtered.length) return { bars: filtered as DailyBar[], source: 'alphav' }
    } catch { /* next provider */ }
  }

  if (PROVIDERS.yahoo) {
    try {
      const p1 = Math.floor(new Date(from).getTime() / 1000)
      const p2 = Math.floor(new Date(to).getTime() / 1000)
      const bars = await yahooHistory(sym, p1, p2, '1d')
      if (bars?.length) return { bars: bars as DailyBar[], source: 'yahoo' }
    } catch { /* next provider */ }
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenWebNinja Real-Time Finance Data API  (Google Finance source)
// ─────────────────────────────────────────────────────────────────────────────
// Docs: https://www.openwebninja.com/api/real-time-finance-data/docs
// Base: https://api.openwebninja.com/realtime-finance-data
// Auth: x-api-key header (lowercase, as specified in OAS 3.0.3 docs)
//
// Symbol format: TICKER:EXCHANGE   e.g. AAPL:NASDAQ  TSLA:NASDAQ  HSBA:LON
// Exchange codes from Google Finance: NASDAQ NYSE LON ETR EPA AMS TYO HKEX TSX ASX
//
// Endpoints (confirmed from OAS 3.0.3 docs):
//   GET /search?query=                             → stocks, ETFs, indices, forex, crypto
//   GET /market-trends?trend_type=                 → MARKET_INDEXES|MOST_ACTIVE|GAINERS|LOSERS|CRYPTO|CURRENCIES|CLIMATE_LEADERS
//   GET /stock-quote?symbol=                       → real-time price + pre/post market
//   GET /stock-time-series?symbol=&period=         → chart bars + key events (1D|5D|1M|6M|YTD|1Y|5Y|MAX)
//   GET /stock-news?symbol=                        → related news articles
//   GET /stock-overview?symbol=                    → company overview / fundamentals
//   GET /stock-income-statement?symbol=            → quarterly + annual P&L
//   GET /stock-balance-sheet?symbol=               → quarterly + annual balance sheet
//   GET /stock-cash-flow?symbol=                   → quarterly + annual cash flow
//   GET /currency-exchange-rate?from_symbol=&to_symbol=  → forex rate
//   GET /currency-time-series?from_symbol=&to_symbol=&period=
//   GET /currency-news?from_symbol=&to_symbol=
//   GET /stock-quote-yahoo?symbol=                 → Yahoo Finance quote (no :EXCHANGE needed)
//   GET /stock-time-series-yahoo?symbol=&period=   → Yahoo Finance chart
// ─────────────────────────────────────────────────────────────────────────────

const OWN_BASE = 'https://api.openwebninja.com/realtime-finance-data'

/** Convert bare ticker to TICKER:EXCHANGE format for OWN API */
export function ownSymbol(symbol: string, exchange?: string): string {
  if (symbol.includes(':')) return symbol  // already formatted

  // Common Google Finance exchange codes by suffix
  const suffixMap: Record<string, string> = {
    '.L':   'LON',   // London Stock Exchange
    '.TO':  'TSX',   // Toronto Stock Exchange
    '.AX':  'ASX',   // Australian Securities Exchange
    '.PA':  'EPA',   // Euronext Paris
    '.AS':  'AMS',   // Euronext Amsterdam
    '.DE':  'ETR',   // Deutsche Börse (Xetra)
    '.MI':  'BIT',   // Borsa Italiana
    '.MC':  'BME',   // Bolsa de Madrid
    '.HK':  'HKEX',  // Hong Kong Exchange
    '.T':   'TYO',   // Tokyo Stock Exchange
    '.NS':  'NSE',   // National Stock Exchange India
    '.BO':  'BSE',   // Bombay Stock Exchange
    '.SS':  'SHA',   // Shanghai Stock Exchange
    '.SZ':  'SHE',   // Shenzhen Stock Exchange
    '.SW':  'VTX',   // SIX Swiss Exchange
    '.BR':  'EBR',   // Euronext Brussels
    '.LS':  'ELI',   // Euronext Lisbon
    '.MX':  'BMV',   // Bolsa Mexicana de Valores
    '.SA':  'BVMF',  // B3 Brazil
    '.NZ':  'NZX',   // New Zealand Exchange
  }

  for (const [suffix, exch] of Object.entries(suffixMap)) {
    if (symbol.toUpperCase().endsWith(suffix.toUpperCase())) {
      const ticker = symbol.slice(0, -suffix.length)
      return `${ticker.toUpperCase()}:${exch}`
    }
  }

  // Default: assume NASDAQ for bare US tickers, override with exchange param
  return `${symbol.toUpperCase()}:${exchange || 'NASDAQ'}`
}

// OpenWebNinja is paid-only — there is no keyless mode. If we boot without
// the env var, register that explicitly so /api/health.credentialHealth
// shows it as `missing` instead of `unknown`.
if (!PROVIDERS.own) recordKeyMissing('own')

/** Core fetcher — x-api-key (lowercase) as per OAS 3.0.3 docs */
export async function ownFetch(endpoint: string, params: Record<string, string> = {}) {
  if (!PROVIDERS.own) return null
  const url = new URL(`${OWN_BASE}/${endpoint}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  if (!params.language) url.searchParams.set('language', 'en')
  const res = await fetch(url.toString(), {
    headers: { 'x-api-key': PROVIDERS.own },
    next: { revalidate: 60 },
  })
  if (!res.ok) {
    // Mirror the Census pattern: surface upstream credential rejection to the
    // central credential-health registry so silent key failures are visible
    // on /api/health and as a structured error log, not just a per-request
    // exception that gets swallowed by the waterfall.
    if (res.status === 401 || res.status === 403) {
      recordKeyRejection('own', `OpenWebNinja /${endpoint} HTTP ${res.status} (key rejected)`)
    }
    throw new Error(`OWN /${endpoint} HTTP ${res.status}`)
  }
  const data = await res.json()
  if (data?.message === 'Unauthorized') {
    recordKeyRejection('own', `OpenWebNinja /${endpoint} returned "Unauthorized" body — OPENWEBNINJA_API_KEY rejected`)
    throw new Error('OWN: Unauthorized — check OPENWEBNINJA_API_KEY')
  }
  recordKeyAccepted('own')
  return data
}

// ─── Quote ───────────────────────────────────────────────────────────────────

/** Real-time stock/index/ETF/crypto quote — Google Finance source */
export async function ownQuote(symbol: string, exchange?: string) {
  const data = await ownFetch('stock-quote', { symbol: ownSymbol(symbol, exchange) })
  const q = data?.data
  if (!q?.price) return null
  return {
    symbol:                 q.symbol,
    name:                   q.name,
    type:                   q.type,
    price:                  q.price,
    open:                   q.open,
    high:                   q.high,
    low:                    q.low,
    volume:                 q.volume,
    prevClose:              q.previous_close,
    change:                 q.change,
    changePct:              q.change_percent,
    prePostMarket:          q.pre_or_post_market,
    prePostMarketChange:    q.pre_or_post_market_change,
    prePostMarketChangePct: q.pre_or_post_market_change_percent,
    currency:               q.currency,
    exchange:               q.exchange,
    exchangeOpen:           q.exchange_open,
    exchangeClose:          q.exchange_close,
    timezone:               q.timezone,
    countryCode:            q.country_code,
    lastUpdate:             q.last_update_utc,
    googleMid:              q.google_mid,
    source:                 'openwebninja',
  }
}

/** Yahoo Finance quote — use for symbols where :EXCHANGE is unknown */
export async function ownQuoteYahoo(symbol: string) {
  // No :EXCHANGE needed — Yahoo uses bare tickers (AAPL, TSLA, etc.)
  const data = await ownFetch('stock-quote-yahoo', { symbol: symbol.toUpperCase() })
  const q = data?.data
  if (!q?.price) return null
  return { ...q, source: 'openwebninja-yahoo' }
}

// ─── Time Series / Chart ──────────────────────────────────────────────────────

/** Chart bars with key events overlay */
export async function ownTimeSeries(symbol: string, period = '1M', exchange?: string) {
  const data = await ownFetch('stock-time-series', {
    symbol: ownSymbol(symbol, exchange),
    period,  // 1D | 5D | 1M | 6M | YTD | 1Y | 5Y | MAX
  })
  const d = data?.data
  if (!d?.time_series) return null
  const bars = Object.entries(d.time_series).map(([ts, v]: [string, any]) => ({
    t: new Date(ts).getTime(), c: v.price, ch: v.change, chPct: v.change_percent, v: v.volume ?? null,
  })).sort((a, b) => a.t - b.t)
  return {
    symbol:    d.symbol, price: d.price, prevClose: d.previous_close,
    change:    d.change, changePct: d.change_percent,
    period:    d.period, intervalSec: d.interval_sec,
    bars,      keyEvents: d.key_events || [],
    source:    'openwebninja',
  }
}

/** Yahoo Finance time series (bare tickers, no :EXCHANGE) */
export async function ownTimeSeriesYahoo(symbol: string, period = '1M') {
  const data = await ownFetch('stock-time-series-yahoo', { symbol: symbol.toUpperCase(), period })
  const d = data?.data
  if (!d?.time_series) return null
  const bars = Object.entries(d.time_series).map(([ts, v]: [string, any]) => ({
    t: new Date(ts).getTime(), c: v.price, ch: v.change, chPct: v.change_percent, v: v.volume ?? null,
  })).sort((a, b) => a.t - b.t)
  return { ...d, bars, source: 'openwebninja-yahoo' }
}

// ─── News ─────────────────────────────────────────────────────────────────────

export async function ownNews(symbol: string, exchange?: string) {
  const data = await ownFetch('stock-news', { symbol: ownSymbol(symbol, exchange) })
  const articles = data?.data
  return Array.isArray(articles) ? articles.map((a: any) => ({
    title:       a.article_title,
    url:         a.article_url,
    image:       a.article_photo_url,
    source:      a.source,
    publishedAt: a.post_time_utc,
    dataSource:  'openwebninja',
  })) : null
}

// ─── Fundamentals ─────────────────────────────────────────────────────────────

export async function ownOverview(symbol: string, exchange?: string) {
  const data = await ownFetch('stock-overview', { symbol: ownSymbol(symbol, exchange) })
  return data?.data || null
}

export async function ownIncomeStatement(symbol: string, exchange?: string) {
  const data = await ownFetch('stock-income-statement', { symbol: ownSymbol(symbol, exchange) })
  return Array.isArray(data?.data) ? data.data : null
}

export async function ownBalanceSheet(symbol: string, exchange?: string) {
  const data = await ownFetch('stock-balance-sheet', { symbol: ownSymbol(symbol, exchange) })
  return Array.isArray(data?.data) ? data.data : null
}

export async function ownCashFlow(symbol: string, exchange?: string) {
  const data = await ownFetch('stock-cash-flow', { symbol: ownSymbol(symbol, exchange) })
  return Array.isArray(data?.data) ? data.data : null
}

// ─── Market Trends ────────────────────────────────────────────────────────────

export type OwnTrendType = 'MARKET_INDEXES' | 'MOST_ACTIVE' | 'GAINERS' | 'LOSERS' | 'CRYPTO' | 'CURRENCIES' | 'CLIMATE_LEADERS'

export async function ownMarketTrends(trend_type: OwnTrendType = 'GAINERS', country = 'us') {
  const data = await ownFetch('market-trends', { trend_type, country })
  return data?.data?.trends || null
}

// ─── Forex / Currency ─────────────────────────────────────────────────────────

export async function ownForex(from: string, to: string) {
  const data = await ownFetch('currency-exchange-rate', { from_symbol: from, to_symbol: to })
  const d = data?.data
  if (!d?.exchange_rate) return null
  return {
    from:       d.from_symbol,
    to:         d.to_symbol,
    rate:       d.exchange_rate,
    prevClose:  d.previous_close,
    lastUpdate: d.last_update_utc,
    source:     'openwebninja',
  }
}

export async function ownForexTimeSeries(from: string, to: string, period = '1M') {
  const data = await ownFetch('currency-time-series', { from_symbol: from, to_symbol: to, period })
  return data?.data || null
}

export async function ownCurrencyNews(from: string, to: string) {
  const data = await ownFetch('currency-news', { from_symbol: from, to_symbol: to })
  return data?.data || null
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function ownSearch(query: string) {
  const data = await ownFetch('search', { query })
  const d = data?.data
  if (!d) return null
  // Flatten all asset types into a single array
  const all = [
    ...(d.stock        || []),
    ...(d.ETF          || []),
    ...(d.index        || []),
    ...(d.mutual_fund  || []),
    ...(d.currency     || []),
    ...(d.futures      || []),
  ]
  return all.map((r: any) => ({
    symbol:    r.symbol,
    name:      r.name,
    type:      r.type,
    price:     r.price,
    change:    r.change,
    changePct: r.change_percent,
    exchange:  r.exchange || '',
    currency:  r.currency || '',
    country:   r.country_code || '',
    source:    'openwebninja',
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Twelve Data — global equities/ETFs/FX/crypto/indices, REST + WebSocket
// Slots into the QUOTE waterfall after Yahoo, before EODHD.
// Docs: https://twelvedata.com/docs#quote
// ─────────────────────────────────────────────────────────────────────────────
const TD_BASE = 'https://api.twelvedata.com'

async function tdFetch(path: string, params: Record<string, string> = {}) {
  if (!PROVIDERS.twelvedata) return null
  const url = new URL(`${TD_BASE}${path}`)
  url.searchParams.set('apikey', PROVIDERS.twelvedata)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { next: { revalidate: 60 } })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      recordKeyRejection('twelvedata', `TwelveData ${path} HTTP ${res.status} (key rejected)`)
    }
    throw new Error(`TwelveData ${path} HTTP ${res.status}`)
  }
  const data = await res.json()
  if (data?.status === 'error') {
    // TwelveData returns 200 with `{ status:"error", code:401, message:"You have entered an invalid API key" }`
    // on a bad/expired key — classic silent rejection that the previous
    // code threw past without recording.
    const code = Number(data.code) || 0
    if (code === 401 || code === 403 || /api ?key/i.test(String(data.message || ''))) {
      recordKeyRejection('twelvedata', `TwelveData ${path} body code=${code}: ${data.message}`)
    }
    throw new Error(`TwelveData: ${data.message}`)
  }
  recordKeyAccepted('twelvedata')
  return data
}

export async function twelvedataQuote(symbol: string) {
  const q = await tdFetch('/quote', { symbol })
  if (!q?.close) return null
  const price = parseFloat(q.close)
  const prev  = parseFloat(q.previous_close)
  return {
    symbol,
    price,
    change:    parseFloat(q.change)         || (price - prev),
    changePct: parseFloat(q.percent_change) || ((price - prev) / prev * 100),
    open:      parseFloat(q.open),
    high:      parseFloat(q.high),
    low:       parseFloat(q.low),
    prevClose: prev,
    volume:    parseInt(q.volume) || 0,
    avgVolume: parseInt(q.average_volume) || 0,
    yearHigh:  parseFloat(q.fifty_two_week?.high),
    yearLow:   parseFloat(q.fifty_two_week?.low),
    name:      q.name || symbol,
    exchange:  q.exchange || '',
    currency:  q.currency || 'USD',
    source:    'twelvedata',
  }
}

export async function twelvedataTimeSeries(symbol: string, interval = '1day', outputsize = 100) {
  const data = await tdFetch('/time_series', { symbol, interval, outputsize: String(outputsize) })
  if (!Array.isArray(data?.values)) return null
  return data.values.map((v: any) => ({
    t: new Date(v.datetime).getTime(),
    o: parseFloat(v.open), h: parseFloat(v.high),
    l: parseFloat(v.low),  c: parseFloat(v.close),
    v: parseInt(v.volume) || 0,
  })).sort((a: any, b: any) => a.t - b.t)
}

// ─────────────────────────────────────────────────────────────────────────────
// Financial Datasets — AI-friendly fundamentals (16k+ US tickers, 30 yrs)
// Slots into the FINANCIALS waterfall after FMP, before EODHD.
// Docs: https://docs.financialdatasets.ai/
// ─────────────────────────────────────────────────────────────────────────────
const FD_BASE = 'https://api.financialdatasets.ai'

async function fdFetch(path: string, params: Record<string, string> = {}) {
  if (!PROVIDERS.financialdatasets) return null
  const url = new URL(`${FD_BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: { 'X-API-KEY': PROVIDERS.financialdatasets },
    next: { revalidate: 3600 },
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      recordKeyRejection('financialdatasets', `FinancialDatasets ${path} HTTP ${res.status} (key rejected)`)
    }
    throw new Error(`FinancialDatasets ${path} HTTP ${res.status}`)
  }
  recordKeyAccepted('financialdatasets')
  return res.json()
}

export async function financialDatasetsIncome(symbol: string, period: 'annual' | 'quarterly' = 'annual', limit = 4) {
  const data = await fdFetch('/financials/income-statements', { ticker: symbol, period, limit: String(limit) })
  // Map to FMP-compatible shape so existing route code can consume it
  return (data?.income_statements || []).map((r: any) => ({
    date: r.report_period || r.fiscal_period_end_date,
    revenue: r.revenue, grossProfit: r.gross_profit,
    grossProfitRatio: r.revenue ? r.gross_profit / r.revenue : null,
    ebitda: r.ebitda, ebitdaratio: r.revenue ? r.ebitda / r.revenue : null,
    operatingIncome: r.operating_income,
    operatingIncomeRatio: r.revenue ? r.operating_income / r.revenue : null,
    netIncome: r.net_income,
    netIncomeRatio: r.revenue ? r.net_income / r.revenue : null,
    eps: r.earnings_per_share, epsdiluted: r.earnings_per_share_diluted,
    weightedAverageShsOutDil: r.weighted_average_shares_diluted,
    costOfRevenue: r.cost_of_revenue,
    operatingExpenses: r.operating_expense,
    interestExpense: r.interest_expense,
    incomeTaxExpense: r.income_tax_expense,
    researchAndDevelopmentExpenses: r.research_and_development,
    sellingGeneralAndAdministrativeExpenses: r.selling_general_and_administrative_expenses,
    depreciationAndAmortization: r.depreciation_and_amortization,
    reportedCurrency: r.currency || 'USD',
    source: 'financialdatasets',
  }))
}

export async function financialDatasetsBalanceSheet(symbol: string, period: 'annual' | 'quarterly' = 'annual', limit = 4) {
  const data = await fdFetch('/financials/balance-sheets', { ticker: symbol, period, limit: String(limit) })
  return (data?.balance_sheets || []).map((r: any) => ({
    date: r.report_period || r.fiscal_period_end_date,
    totalAssets: r.total_assets,
    cashAndCashEquivalents: r.cash_and_equivalents,
    cashAndShortTermInvestments: r.cash_and_short_term_investments,
    netReceivables: r.trade_and_non_trade_receivables,
    inventory: r.inventory,
    totalCurrentAssets: r.current_assets,
    propertyPlantEquipmentNet: r.property_plant_and_equipment,
    goodwill: r.goodwill,
    intangibleAssets: r.intangible_assets,
    totalLiabilities: r.total_liabilities,
    totalCurrentLiabilities: r.current_liabilities,
    shortTermDebt: r.current_debt,
    longTermDebt: r.non_current_debt,
    totalDebt: r.total_debt,
    netDebt: (r.total_debt ?? 0) - (r.cash_and_equivalents ?? 0),
    totalStockholdersEquity: r.shareholders_equity,
    retainedEarnings: r.retained_earnings,
    reportedCurrency: r.currency || 'USD',
    source: 'financialdatasets',
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// FinanceFlow — real-time news + sentiment, US-focused
// Slots into the NEWS waterfall after FMP.
// Docs: https://financeflow.io/docs (Bearer auth)
// ─────────────────────────────────────────────────────────────────────────────
export async function financeflowNews(symbol?: string, limit = 30) {
  if (!PROVIDERS.financeflow) return null
  const url = new URL('https://api.financeflow.io/v1/news')
  if (symbol) url.searchParams.set('symbol', symbol)
  url.searchParams.set('limit', String(limit))
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${PROVIDERS.financeflow}` },
    next: { revalidate: 300 },
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      recordKeyRejection('financeflow', `FinanceFlow news HTTP ${res.status} (bearer rejected)`)
    }
    throw new Error(`FinanceFlow news HTTP ${res.status}`)
  }
  recordKeyAccepted('financeflow')
  const data = await res.json()
  const items = data?.news || data?.articles || data?.data || (Array.isArray(data) ? data : [])
  return items.map((it: any) => ({
    id:          it.id || it.url,
    title:       it.title || it.headline || '',
    summary:     (it.summary || it.description || it.content || '').slice(0, 500),
    url:         it.url || it.link || '',
    source:      it.source || it.publisher || 'FinanceFlow',
    publishedAt: it.published_at || it.publishedAt || it.date || '',
    sentiment:   it.sentiment || it.sentiment_score || null,
    tickers:     it.tickers || it.symbols || (it.symbol ? [it.symbol] : []),
    image:       it.image || it.image_url || null,
    dataSource:  'financeflow',
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Thin keyed-fetch wrappers for providers that didn't previously have one
// ─────────────────────────────────────────────────────────────────────────────
// These exist primarily so every paid-key provider runs through the
// credential-health surface (`recordKeyRejection` / `recordKeyAccepted`).
// Routes that already make ad-hoc fetches against these providers can migrate
// to the wrappers over time; for now `/api/health` exercises each wrapper so
// `/api/health.credentialHealth.providers` lists every paid provider with an
// up-to-date `state` (ok | rejected | missing).
//
// Each wrapper:
//   1. Returns null if no key is configured (no rejection signal — the
//      module-load `recordKeyMissing` already marked it `missing`).
//   2. On 401/403 records a structured rejection and rethrows.
//   3. On 2xx records acceptance and returns the parsed JSON body.
// ─────────────────────────────────────────────────────────────────────────────

interface ProviderProbeOk { ok: true; status: number; data: any }

interface ProbeOpts {
  /**
   * If true, suppress the automatic `recordKeyAccepted(...)` call on a 2xx
   * response — the caller will inspect the body for provider-specific
   * 200-with-auth-error envelopes (e.g. FMP `{ "Error Message": "Invalid
   * API KEY" }`) and call `recordKeyAccepted` itself only after that
   * check. This preserves one-shot rejection logging: without it, a 200+
   * auth-error body would oscillate `ok -> rejected` on every call,
   * resetting the `loggedOnce` latch and re-paging on each request.
   */
  deferAcceptance?: boolean
}

async function probeKeyed(
  providerName: string,
  url: string,
  init: RequestInit,
  reasonLabel: string,
  opts: ProbeOpts = {},
): Promise<ProviderProbeOk> {
  const res = await fetch(url, { ...init, cache: 'no-store' })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      recordKeyRejection(providerName, `${reasonLabel} HTTP ${res.status} (key rejected)`)
    }
    throw new Error(`${reasonLabel} HTTP ${res.status}`)
  }
  let data: any = null
  try { data = await res.json() } catch { /* non-JSON body — still healthy */ }
  if (!opts.deferAcceptance) recordKeyAccepted(providerName)
  return { ok: true, status: res.status, data }
}

/** Financial Modeling Prep — apikey query param. */
export async function fmpFetch(path: string, params: Record<string, string> = {}) {
  if (!PROVIDERS.fmp) return null
  const url = new URL(`https://financialmodelingprep.com${path.startsWith('/') ? path : '/' + path}`)
  url.searchParams.set('apikey', PROVIDERS.fmp)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  // Defer acceptance until after the body-shape auth check below. FMP
  // sometimes returns HTTP 200 with `{ "Error Message": "Invalid API
  // KEY..." }`; without deferral, the auto-accept inside `probeKeyed`
  // would flip state to `ok` and the subsequent rejection would re-fire
  // the `loggedOnce` one-shot log on every single request.
  const r = await probeKeyed(
    'fmp', url.toString(), { next: { revalidate: 300 } },
    `FMP ${path}`, { deferAcceptance: true },
  )
  const body = r.data
  if (body && typeof body === 'object' && !Array.isArray(body)
      && (body['Error Message'] || body['error message'])) {
    const msg = String(body['Error Message'] || body['error message'])
    if (/api ?key|unauthor|forbidden/i.test(msg)) {
      recordKeyRejection('fmp', `FMP ${path} body: ${msg}`)
      throw new Error(msg)
    }
  }
  recordKeyAccepted('fmp')
  return body
}

/** EODHD — api_token query param. */
export async function eodhdFetch(path: string, params: Record<string, string> = {}) {
  if (!PROVIDERS.eodhd) return null
  const url = new URL(`https://eodhd.com${path.startsWith('/') ? path : '/' + path}`)
  url.searchParams.set('api_token', PROVIDERS.eodhd)
  if (!params.fmt) url.searchParams.set('fmt', 'json')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const r = await probeKeyed('eodhd', url.toString(), { next: { revalidate: 300 } }, `EODHD ${path}`)
  return r.data
}

/** Finnhub — token query param. */
export async function finnhubFetch(path: string, params: Record<string, string> = {}) {
  if (!PROVIDERS.finnhub) return null
  const url = new URL(`https://finnhub.io${path.startsWith('/') ? path : '/' + path}`)
  url.searchParams.set('token', PROVIDERS.finnhub)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return (await probeKeyed('finnhub', url.toString(), { next: { revalidate: 60 } }, `Finnhub ${path}`)).data
}

/** FRED — api_key query param. */
export async function fredFetch(path: string, params: Record<string, string> = {}) {
  if (!PROVIDERS.fred) return null
  const url = new URL(`https://api.stlouisfed.org${path.startsWith('/') ? path : '/' + path}`)
  url.searchParams.set('api_key', PROVIDERS.fred)
  url.searchParams.set('file_type', 'json')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  // FRED returns HTTP 400 (not 401) with `error_code:400` when the key is
  // invalid, but it also returns 400 for malformed requests. To stay
  // conservative we only record rejection on a 4xx that comes back with a
  // body string mentioning the key.
  const res = await fetch(url.toString(), { next: { revalidate: 300 }, cache: 'no-store' })
  if (!res.ok) {
    let body = ''
    try { body = await res.text() } catch {}
    if (res.status === 401 || res.status === 403
        || /api[_ ]?key.*not (registered|valid)/i.test(body)
        || /invalid.*api[_ ]?key/i.test(body)) {
      recordKeyRejection('fred', `FRED ${path} HTTP ${res.status}: ${body.slice(0, 120)}`)
    }
    throw new Error(`FRED ${path} HTTP ${res.status}`)
  }
  recordKeyAccepted('fred')
  return res.json()
}

/** SEC EDGAR (sec-api.io) — token in URL or POST body. */
export async function secApiFetch(path: string, init: RequestInit = {}) {
  if (!PROVIDERS.sec) return null
  // sec-api.io accepts the token as the `token` query param on every endpoint
  const sep = path.includes('?') ? '&' : '?'
  const url = `https://api.sec-api.io${path.startsWith('/') || path === '' ? path : '/' + path}${sep}token=${encodeURIComponent(PROVIDERS.sec)}`
  return (await probeKeyed('sec', url, { ...init, next: { revalidate: 300 } }, `SEC ${path || '/'}`)).data
}

/** CoreSignal — `apikey` header. */
export async function coresignalFetch(path: string, init: RequestInit = {}) {
  if (!PROVIDERS.coresignal) return null
  const url = `https://api.coresignal.com${path.startsWith('/') ? path : '/' + path}`
  const headers = { ...(init.headers || {}), apikey: PROVIDERS.coresignal } as Record<string, string>
  return (await probeKeyed('coresignal', url, { ...init, headers, next: { revalidate: 600 } }, `CoreSignal ${path}`)).data
}

// ─────────────────────────────────────────────────────────────────────────────
// Databento — institutional-grade historical market data
// ─────────────────────────────────────────────────────────────────────────────
// Auth:    HTTP Basic (api key as username, empty password)
// Hist:    https://hist.databento.com/v0  (timeseries / metadata)
// Docs:    https://databento.com/docs/api-reference-historical
// Pricing: int64 fields scaled by 1e-9 (i.e. $1.00 = 1_000_000_000)
const DATABENTO_HIST_BASE = 'https://hist.databento.com'
const DATABENTO_PRICE_SCALE = 1_000_000_000 // 1e-9 fixed-point → divide by this for USD
// Default to Nasdaq ITCH which covers most large-cap tech tickers (AAPL,
// MSFT, NVDA, GOOGL, META…). Override with `DATABENTO_DATASET` to point
// at NYSE (XNYS.PILLAR), consolidated US equities (EQUS.MINI), options
// (OPRA.PILLAR), or futures.
const DATABENTO_DATASET = process.env.DATABENTO_DATASET || 'XNAS.ITCH'

/** Databento — Basic auth (key as username). Returns parsed JSON for
 * metadata-style endpoints. For binary / NDJSON timeseries data use the
 * dedicated functions below (`databentoOhlcv`, `databentoQuote`). */
export async function databentoFetch(path: string, init: RequestInit = {}) {
  if (!PROVIDERS.databento) return null
  const url = `${DATABENTO_HIST_BASE}${path.startsWith('/') ? path : '/' + path}`
  const basic = Buffer.from(PROVIDERS.databento + ':').toString('base64')
  const headers = { ...(init.headers || {}), Authorization: `Basic ${basic}` } as Record<string, string>
  return (await probeKeyed('databento', url, { ...init, headers, next: { revalidate: 600 } }, `Databento ${path}`)).data
}

/**
 * Pull recent daily OHLCV bars for a single US equity from Databento.
 * Uses NDJSON encoding so we can parse line-by-line without depending on
 * the (binary) DBN format. Returns the bars sorted oldest → newest, with
 * prices already converted from 1e-9 fixed-point to USD floats.
 */
export async function databentoOhlcv(
  symbol: string,
  opts: { dataset?: string; lookbackDays?: number } = {},
): Promise<Array<{ ts: string; open: number; high: number; low: number; close: number; volume: number }> | null> {
  if (!PROVIDERS.databento) return null
  const dataset = opts.dataset || DATABENTO_DATASET
  const lookback = opts.lookbackDays ?? 10
  const end = new Date()
  const start = new Date(end.getTime() - lookback * 24 * 60 * 60 * 1000)

  const url = new URL(`${DATABENTO_HIST_BASE}/v0/timeseries.get_range`)
  url.searchParams.set('dataset',  dataset)
  url.searchParams.set('symbols',  symbol.toUpperCase())
  url.searchParams.set('schema',   'ohlcv-1d')
  url.searchParams.set('start',    start.toISOString().slice(0, 10))
  url.searchParams.set('end',      end.toISOString().slice(0, 10))
  url.searchParams.set('encoding', 'json')
  url.searchParams.set('stype_in', 'raw_symbol')

  const basic = Buffer.from(PROVIDERS.databento + ':').toString('base64')
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' },
    next: { revalidate: 300 },
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      recordKeyRejection('databento', `Databento ohlcv-1d ${dataset} HTTP ${res.status} (key rejected)`)
    }
    // 404 / 422 typically mean "symbol not in this dataset" or "no data
    // in window" — the waterfall should move on quietly, not surface a
    // credential rejection.
    if (res.status >= 400 && res.status !== 401 && res.status !== 403) return null
    throw new Error(`Databento ohlcv-1d ${dataset} HTTP ${res.status}`)
  }
  recordKeyAccepted('databento')
  const text = await res.text()
  if (!text.trim()) return []
  const bars: Array<{ ts: string; open: number; high: number; low: number; close: number; volume: number }> = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let row: any
    try { row = JSON.parse(trimmed) } catch { continue }
    // Schema: { hd:{ts_event,…}, open, high, low, close, volume }
    if (typeof row.close !== 'number' && typeof row.close !== 'string') continue
    const open  = Number(row.open)  / DATABENTO_PRICE_SCALE
    const high  = Number(row.high)  / DATABENTO_PRICE_SCALE
    const low   = Number(row.low)   / DATABENTO_PRICE_SCALE
    const close = Number(row.close) / DATABENTO_PRICE_SCALE
    if (!Number.isFinite(close) || close <= 0) continue
    bars.push({
      ts:     row.hd?.ts_event || row.ts_event || '',
      open, high, low, close,
      volume: Number(row.volume) || 0,
    })
  }
  // Endpoint returns ascending by ts_event but normalise to be safe.
  return bars.sort((a, b) => a.ts.localeCompare(b.ts))
}

/**
 * Latest quote built from Databento's most recent daily bar. This is
 * the historical API, so the price reflects the last completed session
 * (Databento Live / WebSocket is required for sub-second real-time and
 * is not exposed here). Returns null when the symbol isn't covered by
 * the configured dataset so the upstream waterfall keeps walking.
 */
export async function databentoQuote(symbol: string) {
  const bars = await databentoOhlcv(symbol)
  if (!bars || bars.length === 0) return null
  const latest = bars[bars.length - 1]
  const prev   = bars.length >= 2 ? bars[bars.length - 2] : null
  const prevClose = prev?.close ?? latest.open
  const change    = latest.close - prevClose
  const changePct = prevClose ? (change / prevClose) * 100 : 0
  return {
    symbol:    symbol.toUpperCase(),
    price:     latest.close,
    change:    parseFloat(change.toFixed(4)),
    changePct: parseFloat(changePct.toFixed(4)),
    open:      latest.open,
    high:      latest.high,
    low:       latest.low,
    prevClose,
    volume:    latest.volume,
    timestamp: latest.ts,
    dataset:   DATABENTO_DATASET,
    source:    'databento',
    feed:      'historical-eod',
  }
}

/** Fiscal.ai — Bearer token. */
export async function fiscalaiFetch(path: string, init: RequestInit = {}) {
  if (!PROVIDERS.fiscalai) return null
  const url = `https://api.fiscal.ai${path.startsWith('/') ? path : '/' + path}`
  const headers = { ...(init.headers || {}), Authorization: `Bearer ${PROVIDERS.fiscalai}` } as Record<string, string>
  return (await probeKeyed('fiscalai', url, { ...init, headers, next: { revalidate: 600 } }, `Fiscal.ai ${path}`)).data
}

// ─────────────────────────────────────────────────────────────────────────────
// Alpaca Markets — real-time US equities (IEX on paper/free, SIP on paid)
// ─────────────────────────────────────────────────────────────────────────────
// Auth:    APCA-API-KEY-ID  +  APCA-API-SECRET-KEY  request headers
// Data:    https://data.alpaca.markets/v2  (market data — quotes, bars, trades)
// Trading: https://paper-api.alpaca.markets/v2  (account/positions/orders — not used here)
// Docs:    https://docs.alpaca.markets/reference
const ALPACA_DATA_BASE = 'https://data.alpaca.markets'

/**
 * Bare HTTP call to the Alpaca Market Data API. Returns a tagged
 * outcome so callers that fan out multiple parallel requests can
 * aggregate credential-health into a single signal (avoiding the
 * accept-vs-reject race when one endpoint 200s and another 401s on
 * the same key pair). For one-shot callers, prefer `alpacaFetch`
 * which records health inline.
 */
type AlpacaResult = {
  ok: boolean
  status: number
  data: any | null
  isAuthFailure: boolean
  missingCreds: boolean
}
async function alpacaFetchRaw(path: string, params: Record<string, string> = {}): Promise<AlpacaResult> {
  if (!PROVIDERS.alpaca || !PROVIDERS.alpacaSecret) {
    return { ok: false, status: 0, data: null, isAuthFailure: false, missingCreds: true }
  }
  const url = new URL(`${ALPACA_DATA_BASE}${path.startsWith('/') ? path : '/' + path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: {
      'APCA-API-KEY-ID':     PROVIDERS.alpaca,
      'APCA-API-SECRET-KEY': PROVIDERS.alpacaSecret,
      'Accept':              'application/json',
    },
    next: { revalidate: 30 },
  })
  const isAuthFailure = res.status === 401 || res.status === 403
  if (!res.ok) {
    return { ok: false, status: res.status, data: null, isAuthFailure, missingCreds: false }
  }
  return { ok: true, status: res.status, data: await res.json(), isAuthFailure: false, missingCreds: false }
}

/**
 * Generic keyed fetch for the Alpaca Market Data API.
 * Returns null if either credential half is missing — `recordKeyMissing`
 * already covers the "not configured" case at module load.
 */
export async function alpacaFetch(path: string, params: Record<string, string> = {}) {
  const r = await alpacaFetchRaw(path, params)
  if (r.missingCreds) return null
  if (r.isAuthFailure) {
    recordKeyRejection('alpaca', `Alpaca ${path} HTTP ${r.status} (key pair rejected)`)
  }
  if (!r.ok) {
    throw new Error(`Alpaca ${path} HTTP ${r.status}`)
  }
  recordKeyAccepted('alpaca')
  return r.data
}

/**
 * Latest NBBO quote + last trade for a single US equity symbol.
 * Paper / free-tier accounts get the IEX feed only (set via `feed=iex`),
 * which still gives a real-time bid/ask but reflects only IEX-routed
 * activity. Paid accounts can omit the feed param to get the full SIP feed.
 *
 * Returns null when no quote is available (off-hours symbols, illiquid
 * tickers, etc.) so the upstream waterfall moves on cleanly.
 */
export async function alpacaQuote(symbol: string) {
  const sym = symbol.toUpperCase()
  // Fetch latest quote + latest trade in parallel — quote gives bid/ask,
  // trade gives the most recent print which we use as `price`. We use
  // `alpacaFetchRaw` (not `alpacaFetch`) so we can aggregate the two
  // outcomes into a single credential-health signal afterwards. With
  // the inline-recording variant, two parallel calls would race —
  // a 200 on /quotes and a 401 on /trades against the same key pair
  // could land an `accept` after a `reject`, flapping the health
  // status to `ok` despite a real partial-auth failure.
  const [quoteRes, tradeRes] = await Promise.all([
    alpacaFetchRaw(`/v2/stocks/${encodeURIComponent(sym)}/quotes/latest`, { feed: 'iex' }),
    alpacaFetchRaw(`/v2/stocks/${encodeURIComponent(sym)}/trades/latest`, { feed: 'iex' }),
  ])

  // Aggregate credential health: reject-wins-over-accept. A 401/403
  // on either endpoint means the key pair is invalid for at least
  // part of the data API, which is the operator-action-required
  // signal. Only mark accepted when neither call reported auth
  // failure AND at least one returned 200 — a pair of network
  // errors should leave health state untouched.
  if (!quoteRes.missingCreds && !tradeRes.missingCreds) {
    if (quoteRes.isAuthFailure || tradeRes.isAuthFailure) {
      recordKeyRejection(
        'alpaca',
        `Alpaca quote/trade HTTP ${quoteRes.status}/${tradeRes.status} (key pair rejected)`,
      )
    } else if (quoteRes.ok || tradeRes.ok) {
      recordKeyAccepted('alpaca')
    }
  }

  const quote = quoteRes.ok ? quoteRes.data : null
  const trade = tradeRes.ok ? tradeRes.data : null
  if (!quote && !trade) return null

  const q = quote?.quote ?? null
  const t = trade?.trade ?? null
  // Mid-price is the cleanest single number when both bid and ask exist;
  // otherwise fall back to the last trade price.
  const bid = typeof q?.bp === 'number' ? q.bp : null
  const ask = typeof q?.ap === 'number' ? q.ap : null
  const last = typeof t?.p === 'number' ? t.p : null
  const mid = bid && ask ? (bid + ask) / 2 : null
  const price = last ?? mid
  if (!price) return null

  // Pull yesterday's close to compute change/changePct in a single
  // additional call. The daily-bar endpoint is cheap and well-cached.
  let prevClose = 0, change = 0, changePct = 0
  try {
    const yesterday = new Date()
    yesterday.setUTCDate(yesterday.getUTCDate() - 5) // span weekends/holidays
    const start = yesterday.toISOString().slice(0, 10)
    const bars = await alpacaFetch(`/v2/stocks/${encodeURIComponent(sym)}/bars`, {
      timeframe: '1Day', start, limit: '5', adjustment: 'raw', feed: 'iex',
    })
    const series: Array<{ c: number; t: string }> = bars?.bars ?? []
    if (series.length >= 2) {
      prevClose = series[series.length - 2].c
      change    = price - prevClose
      changePct = prevClose ? (change / prevClose) * 100 : 0
    }
  } catch { /* non-fatal — change is just nice-to-have */ }

  return {
    symbol:    sym,
    price,
    change:    parseFloat(change.toFixed(4)),
    changePct: parseFloat(changePct.toFixed(4)),
    bid:       bid ?? 0,
    ask:       ask ?? 0,
    bidSize:   typeof q?.bs === 'number' ? q.bs : 0,
    askSize:   typeof q?.as === 'number' ? q.as : 0,
    open:      0,
    high:      0,
    low:       0,
    prevClose,
    volume:    typeof t?.s === 'number' ? t.s : 0,
    timestamp: t?.t || q?.t || new Date().toISOString(),
    source:    'alpaca',
    feed:      'iex',
  }
}

/** 21st.dev — Bearer token. */
export async function twentyfirstFetch(path: string, init: RequestInit = {}) {
  if (!PROVIDERS.twentyfirst) return null
  const url = `https://api.21st.dev${path.startsWith('/') ? path : '/' + path}`
  const headers = { ...(init.headers || {}), Authorization: `Bearer ${PROVIDERS.twentyfirst}` } as Record<string, string>
  return (await probeKeyed('twentyfirst', url, { ...init, headers, next: { revalidate: 600 } }, `21st.dev ${path}`)).data
}
