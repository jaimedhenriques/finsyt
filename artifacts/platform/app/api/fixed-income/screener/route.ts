import { NextRequest, NextResponse } from 'next/server'
import { getCreditScreener } from '@/lib/fixed-income'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const grade = sp.get('grade')?.toUpperCase()        // IG | HY
  const sector = sp.get('sector')?.trim()
  const maxSpread = sp.get('maxSpread') ? Number(sp.get('maxSpread')) : null
  const sortBy = sp.get('sortBy') || 'spreadBps'      // spreadBps | notch | totalDebt | nearestMaturityYear
  const order = sp.get('order') === 'asc' ? 'asc' : 'desc'

  try {
    const { rows, source, universe } = getCreditScreener()
    let filtered = rows
    if (grade === 'IG' || grade === 'HY') filtered = filtered.filter(r => r.grade === grade)
    if (sector) filtered = filtered.filter(r => r.sector.toLowerCase() === sector.toLowerCase())
    if (maxSpread != null && Number.isFinite(maxSpread)) filtered = filtered.filter(r => r.spreadBps <= maxSpread)

    const key = (['spreadBps', 'notch', 'totalDebt', 'nearestMaturityYear', 'weightedAvgMaturityYears'].includes(sortBy)
      ? sortBy : 'spreadBps') as keyof (typeof rows)[number]
    filtered = filtered.slice().sort((a, b) => {
      const av = Number(a[key]); const bv = Number(b[key])
      return order === 'asc' ? av - bv : bv - av
    })

    const sectors = [...new Set(rows.map(r => r.sector))].sort()
    return NextResponse.json({ rows: filtered, source, universe, count: filtered.length, sectors })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
