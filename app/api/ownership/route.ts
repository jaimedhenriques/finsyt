import { NextRequest, NextResponse } from 'next/server'

const FMP     = process.env.FMP_API_KEY || ''
const FINNHUB = process.env.FINNHUB_API_KEY || ''

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const symbol = sp.get('symbol')?.toUpperCase()
  const type = sp.get('type') || 'institutional' // institutional | insider | 13f

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })

  try {
    if (type === 'institutional' || type === '13f') {
      if (FMP) {
        const [instRes, fundRes] = await Promise.all([
          fetch(`https://financialmodelingprep.com/stable/institutional-ownership?symbol=${symbol}&apikey=${FMP}`),
          fetch(`https://financialmodelingprep.com/stable/ownership-percent?symbol=${symbol}&apikey=${FMP}`),
        ])
        const [inst, fund] = await Promise.all([instRes.json(), fundRes.json()])

        const holders = Array.isArray(inst) ? inst.slice(0, 20).map((h: any) => ({
          name:          h.investorName || h.holder,
          shares:        h.sharesNumber,
          value:         h.marketValue,
          pctHeld:       h.percentOwnership,
          change:        h.change,
          changePct:     h.changePercent,
          filedDate:     h.lastUpdated,
          type:          h.investorType || 'institution',
        })) : []

        const concentration = fund?.institutionalOwnershipPercentage ? {
          institutional:  fund.institutionalOwnershipPercentage,
          retail:         100 - (fund.institutionalOwnershipPercentage || 0),
        } : null

        return NextResponse.json({ symbol, type, holders, concentration, source: 'fmp' })
      }

      if (FINNHUB) {
        const res = await fetch(`https://finnhub.io/api/v1/stock/institutional-ownership?symbol=${symbol}&token=${FINNHUB}`)
        const data = await res.json()
        const holders = Array.isArray(data?.ownership) ? data.ownership.slice(0, 20).map((h: any) => ({
          name:      h.name,
          shares:    h.share,
          value:     h.change,
          filedDate: h.reportDate,
        })) : []
        return NextResponse.json({ symbol, type, holders, source: 'finnhub' })
      }
    }

    if (type === 'insider') {
      if (FMP) {
        const res = await fetch(`https://financialmodelingprep.com/stable/insider-roaster?symbol=${symbol}&apikey=${FMP}`)
        const data = await res.json()
        const holders = Array.isArray(data) ? data.slice(0, 20).map((h: any) => ({
          name:     h.reportingName,
          role:     h.typeOfOwner,
          shares:   h.sharesNumber,
          value:    h.marketValue,
          filedDate:h.lastUpdated,
        })) : []
        return NextResponse.json({ symbol, type, holders, source: 'fmp' })
      }
    }

    return NextResponse.json({ error: 'No ownership data provider configured' }, { status: 503 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
