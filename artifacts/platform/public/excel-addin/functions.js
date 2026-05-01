/* global CustomFunctions, Office, fetch */

const API_BASE = "https://finsyt.com/platform/api/v1";

function getApiKey() {
  try {
    const k = Office.context.document.settings.get("finsyt_api_key");
    if (!k) throw new Error("Sign in via the Finsyt task pane first (Home → Open Finsyt).");
    return k;
  } catch (e) {
    throw new Error(e.message || "Finsyt: not signed in.");
  }
}

async function call(path) {
  const key = getApiKey();
  const res = await fetch(API_BASE + path, { headers: { Authorization: "Bearer " + key } });
  if (res.status === 401) throw new Error("Finsyt: invalid API key.");
  if (res.status === 429) throw new Error("Finsyt: rate limit exceeded.");
  if (res.status === 503) throw new Error("Finsyt: providers exhausted, try again.");
  if (!res.ok) throw new Error("Finsyt: HTTP " + res.status);
  return res.json();
}

/**
 * =FINSYT.QUOTE("AAPL")           → price
 * =FINSYT.QUOTE("AAPL","marketCap")
 */
async function QUOTE(symbol, field) {
  const f = (field || "price").trim();
  const data = await call("/quote?symbol=" + encodeURIComponent(symbol));
  if (data == null) throw new Error("Finsyt: no quote.");
  if (!(f in data)) throw new Error("Finsyt: unknown field '" + f + "'.");
  return data[f];
}
CustomFunctions.associate("QUOTE", QUOTE);

/**
 * =FINSYT.METRIC("AAPL","revenue")            most recent annual
 * =FINSYT.METRIC("AAPL","revenue","quarterly")
 * =FINSYT.METRIC("AAPL","revenue","annual",-1) prior period
 */
async function METRIC(symbol, metric, period, offset) {
  const p = (period || "annual").toLowerCase().startsWith("q") ? "Q" : "A";
  const off = Math.abs(Number(offset) || 0);
  const url =
    "/financials?symbol=" + encodeURIComponent(symbol) +
    "&metric=" + encodeURIComponent(metric) +
    "&period=" + p +
    "&offset=" + off +
    "&limit=1";
  const data = await call(url);
  // Internal /financials returns either { rows: [{ value, period }] } or
  // { value, period } depending on shape. Be permissive.
  if (data && Array.isArray(data.rows) && data.rows.length) {
    const row = data.rows[0];
    return row.value ?? row.amount ?? row[metric] ?? null;
  }
  if (data && typeof data === "object" && "value" in data) return data.value;
  if (data && typeof data === "object" && metric in data) return data[metric];
  throw new Error("Finsyt: metric '" + metric + "' not available.");
}
CustomFunctions.associate("METRIC", METRIC);

/**
 * =FINSYT.HISTORY("AAPL","2024-01-01","2024-12-31")
 * Returns a 2-D range with header: Date | Open | High | Low | Close | Volume
 */
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
  const rows = bars.map((b) => {
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
  return [header, ...rows];
}
CustomFunctions.associate("HISTORY", HISTORY);

/**
 * =FINSYT.SEARCH("apple", 5)
 * Returns Symbol | Name | Exchange
 */
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
  return [header, ...list.map((r) => [
    r.symbol ?? r.ticker ?? "",
    r.name ?? r.companyName ?? "",
    r.exchange ?? r.mic ?? "",
  ])];
}
CustomFunctions.associate("SEARCH", SEARCH);
