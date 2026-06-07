/* global Office, Excel, fetch */
/* Finsyt Excel task pane — Agent + Builder. */

(function () {
  "use strict";

  // Base URL: derive from the script's own URL so dev and prod manifests work.
  function resolveOrigins() {
    let origin = "https://finsyt.com";
    let platformRoot = "/platform";
    try {
      const here = new URL(document.currentScript ? document.currentScript.src : window.location.href);
      origin = here.origin;
      const idx = here.pathname.indexOf("/excel-addin");
      platformRoot = idx >= 0 ? here.pathname.slice(0, idx) : "/platform";
    } catch (e) { /* fall back to defaults */ }
    return {
      origin,
      platformRoot,
      apiBase: origin + platformRoot + "/api/v1",
      authPage: origin + platformRoot + "/excel-addin/auth",
      developerPage: origin + platformRoot + "/app/developer",
    };
  }

  const ORIGINS = resolveOrigins();

  // ── DOM helpers ───────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }
  function setStatus(node, msg, ok) {
    node.style.display = "block";
    node.className = "status " + (ok ? "ok" : "err");
    node.textContent = msg;
  }

  // ── Credential storage ────────────────────────────────────────────────────
  function getStored(key) {
    try { return Office.context.document.settings.get(key) || null; } catch (e) { return null; }
  }
  async function setStored(key, val) {
    try {
      Office.context.document.settings.set(key, val);
      await new Promise((res) => Office.context.document.settings.saveAsync(res));
    } catch (e) { /* ignore */ }
  }
  async function clearAuth() {
    try {
      Office.context.document.settings.remove("finsyt_addin_token");
      Office.context.document.settings.remove("finsyt_api_key");
      Office.context.document.settings.remove("finsyt_user_email");
      await new Promise((res) => Office.context.document.settings.saveAsync(res));
    } catch (e) { /* ignore */ }
  }
  function currentCredential() {
    return getStored("finsyt_addin_token") || getStored("finsyt_api_key") || null;
  }

  // ── App state ─────────────────────────────────────────────────────────────
  const state = {
    sendContext: true,
    confirmWrites: true,
    contextSummary: {
      workbook: null, sheet: null, address: null,
      values: null, formulas: null,
    },
    inflightAbort: null,
    builderBusy: false,
  };

  function initialTabFromUrl() {
    const h = (window.location.hash || "").replace(/^#/, "").toLowerCase();
    if (h === "builder" || h === "functions" || h === "copilot") return h;
    try {
      const u = new URL(window.location.href);
      const t = (u.searchParams.get("tab") || "").toLowerCase();
      if (t === "builder" || t === "functions" || t === "copilot") return t;
    } catch (e) { /* ignore */ }
    return "copilot";
  }

  // ── Sign-in / sign-out ────────────────────────────────────────────────────
  function renderHeader() {
    const me = $("me-area");
    const cred = currentCredential();
    if (!cred) { me.innerHTML = ""; return; }
    const email = getStored("finsyt_user_email");
    const label = email || (cred.indexOf("fxa_") === 0 ? "Signed in" : "API key");
    me.innerHTML = label + " · <a id=\"signout\">Sign out</a>";
    $("signout").onclick = async () => {
      await clearAuth();
      showSignIn();
    };
  }

  function showSignIn() {
    show($("pane-signin"));
    hide($("tabs"));
    hide($("pane-copilot"));
    hide($("pane-builder"));
    hide($("pane-functions"));
    renderHeader();
  }
  function showApp() {
    hide($("pane-signin"));
    show($("tabs"));
    activateTab(initialTabFromUrl());
    renderHeader();
    refreshSheetContext();
  }
  function activateTab(name) {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.pane === name);
    });
    ["copilot", "builder", "functions"].forEach((n) => {
      const el = $("pane-" + n);
      if (n === name) show(el); else hide(el);
    });
  }

  function clerkSignIn() {
    const status = $("signin-status");
    const dialogUrl = ORIGINS.authPage;
    let dialog;
    try {
      Office.context.ui.displayDialogAsync(
        dialogUrl,
        { height: 65, width: 35, promptBeforeOpen: false },
        (result) => {
          if (result.status !== Office.AsyncResultStatus.Succeeded) {
            setStatus(status, "Could not open sign-in window: " + (result.error && result.error.message), false);
            return;
          }
          dialog = result.value;
          dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (arg) => {
            try {
              const payload = JSON.parse(arg.message);
              if (payload.token) {
                await setStored("finsyt_addin_token", payload.token);
                if (payload.email) await setStored("finsyt_user_email", payload.email);
                dialog.close();
                showApp();
              } else if (payload.error) {
                setStatus(status, "Sign-in failed: " + payload.error, false);
              }
            } catch (e) {
              setStatus(status, "Unexpected message from sign-in window.", false);
            }
          });
          dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {/* user closed */});
        },
      );
    } catch (e) {
      setStatus(status, "Sign-in failed: " + (e.message || e), false);
    }
  }

  async function apiKeySignIn() {
    const status = $("signin-status");
    const k = ($("key-input").value || "").trim();
    if (!k.startsWith("fsk_")) { setStatus(status, "Key must start with fsk_", false); return; }
    try {
      const res = await fetch(ORIGINS.apiBase + "/quote?symbol=AAPL", {
        headers: { Authorization: "Bearer " + k },
      });
      if (res.status === 401) { setStatus(status, "Invalid API key.", false); return; }
      if (!res.ok && res.status !== 503) { setStatus(status, "Unexpected " + res.status + " from server.", false); return; }
      await setStored("finsyt_api_key", k);
      setStatus(status, "Signed in.", true);
      showApp();
    } catch (e) { setStatus(status, "Network error: " + e.message, false); }
  }

  // Sheet context for the agent prompt: book/sheet/selection + values + formulas
  // (capped to 12×12 cells).
  async function refreshSheetContext() {
    if (typeof Excel === "undefined" || !Excel.run) return;
    try {
      await Excel.run(async (ctx) => {
        const wb = ctx.workbook;
        wb.load(["name"]);
        const sel = wb.getSelectedRange();
        sel.load(["address", "values", "formulas", "rowCount", "columnCount", "worksheet/name"]);
        await ctx.sync();
        const workbook = wb.name || null;
        const sheet = sel.worksheet ? sel.worksheet.name : null;
        const address = sel.address || null;
        const cap = (m) => (Array.isArray(m) ? m.slice(0, 12).map((r) => r.slice(0, 12)) : null);
        const values = cap(sel.values);
        const formulas = cap(sel.formulas);
        state.contextSummary = { workbook, sheet, address, values, formulas };
        const txt = $("ctx-text");
        if (txt) {
          if (address) {
            txt.textContent = (sheet ? sheet + "!" : "") + address.split("!").pop();
          } else {
            txt.textContent = "—";
          }
        }
      });
    } catch (e) { /* ignore */ }
  }

  function bindSelectionEvents() {
    if (typeof Office === "undefined" || !Office.EventType) return;
    try {
      Office.context.document.addHandlerAsync(
        Office.EventType.DocumentSelectionChanged,
        () => { refreshSheetContext(); },
      );
    } catch (e) { /* surface may not support it */ }
  }

  // ── Chat rendering ────────────────────────────────────────────────────────
  function renderMarkdown(md) {
    // Minimal markdown (bold/italic/code/lists/breaks); raw HTML is escaped.
    let s = String(md || "");
    s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    // Lists: lines beginning with "- " grouped.
    s = s.replace(/(^|\n)((?:- [^\n]+\n?)+)/g, function (_m, p, block) {
      const items = block.trim().split(/\n/).map((line) => line.replace(/^- /, "")).map((t) => "<li>" + t + "</li>").join("");
      return p + "<ul>" + items + "</ul>";
    });
    s = s.replace(/\n\n+/g, "</p><p>");
    s = "<p>" + s + "</p>";
    return s;
  }

  function appendUserMessage(text) {
    const wrap = document.createElement("div");
    wrap.className = "msg user";
    wrap.innerHTML = '<div class="role">You</div><div class="body"></div>';
    wrap.querySelector(".body").textContent = text;
    $("chat").appendChild(wrap);
    scrollChat();
    return wrap;
  }

  function appendBotMessage() {
    const wrap = document.createElement("div");
    wrap.className = "msg bot";
    wrap.innerHTML =
      '<div class="role">Finsyt</div>' +
      '<div class="steps"></div>' +
      '<div class="body"></div>' +
      '<div class="actions"></div>';
    $("chat").appendChild(wrap);
    scrollChat();
    return wrap;
  }

  function scrollChat() {
    const c = $("chat").parentElement; // pane is the scroller
    c.scrollTop = c.scrollHeight;
  }

  function addStep(stepsEl, label, status) {
    const row = document.createElement("div");
    row.className = "step";
    row.innerHTML = '<span class="dot ' + (status || "run") + '"></span><span></span>';
    row.querySelector("span:last-child").textContent = label;
    stepsEl.appendChild(row);
    return row;
  }

  // ── Action cards (insert into sheet) ──────────────────────────────────────
  function appendAction(actionsEl, kind, args) {
    const card = document.createElement("div");
    card.className = "action";
    let preview = "";
    let label = "";
    if (kind === "formula") {
      label = "Insert formula";
      preview = (args.target ? args.target + ":  " : "") + (args.formula || "");
    } else if (kind === "range") {
      label = "Write " + (Array.isArray(args.values) ? args.values.length + "×" + (args.values[0] || []).length : "?") + " range";
      preview = (args.target ? args.target + "\n" : "") +
        (Array.isArray(args.values)
          ? args.values.slice(0, 6).map((row) => row.join("\t")).join("\n")
          : "");
    } else if (kind === "template") {
      label = "Insert " + String(args.kind || "").toUpperCase() + " template";
      preview = "Symbol: " + (args.symbol || "—") + (args.notes ? "\n" + args.notes : "");
    }
    card.innerHTML =
      '<h4>' + label + '</h4>' +
      (args.explanation ? '<div style="font-size:11px;color:#3D4F6E;margin-bottom:6px">' + args.explanation + '</div>' : "") +
      '<div class="preview"></div>' +
      '<div class="row">' +
        '<button class="btn sm" data-act="apply">Insert</button>' +
        '<button class="btn ghost sm" data-act="dismiss">Dismiss</button>' +
      '</div>';
    card.querySelector(".preview").textContent = preview;
    actionsEl.appendChild(card);
    const applyBtn = card.querySelector('[data-act="apply"]');
    const dismissBtn = card.querySelector('[data-act="dismiss"]');
    dismissBtn.onclick = () => card.remove();
    const apply = async (auto) => {
      try {
        if (kind === "formula") await applyFormula(args);
        else if (kind === "range") await applyRange(args);
        else if (kind === "template") await applyTemplate(args.kind, args.symbol);
        card.style.opacity = "0.55";
        applyBtn.textContent = auto ? "Auto-inserted" : "Inserted";
        applyBtn.disabled = true;
        dismissBtn.textContent = "Undo not available — clear manually";
        dismissBtn.disabled = true;
      } catch (e) {
        alert("Insert failed: " + (e.message || e));
      }
    };
    applyBtn.onclick = () => apply(false);
    // If the user has turned off the "Confirm writes" chip, auto-apply on
    // arrival so the agent can drive the workbook end-to-end.
    if (!state.confirmWrites) {
      // Defer slightly so the card is visible before the write happens.
      setTimeout(() => apply(true), 80);
    }
    scrollChat();
  }

  // ── A1 utilities (used to anchor templates at active cell) ────────────────
  function colLettersToIndex(letters) {
    let n = 0;
    for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
    return n; // 1-indexed
  }
  function colIndexToLetters(n) {
    let s = "";
    let v = n;
    while (v > 0) {
      const r = (v - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      v = Math.floor((v - 1) / 26);
    }
    return s;
  }
  function a1ToOffset(addr) {
    const m = /^([A-Z]+)(\d+)$/.exec(String(addr).toUpperCase());
    if (!m) throw new Error("Bad A1 address: " + addr);
    return { row: parseInt(m[2], 10) - 1, col: colLettersToIndex(m[1]) - 1 };
  }
  // Shift every A1-style ref in `formula` by (dr, dc). Templates only refer
  // to cells within the template, so $-pinned refs shift the same as relative.
  function shiftA1Refs(formula, dr, dc) {
    return String(formula).replace(/(\$?[A-Z]+)(\$?\d+)/g, (_m, colPart, rowPart) => {
      const colAbs = colPart.startsWith("$");
      const rowAbs = rowPart.startsWith("$");
      const colLetters = colPart.replace("$", "");
      const rowNum = parseInt(rowPart.replace("$", ""), 10);
      const newCol = Math.max(1, colLettersToIndex(colLetters) + dc);
      const newRow = Math.max(1, rowNum + dr);
      return (colAbs ? "$" : "") + colIndexToLetters(newCol) + (rowAbs ? "$" : "") + newRow;
    });
  }

  // ── Excel write helpers ───────────────────────────────────────────────────
  function parseTarget(target) {
    if (!target) return { sheet: null, address: null };
    const i = target.indexOf("!");
    if (i < 0) return { sheet: null, address: target };
    return { sheet: target.slice(0, i), address: target.slice(i + 1) };
  }

  async function applyFormula(args) {
    await Excel.run(async (ctx) => {
      const t = parseTarget(args.target || "");
      const sheet = t.sheet
        ? ctx.workbook.worksheets.getItem(t.sheet)
        : ctx.workbook.worksheets.getActiveWorksheet();
      const range = t.address
        ? sheet.getRange(t.address)
        : ctx.workbook.getSelectedRange();
      const f = String(args.formula || "");
      range.formulas = [[f.startsWith("=") ? f : "=" + f]];
      await ctx.sync();
    });
  }

  async function applyRange(args) {
    if (!Array.isArray(args.values) || !args.values.length) throw new Error("Empty values");
    const rows = args.values.length;
    const cols = (args.values[0] || []).length;
    if (!cols) throw new Error("Empty values");
    await Excel.run(async (ctx) => {
      const t = parseTarget(args.target || "");
      const sheet = t.sheet
        ? ctx.workbook.worksheets.getItem(t.sheet)
        : ctx.workbook.worksheets.getActiveWorksheet();
      let anchor;
      if (t.address) {
        anchor = sheet.getRange(t.address).getCell(0, 0);
      } else {
        anchor = ctx.workbook.getSelectedRange().getCell(0, 0);
      }
      const target = anchor.getResizedRange(rows - 1, cols - 1);
      // Split formulas (start with =) from plain values so each cell type is
      // honoured.
      const formulaMatrix = args.values.map((row) =>
        row.map((v) => (typeof v === "string" && v.startsWith("=")) ? v : null),
      );
      const valueMatrix = args.values.map((row) =>
        row.map((v) => (typeof v === "string" && v.startsWith("=")) ? null : v),
      );
      target.values = valueMatrix;
      // Apply formulas separately for cells where both are present (they
      // overwrite the placeholder value).
      target.formulas = formulaMatrix.map((row, ri) =>
        row.map((f, ci) => f != null ? f : (valueMatrix[ri][ci] == null ? "" : "" + valueMatrix[ri][ci])),
      );
      await ctx.sync();
    });
  }

  // ── Builder templates ─────────────────────────────────────────────────────
  // Each template returns a list of declarative "blocks" to write.

  // ── Template format styling ──────────────────────────────────────────────
  // Templates declare a `formats` block of role-tagged cells (template-local
  // A1) that get shifted to the user's anchor and styled at apply time.
  //
  //   title       → bold + slightly larger header text (section titles)
  //   header      → bold (column / row labels)
  //   assumption  → yellow fill ("input cells" — the user is meant to edit)
  //   total       → bold (subtotals / grand totals)
  //
  // Formula cells use Excel's default colour (black), so no explicit styling.
  const STYLE_INPUT_FILL = "#FFF2CC"; // soft yellow used by the standard
                                      // "Input" cell style in Excel

  function buildDcfTemplate(symbol) {
    const sym = (symbol || "AAPL").toUpperCase();
    const q = '"' + sym + '"';
    return {
      blocks: [
        { addr: "A1", values: [[sym + " — DCF model"]] },
        { addr: "A3", values: [
          ["Inputs", ""],
          ["Symbol", sym],
          ["Last price", "=FINSYT.QUOTE(" + q + ")"],
          ["Shares out", "=FINSYT.QUOTE(" + q + ',"sharesOutstanding")'],
          ["Market cap", "=FINSYT.QUOTE(" + q + ',"marketCap")'],
          ["Net debt", 0],
          ["Tax rate", 0.21],
          ["WACC", 0.09],
          ["Terminal growth", 0.025],
        ] },
        { addr: "A14", values: [["Forecast", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Terminal"]] },
        { addr: "A15", values: [
          ["Revenue", "=FINSYT.METRIC(" + q + ',"revenue","annual",0)*1.08', "=B15*1.07", "=C15*1.06", "=D15*1.05", "=E15*1.04", "=F15*(1+B11)"],
          ["Operating margin", 0.28, 0.28, 0.29, 0.29, 0.30, 0.30],
          ["EBIT", "=B15*B16", "=C15*C16", "=D15*D16", "=E15*E16", "=F15*F16", "=G15*G16"],
          ["Tax", "=B17*$B$9", "=C17*$B$9", "=D17*$B$9", "=E17*$B$9", "=F17*$B$9", "=G17*$B$9"],
          ["NOPAT", "=B17-B18", "=C17-C18", "=D17-D18", "=E17-E18", "=F17-F18", "=G17-G18"],
          ["FCF (≈NOPAT)", "=B19", "=C19", "=D19", "=E19", "=F19", "=G19"],
        ] },
        { addr: "A22", values: [
          ["Discount factor", "=1/(1+$B$10)^1", "=1/(1+$B$10)^2", "=1/(1+$B$10)^3", "=1/(1+$B$10)^4", "=1/(1+$B$10)^5", "=1/(1+$B$10)^5"],
          ["PV", "=B20*B22", "=C20*C22", "=D20*D22", "=E20*E22", "=F20*F22", "=(G20/($B$10-$B$11))*G22"],
        ] },
        { addr: "A26", values: [
          ["Enterprise value", "=SUM(B23:G23)"],
          ["Equity value", "=B26-B8"],
          ["Per share", "=B27/B7"],
          ["Last price", "=B6"],
          ["Implied upside", "=B28/B29-1"],
        ] },
      ],
      formats: {
        title: ["A1"],
        header: ["A3", "A14:G14"],
        // User-editable inputs: the symbol cell, net debt, tax rate, WACC,
        // terminal growth, and the operating-margin assumption row.
        assumption: ["B4", "B8", "B9", "B10", "B11", "B16:G16"],
        // Totals: NOPAT row, FCF row, and the EV / Equity / Per-share /
        // Last-price / Implied-upside summary block.
        total: ["A19:G19", "A20:G20", "A26:B26", "A27:B27", "A28:B28", "A29:B29", "A30:B30"],
      },
    };
  }

  function buildCompsTemplate(symbol) {
    const sym = (symbol || "AAPL").toUpperCase();
    const q = '"' + sym + '"';
    return {
      blocks: [
        { addr: "A1", values: [[sym + " — Trading Comparables"]] },
        { addr: "A3", values: [
          ["Symbol", "Price", "Market cap", "P/E", "EV/Sales", "EV/EBITDA"],
        ] },
        { addr: "A4", values: [
          [sym, "=FINSYT.QUOTE(" + q + ')', "=FINSYT.QUOTE(" + q + ',"marketCap")', "=FINSYT.QUOTE(" + q + ',"pe")', "", ""],
        ] },
        { addr: "A5", values: [
          ["(replace these with peers)"],
          ["MSFT", '=FINSYT.QUOTE("MSFT")', '=FINSYT.QUOTE("MSFT","marketCap")', '=FINSYT.QUOTE("MSFT","pe")', "", ""],
          ["GOOGL", '=FINSYT.QUOTE("GOOGL")', '=FINSYT.QUOTE("GOOGL","marketCap")', '=FINSYT.QUOTE("GOOGL","pe")', "", ""],
          ["AMZN", '=FINSYT.QUOTE("AMZN")', '=FINSYT.QUOTE("AMZN","marketCap")', '=FINSYT.QUOTE("AMZN","pe")', "", ""],
          ["META", '=FINSYT.QUOTE("META")', '=FINSYT.QUOTE("META","marketCap")', '=FINSYT.QUOTE("META","pe")', "", ""],
        ] },
        { addr: "A11", values: [
          ["Mean", "", "=AVERAGE(C4:C9)", "=AVERAGE(D4:D9)", "", ""],
          ["Median", "", "=MEDIAN(C4:C9)", "=MEDIAN(D4:D9)", "", ""],
        ] },
      ],
      formats: {
        title: ["A1"],
        header: ["A3:F3"],
        // Peer ticker inputs + the EV/Sales and EV/EBITDA columns are
        // user-editable.
        assumption: ["A6:A9", "E4:F9"],
        total: ["A11:F11", "A12:F12"],
      },
    };
  }

  function buildSensitivityTemplate(symbol) {
    const sym = (symbol || "AAPL").toUpperCase();
    return {
      blocks: [
        { addr: "A1", values: [[sym + " — Sensitivity (per-share value: WACC × terminal growth)"]] },
        { addr: "A3", values: [
          ["WACC \\ g", 0.015, 0.020, 0.025, 0.030, 0.035],
        ] },
        { addr: "A4", values: [
          [0.075, "=100*(1+B$3)/($A4-B$3)", "=100*(1+C$3)/($A4-C$3)", "=100*(1+D$3)/($A4-D$3)", "=100*(1+E$3)/($A4-E$3)", "=100*(1+F$3)/($A4-F$3)"],
          [0.080, "=100*(1+B$3)/($A5-B$3)", "=100*(1+C$3)/($A5-C$3)", "=100*(1+D$3)/($A5-D$3)", "=100*(1+E$3)/($A5-E$3)", "=100*(1+F$3)/($A5-F$3)"],
          [0.085, "=100*(1+B$3)/($A6-B$3)", "=100*(1+C$3)/($A6-C$3)", "=100*(1+D$3)/($A6-D$3)", "=100*(1+E$3)/($A6-E$3)", "=100*(1+F$3)/($A6-F$3)"],
          [0.090, "=100*(1+B$3)/($A7-B$3)", "=100*(1+C$3)/($A7-C$3)", "=100*(1+D$3)/($A7-D$3)", "=100*(1+E$3)/($A7-E$3)", "=100*(1+F$3)/($A7-F$3)"],
          [0.095, "=100*(1+B$3)/($A8-B$3)", "=100*(1+C$3)/($A8-C$3)", "=100*(1+D$3)/($A8-D$3)", "=100*(1+E$3)/($A8-E$3)", "=100*(1+F$3)/($A8-F$3)"],
          [0.100, "=100*(1+B$3)/($A9-B$3)", "=100*(1+C$3)/($A9-C$3)", "=100*(1+D$3)/($A9-D$3)", "=100*(1+E$3)/($A9-E$3)", "=100*(1+F$3)/($A9-F$3)"],
        ] },
        { addr: "A11", values: [["FCF placeholder = 100. Replace with your own NOPAT to recalibrate."]] },
      ],
      formats: {
        title: ["A1"],
        header: ["A3:F3", "A4:A9"],
        // Both axes are user-editable — that's the whole point of a
        // sensitivity table.
        assumption: ["B3:F3", "A4:A9"],
        // No subtotals on a sensitivity grid.
        total: [],
      },
    };
  }

  function buildWaccTemplate(symbol) {
    const sym = (symbol || "AAPL").toUpperCase();
    const q = '"' + sym + '"';
    return {
      blocks: [
        { addr: "A1", values: [[sym + " — WACC"]] },
        { addr: "A3", values: [
          ["Cost of equity (CAPM)"],
          // MACRO_LATEST → scalar most-recent observation (single cell input).
          ["Risk-free rate", '=FINSYT.MACRO_LATEST("YIELD_10Y")'],
          ["Equity risk premium", 0.05],
          ["Beta", "=FINSYT.QUOTE(" + q + ',"beta")'],
          ["Cost of equity", "=B4 + B6*B5"],
        ] },
        { addr: "A9", values: [
          ["Cost of debt"],
          ["Pre-tax cost of debt", 0.05],
          ["Tax rate", 0.21],
          ["After-tax cost of debt", "=B10*(1-B11)"],
        ] },
        { addr: "A14", values: [
          ["Capital weights"],
          ["Market cap (E)", "=FINSYT.QUOTE(" + q + ',"marketCap")'],
          ["Total debt (D)", 0],
          ["E + D", "=B15+B16"],
          ["Weight equity", "=B15/B17"],
          ["Weight debt", "=B16/B17"],
        ] },
        { addr: "A21", values: [
          ["WACC", "=B18*B7 + B19*B12"],
        ] },
      ],
      formats: {
        title: ["A1"],
        header: ["A3", "A9", "A14"],
        // ERP, pre-tax cost of debt, tax rate, total debt are inputs.
        assumption: ["B5", "B10", "B11", "B16"],
        total: ["A7:B7", "A12:B12", "A21:B21"],
      },
    };
  }

  function buildTemplateFor(kind, symbol) {
    switch (kind) {
      case "dcf":         return buildDcfTemplate(symbol);
      case "comps":       return buildCompsTemplate(symbol);
      case "sensitivity": return buildSensitivityTemplate(symbol);
      case "wacc":        return buildWaccTemplate(symbol);
      default: throw new Error("Unknown template: " + kind);
    }
  }

  // Translate a template-local A1 range (e.g. "B4" or "A19:G19") into the
  // sheet-coord range string after shifting by the active-cell anchor.
  function shiftA1Range(addr, dr, dc) {
    const parts = String(addr).split(":");
    const shifted = parts.map((p) => shiftA1Refs(p, dr, dc));
    return shifted.join(":");
  }

  // Insert template blocks at the user's active cell. Formula refs are
  // shifted by the anchor offset; a final pass applies role-based styling.
  async function applyTemplate(kind, symbol) {
    const tpl = buildTemplateFor(kind, symbol);
    const { blocks, formats } = tpl;
    await Excel.run(async (ctx) => {
      const sel = ctx.workbook.getSelectedRange();
      sel.load(["rowIndex", "columnIndex"]);
      const sheet = ctx.workbook.worksheets.getActiveWorksheet();
      sheet.load(["name"]);
      await ctx.sync();
      const anchorRow = sel.rowIndex; // 0-indexed
      const anchorCol = sel.columnIndex;
      // 1-based: translate template "row 1" to the user's actual row.
      const dr = anchorRow;
      const dc = anchorCol;
      let totalRows = 0;
      let totalCols = 0;
      for (const block of blocks) {
        const off = a1ToOffset(block.addr);
        const rows = block.values.length;
        const cols = (block.values[0] || []).length;
        if (!rows || !cols) continue;
        const range = sheet.getRangeByIndexes(
          anchorRow + off.row,
          anchorCol + off.col,
          rows,
          cols,
        );
        const valueMatrix = block.values.map((row) =>
          row.map((v) => (typeof v === "string" && v.startsWith("=")) ? null : v),
        );
        // Shift formula refs by (anchorRow, anchorCol); plain values become
        // empty in the formulas matrix so it stays the same shape as values.
        const formulaMatrix = block.values.map((row) =>
          row.map((v) => {
            if (typeof v === "string" && v.startsWith("=")) {
              return shiftA1Refs(v, dr, dc);
            }
            return v == null ? "" : "" + v;
          }),
        );
        range.values = valueMatrix;
        range.formulas = formulaMatrix;
        totalRows = Math.max(totalRows, off.row + rows);
        totalCols = Math.max(totalCols, off.col + cols);
      }

      // ── Formatting pass ───────────────────────────────────────────────
      if (formats) {
        const applyAll = (addrs, fn) => {
          for (const addr of addrs || []) {
            const shifted = shiftA1Range(addr, dr, dc);
            const range = sheet.getRange(shifted);
            fn(range);
          }
        };
        // Title — bold + bumped font size.
        applyAll(formats.title, (r) => {
          r.format.font.bold = true;
          r.format.font.size = 14;
        });
        // Section / column headers — bold.
        applyAll(formats.header, (r) => {
          r.format.font.bold = true;
        });
        // Assumption inputs — soft yellow fill so users can spot the cells
        // they're meant to edit.
        applyAll(formats.assumption, (r) => {
          r.format.fill.color = STYLE_INPUT_FILL;
        });
        // Totals / subtotals — bold.
        applyAll(formats.total, (r) => {
          r.format.font.bold = true;
        });
      }

      if (totalRows && totalCols) {
        sheet
          .getRangeByIndexes(anchorRow, anchorCol, totalRows, totalCols)
          .format.autofitColumns();
      }
      await ctx.sync();
    });
  }

  // ── Agent streaming ───────────────────────────────────────────────────────
  async function ask(question) {
    if (state.inflightAbort) state.inflightAbort.abort();
    const cred = currentCredential();
    if (!cred) { showSignIn(); return; }

    appendUserMessage(question);
    const bot = appendBotMessage();
    const stepsEl = bot.querySelector(".steps");
    const bodyEl = bot.querySelector(".body");
    const actionsEl = bot.querySelector(".actions");

    const stepRows = {};
    const addStepRow = (kind, label) => {
      stepRows[kind] = addStep(stepsEl, label, "run");
    };
    const finishStep = (kind, ok) => {
      const row = stepRows[kind];
      if (row) row.querySelector(".dot").className = "dot " + (ok ? "ok" : "err");
    };
    const appendStepRow = (label, status) => addStep(stepsEl, label, status);

    let answerText = "";
    const send = $("btn-send");
    send.disabled = true;

    const ctrl = new AbortController();
    state.inflightAbort = ctrl;

    try {
      const ctxPayload = state.sendContext ? state.contextSummary : null;
      const res = await fetch(ORIGINS.apiBase + "/agent/ask", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + cred,
          "Content-Type": "application/json",
          "X-Finsyt-Surface": "excel",
        },
        body: JSON.stringify({
          question,
          context: ctxPayload || undefined,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        if (res.status === 401) { await clearAuth(); showSignIn(); return; }
        throw new Error("HTTP " + res.status);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
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
          let j;
          try { j = JSON.parse(data); } catch (e) { continue; }
          handleSseEvent(event, j, {
            addStepRow,
            finishStep,
            appendStepRow,
            actionsEl,
            onChunk: (t) => {
              answerText += t;
              bodyEl.innerHTML = renderMarkdown(answerText);
              scrollChat();
            },
          });
        }
      }
      // Mark any in-flight steps as ok at the end.
      for (const k of Object.keys(stepRows)) {
        const dot = stepRows[k].querySelector(".dot");
        if (dot.classList.contains("run")) dot.className = "dot ok";
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        bodyEl.innerHTML = '<p style="color:#7A1B1B">Error: ' + (e.message || e) + '</p>';
      }
    } finally {
      state.inflightAbort = null;
      send.disabled = false;
    }
  }

  function handleSseEvent(event, j, ui) {
    if (event === "step") {
      ui.addStepRow(j.kind, j.label || j.kind);
    } else if (event === "tool_call") {
      ui.addStepRow("tool:" + j.id, "Tool: " + j.name);
    } else if (event === "tool_result") {
      // Mark the originating tool_call row by id, then append the summary as
      // a child row scoped to *this* message (never the global selector).
      ui.finishStep("tool:" + j.id, j.ok !== false);
      if (j.summary) ui.appendStepRow(" ↳ " + j.summary, j.ok === false ? "err" : "ok");
    } else if (event === "action") {
      // Accept both spec (type+payload) and legacy (kind+args) shapes.
      const typeMap = {
        insert_formula: "formula",
        write_range: "range",
        insert_template: "template",
      };
      const kind = j.kind || typeMap[j.type] || j.type;
      const payload = j.payload || j.args || {};
      appendAction(ui.actionsEl, kind, payload);
    } else if (event === "answer_chunk") {
      ui.onChunk(j.text || "");
    } else if (event === "done") {
      // handled in finally
    } else if (event === "error") {
      ui.appendStepRow("Error: " + (j.message || "unknown"), "err");
    }
  }

  // ── Wire up ───────────────────────────────────────────────────────────────
  Office.onReady(() => {
    $("dev-link").href = ORIGINS.developerPage;
    $("btn-clerk").onclick = clerkSignIn;
    $("btn-key").onclick = apiKeySignIn;

    $("ctx-chip").onclick = () => {
      state.sendContext = !state.sendContext;
      $("ctx-chip").classList.toggle("on", state.sendContext);
    };
    $("confirm-chip").onclick = () => {
      state.confirmWrites = !state.confirmWrites;
      $("confirm-chip").classList.toggle("on", state.confirmWrites);
      $("confirm-chip").title = state.confirmWrites
        ? "On — action cards require an Insert click"
        : "Off — Finsyt will auto-insert as soon as it suggests";
    };
    $("btn-clear").onclick = () => { $("chat").innerHTML = ""; };

    $("btn-send").onclick = () => {
      const q = ($("prompt").value || "").trim();
      if (!q) return;
      $("prompt").value = "";
      ask(q);
    };
    $("prompt").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $("btn-send").click(); }
    });

    document.querySelectorAll(".tab").forEach((t) => {
      t.onclick = () => activateTab(t.dataset.pane);
    });

    document.querySelectorAll(".tpl").forEach((t) => {
      t.onclick = async () => {
        if (state.builderBusy) return;
        const status = $("builder-status");
        const sym = ($("tpl-symbol").value || "AAPL").trim().toUpperCase();
        state.builderBusy = true;
        try {
          setStatus(status, "Building " + t.dataset.kind.toUpperCase() + " for " + sym + " at active cell…", true);
          await applyTemplate(t.dataset.kind, sym);
          setStatus(
            status,
            "Inserted " + t.dataset.kind.toUpperCase() + " starting at the selected cell.",
            true,
          );
          // Refresh context so the chip reflects the new selection area.
          refreshSheetContext();
        } catch (e) {
          setStatus(status, "Failed: " + (e.message || e), false);
        } finally { state.builderBusy = false; }
      };
    });

    bindSelectionEvents();

    if (currentCredential()) showApp();
    else showSignIn();
  });
})();
