import { NextRequest, NextResponse } from 'next/server'

const CS_BASE = 'https://api.coresignal.com/cdapi'
const CS_KEY  = process.env.CORESIGNAL_API_KEY || ''
const OAI_KEY = process.env.OPENAI_API_KEY || ''

// ── Natural language → ES-DSL via GPT-4o ─────────────────────────────────────
async function nlToEsDsl(prompt: string): Promise<{ dsl: object; explanation: string }> {
  const systemPrompt = `You are an expert at converting natural language company search queries into Elasticsearch DSL queries for the CoreSignal Multi-source Company API.

The index has these key fields:
- company_name (text), industry (text), description (text)
- hq_country (keyword), hq_country_iso2 (keyword), hq_city (keyword), hq_state (keyword)
- size_range (keyword): "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"
- founded_year (keyword, format "YYYY")
- ownership_status (keyword): "Private", "Public", "Non-profit", "Government"
- type (keyword): "Privately Held", "Public Company", "Self-Employed", "Nonprofit", "Government Agency", "Educational Institution", "Partnership", "Sole Proprietorship"
- employees_count_inferred (integer) — inferred headcount
- funding.total_funding (long) — total funding in USD
- funding.last_funding_type (keyword): "Seed", "Angel", "Series A", "Series B", "Series C", "Series D", "Series E+", "Late Stage VC", "Growth Equity", "IPO", "Private Equity", "Debt Financing"
- funding.last_funding_date (keyword, format "YYYY-MM-DD")
- categories_and_keywords (keyword array)
- website (keyword)
- is_b2b (integer): 1 = B2B, 0 = B2C

Return ONLY a JSON object with two keys:
1. "dsl": a valid Elasticsearch DSL query object (just the query body, with "query" and "size" keys, max size 20)
2. "explanation": a short 1-sentence human-readable explanation of the filters applied

Example output:
{"dsl": {"query": {"bool": {"must": [{"match": {"industry": "fintech"}}, {"term": {"hq_country_iso2": "GB"}}], "filter": [{"term": {"ownership_status": "Private"}}]}}, "size": 15}, "explanation": "Fintech companies in the UK that are privately held."}

Prefer bool queries with must/filter/should clauses. Use range queries for numeric fields. Use term for keywords, match for text fields.`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    })
  })
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`)
  const data = await res.json()
  const parsed = JSON.parse(data.choices[0].message.content)
  return { dsl: parsed.dsl, explanation: parsed.explanation }
}

// ── CoreSignal search ─────────────────────────────────────────────────────────
async function searchCoreSignal(dsl: object) {
  const res = await fetch(`${CS_BASE}/v2/company_multi_source/search/es_dsl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CS_KEY}` },
    body: JSON.stringify(dsl),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CoreSignal error ${res.status}: ${text}`)
  }
  return res.json()
}

// ── Route ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    if (!CS_KEY) return NextResponse.json({ error: 'CORESIGNAL_API_KEY not configured' }, { status: 500 })
    if (!OAI_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })

    const { prompt, dsl: rawDsl } = await req.json()

    let dsl: object
    let explanation: string

    if (rawDsl) {
      // Direct DSL passthrough
      dsl = rawDsl
      explanation = 'Custom Elasticsearch query'
    } else if (prompt) {
      const result = await nlToEsDsl(prompt)
      dsl = result.dsl
      explanation = result.explanation
    } else {
      return NextResponse.json({ error: 'Provide prompt or dsl' }, { status: 400 })
    }

    const csResult = await searchCoreSignal(dsl)
    const hits = (csResult.hits?.hits || []).map((h: any) => ({
      id: h._source?.id,
      name: h._source?.company_name,
      industry: h._source?.industry,
      country: h._source?.hq_country,
      country_iso2: h._source?.hq_country_iso2,
      city: h._source?.hq_city,
      size_range: h._source?.size_range,
      headcount: h._source?.employees_count_inferred,
      founded: h._source?.founded_year,
      ownership: h._source?.ownership_status,
      website: h._source?.website,
      description: h._source?.description_enriched || h._source?.description,
      total_funding: h._source?.funding?.total_funding,
      last_funding_type: h._source?.funding?.last_funding_type,
      last_funding_date: h._source?.funding?.last_funding_date,
      logo_url: h._source?.company_logo_url,
      keywords: h._source?.categories_and_keywords?.slice(0, 8),
      score: h._score,
    }))

    return NextResponse.json({
      hits,
      total: csResult.hits?.total?.value || hits.length,
      explanation,
      dsl, // expose for transparency
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
