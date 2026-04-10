import { NextRequest, NextResponse } from 'next/server'
let watchlist: string[] = ['AAPL','MSFT','NVDA','GOOGL','META']
export async function GET() { return NextResponse.json({ watchlist }) }
export async function POST(req: NextRequest) {
  const { symbol, action } = await req.json()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  if (action==='remove') watchlist = watchlist.filter(s => s!==symbol.toUpperCase())
  else { const s = symbol.toUpperCase(); if (!watchlist.includes(s)) watchlist.push(s) }
  return NextResponse.json({ watchlist })
}
