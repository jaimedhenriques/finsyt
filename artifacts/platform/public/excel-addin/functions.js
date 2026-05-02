/* global CustomFunctions, Office, fetch */

// Derive API base from the URL of this script so prod/dev manifests both work.
function resolveApiBase() {
  // Allow an override stored alongside the auth token.
  try {
    const o = Office.context.document.settings.get("finsyt_api_base");
    if (typeof o === "string" && o) return o.replace(/\/$/, "");
  } catch (e) { /* ignore */ }
  try {
    if (typeof document !== "undefined" && document.currentScript && document.currentScript.src) {
      const u = new URL(document.currentScript.src);
      // Drop everything from /excel-addin onward; this gives us the platform root.
      const idx = u.pathname.indexOf("/excel-addin");
      const platformRoot = idx >= 0 ? u.pathname.slice(0, idx) : "/platform";
      return u.origin + platformRoot + "/api/v1";
    }
  } catch (e) { /* ignore */ }
  return "https://finsyt.com/platform/api/v1";
}

const API_BASE = resolveApiBase();

function getCredential() {
  // Prefer the short-lived Clerk-popup add-in token; fall back to a long-lived
  // fsk_ workspace API key.
  try {
    const tok = Office.context.document.settings.get("finsyt_addin_token");
    if (typeof tok === "string" && tok) return tok;
  } catch (e) { /* ignore */ }
  try {
    const k = Office.context.document.settings.get("finsyt_api_key");
    if (typeof k === "string" && k) return k;
  } catch (e) { /* ignore */ }
  throw new Error("Sign in via the Finsyt task pane first (Home → Open Finsyt).");
}

async function call(path) {
  const cred = getCredential();
  const res = await fetch(API_BASE + path, {
    headers: { Authorization: "Bearer " + cred },
  });
  if (res.status === 401) throw new Error("Finsyt: not signed in or token expired.");
  if (res.status === 403) throw new Error("Finsyt: insufficient permissions.");
  if (res.status === 429) throw new Error("Finsyt: rate limit exceeded.");
  if (res.status === 503) throw new Error("Finsyt: providers exhausted, try again.");
  if (!res.ok) throw new Error("Finsyt: HTTP " + res.status);
  return res.json();
}

// /api/macro returns `history`, /api/v1/macro returns `series`. Accept either.
function pickMacroSeries(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.series)) return data.series;
  if (Array.isArray(data.history)) return data.history;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

// ── Period parsing ──────────────────────────────────────────────────────────
// Accepted forms:
//   "FY"            → most recent annual
//   "FY-1", "FY-2"  → relative annual offsets
//   "FY2024"        → fixed fiscal year (alias: bare "2024")
//   "Q", "Q-1"      → quarterly offsets
//   "Q1-2025"       → fixed quarter (alias: "2025Q1")
//   "TTM" / "LTM"   → trailing twelve months (synonyms)
//   bare integer    → annual offset (0 = most recent)
function parsePeriod(p) {
  const s = String(p == null ? "FY" : p).trim().toUpperCase();
  if (s === "TTM" || s === "LTM") {
    return { period: "Q", offset: 0, ttm: true, year: null, quarter: null };
  }
  if (s === "FY" || s === "ANNUAL") return { period: "A", offset: 0 };
  let m = /^FY-(\d+)$/.exec(s);
  if (m) return { period: "A", offset: parseInt(m[1], 10) };
  m = /^FY(\d{4})$/.exec(s);
  if (m) return { period: "A", year: parseInt(m[1], 10) };
  if (s === "Q" || s === "QUARTERLY") return { period: "Q", offset: 0 };
  m = /^Q-(\d+)$/.exec(s);
  if (m) return { period: "Q", offset: parseInt(m[1], 10) };
  m = /^(\d{4})Q([1-4])$/.exec(s);
  if (m) return { period: "Q", year: parseInt(m[1], 10), quarter: parseInt(m[2], 10) };
  m = /^Q([1-4])-(\d{4})$/.exec(s);
  if (m) return { period: "Q", year: parseInt(m[2], 10), quarter: parseInt(m[1], 10) };
  m = /^(\d{4})$/.exec(s);
  if (m) return { period: "A", year: parseInt(m[1], 10) };
  if (/^-?\d+$/.test(s)) return { period: "A", offset: Math.abs(parseInt(s, 10)) };
  return { period: "A", offset: 0 };
}

// ── QUOTE ───────────────────────────────────────────────────────────────────
async function QUOTE(symbol, field) {
  const f = (field || "price").trim();
  const data = await call("/quote?symbol=" + encodeURIComponent(symbol));
  const q = data && (data.quote || data);
  if (!q) throw new Error("Finsyt: no quote.");
  if (!(f in q)) throw new Error("Finsyt: unknown field '" + f + "'.");
  return q[f];
}
CustomFunctions.associate("QUOTE", QUOTE);

// ── METRIC ──────────────────────────────────────────────────────────────────
async function METRIC(symbol, metric, period, offset) {
  const p = (period || "annual").toLowerCase().startsWith("q") ? "Q" : "A";
  const off = Math.abs(Number(offset) || 0);
  const url =
    "/financials?symbol=" + encodeURIComponent(symbol) +
    "&metric=" + encodeURIComponent(metric) +
    "&period=" + p + "&offset=" + off + "&limit=1";
  const data = await call(url);
  if (data && Array.isArray(data.rows) && data.rows.length) {
    const row = data.rows[0];
    return row.value ?? row.amount ?? row[metric] ?? null;
  }
  if (data && typeof data === "object" && "value" in data) return data.value;
  if (data && typeof data === "object" && metric in data) return data[metric];
  throw new Error("Finsyt: metric '" + metric + "' not available.");
}
CustomFunctions.associate("METRIC", METRIC);

// ── HISTORY ─────────────────────────────────────────────────────────────────
async function HISTORY(symbol, from, to, timespan) {
  const ts = (timespan || "day").toLowerCase();
  const url =
    "/aggs?symbol=" + encodeURIComponent(symbol) +
    "&from=" + encodeURIComponent(from) +
    "&to=" + encodeURIComponent(to) +
    "&timespan=" + encodeURIComponent(ts);
  const data = await call(url);
  const bars =
    (Array.isArray(data) && data) ||
    (data && Array.isArray(data.bars) && data.bars) ||
    (data && Array.isArray(data.results) && data.results) ||
    (data && Array.isArray(data.data) && data.data) ||
    [];
  const header = ["Date", "Open", "High", "Low", "Close", "Volume"];
  if (!bars.length) return [header, ["No data", "", "", "", "", ""]];
  const rows = bars.map(function (b) {
    const tRaw = b.t ?? b.date ?? b.timestamp ?? b.time;
    const d = typeof tRaw === "number" ? new Date(tRaw) : new Date(tRaw);
    const iso = isNaN(d.getTime()) ? String(tRaw ?? "") : d.toISOString().slice(0, 10);
    return [
      iso,
      Number(b.o ?? b.open ?? 0),
      Number(b.h ?? b.high ?? 0),
      Number(b.l ?? b.low ?? 0),
      Number(b.c ?? b.close ?? 0),
      Number(b.v ?? b.volume ?? 0),
    ];
  });
  return [header].concat(rows);
}
CustomFunctions.associate("HISTORY", HISTORY);

// ── SEARCH ──────────────────────────────────────────────────────────────────
async function SEARCH(query, limit) {
  const lim = Math.max(1, Math.min(50, Number(limit) || 10));
  const url = "/search?q=" + encodeURIComponent(query) + "&limit=" + lim;
  const data = await call(url);
  const list =
    (Array.isArray(data) && data) ||
    (data && Array.isArray(data.results) && data.results) ||
    (data && Array.isArray(data.matches) && data.matches) ||
    [];
  const header = ["Symbol", "Name", "Exchange"];
  if (!list.length) return [header, ["No matches", "", ""]];
  return [header].concat(
    list.map(function (r) {
      return [
        r.symbol ?? r.ticker ?? "",
        r.name ?? r.companyName ?? "",
        r.exchange ?? r.mic ?? "",
      ];
    }),
  );
}
CustomFunctions.associate("SEARCH", SEARCH);

// ── FINANCIALS (scalar line item for one period) ────────────────────────────
/**
 * =FINSYT.FINANCIALS("AAPL","income","revenue","FY-1")
 * Returns one line item value from a statement at the requested period.
 */
async function FINANCIALS(symbol, statement, line, period) {
  if (!statement) throw new Error("Finsyt: statement required (income|balance|cash).");
  if (!line) throw new Error("Finsyt: line item required.");
  const stmt = String(statement).toLowerCase();
  const sp = parsePeriod(period);
  const p = sp.period;
  // We pull a small window then pick the right row by year/offset locally.
  const lim = sp.year ? 8 : Math.max(1, (sp.offset || 0) + 1);
  const url =
    "/financials?symbol=" + encodeURIComponent(symbol) +
    "&type=" + encodeURIComponent(stmt) +
    "&metric=" + encodeURIComponent(line) +
    "&period=" + p +
    "&limit=" + lim;
  const data = await call(url);
  const rows =
    (data && Array.isArray(data.rows) && data.rows) ||
    (data && Array.isArray(data.statements) && data.statements) ||
    (Array.isArray(data) ? data : []);
  if (!rows.length) throw new Error("Finsyt: no financials for " + symbol + ".");
  let row = null;
  if (sp.year) {
    row = rows.find(function (r) {
      const y = Number(r.calendarYear || r.fiscalYear || (r.date ? String(r.date).slice(0, 4) : ""));
      if (y !== sp.year) return false;
      if (sp.quarter) {
        const q = Number(r.period ? String(r.period).replace(/[^0-9]/g, "") : r.quarter || 0);
        return q === sp.quarter;
      }
      return true;
    }) || null;
  } else {
    row = rows[Math.min(sp.offset || 0, rows.length - 1)] || null;
  }
  if (!row) throw new Error("Finsyt: period '" + period + "' not found.");
  const v = row.value ?? row.amount ?? row[line];
  if (v == null) throw new Error("Finsyt: line '" + line + "' missing on row.");
  return v;
}
CustomFunctions.associate("FINANCIALS", FINANCIALS);

// ── ESTIMATE (scalar consensus value for forward period) ────────────────────
/**
 * =FINSYT.ESTIMATE("AAPL","eps","next_q")
 * =FINSYT.ESTIMATE("AAPL","revenue","next_y","high")
 */
async function ESTIMATE(symbol, metric, period, type) {
  if (!metric) throw new Error("Finsyt: metric required.");
  const m = String(metric).trim().toLowerCase();
  const per = String(period || "current_y").trim().toLowerCase();
  const t = String(type || "consensus").trim().toLowerCase();
  const data = await call("/estimates?symbol=" + encodeURIComponent(symbol));
  if (!data) throw new Error("Finsyt: no estimates.");
  // Pick annual vs quarterly bucket from /api/estimates' real shape; fall
  // back to legacy keys for any older mock servers.
  const wantsQuarterUpfront = per.indexOf("_q") > 0;
  const list =
    (wantsQuarterUpfront && Array.isArray(data.estimatesQuarterly) && data.estimatesQuarterly) ||
    (!wantsQuarterUpfront && Array.isArray(data.estimatesAnnual) && data.estimatesAnnual) ||
    (Array.isArray(data.estimates) && data.estimates) ||
    (Array.isArray(data.rows) && data.rows) ||
    (Array.isArray(data) ? data : []);
  // Helper: pick consensus, high, low, median fields tolerantly.
  function pickStat(node) {
    if (!node || typeof node !== "object") return null;
    if (t === "consensus") {
      return node.avg ?? node.average ?? node.mean ?? node.consensus ?? node.estimate ?? node.value ?? null;
    }
    if (t === "high")   return node.high ?? node.max ?? null;
    if (t === "low")    return node.low ?? node.min ?? null;
    if (t === "median") return node.median ?? node.med ?? null;
    return node[t] ?? null;
  }
  // FMP rows have flat metric fields (revenueAvg / epsHigh / …).
  function pickFmpFlat(row) {
    if (!row || typeof row !== "object") return null;
    const cap = m.charAt(0).toUpperCase() + m.slice(1);
    if (t === "consensus") return row[m + "Avg"]   ?? row["estimated" + cap + "Avg"]  ?? null;
    if (t === "high")      return row[m + "High"]  ?? row["estimated" + cap + "High"] ?? null;
    if (t === "low")       return row[m + "Low"]   ?? row["estimated" + cap + "Low"]  ?? null;
    if (t === "median")    return row[m + "Median"]?? row["estimated" + cap + "Median"] ?? null;
    return null;
  }
  // 1) Top-level scalar fields (priceTarget / numAnalysts / rating).
  if (per === "current_y" || per === "current_q") {
    if (m === "pricetarget") return data.priceTarget ?? data.consensus?.priceTarget ?? null;
    if (m === "numanalysts") return data.numAnalysts ?? data.consensus?.numAnalysts ?? null;
    if (m === "rating")      return data.rating      ?? data.consensus?.rating      ?? null;
  }
  // 2) Period-aware lookup; the bucket above filters annual vs quarterly.
  const wantsForward = per.indexOf("next") === 0;
  const today = new Date();
  const candidates = list.filter(function (r) {
    const dateStr = r.date || r.endDate || r.periodEnd || "";
    if (!wantsForward) return true;
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && d > today;
  });
  candidates.sort(function (a, b) {
    return new Date(a.date || a.endDate || 0) - new Date(b.date || b.endDate || 0);
  });
  const target = candidates[0] || list[0];
  if (!target) throw new Error("Finsyt: no estimate row for period '" + per + "'.");
  // Try the FMP-flat shape first (revenueAvg/epsHigh/etc.), then a nested
  // metric node, then the row itself.
  const flat = pickFmpFlat(target);
  if (flat != null) return flat;
  const node = target[m] ?? target[m + "Estimate"] ?? target[m + "Avg"] ?? target;
  const v = pickStat(node);
  if (v == null && typeof node === "number") return node;
  if (v == null) throw new Error("Finsyt: estimate metric '" + m + "' not available.");
  return v;
}
CustomFunctions.associate("ESTIMATE", ESTIMATE);

// ── TRANSCRIPT (returns a 2-D text block) ───────────────────────────────────
/**
 * =FINSYT.TRANSCRIPT("AAPL","2024Q1","summary")
 * Section options: summary | prepared | qa | full (default summary).
 * Returns header row + body rows so it spills as a 2-D range.
 */
async function TRANSCRIPT(symbol, period, section) {
  const sp = parsePeriod(period || "latest");
  const sec = String(section || "summary").trim().toLowerCase();
  let url = "/transcripts?symbol=" + encodeURIComponent(symbol);
  if (sp.year) url += "&year=" + sp.year;
  if (sp.quarter) url += "&quarter=" + sp.quarter;
  const data = await call(url);
  // /api/transcripts returns `{transcripts:[…]}` for symbol-only lookups
  // but a single transcript object when year+quarter are supplied.
  let t = null;
  if (data && (Array.isArray(data.transcripts) || Array.isArray(data.results))) {
    const list = data.transcripts || data.results;
    t = list[0] || null;
  } else if (data && (data.content || data.transcript || data.summary)) {
    t = data;
  }
  if (!t) return [["No transcript found"]];
  const header = [[
    String(t.symbol || symbol).toUpperCase() +
      " — " + (t.year || sp.year || "") + (t.quarter ? "Q" + t.quarter : (sp.quarter ? "Q" + sp.quarter : "")) +
      " (" + sec + ")",
  ]];
  const meta = [[
    "Date: " + (t.date || t.publishedAt || ""),
  ]];
  let bodyText = "";
  if (sec === "summary") {
    bodyText = t.summary || (typeof t.content === "string" ? t.content.slice(0, 1500) : "");
  } else if (sec === "prepared") {
    bodyText = t.prepared || t.preparedRemarks || "";
    if (!bodyText && typeof t.content === "string") {
      const i = t.content.toLowerCase().indexOf("question");
      bodyText = i > 0 ? t.content.slice(0, i) : t.content;
    }
  } else if (sec === "qa") {
    bodyText = t.qa || t.questionsAnswers || "";
    if (!bodyText && typeof t.content === "string") {
      const i = t.content.toLowerCase().indexOf("question");
      bodyText = i > 0 ? t.content.slice(i) : "";
    }
  } else {
    bodyText = t.content || t.transcript || "";
  }
  if (!bodyText) return header.concat(meta, [["(empty section)"]]);
  // Split into ~120-char-wide rows so Excel cells are readable.
  const rows = [];
  const paragraphs = String(bodyText).split(/\n+/);
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    let s = trimmed;
    while (s.length > 120) {
      let cut = s.lastIndexOf(" ", 120);
      if (cut < 60) cut = 120;
      rows.push([s.slice(0, cut)]);
      s = s.slice(cut).trimStart();
    }
    if (s) rows.push([s]);
  }
  // Cap to 200 rows.
  return header.concat(meta, rows.slice(0, 200));
}
CustomFunctions.associate("TRANSCRIPT", TRANSCRIPT);

// ── FILINGS ─────────────────────────────────────────────────────────────────
async function FILINGS(symbol, type, limit) {
  const lim = Math.max(1, Math.min(50, Number(limit) || 10));
  const url =
    "/filings?symbol=" + encodeURIComponent(symbol) +
    (type ? "&type=" + encodeURIComponent(type) : "") +
    "&limit=" + lim;
  const data = await call(url);
  const list = (data && (data.filings || data.results)) || [];
  const header = ["Form", "Filed", "Description", "URL"];
  if (!list.length) return [header, ["No filings", "", "", ""]];
  return [header].concat(
    list.map(function (f) {
      return [
        f.form || f.type || "",
        f.filedAt || f.date || f.filed || "",
        f.description || f.title || "",
        f.linkToHtml || f.url || "",
      ];
    }),
  );
}
CustomFunctions.associate("FILINGS", FILINGS);

// ── NEWS ────────────────────────────────────────────────────────────────────
async function NEWS(symbol, limit) {
  const lim = Math.max(1, Math.min(50, Number(limit) || 10));
  const url =
    "/news?" + (symbol ? "symbol=" + encodeURIComponent(symbol) + "&" : "") +
    "limit=" + lim;
  const data = await call(url);
  const list = (data && (data.articles || data.news)) || [];
  const header = ["Date", "Source", "Title", "URL"];
  if (!list.length) return [header, ["No headlines", "", "", ""]];
  return [header].concat(
    list.map(function (n) {
      return [
        n.date || n.publishedAt || n.pubDate || "",
        n.source || n.publisher || n.site || "",
        n.title || n.headline || "",
        n.url || n.link || "",
      ];
    }),
  );
}
CustomFunctions.associate("NEWS", NEWS);

// ── MACRO (series, [from], [to]) ────────────────────────────────────────────
/**
 * =FINSYT.MACRO("CPI","2020-01-01","2024-12-31") → Date | Value
 * If from/to are omitted, returns the most recent ~24 observations.
 */
async function MACRO(series, from, to) {
  if (!series) throw new Error("Finsyt: series required.");
  const id = String(series).trim().toUpperCase();
  let periods = 24;
  if (from && to) {
    const a = new Date(from);
    const b = new Date(to);
    if (!isNaN(a.getTime()) && !isNaN(b.getTime())) {
      const months = Math.max(1, Math.round((b.getTime() - a.getTime()) / (30 * 24 * 3600 * 1000)));
      periods = Math.min(360, months);
    }
  }
  const url = "/macro?indicator=" + encodeURIComponent(id) + "&country=US&periods=" + periods;
  const data = await call(url);
  const series_data = pickMacroSeries(data);
  const header = ["Date", "Value"];
  if (!series_data.length) return [header, ["No data", ""]];
  let rows = series_data.map(function (s) {
    return [s.date || s.period || s.t || "", Number(s.value ?? s.v ?? 0)];
  });
  if (from) {
    const f = new Date(from).getTime();
    if (!isNaN(f)) rows = rows.filter(function (r) { return new Date(r[0]).getTime() >= f; });
  }
  if (to) {
    const t = new Date(to).getTime();
    if (!isNaN(t)) rows = rows.filter(function (r) { return new Date(r[0]).getTime() <= t; });
  }
  if (!rows.length) return [header, ["No data", ""]];
  return [header].concat(rows);
}
CustomFunctions.associate("MACRO", MACRO);

// ── MACRO_LATEST (scalar — most recent value for one series) ────────────────
/**
 * =FINSYT.MACRO_LATEST("YIELD_10Y")            → most recent value (US default)
 * =FINSYT.MACRO_LATEST("CPI","US")             → most recent value, explicit country
 *
 * Scalar companion to MACRO(): returns just the latest observation as a
 * single number, suitable for plugging directly into single-cell formulas
 * such as the WACC template's risk-free rate input.
 */
async function MACRO_LATEST(series, country) {
  if (!series) throw new Error("Finsyt: series required.");
  const id = String(series).trim().toUpperCase();
  const c = String(country || "US").trim().toUpperCase();
  const url =
    "/macro?indicator=" + encodeURIComponent(id) +
    "&country=" + encodeURIComponent(c) +
    "&periods=1";
  const data = await call(url);
  const series_data = pickMacroSeries(data);
  if (!series_data.length) throw new Error("Finsyt: no observations for '" + id + "'.");
  const last = series_data[series_data.length - 1];
  const v = Number(last.value ?? last.v ?? 0);
  if (!isFinite(v)) throw new Error("Finsyt: non-numeric value for '" + id + "'.");
  return v;
}
CustomFunctions.associate("MACRO_LATEST", MACRO_LATEST);

// ── DIVIDEND (scalar field for symbol) ──────────────────────────────────────
/**
 * =FINSYT.DIVIDEND("AAPL")            → trailing dividend yield (decimal)
 * =FINSYT.DIVIDEND("AAPL","payout")   → dividend payout ratio
 * =FINSYT.DIVIDEND("AAPL","nextExDate") → upcoming ex-date (string)
 * =FINSYT.DIVIDEND("AAPL","amount")   → most recent dividend per share
 * =FINSYT.DIVIDEND("AAPL","frequency") → e.g. "Quarterly"
 */
async function DIVIDEND(symbol, field) {
  const f = String(field || "yield").trim().toLowerCase();
  const data = await call("/dividends?symbol=" + encodeURIComponent(symbol));
  // /api/dividends returns `recent` (slim rows) + `yieldPct` + `ttm` +
  // `currentPrice`. Older mocks may use `dividends`/`historical`.
  const list =
    (data && Array.isArray(data.recent) && data.recent) ||
    (data && (data.dividends || data.historical)) ||
    [];
  function rowAmount(d) {
    return Number(d.amount ?? d.adjAmount ?? d.dividend ?? d.adjDividend ?? 0);
  }
  function rowDate(d) {
    return d.exDate || d.date || d.paymentDate || "";
  }
  const top = list[0] || null;
  if (f === "amount") {
    if (!top) return null;
    return rowAmount(top);
  }
  if (f === "nextexdate" || f === "next_ex_date" || f === "exdate") {
    const today = new Date().toISOString().slice(0, 10);
    const future = list.map(rowDate).filter(function (s) { return s && s >= today; }).sort();
    return future[0] || (top ? rowDate(top) : "");
  }
  if (f === "frequency") {
    if (data && data.frequency) return data.frequency;
    const recent = list.slice(0, 4).map(rowDate).filter(Boolean);
    if (recent.length < 2) return "Unknown";
    const ts = recent.map(function (s) { return new Date(s).getTime(); }).filter(function (n) { return !isNaN(n); });
    if (ts.length < 2) return "Unknown";
    const days = (ts[0] - ts[ts.length - 1]) / (ts.length - 1) / (24 * 3600 * 1000);
    if (days < 45)  return "Monthly";
    if (days < 120) return "Quarterly";
    if (days < 200) return "Semi-Annual";
    return "Annual";
  }
  if (f === "payout" || f === "payoutratio") {
    try {
      const r = await call("/financials?symbol=" + encodeURIComponent(symbol) + "&metric=payoutRatio&period=A&limit=1");
      const rows = (r && r.rows) || [];
      if (rows[0] && rows[0].value != null) return Number(rows[0].value);
    } catch (e) { /* fall through */ }
    if (data && data.payoutRatio != null) return Number(data.payoutRatio);
    return null;
  }
  if (f === "ttm") {
    if (data && data.ttm != null) return Number(data.ttm);
    return list.slice(0, 4).reduce(function (s, d) { return s + rowAmount(d); }, 0) || null;
  }
  // Default: yield. Server already returns `yieldPct` as a percent value.
  if (data && data.yieldPct != null) return Number(data.yieldPct) / 100;
  if (data && data.yield != null) return Number(data.yield);
  if (data && data.dividendYield != null) return Number(data.dividendYield);
  if (data && data.ttm != null && data.currentPrice) {
    const p = Number(data.currentPrice);
    if (p > 0) return Number(data.ttm) / p;
  }
  if (!top) return null;
  const ttm = list.slice(0, 4).reduce(function (s, d) { return s + rowAmount(d); }, 0);
  if (!ttm) return null;
  try {
    const q = await call("/quote?symbol=" + encodeURIComponent(symbol));
    const price = Number((q && (q.quote || q).price) || 0);
    if (price > 0) return ttm / price;
  } catch (e) { /* ignore */ }
  return null;
}
CustomFunctions.associate("DIVIDEND", DIVIDEND);

// ── ASK ─────────────────────────────────────────────────────────────────────
/**
 * =FINSYT.ASK("What was AAPL's revenue growth last year?")
 * =FINSYT.ASK("Compare gross margin vs peers", "AAPL")
 * Non-streaming convenience: drains the SSE stream and returns the final answer
 * as a single string.
 */
async function ASK(question, symbol) {
  const cred = getCredential();
  const body = { question: String(question || "") };
  if (symbol) body.context = { symbol: String(symbol).toUpperCase() };
  const res = await fetch(API_BASE + "/agent/ask", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + cred,
      "Content-Type": "application/json",
      "X-Finsyt-Surface": "excel",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error("Finsyt: HTTP " + res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let errored = "";
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    buffer += decoder.decode(r.value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = frame.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += (data ? "\n" : "") + line.slice(5).trim();
      }
      if (!data) continue;
      try {
        const j = JSON.parse(data);
        if (event === "answer_chunk" && typeof j.text === "string") answer += j.text;
        else if (event === "error" && j.message) errored = j.message;
      } catch (e) { /* ignore malformed frame */ }
    }
  }
  if (errored && !answer) throw new Error("Finsyt: " + errored);
  return answer || "(no answer)";
}
CustomFunctions.associate("ASK", ASK);
