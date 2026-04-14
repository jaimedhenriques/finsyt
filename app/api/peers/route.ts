import { NextRequest, NextResponse } from 'next/server'

const FMP     = process.env.FMP_API_KEY || ''
const FINNHUB = process.env.FINNHUB_API_KEY || ''
const EODHD   = process.env.EODHD_API_KEY || process.env.eodhd_api || ''

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const symbol = sp.get('symbol')?.toUpperCase()

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  try {
    // FMP: peers + detailed comparison
    if (FMP) {
      const [peersRes, profileRes] = await Promise.all([
        fetch(`https://financialmodelingprep.com/stable/stock-peers?symbol=${symbol}&apikey=${FMP}`),
        fetch(`https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${FMP}`),
      ])
      const [peersData, profileData] = await Promise.all([peersRes.json(), profileRes.json()])

      const peerSymbols: string[] = peersData?.peersList || []
      const mainProfile = Array.isArray(profileData) ? profileData[0] : profileData

      if (peerSymbols.length > 0) {
        // Fetch profile for all peers in parallel
        const peerProfiles = await Promise.all(
          peerSymbols.slice(0, 8).map(async (sym: string) => {
            try {
              const [profRes, ratioRes] = await Promise.all([
                fetch(`https://financialmodelingprep.com/stable/profile?symbol=${sym}&apikey=${FMP}`),
                fetch(`https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=${sym}&apikey=${FMP}`),
              ])
              const [prof, ratios] = await Promise.all([profRes.json(), ratioRes.json()])
              const p = Array.isArray(prof) ? prof[0] : prof
              const r = Array.isArray(ratios) ? ratios[0] : ratios
              return {
                symbol:       sym,
                name:         p?.companyName,
                price:        p?.price,
                marketCap:    p?.mktCap,
                pe:           p?.pe || r?.peRatioTTM,
                evEbitda:     r?.evToEbitdaTTM,
                revenueGrowth:r?.revenuePerShareTTM,
                netMargin:    p?.netProfitMargin || r?.netIncomePerShareTTM,
                roe:          r?.roeTTM,
                beta:         p?.beta,
                divYield:     p?.lastDiv ? (p.lastDiv * 4 / p.price * 100) : null,
              }
            } catch { return null }
          })
        )

        const main = {
          symbol,
          name:      mainProfile?.companyName,
          price:     mainProfile?.price,
          marketCap: mainProfile?.mktCap,
          pe:        mainProfile?.pe,
          beta:      mainProfile?.beta,
          sector:    mainProfile?.sector,
          industry:  mainProfile?.industry,
        }

        return NextResponse.json({
          symbol,
          main,
          peers: peerProfiles.filter(Boolean),
          source: 'fmp',
        })
      }
    }

    // Finnhub peer list
    if (FINNHUB) {
      const res = await fetch(`https://finnhub.io/api/v1/stock/peers?symbol=${symbol}&token=${FINNHUB}`)
      const peers = await res.json()
      return NextResponse.json({ symbol, peerSymbols: Array.isArray(peers) ? peers : [], source: 'finnhub' })
    }

    return NextResponse.json({ error: 'No peers provider configured' }, { status: 503 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
