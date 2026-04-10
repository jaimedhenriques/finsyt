import { NextRequest, NextResponse } from 'next/server'
const GROQ       = process.env.GROQ_API_KEY
const PERPLEXITY = process.env.PERPLEXITY_API_KEY
const FMP        = process.env.FMP_API_KEY
const FINNHUB    = process.env.FINNHUB_API_KEY

const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768']
const SYSTEM_PROMPT = `You are Finsyt AI — an institutional-quality financial analyst with access to real-time market data, earnings transcripts, SEC filings, and expert call databases.

Your responses must:
1. Lead with the direct answer (no preamble)
2. Use BULLET POINTS for key data (bold label: content format — "**Revenue Growth:** +73% YoY...")
3. Cite source type for key claims (transcript / filing / consensus / news)
4. End with a brief synthesis paragraph
5. Be concise but data-rich — analysts don't want fluff

Available data sources: Finnhub (real-time quotes), FMP (financials, transcripts, filings), FRED (macro), Alpha Vantage (news sentiment), Databento (tick data).`

async function fetchCompanyContext(symbol: string): Promise<string> {
  if (!symbol) return ''
  try {
    const [qRes, incRes, earnRes, newsRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB}`),
      fetch(`https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=4&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/api/v3/earnings-surprises/${symbol}?apikey=${FMP}`),
      fetch(`https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${new Date(Date.now()-7*86400000).toISOString().slice(0,10)}&to=${new Date().toISOString().slice(0,10)}&token=${FINNHUB}`),
    ])
    const [q, income, earnings, news] = await Promise.all([qRes.json(), incRes.json(), earnRes.json(), newsRes.json()])

    const latestIncome = income[0] || {}
    const latestEarnings = earnings.slice(0, 4)
    const topNews = (Array.isArray(news) ? news : []).slice(0, 5).map((n: any) => `- ${n.headline}`).join('\n')

    return `
REAL-TIME DATA FOR ${symbol}:
Current Price: $${q.c} | Change: ${((q.c-q.pc)/q.pc*100).toFixed(2)}% | High: $${q.h} | Low: $${q.l}

LATEST INCOME STATEMENT (${latestIncome.date || 'TTM'}):
Revenue: $${(latestIncome.revenue/1e9)?.toFixed(1)}B | Gross Margin: ${(latestIncome.grossProfitRatio*100)?.toFixed(1)}% | Net Margin: ${(latestIncome.netIncomeRatio*100)?.toFixed(1)}% | EPS: $${latestIncome.epsdiluted}

RECENT EARNINGS SURPRISES:
${latestEarnings.map((e: any) => `${e.date}: Actual $${e.actualEarningResult} vs Est $${e.estimatedEarning} (${e.actualEarningResult >= e.estimatedEarning ? 'BEAT' : 'MISS'})`).join('\n')}

RECENT NEWS:
${topNews}
`.trim()
  } catch { return '' }
}

async function callGroq(messages: any[], model: string) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ}` },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 1500 }),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callPerplexity(query: string, symbol?: string) {
  const systemMsg = `You are an institutional financial analyst. Answer about ${symbol || 'financial markets'}. Be data-driven, cite sources, use bullet points with bold labels.`
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PERPLEXITY}` },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: query }],
      temperature: 0.2, max_tokens: 1500,
    }),
  })
  if (!res.ok) throw new Error(`Perplexity ${res.status}`)
  const data = await res.json()
  return {
    content: data.choices?.[0]?.message?.content || '',
    citations: data.citations || [],
  }
}

export async function POST(req: NextRequest) {
  try {
    const { query, symbol, messages: history, usePerplexity } = await req.json()
    if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 })

    const sym = symbol?.toUpperCase() || extractSymbol(query)

    // Fetch live context
    const context = sym ? await fetchCompanyContext(sym) : ''

    // Build messages
    const systemWithCtx = context ? `${SYSTEM_PROMPT}\n\n${context}` : SYSTEM_PROMPT
    const msgs = [
      { role: 'system', content: systemWithCtx },
      ...(history || []).slice(-6).map((m: any) => ({ role: m.role === 'ai' ? 'assistant' : m.role, content: m.content || m.bullets?.join('\n') || '' })),
      { role: 'user', content: query },
    ]

    let responseText = ''
    let citations: any[] = []
    let modelUsed = ''

    // Try Groq first (fastest)
    if (GROQ && !usePerplexity) {
      for (const model of GROQ_MODELS) {
        try {
          responseText = await callGroq(msgs, model)
          modelUsed = `groq/${model}`
          break
        } catch (e) {
          console.error(`Groq model ${model} failed:`, e)
        }
      }
    }

    // Fall back to Perplexity (web-grounded, great for current events)
    if (!responseText && PERPLEXITY) {
      const contextQuery = sym ? `${query} (regarding ${sym})` : query
      const result = await callPerplexity(contextQuery, sym)
      responseText = result.content
      citations = result.citations
      modelUsed = 'perplexity/sonar-pro'
    }

    if (!responseText) {
      return NextResponse.json({ error: 'All AI providers unavailable' }, { status: 503 })
    }

    // Parse response into bullets + summary
    const lines = responseText.split('\n').filter((l: string) => l.trim())
    const bullets: string[] = []
    const otherLines: string[] = []

    lines.forEach((line: string) => {
      const cleaned = line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '').trim()
      if (line.match(/^[-•*]/) || line.match(/^\d+\./)) {
        bullets.push(cleaned)
      } else {
        otherLines.push(cleaned)
      }
    })

    const summary = otherLines.filter(l => l.length > 40).join(' ').slice(0, 300)

    // Build source refs
    const sources = [
      ...(sym ? [
        { title: `${sym} Real-Time Quote`, type: 'filing' as const, symbol: sym, date: new Date().toISOString().slice(0,10) },
        { title: `${sym} Latest Income Statement`, type: 'filing' as const, symbol: sym },
        { title: `${sym} Earnings Surprises`, type: 'transcript' as const, symbol: sym },
        { title: `${sym} Recent News`, type: 'news' as const, symbol: sym },
      ] : []),
      ...citations.slice(0, 3).map((c: any) => ({ title: typeof c === 'string' ? c : c.title || 'Web Source', type: 'news' as const, symbol: sym })),
    ]

    return NextResponse.json({
      content: summary || '',
      bullets: bullets.length > 0 ? bullets : [responseText.slice(0, 400)],
      sources,
      modelUsed,
      symbol: sym,
      hasLiveData: !!context,
    })
  } catch (e) {
    return NextResponse.json({ error: 'Research failed', detail: String(e) }, { status: 500 })
  }
}

function extractSymbol(query: string): string {
  const tickers = ['NVDA', 'TSLA', 'MSFT', 'AAPL', 'META', 'GOOGL', 'AMZN', 'JPM', 'GS', 'V', 'MA', 'NFLX', 'AMD', 'INTC', 'AVGO', 'TSM', 'PLTR', 'UBER', 'ABNB', 'CRM', 'SNOW', 'COIN', 'RBLX', 'HOOD', 'SOFI', 'RIVN', 'LCID', 'NIO']
  const upper = query.toUpperCase()
  return tickers.find(t => upper.includes(t)) || ''
}
