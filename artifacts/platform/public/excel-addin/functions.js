/* global CustomFunctions, Office, Excel, fetch */

// ── Shared provenance store ──────────────────────────────────────────────────
// Keyed by "SYMBOL:field" (upper-cased). Written by scalar data functions,
// read by =FINSYT.SOURCE(). Shared with the taskpane via the same runtime.
var _finsytProv = (typeof window !== "undefined" && window._finsytProv)
  ? window._finsytProv
  : {};
if (typeof window !== "undefined") window._finsytProv = _finsytProv;

// Per-token agent rate limiter (in-cell AGENT calls): max 10 per 60s.
var _agentBucket = { count: 0, resetAt: 0 };
function _checkAgentRate() {
  var now = Date.now();
  if (now > _agentBucket.resetAt) { _agentBucket.count = 0; _agentBucket.resetAt = now + 60000; }
  if (_agentBucket.count >= 10) throw new Error("Finsyt: in-cell agent rate limit (10/min). Use the task pane for high-volume queries.");
  _agentBucket.count++;
}

// Derive API base from the URL of this script so prod/dev manifests both work.
function resolveApiBase() {
  try {
    var o = Office.context.document.settings.get("finsyt_api_base");
    if (typeof o === "string" && o) return o.replace(/\/$/, "");
  } catch (e) { /* ignore */ }
  try {
    if (typeof document !== "undefined" && document.currentScript && document.currentScript.src) {
      var u = new URL(document.currentScript.src);
      var idx = u.pathname.indexOf("/excel-addin");
      var platformRoot = idx >= 0 ? u.pathname.slice(0, idx) : "/platform";
      return u.origin + platformRoot + "/api/v1";
    }
  } catch (e) { /* ignore */ }
  return "https://finsyt.com/platform/api/v1";
}

var API_BASE = resolveApiBase();

function getCredential() {
  try {
    var tok = Office.context.document.settings.get("finsyt_addin_token");
    if (typeof tok === "string" && tok) return tok;
  } catch (e) { /* ignore */ }
  try {
    var k = Office.context.document.settings.get("finsyt_api_key");
    if (typeof k === "string" && k) return k;
  } catch (e) { /* ignore */ }
  throw new Error("Sign in via the Finsyt task pane first (Home → Open Finsyt).");
}

// Standard JSON fetch helper.
async function call(path) {
  var cred = getCredential();
  var res = await fetch(API_BASE + path, {
    headers: { Authorization: "Bearer " + cred },
  });
  if (res.status === 401) throw new Error("Finsyt: not signed in or token expired.");
  if (res.status === 403) throw new Error("Finsyt: insufficient permissions.");
  if (res.status === 429) throw new Error("Finsyt: rate limit exceeded.");
  if (res.status === 503) throw new Error("Finsyt: providers exhausted, try again.");
  if (!res.ok) throw new Error("Finsyt: HTTP " + res.status);
  return res.json();
}

// ── Provenance helpers ───────────────────────────────────────────────────────

/**
 * Store provenance in the shared map and, when running in the shared runtime,
 * write a cell comment to the calling cell so the source is discoverable
 * without leaving Excel.
 *
 * @param {string} provKey - e.g. "AAPL:price"
 * @param {string} label   - human label, e.g. "FMP / EODHD"
 * @param {string} url     - deep link or empty string
 * @param {object} [inv]   - CustomFunctions invocation (has .address when requiresAddress:true)
 */
function _storeProvenance(provKey, label, url, inv) {
  var entry = {
    label: label || "Finsyt",
    url: url || "",
    ts: new Date().toISOString().slice(0, 10),
  };
  // Keys are always stored uppercased so SOURCE() can look them up case-insensitively.
  _finsytProv[provKey.toUpperCase()] = entry;

  // Attempt to write a cell comment in the shared runtime (non-fatal).
  // Requires ExcelApi 1.10+. Uses getItemOrNullObject + sync so the Office.js
  // context is not mixed with native Promise chains.
  if (typeof Excel !== "undefined" && Excel.run && inv && inv.address) {
    var cellAddr = inv.address;
    var note = "Source: " + entry.label + (entry.url ? "\n" + entry.url : "") + "\nAs of: " + entry.ts + "\nData via Finsyt — finsyt.com";
    Excel.run(function (ctx) {
      // Strip sheet prefix from address (Excel passes e.g. "Sheet1!B3").
      var addr = cellAddr.indexOf("!") >= 0 ? cellAddr.split("!")[1] : cellAddr;
      var sheet = ctx.workbook.worksheets.getActiveWorksheet();
      var range = sheet.getRange(addr);
      // getItemOrNullObject avoids a throw when no comment exists.
      var existing = ctx.workbook.comments.getItemByCell ? null : null;
      try {
        existing = ctx.workbook.comments.getItemByCell(range);
      } catch (e) { /* API may not be present */ }
      if (existing) {
        // Load isNullObject so we can branch inside the same sync batch.
        existing.load("isNullObject");
        return ctx.sync().then(function () {
          if (!existing.isNullObject) existing.delete();
          ctx.workbook.comments.add(range, note);
          return ctx.sync();
        });
      }
      ctx.workbook.comments.add(range, note);
      return ctx.sync();
    }).catch(function () { /* non-fatal: cell comments require ExcelApi 1.10+ */ });
  }
}

/**
 * Extract a source label from a raw API response object.
 * Looks for `source`, `provider`, `attribution` fields.
 */
function _pickSource(data) {
  if (!data || typeof data !== "object") return "";
  var v = data.source || data.provider || data.attribution;
  if (typeof v === "string" && v) return v;
  var q = data.quote;
  if (q && typeof q === "object") {
    v = q.source || q.provider;
    if (typeof v === "string" && v) return v;
  }
  return "";
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
function parsePeriod(p) {
  var s = String(p == null ? "FY" : p).trim().toUpperCase();
  if (s === "TTM" || s === "LTM") {
    return { period: "Q", offset: 0, ttm: true, year: null, quarter: null };
  }
  if (s === "FY" || s === "ANNUAL") return { period: "A", offset: 0 };
  var m = /^FY-(\d+)$/.exec(s);
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
async function QUOTE(symbol, field, invocation) {
  var f = (field || "price").trim();
  var data = await call("/quote?symbol=" + encodeURIComponent(symbol));
  var q = data && (data.quote || data);
  if (!q) throw new Error("Finsyt: no quote.");
  if (!(f in q)) throw new Error("Finsyt: unknown field '" + f + "'.");
  var src = _pickSource(data) || "Finsyt";
  _storeProvenance(symbol + ":" + f, src, "", invocation);
  return q[f];
}
CustomFunctions.associate("QUOTE", QUOTE);

// ── METRIC ──────────────────────────────────────────────────────────────────
async function METRIC(symbol, metric, period, offset, invocation) {
  var p = (period || "annual").toLowerCase().startsWith("q") ? "Q" : "A";
  var off = Math.abs(Number(offset) || 0);
  var url =
    "/financials?symbol=" + encodeURIComponent(symbol) +
    "&metric=" + encodeURIComponent(metric) +
    "&period=" + p + "&offset=" + off + "&limit=1";
  var data = await call(url);
  var src = _pickSource(data) || "Finsyt";
  _storeProvenance(symbol + ":metric:" + metric, src, "", invocation);
  if (data && Array.isArray(data.rows) && data.rows.length) {
    var row = data.rows[0];
    return row.value ?? row.amount ?? row[metric] ?? null;
  }
  if (data && typeof data === "object" && "value" in data) return data.value;
  if (data && typeof data === "object" && metric in data) return data[metric];
  throw new Error("Finsyt: metric '" + metric + "' not available.");
}
CustomFunctions.associate("METRIC", METRIC);

// ── HISTORY ─────────────────────────────────────────────────────────────────
async function HISTORY(symbol, from, to, timespan) {
  var ts = (timespan || "day").toLowerCase();
  var url =
    "/aggs?symbol=" + encodeURIComponent(symbol) +
    "&from=" + encodeURIComponent(from) +
    "&to=" + encodeURIComponent(to) +
    "&timespan=" + encodeURIComponent(ts);
  var data = await call(url);
  var bars =
    (Array.isArray(data) && data) ||
    (data && Array.isArray(data.bars) && data.bars) ||
    (data && Array.isArray(data.results) && data.results) ||
    (data && Array.isArray(data.data) && data.data) ||
    [];
  var header = ["Date", "Open", "High", "Low", "Close", "Volume"];
  if (!bars.length) return [header, ["No data", "", "", "", "", ""]];
  var rows = bars.map(function (b) {
    var tRaw = b.t ?? b.date ?? b.timestamp ?? b.time;
    var d = typeof tRaw === "number" ? new Date(tRaw) : new Date(tRaw);
    var iso = isNaN(d.getTime()) ? String(tRaw ?? "") : d.toISOString().slice(0, 10);
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
  var lim = Math.max(1, Math.min(50, Number(limit) || 10));
  var url = "/search?q=" + encodeURIComponent(query) + "&limit=" + lim;
  var data = await call(url);
  var list =
    (Array.isArray(data) && data) ||
    (data && Array.isArray(data.results) && data.results) ||
    (data && Array.isArray(data.matches) && data.matches) ||
    [];
  var header = ["Symbol", "Name", "Exchange"];
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
async function FINANCIALS(symbol, statement, line, period, invocation) {
  if (!statement) throw new Error("Finsyt: statement required (income|balance|cash).");
  if (!line) throw new Error("Finsyt: line item required.");
  var stmt = String(statement).toLowerCase();
  var sp = parsePeriod(period);
  var p = sp.period;
  var lim = sp.year ? 8 : Math.max(1, (sp.offset || 0) + 1);
  var url =
    "/financials?symbol=" + encodeURIComponent(symbol) +
    "&type=" + encodeURIComponent(stmt) +
    "&metric=" + encodeURIComponent(line) +
    "&period=" + p +
    "&limit=" + lim;
  var data = await call(url);
  var rows =
    (data && Array.isArray(data.rows) && data.rows) ||
    (data && Array.isArray(data.statements) && data.statements) ||
    (Array.isArray(data) ? data : []);
  if (!rows.length) throw new Error("Finsyt: no financials for " + symbol + ".");
  var row = null;
  if (sp.year) {
    row = rows.find(function (r) {
      var y = Number(r.calendarYear || r.fiscalYear || (r.date ? String(r.date).slice(0, 4) : ""));
      if (y !== sp.year) return false;
      if (sp.quarter) {
        var q = Number(r.period ? String(r.period).replace(/[^0-9]/g, "") : r.quarter || 0);
        return q === sp.quarter;
      }
      return true;
    }) || null;
  } else {
    row = rows[Math.min(sp.offset || 0, rows.length - 1)] || null;
  }
  if (!row) throw new Error("Finsyt: period '" + period + "' not found.");
  var v = row.value ?? row.amount ?? row[line];
  if (v == null) throw new Error("Finsyt: line '" + line + "' missing on row.");
  var src = _pickSource(data) || row.source || "Finsyt";
  var provUrl = row.filingUrl || row.url || "";
  _storeProvenance(symbol + ":financials:" + line, src, provUrl, invocation);
  return v;
}
CustomFunctions.associate("FINANCIALS", FINANCIALS);

// ── ESTIMATE (scalar consensus value for forward period) ────────────────────
async function ESTIMATE(symbol, metric, period, type, invocation) {
  if (!metric) throw new Error("Finsyt: metric required.");
  var m = String(metric).trim().toLowerCase();
  var per = String(period || "current_y").trim().toLowerCase();
  var t = String(type || "consensus").trim().toLowerCase();
  var data = await call("/estimates?symbol=" + encodeURIComponent(symbol));
  if (!data) throw new Error("Finsyt: no estimates.");
  var wantsQuarterUpfront = per.indexOf("_q") > 0;
  var list =
    (wantsQuarterUpfront && Array.isArray(data.estimatesQuarterly) && data.estimatesQuarterly) ||
    (!wantsQuarterUpfront && Array.isArray(data.estimatesAnnual) && data.estimatesAnnual) ||
    (Array.isArray(data.estimates) && data.estimates) ||
    (Array.isArray(data.rows) && data.rows) ||
    (Array.isArray(data) ? data : []);
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
  function pickFmpFlat(row) {
    if (!row || typeof row !== "object") return null;
    var cap = m.charAt(0).toUpperCase() + m.slice(1);
    if (t === "consensus") return row[m + "Avg"]   ?? row["estimated" + cap + "Avg"]  ?? null;
    if (t === "high")      return row[m + "High"]  ?? row["estimated" + cap + "High"] ?? null;
    if (t === "low")       return row[m + "Low"]   ?? row["estimated" + cap + "Low"]  ?? null;
    if (t === "median")    return row[m + "Median"]?? row["estimated" + cap + "Median"] ?? null;
    return null;
  }
  if (per === "current_y" || per === "current_q") {
    if (m === "pricetarget") return data.priceTarget ?? data.consensus?.priceTarget ?? null;
    if (m === "numanalysts") return data.numAnalysts ?? data.consensus?.numAnalysts ?? null;
    if (m === "rating")      return data.rating      ?? data.consensus?.rating      ?? null;
  }
  var wantsForward = per.indexOf("next") === 0;
  var today = new Date();
  var candidates = list.filter(function (r) {
    var dateStr = r.date || r.endDate || r.periodEnd || "";
    if (!wantsForward) return true;
    var d = new Date(dateStr);
    return !isNaN(d.getTime()) && d > today;
  });
  candidates.sort(function (a, b) {
    return new Date(a.date || a.endDate || 0) - new Date(b.date || b.endDate || 0);
  });
  var target = candidates[0] || list[0];
  if (!target) throw new Error("Finsyt: no estimate row for period '" + per + "'.");
  var flat = pickFmpFlat(target);
  if (flat != null) {
    var src = _pickSource(data) || "Finsyt";
    _storeProvenance(symbol + ":estimate:" + m, src, "", invocation);
    return flat;
  }
  var node = target[m] ?? target[m + "Estimate"] ?? target[m + "Avg"] ?? target;
  var val = pickStat(node);
  if (val == null && typeof node === "number") val = node;
  if (val == null) throw new Error("Finsyt: estimate metric '" + m + "' not available.");
  var srcE = _pickSource(data) || "Finsyt";
  _storeProvenance(symbol + ":estimate:" + m, srcE, "", invocation);
  return val;
}
CustomFunctions.associate("ESTIMATE", ESTIMATE);

// ── TRANSCRIPT (returns a 2-D text block) ───────────────────────────────────
async function TRANSCRIPT(symbol, period, section) {
  var sp = parsePeriod(period || "latest");
  var sec = String(section || "summary").trim().toLowerCase();
  var url = "/transcripts?symbol=" + encodeURIComponent(symbol);
  if (sp.year) url += "&year=" + sp.year;
  if (sp.quarter) url += "&quarter=" + sp.quarter;
  var data = await call(url);
  var t = null;
  if (data && (Array.isArray(data.transcripts) || Array.isArray(data.results))) {
    var list = data.transcripts || data.results;
    t = list[0] || null;
  } else if (data && (data.content || data.transcript || data.summary)) {
    t = data;
  }
  if (!t) return [["No transcript found"]];
  var header = [[
    String(t.symbol || symbol).toUpperCase() +
      " — " + (t.year || sp.year || "") + (t.quarter ? "Q" + t.quarter : (sp.quarter ? "Q" + sp.quarter : "")) +
      " (" + sec + ")",
  ]];
  var meta = [[
    "Date: " + (t.date || t.publishedAt || "") + (t.url ? " | Source: " + (t.source || "Finsyt") : ""),
  ]];
  var bodyText = "";
  if (sec === "summary") {
    bodyText = t.summary || (typeof t.content === "string" ? t.content.slice(0, 1500) : "");
  } else if (sec === "prepared") {
    bodyText = t.prepared || t.preparedRemarks || "";
    if (!bodyText && typeof t.content === "string") {
      var i = t.content.toLowerCase().indexOf("question");
      bodyText = i > 0 ? t.content.slice(0, i) : t.content;
    }
  } else if (sec === "qa") {
    bodyText = t.qa || t.questionsAnswers || "";
    if (!bodyText && typeof t.content === "string") {
      var qi = t.content.toLowerCase().indexOf("question");
      bodyText = qi > 0 ? t.content.slice(qi) : "";
    }
  } else {
    bodyText = t.content || t.transcript || "";
  }
  if (!bodyText) return header.concat(meta, [["(empty section)"]]);
  var rows = [];
  var paragraphs = String(bodyText).split(/\n+/);
  for (var pi = 0; pi < paragraphs.length; pi++) {
    var trimmed = paragraphs[pi].trim();
    if (!trimmed) continue;
    var s = trimmed;
    while (s.length > 120) {
      var cut = s.lastIndexOf(" ", 120);
      if (cut < 60) cut = 120;
      rows.push([s.slice(0, cut)]);
      s = s.slice(cut).trimStart();
    }
    if (s) rows.push([s]);
  }
  return header.concat(meta, rows.slice(0, 200));
}
CustomFunctions.associate("TRANSCRIPT", TRANSCRIPT);

// ── FILINGS ─────────────────────────────────────────────────────────────────
async function FILINGS(symbol, type, limit) {
  var lim = Math.max(1, Math.min(50, Number(limit) || 10));
  var url =
    "/filings?symbol=" + encodeURIComponent(symbol) +
    (type ? "&type=" + encodeURIComponent(type) : "") +
    "&limit=" + lim;
  var data = await call(url);
  var list = (data && (data.filings || data.results)) || [];
  var header = ["Form", "Filed", "Description", "URL"];
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
  var lim = Math.max(1, Math.min(50, Number(limit) || 10));
  var url =
    "/news?" + (symbol ? "symbol=" + encodeURIComponent(symbol) + "&" : "") +
    "limit=" + lim;
  var data = await call(url);
  var list = (data && (data.articles || data.news)) || [];
  var header = ["Date", "Source", "Title", "URL"];
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
async function MACRO(series, from, to) {
  if (!series) throw new Error("Finsyt: series required.");
  var id = String(series).trim().toUpperCase();
  var periods = 24;
  if (from && to) {
    var a = new Date(from);
    var b = new Date(to);
    if (!isNaN(a.getTime()) && !isNaN(b.getTime())) {
      var months = Math.max(1, Math.round((b.getTime() - a.getTime()) / (30 * 24 * 3600 * 1000)));
      periods = Math.min(360, months);
    }
  }
  var url = "/macro?indicator=" + encodeURIComponent(id) + "&country=US&periods=" + periods;
  var data = await call(url);
  var series_data = pickMacroSeries(data);
  var header = ["Date", "Value"];
  if (!series_data.length) return [header, ["No data", ""]];
  var rows = series_data.map(function (s) {
    return [s.date || s.period || s.t || "", Number(s.value ?? s.v ?? 0)];
  });
  if (from) {
    var f = new Date(from).getTime();
    if (!isNaN(f)) rows = rows.filter(function (r) { return new Date(r[0]).getTime() >= f; });
  }
  if (to) {
    var tEnd = new Date(to).getTime();
    if (!isNaN(tEnd)) rows = rows.filter(function (r) { return new Date(r[0]).getTime() <= tEnd; });
  }
  if (!rows.length) return [header, ["No data", ""]];
  return [header].concat(rows);
}
CustomFunctions.associate("MACRO", MACRO);

// ── MACRO_LATEST (scalar) ────────────────────────────────────────────────────
async function MACRO_LATEST(series, country) {
  if (!series) throw new Error("Finsyt: series required.");
  var id = String(series).trim().toUpperCase();
  var c = String(country || "US").trim().toUpperCase();
  var url =
    "/macro?indicator=" + encodeURIComponent(id) +
    "&country=" + encodeURIComponent(c) +
    "&periods=1";
  var data = await call(url);
  var series_data = pickMacroSeries(data);
  if (!series_data.length) throw new Error("Finsyt: no observations for '" + id + "'.");
  var last = series_data[series_data.length - 1];
  var v = Number(last.value ?? last.v ?? 0);
  if (!isFinite(v)) throw new Error("Finsyt: non-numeric value for '" + id + "'.");
  return v;
}
CustomFunctions.associate("MACRO_LATEST", MACRO_LATEST);

// ── DIVIDEND ─────────────────────────────────────────────────────────────────
async function DIVIDEND(symbol, field, invocation) {
  var f = String(field || "yield").trim().toLowerCase();
  var data = await call("/dividends?symbol=" + encodeURIComponent(symbol));
  var list =
    (data && Array.isArray(data.recent) && data.recent) ||
    (data && (data.dividends || data.historical)) ||
    [];
  var src = _pickSource(data) || "Finsyt";
  _storeProvenance(symbol + ":dividend:" + f, src, "", invocation);

  function rowAmount(d) {
    return Number(d.amount ?? d.adjAmount ?? d.dividend ?? d.adjDividend ?? 0);
  }
  function rowDate(d) {
    return d.exDate || d.date || d.paymentDate || "";
  }
  var top = list[0] || null;
  if (f === "amount") {
    if (!top) return null;
    return rowAmount(top);
  }
  if (f === "nextexdate" || f === "next_ex_date" || f === "exdate") {
    var today = new Date().toISOString().slice(0, 10);
    var future = list.map(rowDate).filter(function (s) { return s && s >= today; }).sort();
    return future[0] || (top ? rowDate(top) : "");
  }
  if (f === "frequency") {
    if (data && data.frequency) return data.frequency;
    var recent = list.slice(0, 4).map(rowDate).filter(Boolean);
    if (recent.length < 2) return "Unknown";
    var ts = recent.map(function (s) { return new Date(s).getTime(); }).filter(function (n) { return !isNaN(n); });
    if (ts.length < 2) return "Unknown";
    var days = (ts[0] - ts[ts.length - 1]) / (ts.length - 1) / (24 * 3600 * 1000);
    if (days < 45)  return "Monthly";
    if (days < 120) return "Quarterly";
    if (days < 200) return "Semi-Annual";
    return "Annual";
  }
  if (f === "payout" || f === "payoutratio") {
    try {
      var r = await call("/financials?symbol=" + encodeURIComponent(symbol) + "&metric=payoutRatio&period=A&limit=1");
      var rows = (r && r.rows) || [];
      if (rows[0] && rows[0].value != null) return Number(rows[0].value);
    } catch (e) { /* fall through */ }
    if (data && data.payoutRatio != null) return Number(data.payoutRatio);
    return null;
  }
  if (f === "ttm") {
    if (data && data.ttm != null) return Number(data.ttm);
    return list.slice(0, 4).reduce(function (s, d) { return s + rowAmount(d); }, 0) || null;
  }
  if (data && data.yieldPct != null) return Number(data.yieldPct) / 100;
  if (data && data.yield != null) return Number(data.yield);
  if (data && data.dividendYield != null) return Number(data.dividendYield);
  if (data && data.ttm != null && data.currentPrice) {
    var p = Number(data.currentPrice);
    if (p > 0) return Number(data.ttm) / p;
  }
  if (!top) return null;
  var ttm = list.slice(0, 4).reduce(function (s, d) { return s + rowAmount(d); }, 0);
  if (!ttm) return null;
  try {
    var q = await call("/quote?symbol=" + encodeURIComponent(symbol));
    var price = Number((q && (q.quote || q).price) || 0);
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
  var cred = getCredential();
  var body = { question: String(question || "") };
  if (symbol) body.context = { symbol: String(symbol).toUpperCase() };
  var res = await fetch(API_BASE + "/agent/ask", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + cred,
      "Content-Type": "application/json",
      "X-Finsyt-Surface": "excel",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error("Finsyt: HTTP " + res.status);
  var reader = res.body.getReader();
  var decoder = new TextDecoder();
  var buffer = "";
  var answer = "";
  var errored = "";
  while (true) {
    var r = await reader.read();
    if (r.done) break;
    buffer += decoder.decode(r.value, { stream: true });
    var idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      var frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      var lines = frame.split("\n");
      var event = "message";
      var data = "";
      for (var li = 0; li < lines.length; li++) {
        if (lines[li].startsWith("event:")) event = lines[li].slice(6).trim();
        else if (lines[li].startsWith("data:")) data += (data ? "\n" : "") + lines[li].slice(5).trim();
      }
      if (!data) continue;
      try {
        var j = JSON.parse(data);
        if (event === "answer_chunk" && typeof j.text === "string") answer += j.text;
        else if (event === "error" && j.message) errored = j.message;
      } catch (e) { /* ignore malformed frame */ }
    }
  }
  if (errored && !answer) throw new Error("Finsyt: " + errored);
  return answer || "(no answer)";
}
CustomFunctions.associate("ASK", ASK);

// ── AGENT ────────────────────────────────────────────────────────────────────
/**
 * =FINSYT.AGENT("Why did NVDA beat earnings?")
 * =FINSYT.AGENT("Compare AAPL vs MSFT margins","AAPL",6)
 *
 * Returns a 2-D spill:
 *   Row 1 : ["Answer", <full answer text>]
 *   Row 2+: ["[N]", <provider label>, <URL or "">, <excerpt or "">]
 *
 * Rate-limited to 10 calls / minute to prevent formula-recalc storms.
 */
async function AGENT(prompt, symbol, maxCitations) {
  _checkAgentRate();
  var cred = getCredential();
  var maxCite = Math.min(20, Math.max(1, Number(maxCitations) || 8));
  var body = { question: String(prompt || "") };
  if (symbol) body.context = { symbol: String(symbol).toUpperCase() };
  var res = await fetch(API_BASE + "/agent/ask", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + cred,
      "Content-Type": "application/json",
      "X-Finsyt-Surface": "excel-cell",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error("Finsyt: HTTP " + res.status);

  var reader = res.body.getReader();
  var decoder = new TextDecoder();
  var buffer = "";
  var answer = "";
  var errored = "";

  // Collect citations from tool_result events:
  // { title, url, source, excerpt }
  var citations = [];
  var citationIndex = 1;

  // Index references found in the answer text like [1], [2].
  // We also collect news/filings/transcripts from tool results.
  var toolResults = {};

  while (true) {
    var r = await reader.read();
    if (r.done) break;
    buffer += decoder.decode(r.value, { stream: true });
    var idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      var frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      var lines = frame.split("\n");
      var evt = "message";
      var rawData = "";
      for (var li = 0; li < lines.length; li++) {
        if (lines[li].startsWith("event:")) evt = lines[li].slice(6).trim();
        else if (lines[li].startsWith("data:")) rawData += (rawData ? "\n" : "") + lines[li].slice(5).trim();
      }
      if (!rawData) continue;
      try {
        var j = JSON.parse(rawData);
        if (evt === "answer_chunk" && typeof j.text === "string") {
          answer += j.text;
        } else if (evt === "error" && j.message) {
          errored = j.message;
        } else if (evt === "tool_result") {
          // Collect source info from tool results so we can build citations.
          var toolId = j.id || j.name || ("tool" + Object.keys(toolResults).length);
          var toolName = j.name || "";
          var providerLabel = j.provider || j.summary || "";
          // Try to extract URLs and source items from raw payload.
          if (j.raw) {
            try {
              var payload = JSON.parse(j.raw);
              // News articles → one citation per article (capped).
              var articles = payload.articles || payload.news || [];
              for (var ai = 0; ai < articles.length && citations.length < maxCite; ai++) {
                var art = articles[ai];
                if (art.url || art.link) {
                  citations.push({
                    index: citationIndex++,
                    source: art.source || art.publisher || providerLabel || "News",
                    url: art.url || art.link || "",
                    excerpt: (art.title || "").slice(0, 120),
                  });
                }
              }
              // Filings → one citation per filing.
              var filings = payload.filings || [];
              for (var fi = 0; fi < filings.length && citations.length < maxCite; fi++) {
                var filing = filings[fi];
                if (filing.url) {
                  citations.push({
                    index: citationIndex++,
                    source: "SEC EDGAR (" + (filing.form || "Filing") + ")",
                    url: filing.url,
                    excerpt: (filing.description || filing.form || "").slice(0, 80) + (filing.filed ? " · " + filing.filed : ""),
                  });
                }
              }
              // Transcripts → one citation per transcript.
              var transcripts = payload.transcripts || [];
              for (var ti = 0; ti < transcripts.length && citations.length < maxCite; ti++) {
                var tr = transcripts[ti];
                if (tr.url || tr.symbol) {
                  citations.push({
                    index: citationIndex++,
                    source: "Earnings call — " + (tr.symbol || "") + " " + (tr.year || "") + (tr.quarter ? "Q" + tr.quarter : ""),
                    url: tr.url || "",
                    excerpt: (typeof tr.excerpt === "string" ? tr.excerpt.slice(0, 120) : ""),
                  });
                }
              }
              // Provider-level citation if no finer-grained items.
              if (articles.length === 0 && filings.length === 0 && transcripts.length === 0 && providerLabel && citations.length < maxCite) {
                citations.push({
                  index: citationIndex++,
                  source: providerLabel,
                  url: "",
                  excerpt: toolName ? "Tool: " + toolName : "",
                });
              }
            } catch (e) {
              // raw is not JSON — add a generic citation if we have a label.
              if (providerLabel && citations.length < maxCite) {
                citations.push({
                  index: citationIndex++,
                  source: providerLabel,
                  url: "",
                  excerpt: toolName ? "Tool: " + toolName : "",
                });
              }
            }
          } else if (providerLabel && citations.length < maxCite) {
            citations.push({
              index: citationIndex++,
              source: providerLabel,
              url: "",
              excerpt: toolName ? "Tool: " + toolName : "",
            });
          }
          toolResults[toolId] = j;
        }
      } catch (e) { /* ignore malformed frame */ }
    }
  }

  if (errored && !answer) throw new Error("Finsyt: " + errored);
  if (!answer) answer = "(no answer)";

  // Build the 2-D result.
  var resultRows = [["Answer", answer]];
  if (citations.length > 0) {
    resultRows.push(["#", "Source", "URL", "Excerpt"]);
    for (var ci = 0; ci < citations.length; ci++) {
      var cite = citations[ci];
      resultRows.push(["[" + cite.index + "]", cite.source, cite.url, cite.excerpt]);
    }
  }
  return resultRows;
}
CustomFunctions.associate("AGENT", AGENT);

// ── SOURCE ───────────────────────────────────────────────────────────────────
/**
 * =FINSYT.SOURCE("AAPL","price")
 * Returns the data-source attribution for the most recently fetched value
 * for this symbol and field. Relies on the shared provenance cache written
 * by QUOTE / FINANCIALS / METRIC / ESTIMATE / DIVIDEND.
 */
function SOURCE(symbol, field) {
  if (!symbol) return "";
  var sym = String(symbol).trim().toUpperCase();
  // Keys are always stored fully uppercased (e.g. "AAPL:PRICE", "AAPL:FINANCIALS:REVENUE").
  // Normalize field to uppercase so lookup always matches regardless of caller case.
  var f = String(field || "price").trim().toUpperCase();
  var key = sym + ":" + f;
  if (_finsytProv[key]) return _finsytProv[key].label + " (as of " + _finsytProv[key].ts + ")";
  // Scan for any key prefixed with this symbol when an exact field match isn't found.
  var prefix = sym + ":";
  var keys = Object.keys(_finsytProv).filter(function (k) { return k.indexOf(prefix) === 0; });
  if (keys.length) {
    // Return the most recently stored entry for this symbol.
    keys.sort(function (a, b) {
      var ta = _finsytProv[a].ts || "";
      var tb = _finsytProv[b].ts || "";
      return tb < ta ? -1 : tb > ta ? 1 : 0;
    });
    var entry = _finsytProv[keys[0]];
    return entry.label + " (as of " + entry.ts + ")";
  }
  return "No source recorded yet — recalculate the data cell first.";
}
CustomFunctions.associate("SOURCE", SOURCE);
