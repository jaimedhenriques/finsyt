/**
 * Shared agent core used by both the cookie-auth `/api/agent/ask` route
 * (used by the platform web app) and the bearer-auth `/api/v1/agent/ask`
 * route (used by the Excel add-in copilot and external clients).
 *
 * The Excel surface needs two extra abilities over the platform surface:
 *  1. The model must know it is talking to a spreadsheet user, so it can
 *     emit Excel formulas and templated layouts instead of long prose.
 *  2. The SSE stream must include `event: action` frames the add-in can
 *     execute against the workbook (insert_formula / write_range /
 *     insert_template). These are produced by a small `propose_*` tool
 *     family the model is encouraged to call when the user asks for
 *     something that lands in cells rather than text.
 *
 * Both surfaces share the same underlying TOOLS registry so the model has
 * a single, consistent set of capabilities for fetching data.
 */

const PROXY_BASE = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "";
const PROXY_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";
const DIRECT_KEY = process.env.OPENAI_API_KEY || "";
const USE_DIRECT = !!DIRECT_KEY;
const USE_PROXY = !USE_DIRECT && !!(PROXY_BASE && PROXY_KEY);

export const OPENAI_BASE = USE_PROXY ? PROXY_BASE : "https://api.openai.com/v1";
export const OPENAI_KEY = USE_DIRECT ? DIRECT_KEY : USE_PROXY ? PROXY_KEY : "";
export const OPENAI_MODEL = process.env.AGENT_MODEL || "gpt-4o-mini";

export type SseSend = (event: string, data: unknown) => void;

export interface AgentRunOptions {
  question: string;
  baseUrl: string;
  contextPreface?: string;
  surface: "platform" | "excel";
  signal: AbortSignal;
  send: SseSend;
  /**
   * Auth context for the inner data-tool fetches. The data routes are
   * gated by Clerk middleware (cookie auth) or `withPublicApi` (bearer
   * auth on the `/api/v1/*` mirrors). Forward whichever credential the
   * caller used so tools can ground answers in real platform data:
   *  - Cookie-auth callers (the platform UI) pass `dataRoutePrefix:
   *    "/api"` and `forwardHeaders: { cookie }`.
   *  - Bearer-auth callers (Excel add-in / external API consumers) pass
   *    `dataRoutePrefix: "/api/v1"` and `forwardHeaders: { authorization }`.
   */
  dataRoutePrefix?: string;
  forwardHeaders?: Record<string, string>;
}

// ── Excel-specific propose tools ─────────────────────────────────────────────
// These emit `action` SSE frames that the task pane applies via Excel.run;
// they have no server-side `run`.

const EXCEL_TOOLS_DEFS = [
  {
    name: "propose_formula",
    description:
      "Suggest a single formula to insert into a target cell of the active worksheet. Use when the user asks for a calculation that should live in one cell (e.g. =FINSYT.QUOTE(\"AAPL\")).",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string", description: "Target cell reference, e.g. A1 or Sheet2!B3. If omitted, the current selection is used." },
        formula: { type: "string", description: "Excel formula INCLUDING the leading = sign." },
        explanation: { type: "string", description: "One-line plain-English explanation shown alongside the Insert button." },
      },
      required: ["formula"],
    },
  },
  {
    name: "propose_range",
    description:
      "Suggest a 2-D range of values (or formulas) to write into the sheet. Use for small tables / lists. Each row must have the same length.",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string", description: "Top-left target cell, e.g. A1 or Sheet1!B2. Defaults to current selection top-left." },
        values: {
          type: "array",
          items: { type: "array", items: { type: ["string", "number", "boolean", "null"] } },
          description: "2-D matrix of cell values. Strings starting with = are treated as formulas.",
        },
        title: { type: "string" },
      },
      required: ["values"],
    },
  },
  {
    name: "propose_template",
    description:
      "Suggest one of the canned Builder templates: 'dcf', 'comps', 'sensitivity', 'wacc'. Use when the user asks to build a model from scratch.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["dcf", "comps", "sensitivity", "wacc"] },
        symbol: { type: "string", description: "Optional ticker to seed the template with." },
        notes: { type: "string" },
      },
      required: ["kind"],
    },
  },
] as const;

// ── Data tools ───────────────────────────────────────────────────────────────
type ToolCtx = { base: string; prefix: string; headers?: Record<string, string> };
type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run?: (args: Record<string, unknown>, ctx: ToolCtx) => Promise<unknown>;
};

async function safeFetch(url: string, init?: RequestInit): Promise<unknown> {
  try {
    const r = await fetch(url, { cache: "no-store", ...init });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const ct = r.headers.get("content-type") || "";
    return ct.includes("application/json") ? await r.json() : await r.text();
  } catch (e) {
    return { error: String((e as Error).message || e) };
  }
}

function dataFetch(ctx: ToolCtx, path: string): Promise<unknown> {
  // path is like "/quote?symbol=AAPL". Compose with the auth-aware
  // prefix ("/api" for cookie sessions, "/api/v1" for bearer callers) so
  // both the platform UI and Excel/API-key callers can ground answers.
  return safeFetch(`${ctx.base}${ctx.prefix}${path}`, { headers: ctx.headers });
}

function trim<T>(arr: T[] | undefined, n: number): T[] {
  return Array.isArray(arr) ? arr.slice(0, n) : [];
}

const DATA_TOOLS: ToolDef[] = [
  {
    name: "get_quote",
    description: "Real-time quote, market cap, P/E, 52w range, sector for a single ticker.",
    parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] },
    run: async (a, ctx) => {
      const sym = String(a.symbol || "");
      const d: any = await dataFetch(ctx, `/quote?symbol=${encodeURIComponent(sym)}`);
      const q = d && !d.error ? d.quote || d : null;
      if (q?.price) {
        return {
          symbol: q.symbol,
          name: q.name,
          price: q.price,
          changePct: q.changePct,
          marketCap: q.marketCap,
          pe: q.pe,
          eps: q.eps,
          high52w: q.high52w,
          low52w: q.low52w,
          sector: q.sector,
          industry: q.industry,
          source: "FMP / EODHD",
        };
      }
      return { empty: true, note: "No quote data." };
    },
  },
  {
    name: "get_financials",
    description: "Income statement summary for a ticker (annual, last 3 years).",
    parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] },
    run: async (a, ctx) => {
      const sym = String(a.symbol || "");
      const d: any = await dataFetch(
        ctx,
        `/financials?symbol=${encodeURIComponent(sym)}&type=income&period=annual&limit=3`,
      );
      const rows = Array.isArray(d) ? d : d?.statements || d?.income || d?.data || [];
      return {
        years: trim(rows, 3).map((r: any) => ({
          year: r.calendarYear || r.fiscalYear || r.date,
          revenue: r.revenue,
          grossProfit: r.grossProfit,
          operatingIncome: r.operatingIncome,
          netIncome: r.netIncome,
          eps: r.epsdiluted || r.eps,
        })),
      };
    },
  },
  {
    name: "get_news",
    description: "Latest news headlines for a ticker (or general market if omitted). Up to 6 items.",
    parameters: { type: "object", properties: { symbol: { type: "string" }, limit: { type: "number" } } },
    run: async (a, ctx) => {
      const sym = a.symbol ? String(a.symbol) : "";
      const lim = Math.min(Number(a.limit) || 6, 10);
      const path = `/news?${sym ? `symbol=${encodeURIComponent(sym)}&` : ""}limit=${lim}`;
      const d: any = await dataFetch(ctx, path);
      const articles = trim(d?.articles || d?.news || [], 6);
      return {
        articles: articles.map((n: any) => ({
          title: n.title || n.headline,
          source: n.source || n.publisher || n.site,
          date: n.date || n.publishedAt || n.pubDate,
          url: n.url || n.link,
        })),
      };
    },
  },
  {
    name: "get_filings",
    description: "SEC filings for a US ticker. Optional type filter (10-K, 10-Q, 8-K).",
    parameters: { type: "object", properties: { symbol: { type: "string" }, type: { type: "string" } }, required: ["symbol"] },
    run: async (a, ctx) => {
      const sym = String(a.symbol || "");
      const type = a.type ? String(a.type) : "";
      const d: any = await dataFetch(
        ctx,
        `/filings?symbol=${encodeURIComponent(sym)}${type ? `&type=${encodeURIComponent(type)}` : ""}&limit=8`,
      );
      const list = trim(d?.filings || d?.results || [], 8);
      return {
        filings: list.map((f: any) => ({
          form: f.form || f.type,
          filed: f.filedAt || f.date || f.filed,
          description: f.description || f.title,
          url: f.linkToHtml || f.url,
        })),
      };
    },
  },
  {
    name: "get_estimates",
    description: "Sell-side analyst consensus estimates and price targets.",
    parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] },
    run: async (a, ctx) => {
      const sym = String(a.symbol || "");
      const d: any = await dataFetch(ctx, `/estimates?symbol=${encodeURIComponent(sym)}`);
      return d?.estimates || d || { empty: true };
    },
  },
  {
    name: "get_transcripts",
    description: "Earnings call transcripts list for a ticker (most recent first).",
    parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] },
    run: async (a, ctx) => {
      const sym = String(a.symbol || "");
      const d: any = await dataFetch(ctx, `/transcripts?symbol=${encodeURIComponent(sym)}&limit=4`);
      const list = d?.transcripts || d?.results || [];
      return {
        transcripts: trim(list, 4).map((t: any) => ({
          symbol: t.symbol,
          year: t.year,
          quarter: t.quarter,
          date: t.date,
          url: t.url,
          excerpt: typeof t.content === "string" ? t.content.slice(0, 600) : undefined,
        })),
      };
    },
  },
  {
    name: "get_macro",
    description:
      "Macro indicator series. Indicators: GDP_GROWTH_RATE, INFLATION_RATE, UNEMPLOYMENT_RATE, INTEREST_RATE, YIELD_10Y, YIELD_2Y.",
    parameters: { type: "object", properties: { country: { type: "string" }, indicator: { type: "string" } }, required: ["indicator"] },
    run: async (a, ctx) => {
      const country = a.country ? String(a.country) : "US";
      const indicator = String(a.indicator || "");
      const path = `/macro?country=${encodeURIComponent(country)}&indicator=${encodeURIComponent(indicator)}&periods=12`;
      const d: any = await dataFetch(ctx, path);
      return d?.series || d?.history || d || { empty: true };
    },
  },
  {
    name: "get_dividends",
    description: "Dividend history for a ticker (ex-date, payment date, amount).",
    parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] },
    run: async (a, ctx) => {
      const sym = String(a.symbol || "");
      const d: any = await dataFetch(ctx, `/dividends?symbol=${encodeURIComponent(sym)}`);
      const list = d?.recent || d?.dividends || d?.historical || [];
      return { dividends: trim(list, 8), yieldPct: d?.yieldPct, ttm: d?.ttm };
    },
  },
];

function buildSystemPrompt(surface: "platform" | "excel"): string {
  const base = `You are Finsyt's institutional research agent.

Your job: answer the user's financial question by planning, calling tools to gather REAL data from the platform's data routes, and synthesising a grounded answer.

Rules:
- Always plan first. Call multiple tools in parallel when independent (e.g. quote + news + filings for the same ticker).
- Cite EVERY non-trivial claim with the matching source label like (FMP quote), (10-K 2024-Feb-21), (Reuters), (FRED).
- For one or more tickers, prefer get_quote + get_financials + get_news. For "earnings call" or "guidance" → get_transcripts. For 10-K / 10-Q / 8-K → get_filings. For GDP / inflation / rates → get_macro. For payout / yield → get_dividends.
- Be concise but complete. Lead with the so-what in 1-2 sentences, then bullets, then a short risk caveat.
- If a tool returns nothing useful, say so explicitly — do not hallucinate.
- Format the final answer as Markdown.`;
  if (surface !== "excel") return base;
  return (
    base +
    `

EXCEL CONTEXT — IMPORTANT:
- The user is in Microsoft Excel. The task pane shows your answer next to their workbook.
- Whenever the natural answer is a number, formula, or small table that belongs in the workbook, ALSO call one of the propose_* tools so the user gets a one-click "Insert" button. Examples:
  • "What's NVDA's price?" → call propose_formula with =FINSYT.QUOTE("NVDA").
  • "Give me Apple's last 3 years of revenue" → call propose_range with a 4×2 table.
  • "Build me a DCF for MSFT" → call propose_template with kind=dcf, symbol=MSFT.
- Available =FINSYT.* worksheet functions you can suggest in formulas: QUOTE, METRIC, HISTORY, FINANCIALS, ESTIMATE, TRANSCRIPT, FILINGS, NEWS, MACRO, DIVIDEND, ASK.
- Keep prose answers SHORT (≤120 words) when proposing a formula or template — the spreadsheet does the heavy lifting.`
  );
}

function buildToolList(surface: "platform" | "excel"): ToolDef[] {
  if (surface !== "excel") return DATA_TOOLS;
  return [
    ...DATA_TOOLS,
    ...EXCEL_TOOLS_DEFS.map(
      (t): ToolDef => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
        // No `run` — we don't execute these server-side. We emit an `action`
        // SSE frame and return a stub result to the model so it can keep going.
      }),
    ),
  ];
}

function summariseToolResult(name: string, out: any): string {
  if (!out || out.error) return out?.error || "no data";
  switch (name) {
    case "get_quote":
      return out.symbol ? `${out.symbol} $${out.price ?? "—"} · ${out.changePct ?? "—"}%` : "no quote";
    case "get_news":
      return `${out.articles?.length || 0} headlines`;
    case "get_filings":
      return `${out.filings?.length || 0} filings`;
    case "get_financials":
      return `${out.years?.length || 0} years of statements`;
    case "get_transcripts":
      return `${out.transcripts?.length || 0} transcripts`;
    case "get_macro":
      return Array.isArray(out) ? `${out.length} datapoints` : "macro series";
    case "get_dividends":
      return `${out.dividends?.length || 0} dividend rows`;
    case "get_estimates":
      return out?.consensus || out?.numAnalysts ? "consensus loaded" : "estimates";
    case "propose_formula":
      return "formula proposed";
    case "propose_range":
      return "range proposed";
    case "propose_template":
      return "template proposed";
    default:
      return JSON.stringify(out).slice(0, 80);
  }
}

export async function runAgent(opts: AgentRunOptions): Promise<void> {
  const { question, baseUrl, surface, signal, send } = opts;
  const toolCtx: ToolCtx = {
    base: baseUrl,
    prefix: opts.dataRoutePrefix || "/api",
    headers: opts.forwardHeaders,
  };
  const tools = buildToolList(surface);
  const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));
  const openaiTools = tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  send("step", { kind: "plan", label: "Planning approach…" });

  const messages: any[] = [
    { role: "system", content: buildSystemPrompt(surface) },
    { role: "user", content: (opts.contextPreface || "") + question },
  ];

  for (let turn = 0; turn < 5; turn++) {
    if (signal.aborted) return;
    const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        tools: openaiTools,
        tool_choice: "auto",
        parallel_tool_calls: true,
      }),
      signal,
    });
    if (!r.ok) {
      const txt = await r.text();
      send("error", { message: `Model error ${r.status}: ${txt.slice(0, 300)}` });
      return;
    }
    const j: any = await r.json();
    const msg = j.choices?.[0]?.message;
    if (!msg) {
      send("error", { message: "No model response" });
      return;
    }

    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
      messages.push(msg);
      send("step", {
        kind: "tools",
        label: `Calling ${msg.tool_calls.length} tool${msg.tool_calls.length > 1 ? "s" : ""}…`,
      });

      const results = await Promise.all(
        msg.tool_calls.map(async (tc: any) => {
          const def = toolMap[tc.function.name];
          let args: any = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {/* ignore */}
          send("tool_call", { id: tc.id, name: tc.function.name, args });

          // Excel propose_* tools have no server-side `run`; emit an action
          // and hand the model a stub success result.
          if (!def?.run && tc.function.name.startsWith("propose_")) {
            // Action protocol: emit spec shape (type+payload) plus legacy
            // (kind+args) for back-compat with older task panes.
            const proposalKind = tc.function.name.replace(/^propose_/, "");
            const typeMap: Record<string, string> = {
              formula: "insert_formula",
              range: "write_range",
              template: "insert_template",
            };
            const type = typeMap[proposalKind] || proposalKind;
            send("action", {
              type,
              kind: proposalKind, // legacy field — keep for back-compat
              payload: args,
              args, // legacy alias
            });
            const stub = { ok: true, suggested: true };
            send("tool_result", {
              id: tc.id,
              name: tc.function.name,
              ok: true,
              summary: summariseToolResult(tc.function.name, stub),
              raw: JSON.stringify(stub),
            });
            return {
              tool_call_id: tc.id,
              role: "tool",
              name: tc.function.name,
              content: JSON.stringify(stub),
            };
          }

          const out = def?.run ? await def.run(args, toolCtx) : { error: "unknown tool" };
          send("tool_result", {
            id: tc.id,
            name: tc.function.name,
            ok: !(out as any)?.error,
            summary: summariseToolResult(tc.function.name, out),
            raw: JSON.stringify(out).slice(0, 6000),
          });
          return {
            tool_call_id: tc.id,
            role: "tool",
            name: tc.function.name,
            content: JSON.stringify(out).slice(0, 8000),
          };
        }),
      );
      for (const r of results) messages.push(r);
      continue;
    }

    const final = msg.content || "";
    send("step", { kind: "synthesise", label: "Synthesising answer…" });
    const chunkSize = 40;
    for (let i = 0; i < final.length; i += chunkSize) {
      send("answer_chunk", { text: final.slice(i, i + chunkSize) });
      await new Promise((res) => setTimeout(res, 8));
    }
    send("done", { ok: true });
    return;
  }

  send("error", { message: "Agent exceeded reasoning turn budget." });
}
