import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { requireProFeature } from '@/lib/billing'
import { getClustersForSymbol, getGlobalClusters, type QuestionCluster } from '@/lib/question-clusters'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Curated fallback used only when the upstream transcript API or LLM is
// unavailable. Keeps the demo surfaces populated.
const FALLBACK: QuestionCluster[] = [
  {
    id: 'margin-transition',
    theme: 'Margin transition',
    chips: ['Gross margin', 'Mix shift', 'Pricing'],
    quarter: 'Curated',
    questions: [
      { symbol: 'NVDA', name: 'NVIDIA', date: '2026-02-21', event: 'Q4 2026', section: 'Q&A',
        q: 'How should we think about gross margin once Blackwell mix normalises against Hopper?',
        analyst: 'Stacy Rasgon — Bernstein' },
      { symbol: 'AMD', name: 'AMD', date: '2026-02-04', event: 'Q4 2025', section: 'Q&A',
        q: 'What is the cadence of MI325 ramp and the implied gross margin trajectory through FY26?',
        analyst: 'Vivek Arya — BofA' },
      { symbol: 'AVGO', name: 'Broadcom', date: '2026-03-06', event: 'Q1 2026', section: 'Q&A',
        q: 'Can you bridge the 60bps gross margin uplift between custom silicon and merchant?',
        analyst: 'Harlan Sur — JPM' },
    ],
  },
  {
    id: 'ai-capex',
    theme: 'AI capex',
    chips: ['Hyperscaler', 'Capex intensity', 'ROI'],
    quarter: 'Curated',
    questions: [
      { symbol: 'MSFT', name: 'Microsoft', date: '2026-01-30', event: 'Q2 2026', section: 'Q&A',
        q: 'How are you sizing FY27 AI infrastructure capex relative to bookings visibility?',
        analyst: 'Mark Moerdler — Bernstein' },
      { symbol: 'META', name: 'Meta', date: '2026-01-29', event: 'Q4 2025', section: 'Q&A',
        q: 'When do we get visibility into the unit economics of Llama-driven engagement lift?',
        analyst: 'Brian Nowak — Morgan Stanley' },
      { symbol: 'GOOGL', name: 'Alphabet', date: '2026-02-04', event: 'Q4 2025', section: 'Q&A',
        q: 'Capex is up 38% YoY — what is the through-cycle ROIC framework you are operating against?',
        analyst: 'Doug Anmuth — JPM' },
    ],
  },
  {
    id: 'pricing-power',
    theme: 'Pricing power & elasticity',
    chips: ['Price', 'Elasticity', 'Volume'],
    quarter: 'Curated',
    questions: [
      { symbol: 'AAPL', name: 'Apple', date: '2026-02-01', event: 'Q1 2026', section: 'Q&A',
        q: 'How are you thinking about iPhone ASP given mix into Pro tiers vs entry-level?',
        analyst: 'Erik Woodring — Morgan Stanley' },
      { symbol: 'NFLX', name: 'Netflix', date: '2026-01-22', event: 'Q4 2025', section: 'Q&A',
        q: 'What is the elasticity you observe at the new price points across UCAN and EMEA?',
        analyst: 'Eric Sheridan — Goldman' },
      { symbol: 'RACE', name: 'Ferrari', date: '2026-02-06', event: 'Q4 2025', section: 'Q&A',
        q: 'Mix and price contributed 11pp to growth — can that cadence continue into 2027?',
        analyst: 'Adam Jonas — Morgan Stanley' },
    ],
  },
  {
    id: 'china',
    theme: 'China demand',
    chips: ['China', 'Geo mix', 'Policy'],
    quarter: 'Curated',
    questions: [
      { symbol: 'TSLA', name: 'Tesla', date: '2026-01-24', event: 'Q4 2025', section: 'Q&A',
        q: 'Order trajectory in China — any change after the latest local OEM price actions?',
        analyst: 'Adam Jonas — Morgan Stanley' },
      { symbol: 'NKE', name: 'Nike', date: '2026-03-21', event: 'Q3 2026', section: 'Q&A',
        q: 'Greater China returned to growth — is the inventory clear-through complete?',
        analyst: 'Matthew Boss — JPM' },
    ],
  },
  {
    id: 'capital-return',
    theme: 'Capital return',
    chips: ['Buyback', 'Dividend', 'M&A'],
    quarter: 'Curated',
    questions: [
      { symbol: 'AAPL', name: 'Apple', date: '2026-02-01', event: 'Q1 2026', section: 'Q&A',
        q: 'How do you frame buyback pace against the net cash neutral target?',
        analyst: 'Wamsi Mohan — BofA' },
      { symbol: 'MSFT', name: 'Microsoft', date: '2026-01-30', event: 'Q2 2026', section: 'Q&A',
        q: 'M&A vs organic — how does the bar move at this scale of AI capex?',
        analyst: 'Karl Keirstead — UBS' },
    ],
  },
]

function filterFallback(symbol?: string): QuestionCluster[] {
  if (!symbol) return FALLBACK
  return FALLBACK
    .map(c => ({ ...c, questions: c.questions.filter(q => q.symbol === symbol) }))
    .filter(c => c.questions.length > 0)
}

export async function GET(req: NextRequest) {
  // Require a verified Clerk session — unauthenticated callers are rejected
  // before any entitlement check so cookie forgery cannot bypass this gate.
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }
  const pro = await requireProFeature(orgId, 'Clustered analyst Q&A')
  if (!pro.allowed) {
    return NextResponse.json(
      { error: pro.reason ?? 'Clustered analyst Q&A is a Pro feature.', clusters: [] },
      { status: 402 },
    )
  }

  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  const refresh = req.nextUrl.searchParams.get('refresh') === '1'

  try {
    let clusters: QuestionCluster[] = []
    let scope: string
    let source: 'live' | 'fallback' = 'live'

    if (symbol) {
      scope = symbol
      clusters = await getClustersForSymbol(symbol, { refresh })
      if (!clusters.length) { clusters = filterFallback(symbol); source = 'fallback' }
    } else {
      scope = 'global'
      clusters = await getGlobalClusters({ refresh })
      if (!clusters.length) { clusters = filterFallback(); source = 'fallback' }
    }

    return NextResponse.json({ clusters, scope, source, generatedAt: new Date().toISOString() })
  } catch (e) {
    console.error('[analyst-questions] cluster generation failed:', e)
    return NextResponse.json({
      clusters: filterFallback(symbol || undefined),
      scope: symbol || 'global',
      source: 'fallback',
      error: 'cluster_generation_failed',
    })
  }
}
