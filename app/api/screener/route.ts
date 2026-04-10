import { NextRequest, NextResponse } from 'next/server'
const DATA = [
  { symbol:'AAPL', name:'Apple Inc.', sector:'Technology', mcap:3828662403000, pe:33.02, eps:6.42, change:1.2, price:189.3 },
  { symbol:'MSFT', name:'Microsoft Corp.', sector:'Technology', mcap:3100000000000, pe:34.1, eps:11.5, change:-0.4, price:415.2 },
  { symbol:'NVDA', name:'NVIDIA Corp.', sector:'Technology', mcap:2900000000000, pe:52.3, eps:2.13, change:2.8, price:924.8 },
  { symbol:'GOOGL', name:'Alphabet Inc.', sector:'Technology', mcap:2050000000000, pe:21.8, eps:7.4, change:0.6, price:178.5 },
  { symbol:'AMZN', name:'Amazon.com Inc.', sector:'Consumer Disc.', mcap:1980000000000, pe:43.2, eps:4.2, change:1.1, price:192.4 },
  { symbol:'META', name:'Meta Platforms', sector:'Technology', mcap:1340000000000, pe:27.1, eps:19.8, change:0.9, price:529.3 },
  { symbol:'TSLA', name:'Tesla Inc.', sector:'Consumer Disc.', mcap:780000000000, pe:48.5, eps:3.1, change:-1.8, price:248.2 },
  { symbol:'JPM', name:'JPMorgan Chase', sector:'Financials', mcap:710000000000, pe:12.4, eps:18.2, change:0.3, price:224.5 },
  { symbol:'V', name:'Visa Inc.', sector:'Financials', mcap:590000000000, pe:29.3, eps:9.7, change:0.5, price:280.1 },
  { symbol:'LLY', name:'Eli Lilly', sector:'Healthcare', mcap:760000000000, pe:65.4, eps:12.1, change:1.5, price:795.2 },
  { symbol:'ABBV', name:'AbbVie Inc.', sector:'Healthcare', mcap:348000000000, pe:18.7, eps:10.5, change:0.2, price:197.3 },
  { symbol:'BAC', name:'Bank of America', sector:'Financials', mcap:315000000000, pe:13.1, eps:3.2, change:-0.2, price:40.2 },
  { symbol:'XOM', name:'Exxon Mobil', sector:'Energy', mcap:498000000000, pe:14.2, eps:8.6, change:-0.8, price:116.4 },
  { symbol:'WMT', name:'Walmart Inc.', sector:'Consumer Staples', mcap:685000000000, pe:36.2, eps:2.4, change:0.4, price:85.2 },
  { symbol:'MA', name:'Mastercard Inc.', sector:'Financials', mcap:478000000000, pe:38.4, eps:13.4, change:0.6, price:510.2 },
  { symbol:'NFLX', name:'Netflix Inc.', sector:'Technology', mcap:382000000000, pe:44.2, eps:19.8, change:1.9, price:890.4 },
  { symbol:'AVGO', name:'Broadcom Inc.', sector:'Technology', mcap:920000000000, pe:31.2, eps:5.1, change:1.4, price:218.5 },
  { symbol:'CVX', name:'Chevron Corp.', sector:'Energy', mcap:268000000000, pe:13.6, eps:10.5, change:-0.5, price:148.2 },
  { symbol:'ADBE', name:'Adobe Inc.', sector:'Technology', mcap:225000000000, pe:30.2, eps:17.3, change:-0.4, price:508.3 },
  { symbol:'AMD', name:'Advanced Micro', sector:'Technology', mcap:258000000000, pe:42.1, eps:3.8, change:2.1, price:158.4 },
]
export async function GET(req: NextRequest) {
  const sector = req.nextUrl.searchParams.get('sector')||''
  const minMcap = parseFloat(req.nextUrl.searchParams.get('minMcap')||'0')
  const maxPE = parseFloat(req.nextUrl.searchParams.get('maxPE')||'9999')
  let filtered = DATA
  if (sector) filtered = filtered.filter(s => s.sector.toLowerCase().includes(sector.toLowerCase()))
  if (minMcap) filtered = filtered.filter(s => s.mcap >= minMcap)
  if (maxPE < 9999) filtered = filtered.filter(s => s.pe <= maxPE && s.pe > 0)
  return NextResponse.json({ results: filtered, total: filtered.length })
}
