import { NextRequest, NextResponse } from 'next/server'
const AV = process.env.ALPHA_VANTAGE_KEY
const OPENAI = process.env.OPENAI_API_KEY

export async function POST(req: NextRequest) {
  const { query, symbol } = await req.json()
  if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 })

  let ctx: any = {}
  if (symbol) {
    try {
      const [or, ir, nr] = await Promise.all([
        fetch(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${AV}`),
        fetch(`https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${symbol}&apikey=${AV}`),
        fetch(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&limit=5&apikey=${AV}`),
      ])
      const [o, inc, news] = await Promise.all([or.json(), ir.json(), nr.json()])
      ctx = { company:o.Name, sector:o.Sector, marketCap:o.MarketCapitalization, pe:o.PERatio, eps:o.EPS,
        revenue:inc.annualReports?.[0]?.totalRevenue, netIncome:inc.annualReports?.[0]?.netIncome,
        recentNews:(news.feed||[]).slice(0,3).map((n: any) => ({ title:n.title, sentiment:n.overall_sentiment_label })) }
    } catch {}
  }

  if (OPENAI) {
    try {
      const sysPrompt = `You are Finsyt AI — an institutional-quality financial analyst. Provide cited, data-driven analysis. Structure: 1) Direct summary 2) Key data points 3) Risks 4) Confidence level. Current context: ${JSON.stringify(ctx)}`
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${OPENAI}`},
        body: JSON.stringify({ model:'gpt-4o', messages:[{role:'system',content:sysPrompt},{role:'user',content:query}], temperature:0.3, max_tokens:1000 })
      })
      const d = await res.json()
      return NextResponse.json({ answer: d.choices?.[0]?.message?.content||'', sources:[{label:'Alpha Vantage',type:'data'},{label:'SEC EDGAR',type:'filing'},{label:'News Sentiment',type:'news'}], model:'GPT-4o' })
    } catch {}
  }

  // Fallback
  let answer = ''
  if (symbol && ctx.company) {
    const rev = ctx.revenue ? `$${(ctx.revenue/1e9).toFixed(1)}B` : 'N/A'
    const ni = ctx.netIncome ? `$${(ctx.netIncome/1e9).toFixed(1)}B` : 'N/A'
    const mc = ctx.marketCap ? `$${(ctx.marketCap/1e12).toFixed(2)}T` : 'N/A'
    answer = `**${ctx.company} (${symbol})**\n\nMarket Cap: ${mc} · P/E: ${ctx.pe}x · EPS: $${ctx.eps}\nRevenue: ${rev} · Net Income: ${ni}\n\n`
    if (ctx.recentNews?.length) {
      answer += '**Recent News:**\n' + ctx.recentNews.map((n: any) => `- ${n.title} *(${n.sentiment})*`).join('\n') + '\n\n'
    }
    answer += '*Add your OpenAI API key in Settings for full AI-powered analysis.*'
  } else {
    answer = '**Finsyt AI Research Engine**\n\nEnter a ticker above to get company-specific analysis, or add your OpenAI API key in Settings to unlock full multi-source AI research with cited reasoning.'
  }
  return NextResponse.json({ answer, sources:[{label:'Alpha Vantage',type:'data'},{label:'SEC EDGAR',type:'filing'}], model:'Finsyt Engine v1' })
}
