import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import {
  withClerkContext,
  agentsTable,
  agentEventTriggersTable,
  agentRunsTable,
  type AgentEventTriggerRow,
  type AgentRow,
  db,
} from '@workspace/db'
import { executeAgent, harvestTickers } from './agent-executor'

// ── Event Trigger Engine ────────────────────────────────────────────────────
// Evaluates all enabled event triggers and fires agent runs for those whose
// conditions are met. Designed to be called from a periodic cron task
// (e.g., every 15 minutes) or from `POST /api/triggers/evaluate`.
//
// Trigger evaluation is fire-and-forget per trigger: a failed evaluation
// records the error in `last_error` but does not crash the batch.

const FMP_KEY = process.env.FMP_API_KEY

export interface EvaluateTriggerSummary {
  triggerId: string
  agentId: string
  triggerType: string
  fired: boolean
  reason: string
}

// ── Public entry: evaluate all org triggers ─────────────────────────────────
export async function evaluateAllTriggers(
  orgId: string,
  userId: string,
): Promise<EvaluateTriggerSummary[]> {
  const triggers = await withClerkContext(orgId, userId, (tx) =>
    tx
      .select()
      .from(agentEventTriggersTable)
      .where(
        and(
          eq(agentEventTriggersTable.orgId, orgId),
          eq(agentEventTriggersTable.enabled, true),
        ),
      ),
  )

  const results: EvaluateTriggerSummary[] = []
  for (const trigger of triggers) {
    const result = await evaluateSingleTrigger(orgId, userId, trigger)
    results.push(result)
  }
  return results
}

// ── Single trigger evaluation ───────────────────────────────────────────────
async function evaluateSingleTrigger(
  orgId: string,
  userId: string,
  trigger: AgentEventTriggerRow,
): Promise<EvaluateTriggerSummary> {
  const base: EvaluateTriggerSummary = {
    triggerId: trigger.id,
    agentId: trigger.agentId,
    triggerType: trigger.triggerType,
    fired: false,
    reason: '',
  }

  try {
    const config = trigger.config as Record<string, unknown>
    const cooldownHours = Number((config.cooldownHours as number | undefined) ?? 24)

    // Respect cooldown: if the trigger fired recently, skip.
    if (trigger.lastFiredAt) {
      const elapsed = (Date.now() - trigger.lastFiredAt.getTime()) / 3_600_000
      if (elapsed < cooldownHours) {
        await markChecked(trigger.id, null)
        return { ...base, reason: `cooldown: ${cooldownHours}h, elapsed ${elapsed.toFixed(1)}h` }
      }
    }

    let conditionMet = false
    let reason = ''

    switch (trigger.triggerType) {
      case 'filing':
        ;({ conditionMet, reason } = await checkFilingTrigger(config))
        break
      case 'price':
        ;({ conditionMet, reason } = await checkPriceTrigger(config))
        break
      case 'news':
        ;({ conditionMet, reason } = await checkNewsTrigger(config))
        break
      case 'watchlist':
        ;({ conditionMet, reason } = await checkWatchlistTrigger(config))
        break
      default:
        reason = `unknown trigger type: ${trigger.triggerType}`
    }

    await markChecked(trigger.id, null)

    if (!conditionMet) return { ...base, reason }

    // Fire: load the agent and run it.
    const agent = await loadAgent(orgId, userId, trigger.agentId)
    if (!agent) {
      await markChecked(trigger.id, `agent ${trigger.agentId} not found`)
      return { ...base, reason: 'agent not found' }
    }

    await fireAgent(orgId, agent, trigger)
    await markFired(trigger.id)
    return { ...base, fired: true, reason }
  } catch (err) {
    const msg = (err as Error).message || String(err)
    await markChecked(trigger.id, msg)
    return { ...base, reason: `error: ${msg}` }
  }
}

// ── Condition checkers ──────────────────────────────────────────────────────

async function checkFilingTrigger(
  config: Record<string, unknown>,
): Promise<{ conditionMet: boolean; reason: string }> {
  const symbol = (config.symbol as string | undefined) || ''
  const formType = (config.formType as string | undefined) || ''
  if (!symbol && !formType) return { conditionMet: false, reason: 'no symbol or formType configured' }

  // Use SEC EDGAR free API: check for filings in the last 24h.
  try {
    if (symbol) {
      const cik = await secCikFor(symbol)
      if (!cik) return { conditionMet: false, reason: `CIK not found for ${symbol}` }

      const r = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: { 'User-Agent': 'Finsyt Trigger Engine contact@finsyt.dev' },
      })
      if (!r.ok) return { conditionMet: false, reason: `SEC API ${r.status}` }
      const data: any = await r.json()
      const recent = data?.filings?.recent
      if (!recent?.form) return { conditionMet: false, reason: 'no recent filings data' }

      const cutoff = new Date(Date.now() - 24 * 3_600_000)
      for (let i = 0; i < Math.min(recent.form.length, 20); i++) {
        if (formType && recent.form[i] !== formType) continue
        const filedDate = new Date(recent.filingDate[i])
        if (filedDate >= cutoff) {
          return {
            conditionMet: true,
            reason: `${symbol} filed ${recent.form[i]} on ${recent.filingDate[i]}`,
          }
        }
      }
      return { conditionMet: false, reason: `no new ${formType || 'filing'} for ${symbol} in 24h` }
    }
    return { conditionMet: false, reason: 'symbol required for filing trigger' }
  } catch (err) {
    return { conditionMet: false, reason: `SEC check error: ${(err as Error).message}` }
  }
}

async function checkPriceTrigger(
  config: Record<string, unknown>,
): Promise<{ conditionMet: boolean; reason: string }> {
  const symbol = (config.symbol as string) || ''
  const direction = (config.direction as 'above' | 'below') || 'above'
  const threshold = Number(config.threshold || 0)
  if (!symbol || !threshold) return { conditionMet: false, reason: 'symbol + threshold required' }

  try {
    const price = await fetchQuotePrice(symbol)
    if (price === null) return { conditionMet: false, reason: `no price data for ${symbol}` }

    const conditionMet =
      direction === 'above' ? price >= threshold : price <= threshold
    return {
      conditionMet,
      reason: `${symbol} price $${price} ${direction === 'above' ? '>=' : '<='} $${threshold}: ${conditionMet}`,
    }
  } catch (err) {
    return { conditionMet: false, reason: `price check error: ${(err as Error).message}` }
  }
}

async function checkNewsTrigger(
  config: Record<string, unknown>,
): Promise<{ conditionMet: boolean; reason: string }> {
  const symbol = (config.symbol as string | undefined) || ''
  const keywords: string[] = Array.isArray(config.keywords)
    ? (config.keywords as string[]).map(String)
    : []
  if (!keywords.length) return { conditionMet: false, reason: 'no keywords configured' }

  try {
    // Use Yahoo Finance RSS as a free fallback for news.
    const feedSymbol = symbol || '%5EGSPC'
    const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(feedSymbol)}&region=US&lang=en-US`
    const r = await fetch(rssUrl, { headers: { 'User-Agent': 'Finsyt Trigger Engine' } })
    if (!r.ok) return { conditionMet: false, reason: `RSS feed ${r.status}` }
    const text = await r.text()

    const cutoff = new Date(Date.now() - 24 * 3_600_000)
    const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    for (const m of items.slice(0, 20)) {
      const blk = m[1]
      const grab = (tag: string) =>
        (blk.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`)) ||
          blk.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)))?.[1]?.trim() || ''
      const pubDate = new Date(grab('pubDate'))
      if (isNaN(pubDate.getTime()) || pubDate < cutoff) continue
      const title = (grab('title') + ' ' + grab('description')).toLowerCase()
      const matched = keywords.find((kw) => title.includes(kw.toLowerCase()))
      if (matched) {
        return {
          conditionMet: true,
          reason: `Keyword "${matched}" found in news: ${grab('title').slice(0, 80)}`,
        }
      }
    }
    return { conditionMet: false, reason: `no news matching [${keywords.join(',')}] in 24h` }
  } catch (err) {
    return { conditionMet: false, reason: `news check error: ${(err as Error).message}` }
  }
}

async function checkWatchlistTrigger(
  config: Record<string, unknown>,
): Promise<{ conditionMet: boolean; reason: string }> {
  const symbols: string[] = Array.isArray(config.symbols)
    ? (config.symbols as string[]).map(String)
    : []
  const thresholdPct = Number(config.thresholdPct || 5)
  if (!symbols.length) return { conditionMet: false, reason: 'no symbols configured' }

  try {
    for (const sym of symbols.slice(0, 20)) {
      const changePct = await fetchChangePercent(sym)
      if (changePct === null) continue
      if (Math.abs(changePct) >= thresholdPct) {
        return {
          conditionMet: true,
          reason: `${sym} moved ${changePct.toFixed(2)}% (threshold: ±${thresholdPct}%)`,
        }
      }
    }
    return {
      conditionMet: false,
      reason: `no watchlist symbols moved ≥${thresholdPct}% today`,
    }
  } catch (err) {
    return { conditionMet: false, reason: `watchlist check error: ${(err as Error).message}` }
  }
}

// ── Data fetchers ───────────────────────────────────────────────────────────

async function fetchQuotePrice(symbol: string): Promise<number | null> {
  if (FMP_KEY) {
    try {
      const r = await fetch(
        `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(symbol)}&apikey=${FMP_KEY}`,
      )
      if (r.ok) {
        const data: any = await r.json()
        const price = Array.isArray(data) ? data[0]?.price : data?.price
        if (price) return Number(price)
      }
    } catch { /* fall through */ }
  }
  // Free Yahoo fallback
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinsytAgent/1.0)' } },
    )
    if (r.ok) {
      const data: any = await r.json()
      return data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null
    }
  } catch { /* */ }
  return null
}

async function fetchChangePercent(symbol: string): Promise<number | null> {
  if (FMP_KEY) {
    try {
      const r = await fetch(
        `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(symbol)}&apikey=${FMP_KEY}`,
      )
      if (r.ok) {
        const data: any = await r.json()
        const row = Array.isArray(data) ? data[0] : data
        if (row?.changesPercentage != null) return Number(row.changesPercentage)
      }
    } catch { /* */ }
  }
  // Yahoo fallback
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinsytAgent/1.0)' } },
    )
    if (r.ok) {
      const data: any = await r.json()
      const meta = data?.chart?.result?.[0]?.meta
      if (meta?.regularMarketPrice && meta?.chartPreviousClose) {
        return ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100
      }
    }
  } catch { /* */ }
  return null
}

async function secCikFor(symbol: string): Promise<string | null> {
  try {
    const r = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': 'Finsyt Agent contact@finsyt.dev' },
    })
    if (!r.ok) return null
    const j: any = await r.json()
    const up = symbol.toUpperCase()
    for (const k of Object.keys(j)) {
      if (j[k]?.ticker?.toUpperCase() === up)
        return String(j[k].cik_str).padStart(10, '0')
    }
    return null
  } catch {
    return null
  }
}

// ── Agent firing ────────────────────────────────────────────────────────────

async function loadAgent(
  orgId: string,
  userId: string,
  agentId: string,
): Promise<AgentRow | null> {
  try {
    const rows = await withClerkContext(orgId, userId, (tx) =>
      tx
        .select()
        .from(agentsTable)
        .where(and(eq(agentsTable.orgId, orgId), eq(agentsTable.id, agentId)))
        .limit(1),
    )
    return rows[0] ?? null
  } catch {
    return null
  }
}

async function fireAgent(
  orgId: string,
  agent: AgentRow,
  trigger: AgentEventTriggerRow,
): Promise<void> {
  const tickers = harvestTickers(agent.instructions)
  const out = await executeAgent({
    agentName: agent.name,
    category: agent.category,
    templateSlug: agent.templateSlug,
    instructions: agent.instructions,
    tickers,
    orgId,
  })

  const now = new Date()
  await withClerkContext(orgId, agent.authorUserId, async (tx) => {
    await tx.insert(agentRunsTable).values({
      orgId,
      agentId: agent.id,
      agentName: agent.name,
      category: agent.category,
      icon: agent.icon,
      triggeredBy: `event:${trigger.triggerType}`,
      triggeredByUserId: null,
      ranAt: now,
      read: false,
      headline: out.headline,
      summary: out.summary,
      findings: out.findings as unknown as object,
      sources: out.sources as unknown as object,
      model: out.model,
      provider: out.provider,
      promptTokens: out.promptTokens ?? null,
      completionTokens: out.completionTokens ?? null,
      latencyMs: out.latencyMs,
      runStatus: out.ok ? 'ok' : 'error',
      errorMessage: out.errorMessage ?? null,
    })
    // Update agent timestamps.
    await tx
      .update(agentsTable)
      .set({ lastRunAt: now })
      .where(eq(agentsTable.id, agent.id))
  })
}

// ── Bookkeeping ─────────────────────────────────────────────────────────────

async function markChecked(triggerId: string, error: string | null): Promise<void> {
  try {
    await db
      .update(agentEventTriggersTable)
      .set({ lastCheckedAt: new Date(), lastError: error })
      .where(eq(agentEventTriggersTable.id, triggerId))
  } catch { /* best-effort */ }
}

async function markFired(triggerId: string): Promise<void> {
  try {
    const now = new Date()
    // Increment fireCount via raw SQL expression to avoid a read-modify-write race.
    await db.execute(
      sql`UPDATE agent_event_triggers SET last_fired_at = ${now}, last_checked_at = ${now}, last_error = NULL, fire_count = fire_count + 1 WHERE id = ${triggerId}`,
    )
  } catch { /* best-effort */ }
}
