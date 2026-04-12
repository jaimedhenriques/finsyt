import { NextResponse } from 'next/server'
import { PROVIDERS, massiveMarketStatus } from '@/lib/data-providers'

export async function GET() {
  if (PROVIDERS.massive) {
    try {
      const data = await massiveMarketStatus()
      if (data) return NextResponse.json({ ...data, source: 'massive' })
    } catch (e) { console.warn('[market-status] Massive failed') }
  }

  // Fallback: compute from NYSE trading hours
  const now = new Date()
  const nyNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = nyNow.getDay()
  const h   = nyNow.getHours()
  const m   = nyNow.getMinutes()
  const mins = h * 60 + m
  const isWeekday = day >= 1 && day <= 5
  const isOpen    = isWeekday && mins >= 570 && mins < 960 // 9:30 - 16:00
  return NextResponse.json({
    market:    isOpen ? 'open' : 'closed',
    serverTime: now.toISOString(),
    exchanges: { nasdaq: isOpen ? 'open' : 'closed', nyse: isOpen ? 'open' : 'closed' },
    source: 'computed',
  })
}
