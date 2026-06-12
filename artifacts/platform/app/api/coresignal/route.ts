import { NextRequest, NextResponse } from 'next/server'

const CS_BASE = 'https://api.coresignal.com/cdapi'
const CS_KEY  = process.env.CORESIGNAL_API_KEY || ''

const csHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${CS_KEY}`,
})

async function searchCompanies(query: string, filters: Record<string, any> = {}) {
  const must: any[] = [
    { multi_match: { query, fields: ['company_name^3', 'company_name_alias', 'description'], fuzziness: 'AUTO' } }
  ]
  if (filters.hq_country) must.push({ term: { hq_country_iso2: filters.hq_country } })
  if (filters.industry)   must.push({ match: { industry: filters.industry } })
  if (filters.size_range) must.push({ term: { size_range: filters.size_range } })
  const res = await fetch(`${CS_BASE}/v2/company_multi_source/search/es_dsl`, {
    method: 'POST', headers: csHeaders(),
    body: JSON.stringify({ query: { bool: { must } }, size: 10 }),
  })
  if (!res.ok) throw new Error(`CoreSignal search ${res.status}: ${await res.text()}`)
  return res.json()
}

async function getCompanyById(id: string) {
  const res = await fetch(`${CS_BASE}/v2/company_multi_source/collect/${id}`, { headers: csHeaders() })
  if (!res.ok) throw new Error(`CoreSignal collect ${res.status}`)
  return res.json()
}

async function enrichByWebsite(website: string) {
  const res = await fetch(`${CS_BASE}/v2/company_multi_source/enrich?website=${encodeURIComponent(website)}`, { headers: csHeaders() })
  if (!res.ok) throw new Error(`CoreSignal enrich ${res.status}`)
  return res.json()
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const id     = searchParams.get('id')
  const website= searchParams.get('website')

  try {
    if (!CS_KEY) return NextResponse.json({ error: 'CORESIGNAL_API_KEY not configured' }, { status: 500 })
    if (action === 'enrich' && website) return NextResponse.json(await enrichByWebsite(website))
    if (action === 'collect' && id)     return NextResponse.json(await getCompanyById(id))
    if (action === 'headcount' && id) {
      const data = await getCompanyById(id)
      return NextResponse.json({
        current:          data.employees_count_inferred,
        history:          data.employees_count_inferred_by_month || [],
        attrition_rate:   data.employee_attrition_rate,
        attrition_history:data.employee_attrition_rate_by_month || [],
        departures:       data.departures_count,
        size_range:       data.size_range,
        funding:          data.funding,
      })
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') || 'search'
  try {
    if (!CS_KEY) return NextResponse.json({ error: 'CORESIGNAL_API_KEY not configured' }, { status: 500 })
    const body = await req.json()
    if (action === 'search') {
      const data = await searchCompanies(body.query || '', body.filters || {})
      return NextResponse.json(data)
    }
    // raw ES-DSL passthrough
    if (action === 'es_dsl') {
      const res = await fetch(`${CS_BASE}/v2/company_multi_source/search/es_dsl`, {
        method: 'POST', headers: csHeaders(), body: JSON.stringify(body),
      })
      return NextResponse.json(await res.json())
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
