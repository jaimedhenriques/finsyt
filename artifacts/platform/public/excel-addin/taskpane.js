/* global Office, Excel, fetch */
/* Finsyt Excel task pane — Agent + Builder + Provenance. */

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
    autoExecute: false, // Build tab: when on, the agent applies every step
                        // without the preview/approve gate on bulk writes.
    contextSummary: {
      workbook: null, sheet: null, address: null,
      values: null, formulas: null,
    },
    inflightAbort: null,
    builderBusy: false,
  };

  // Atomic agentic-build tools streamed by the server as `excel_op` frames and
  // executed client-side via Office.js (see executeExcelOp). Kept in sync with
  // lib/excel-addin/tools.ts.
  const EXCEL_OP_TOOLS = new Set([
    "write_range", "write_cell", "insert_formula", "apply_number_format",
    "apply_fill_color", "apply_border", "set_column_width", "set_row_height",
    "merge_cells", "insert_named_table", "add_sheet", "rename_sheet",
    "apply_conditional_format", "write_header_row", "apply_freeze_panes",
    "clear_range", "read_range", "get_sheet_names", "get_used_range",
    "set_validation", "insert_chart", "apply_font_style", "auto_fit_columns",
    "write_bulk_rows", "protect_sheet",
  ]);
  // Pure reads — never gated, payload flows back to the model.
  const READ_OPS = new Set(["read_range", "get_sheet_names", "get_used_range"]);
  // Sheet-level / destructive ops — always require approval unless auto-execute.
  const STRUCTURAL_OPS = new Set([
    "add_sheet", "rename_sheet", "protect_sheet", "clear_range",
  ]);

  const TAB_NAMES = ["copilot", "build", "builder", "functions", "provenance"];

  function initialTabFromUrl() {
    const h = (window.location.hash || "").replace(/^#/, "").toLowerCase();
    if (TAB_NAMES.indexOf(h) >= 0) return h;
    try {
      const u = new URL(window.location.href);
      const t = (u.searchParams.get("tab") || "").toLowerCase();
      if (TAB_NAMES.indexOf(t) >= 0) return t;
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
    hide($("pane-build"));
    hide($("pane-builder"));
    hide($("pane-functions"));
    hide($("pane-provenance"));
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
    TAB_NAMES.forEach((n) => {
      const el = $("pane-" + n);
      if (el) {
        if (n === name) show(el); else hide(el);
      }
    });
    if (name === "provenance") renderProvenanceTable();
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
        const label = address
          ? (sheet ? sheet + "!" : "") + address.split("!").pop()
          : "—";
        const txt = $("ctx-text");
        if (txt) txt.textContent = label;
        const btxt = $("build-ctx-text");
        if (btxt) btxt.textContent = label;
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

  // ── Provenance table ──────────────────────────────────────────────────────
  // Reads _finsytProv from the shared runtime (set by functions.js).
  function renderProvenanceTable() {
    const container = $("prov-content");
    if (!container) return;
    // Access the shared provenance map written by functions.js.
    const prov = (typeof window !== "undefined" && window._finsytProv) || {};
    const keys = Object.keys(prov);
    if (!keys.length) {
      container.innerHTML = '<p class="prov-empty">No provenance recorded yet. Use <code>=FINSYT.QUOTE()</code>, <code>=FINSYT.FINANCIALS()</code>, or other data functions — their sources will appear here.</p>';
      return;
    }
    let rows = "";
    keys.forEach((k) => {
      const e = prov[k];
      const urlCell = e.url
        ? `<a href="${escHtml(e.url)}" target="_blank">View source ↗</a>`
        : "—";
      rows += `<tr>
        <td>${escHtml(k)}</td>
        <td><span class="src-label">${escHtml(e.label)}</span><br><span class="src-date">${escHtml(e.ts)}</span></td>
        <td>${urlCell}</td>
      </tr>`;
    });
    container.innerHTML = `
      <table class="prov-table">
        <thead><tr><th>Symbol : Field</th><th>Source</th><th>Link</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function escHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── Chat rendering ────────────────────────────────────────────────────────
  /**
   * Render minimal markdown. Citation markers like [1] become clickable badge
   * links that scroll to the corresponding source row in the sources panel.
   */
  function renderMarkdown(md, citations) {
    let s = String(md || "");
    s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    // Lists
    s = s.replace(/(^|\n)((?:- [^\n]+\n?)+)/g, function (_m, p, block) {
      const items = block.trim().split(/\n/).map((line) => line.replace(/^- /, "")).map((t) => "<li>" + t + "</li>").join("");
      return p + "<ul>" + items + "</ul>";
    });
    // Citation markers [N] → clickable badge
    if (citations && citations.length) {
      s = s.replace(/\[(\d+)\]/g, (_m, n) => {
        const idx = parseInt(n, 10);
        const cite = citations.find((c) => c.index === idx);
        const title = cite ? escHtml(cite.source) : "Source " + n;
        return `<a class="cite-ref" href="#" data-cite="${idx}" title="${title}">${n}</a>`;
      });
    }
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
      '<div class="role">Finsyt Agent</div>' +
      '<div class="steps"></div>' +
      '<div class="body"></div>' +
      '<div class="actions"></div>';
    $("chat").appendChild(wrap);
    scrollChat();
    return wrap;
  }

  function scrollChat() {
    const c = $("chat");
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

  // ── Sources panel ─────────────────────────────────────────────────────────
  /**
   * Append a collapsible "Sources" panel below a bot message.
   * citations: Array<{ index, source, url, excerpt }>
   * answerText: the final answer string for "Insert to sheet" action
   */
  function appendSourcesPanel(actionsEl, citations, answerText) {
    if (!citations || !citations.length) return;
    const panel = document.createElement("div");
    panel.className = "sources-panel";

    const toggle = document.createElement("button");
    toggle.className = "sources-toggle";
    toggle.innerHTML =
      `<span>Sources</span>` +
      `<span class="count-badge">${citations.length}</span>` +
      `<svg class="chevron" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="#7D8FA9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const list = document.createElement("div");
    list.className = "sources-list";

    citations.forEach((cite) => {
      const row = document.createElement("div");
      row.className = "source-row";
      row.dataset.citeIdx = cite.index;
      let linkHtml = "";
      if (cite.url) {
        linkHtml = `<a class="source-link" href="${escHtml(cite.url)}" target="_blank">View source ↗</a>`;
      }
      row.innerHTML =
        `<span class="source-idx">${cite.index}</span>` +
        `<div class="source-body">` +
          `<div class="source-label">${escHtml(cite.source)}</div>` +
          (cite.excerpt ? `<div class="source-excerpt">${escHtml(cite.excerpt)}</div>` : "") +
          linkHtml +
        `</div>`;
      list.appendChild(row);
    });

    // Insert-with-citations action row
    const insertRow = document.createElement("div");
    insertRow.className = "insert-row";
    const insertBtn = document.createElement("button");
    insertBtn.className = "btn ghost sm";
    insertBtn.textContent = "Insert answer + citations to sheet";
    insertBtn.title = "Write the answer text and a citation table starting at the active cell";
    insertBtn.onclick = async () => {
      try {
        insertBtn.disabled = true;
        insertBtn.textContent = "Inserting…";
        await insertAnswerWithCitations(answerText, citations);
        insertBtn.textContent = "Inserted ✓";
      } catch (e) {
        insertBtn.textContent = "Insert answer + citations to sheet";
        insertBtn.disabled = false;
        alert("Insert failed: " + (e.message || e));
      }
    };
    insertRow.appendChild(insertBtn);
    list.appendChild(insertRow);

    toggle.onclick = () => {
      const open = !list.classList.contains("open");
      list.classList.toggle("open", open);
      toggle.classList.toggle("open", open);
    };
    // Auto-open on first render
    list.classList.add("open");
    toggle.classList.add("open");

    panel.appendChild(toggle);
    panel.appendChild(list);
    actionsEl.appendChild(panel);

    // Wire citation badge clicks in the parent message body to scroll here.
    const msgEl = actionsEl.closest(".msg.bot");
    if (msgEl) {
      msgEl.addEventListener("click", (e) => {
        const ref = e.target.closest("[data-cite]");
        if (!ref) return;
        e.preventDefault();
        const idx = parseInt(ref.dataset.cite, 10);
        const sourceRow = list.querySelector(`[data-cite-idx="${idx}"]`);
        if (sourceRow) {
          // Ensure panel is open, then scroll.
          list.classList.add("open");
          toggle.classList.add("open");
          sourceRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
          sourceRow.style.background = "#EEF4FF";
          setTimeout(() => { sourceRow.style.background = ""; }, 1200);
        }
      });
    }

    scrollChat();
  }

  // ── Insert answer + citations into sheet ──────────────────────────────────
  async function insertAnswerWithCitations(answerText, citations) {
    if (typeof Excel === "undefined" || !Excel.run) throw new Error("Excel APIs not available.");
    await Excel.run(async (ctx) => {
      const sel = ctx.workbook.getSelectedRange();
      sel.load(["rowIndex", "columnIndex"]);
      const sheet = ctx.workbook.worksheets.getActiveWorksheet();
      await ctx.sync();

      const anchorRow = sel.rowIndex;
      const anchorCol = sel.columnIndex;

      // Row 0: "Answer" label + text
      const answerRange = sheet.getRangeByIndexes(anchorRow, anchorCol, 1, 2);
      answerRange.values = [["Answer", answerText]];
      answerRange.getCell(0, 0).format.font.bold = true;

      // Auto-wrap the answer cell
      const textCell = answerRange.getCell(0, 1);
      textCell.format.wrapText = true;
      textCell.format.columnWidth = 300;

      if (citations && citations.length) {
        // Header row
        const headerRange = sheet.getRangeByIndexes(anchorRow + 1, anchorCol, 1, 4);
        headerRange.values = [["#", "Source", "URL", "Excerpt"]];
        headerRange.format.font.bold = true;
        headerRange.format.fill.color = "#F2F5FB";

        // Citation rows
        const citRows = citations.map((c) => [
          "[" + c.index + "]",
          c.source || "",
          c.url || "",
          c.excerpt || "",
        ]);
        const citRange = sheet.getRangeByIndexes(anchorRow + 2, anchorCol, citRows.length, 4);
        citRange.values = citRows;
        citRange.format.wrapText = false;
        // Make URL column slightly wider
        sheet.getRangeByIndexes(anchorRow + 2, anchorCol + 2, citRows.length, 1).format.columnWidth = 180;
      }

      await ctx.sync();
    });
  }

  // ── Action cards (insert formula / range / template into sheet) ────────────
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
      (args.explanation ? '<div style="font-size:11px;color:#3D4F6E;margin-bottom:6px">' + escHtml(args.explanation) + '</div>' : "") +
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
    if (!state.confirmWrites) {
      setTimeout(() => apply(true), 80);
    }
    scrollChat();
  }

  // ── A1 utilities ─────────────────────────────────────────────────────────
  function colLettersToIndex(letters) {
    let n = 0;
    for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
    return n;
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
      const formulaMatrix = args.values.map((row) =>
        row.map((v) => (typeof v === "string" && v.startsWith("=")) ? v : null),
      );
      const valueMatrix = args.values.map((row) =>
        row.map((v) => (typeof v === "string" && v.startsWith("=")) ? null : v),
      );
      target.values = valueMatrix;
      target.formulas = formulaMatrix.map((row, ri) =>
        row.map((f, ci) => f != null ? f : (valueMatrix[ri][ci] == null ? "" : "" + valueMatrix[ri][ci])),
      );
      await ctx.sync();
    });
  }

  // ── Builder templates ─────────────────────────────────────────────────────
  const STYLE_INPUT_FILL = "#FFF2CC";

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
        assumption: ["B4", "B8", "B9", "B10", "B11", "B16:G16"],
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
        assumption: ["B3:F3", "A4:A9"],
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

  function shiftA1Range(addr, dr, dc) {
    const parts = String(addr).split(":");
    const shifted = parts.map((p) => shiftA1Refs(p, dr, dc));
    return shifted.join(":");
  }

  async function applyTemplate(kind, symbol) {
    const tpl = buildTemplateFor(kind, symbol);
    const { blocks, formats } = tpl;
    await Excel.run(async (ctx) => {
      const sel = ctx.workbook.getSelectedRange();
      sel.load(["rowIndex", "columnIndex"]);
      const sheet = ctx.workbook.worksheets.getActiveWorksheet();
      sheet.load(["name"]);
      await ctx.sync();
      const anchorRow = sel.rowIndex;
      const anchorCol = sel.columnIndex;
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

      if (formats) {
        const applyAll = (addrs, fn) => {
          for (const addr of addrs || []) {
            const shifted = shiftA1Range(addr, dr, dc);
            const range = sheet.getRange(shifted);
            fn(range);
          }
        };
        applyAll(formats.title, (r) => { r.format.font.bold = true; r.format.font.size = 14; });
        applyAll(formats.header, (r) => { r.format.font.bold = true; });
        applyAll(formats.assumption, (r) => { r.format.fill.color = STYLE_INPUT_FILL; });
        applyAll(formats.total, (r) => { r.format.font.bold = true; });
      }

      if (totalRows && totalCols) {
        sheet
          .getRangeByIndexes(anchorRow, anchorCol, totalRows, totalCols)
          .format.autofitColumns();
      }
      await ctx.sync();
    });
  }

  // ── Shared SSE streamer ───────────────────────────────────────────────────
  // POSTs to /agent/ask and dispatches each SSE frame to `onEvent(event, json)`.
  // `onEvent` may be async; frames are processed strictly in arrival order so an
  // excel_op handler can execute + post its result before the next frame runs.
  async function streamAgent(opts) {
    const cred = currentCredential();
    if (!cred) { showSignIn(); throw new Error("not signed in"); }
    const res = await fetch(ORIGINS.apiBase + "/agent/ask", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + cred,
        "Content-Type": "application/json",
        "X-Finsyt-Surface": "excel",
      },
      body: JSON.stringify({
        question: opts.question,
        context: opts.context || undefined,
      }),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) {
      if (res.status === 401) { await clearAuth(); showSignIn(); throw new Error("unauthorized"); }
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
        await opts.onEvent(event, j);
      }
    }
  }

  // Round-trip: hand the agent loop the real outcome of an executed op so it
  // can plan its next step. The server has its own timeout fallback, so a
  // failed POST here never deadlocks the run.
  async function postToolResult(id, payload) {
    const cred = currentCredential();
    if (!cred) return;
    try {
      await fetch(ORIGINS.apiBase + "/agent/tool-result", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + cred,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(Object.assign({ id: id }, payload)),
      });
    } catch (e) { /* server-side timeout will release the op */ }
  }

  // ── Atomic Excel op dispatcher (Office.js) ────────────────────────────────
  function getSheet(ctx, name) {
    return name
      ? ctx.workbook.worksheets.getItem(name)
      : ctx.workbook.worksheets.getActiveWorksheet();
  }

  // Write a 2-D matrix into `target`, honouring per-cell formulas (strings that
  // start with "=") vs. plain values. Mirrors the proven applyRange split.
  function writeMatrix(target, values) {
    const formulaMatrix = values.map((row) =>
      row.map((v) => (typeof v === "string" && v.startsWith("=")) ? v : null),
    );
    const valueMatrix = values.map((row) =>
      row.map((v) => (typeof v === "string" && v.startsWith("=")) ? null : v),
    );
    target.values = valueMatrix;
    target.formulas = formulaMatrix.map((row, ri) =>
      row.map((f, ci) => (f != null ? f : (valueMatrix[ri][ci] == null ? "" : "" + valueMatrix[ri][ci]))),
    );
  }

  async function executeExcelOp(tool, args) {
    args = args || {};
    return await Excel.run(async (ctx) => {
      const sheet = getSheet(ctx, args.sheet);
      switch (tool) {
        case "write_cell": {
          const range = sheet.getRange(args.cell);
          const v = args.value;
          if (typeof v === "string" && v.startsWith("=")) range.formulas = [[v]];
          else range.values = [[v == null ? "" : v]];
          await ctx.sync(); return;
        }
        case "insert_formula": {
          const range = sheet.getRange(args.cell);
          const f = String(args.formula || "");
          range.formulas = [[f.startsWith("=") ? f : "=" + f]];
          await ctx.sync(); return;
        }
        case "write_range":
        case "write_bulk_rows": {
          const values = tool === "write_range" ? args.values : args.rows;
          if (!Array.isArray(values) || !values.length) throw new Error("Empty values");
          const cols = (values[0] || []).length;
          if (!cols) throw new Error("Empty values");
          const anchor = sheet.getRange(args.anchor).getCell(0, 0);
          const target = anchor.getResizedRange(values.length - 1, cols - 1);
          writeMatrix(target, values);
          await ctx.sync(); return;
        }
        case "write_header_row": {
          const headers = args.headers || [];
          if (!headers.length) throw new Error("No headers");
          const anchor = sheet.getRange(args.anchor).getCell(0, 0);
          const target = anchor.getResizedRange(0, headers.length - 1);
          target.values = [headers];
          target.format.font.bold = true;
          await ctx.sync(); return;
        }
        case "clear_range": {
          sheet.getRange(args.range).clear();
          await ctx.sync(); return;
        }
        case "apply_number_format": {
          const r = sheet.getRange(args.range);
          r.load(["rowCount", "columnCount"]);
          await ctx.sync();
          const m = [];
          for (let i = 0; i < r.rowCount; i++) {
            const row = [];
            for (let k = 0; k < r.columnCount; k++) row.push(args.format);
            m.push(row);
          }
          r.numberFormat = m;
          await ctx.sync(); return;
        }
        case "apply_fill_color": {
          sheet.getRange(args.range).format.fill.color = args.color;
          await ctx.sync(); return;
        }
        case "apply_font_style": {
          const f = sheet.getRange(args.range).format.font;
          if (typeof args.bold === "boolean") f.bold = args.bold;
          if (typeof args.italic === "boolean") f.italic = args.italic;
          if (typeof args.underline === "boolean") f.underline = args.underline ? "Single" : "None";
          if (args.size) f.size = args.size;
          if (args.color) f.color = args.color;
          await ctx.sync(); return;
        }
        case "apply_border": {
          const r = sheet.getRange(args.range);
          const style = String(args.style || "thin");
          const weightMap = { thin: "Thin", medium: "Medium", thick: "Thick" };
          const setEdge = (which) => {
            const b = r.format.borders.getItem(which);
            if (style === "double") { b.style = "Double"; }
            else { b.style = "Continuous"; b.weight = weightMap[style] || "Thin"; }
          };
          const edges = String(args.edges || "all");
          if (edges === "all") {
            ["EdgeTop", "EdgeBottom", "EdgeLeft", "EdgeRight", "InsideHorizontal", "InsideVertical"].forEach(setEdge);
          } else if (edges === "outline") {
            ["EdgeTop", "EdgeBottom", "EdgeLeft", "EdgeRight"].forEach(setEdge);
          } else if (edges === "bottom") { setEdge("EdgeBottom"); }
          else if (edges === "top") { setEdge("EdgeTop"); }
          await ctx.sync(); return;
        }
        case "auto_fit_columns": {
          const r = args.range ? sheet.getRange(args.range) : sheet.getUsedRange();
          r.format.autofitColumns();
          await ctx.sync(); return;
        }
        case "set_column_width": {
          sheet.getRange(args.columns).format.columnWidth = args.width;
          await ctx.sync(); return;
        }
        case "set_row_height": {
          sheet.getRange(args.rows).format.rowHeight = args.height;
          await ctx.sync(); return;
        }
        case "merge_cells": {
          sheet.getRange(args.range).merge(args.across === true);
          await ctx.sync(); return;
        }
        case "apply_freeze_panes": {
          if (args.rows) sheet.freezePanes.freezeRows(args.rows);
          if (args.columns) sheet.freezePanes.freezeColumns(args.columns);
          await ctx.sync(); return;
        }
        case "set_validation": {
          const r = sheet.getRange(args.range);
          if (Array.isArray(args.list) && args.list.length) {
            r.dataValidation.rule = { list: { inCellDropDown: true, source: args.list.join(",") } };
          } else if (typeof args.min === "number" || typeof args.max === "number") {
            r.dataValidation.rule = {
              decimal: {
                formula1: typeof args.min === "number" ? args.min : -1e15,
                formula2: typeof args.max === "number" ? args.max : 1e15,
                operator: "Between",
              },
            };
          }
          await ctx.sync(); return;
        }
        case "insert_named_table": {
          const t = ctx.workbook.tables.add(sheet.getRange(args.range), args.hasHeaders !== false);
          if (args.name) t.name = String(args.name).replace(/[^A-Za-z0-9_]/g, "_");
          await ctx.sync(); return;
        }
        case "insert_chart": {
          const typeMap = {
            columnClustered: "ColumnClustered", line: "Line", pie: "Pie",
            barClustered: "BarClustered", area: "Area", scatter: "XYScatter",
          };
          const ct = typeMap[args.chartType || "columnClustered"] || "ColumnClustered";
          const chart = sheet.charts.add(ct, sheet.getRange(args.dataRange), "Auto");
          if (args.title) chart.title.text = String(args.title);
          await ctx.sync(); return;
        }
        case "apply_conditional_format": {
          const r = sheet.getRange(args.range);
          if (args.type === "colorScale") {
            r.conditionalFormats.add("ColorScale");
          } else if (args.type === "dataBar") {
            r.conditionalFormats.add("DataBar");
          } else {
            const cf = r.conditionalFormats.add("CellValue");
            const opMap = { greaterThan: "GreaterThan", lessThan: "LessThan", between: "Between", equalTo: "EqualTo" };
            cf.cellValue.rule = {
              formula1: String(args.value != null ? args.value : 0),
              operator: opMap[args.operator || "greaterThan"] || "GreaterThan",
            };
            if (args.color) cf.cellValue.format.fill.color = args.color;
          }
          await ctx.sync(); return;
        }
        case "add_sheet": {
          const ws = ctx.workbook.worksheets.add(args.name || undefined);
          if (args.activate !== false) ws.activate();
          await ctx.sync(); return;
        }
        case "rename_sheet": {
          const ws = args.from
            ? ctx.workbook.worksheets.getItem(args.from)
            : ctx.workbook.worksheets.getActiveWorksheet();
          ws.name = args.to;
          await ctx.sync(); return;
        }
        case "protect_sheet": {
          const ws = getSheet(ctx, args.sheet);
          if (args.protect === false) ws.protection.unprotect();
          else ws.protection.protect();
          await ctx.sync(); return;
        }
        case "read_range": {
          const r = sheet.getRange(args.range);
          r.load(["address", "values", "formulas", "rowCount", "columnCount"]);
          await ctx.sync();
          return {
            address: r.address, rowCount: r.rowCount, columnCount: r.columnCount,
            values: r.values, formulas: r.formulas,
          };
        }
        case "get_sheet_names": {
          const sheets = ctx.workbook.worksheets;
          sheets.load("items/name");
          await ctx.sync();
          return { sheets: sheets.items.map((s) => s.name) };
        }
        case "get_used_range": {
          const used = sheet.getUsedRangeOrNullObject(true);
          used.load(["address", "rowCount", "columnCount", "isNullObject"]);
          sheet.load("name");
          await ctx.sync();
          if (used.isNullObject) return { sheet: sheet.name, empty: true };
          return {
            sheet: sheet.name, address: used.address,
            rowCount: used.rowCount, columnCount: used.columnCount,
          };
        }
        default:
          throw new Error("Unknown excel op: " + tool);
      }
    });
  }

  // ── Preview / approve guard ───────────────────────────────────────────────
  function matrixCells(m) {
    return Array.isArray(m)
      ? m.reduce((a, row) => a + (Array.isArray(row) ? row.length : 0), 0)
      : 0;
  }
  function rangeCells(range) {
    if (!range) return 0;
    const parts = String(range).split("!").pop().split(":");
    if (parts.length < 2) return 1;
    try {
      const a = a1ToOffset(parts[0].toUpperCase());
      const b = a1ToOffset(parts[1].toUpperCase());
      return (Math.abs(b.row - a.row) + 1) * (Math.abs(b.col - a.col) + 1);
    } catch (e) { return 0; }
  }
  function estimateOpCells(tool, args) {
    args = args || {};
    if (tool === "write_range") return matrixCells(args.values);
    if (tool === "write_bulk_rows") return matrixCells(args.rows);
    if (tool === "write_header_row") return (args.headers || []).length;
    if (tool === "write_cell" || tool === "insert_formula") return 1;
    if (tool === "clear_range") return rangeCells(args.range);
    return 0;
  }
  function opNeedsApproval(tool, args, runCtx) {
    if (runCtx.autoExecute || runCtx.approved) return false;
    if (STRUCTURAL_OPS.has(tool)) return true;
    return estimateOpCells(tool, args) > 10;
  }
  // An aggregated batch (one model turn's worth of mutating ops) needs approval
  // when any op is structural or the batch writes more than 10 cells in total —
  // catches "bulk builds" that the model splits into many small sub-threshold ops.
  function planNeedsApproval(ops, runCtx) {
    if (runCtx.autoExecute || runCtx.approved) return false;
    if (!ops || !ops.length) return false;
    let total = 0;
    for (const op of ops) {
      if (STRUCTURAL_OPS.has(op.tool)) return true;
      total += estimateOpCells(op.tool, op.args);
    }
    return total > 10;
  }
  function describeOpShort(tool, args) {
    args = args || {};
    const loc = args.cell || args.anchor || args.range || args.dataRange ||
      args.columns || args.rows || args.name || args.to || "";
    return tool + (loc ? " " + loc : "");
  }
  function describeOp(tool, args, cells) {
    args = args || {};
    const sheet = args.sheet ? args.sheet + "!" : "";
    if (tool === "write_range" || tool === "write_bulk_rows") {
      return "Write " + cells + " cells at " + sheet + (args.anchor || "?");
    }
    if (tool === "clear_range") return "Clear " + sheet + (args.range || "?") + " (" + cells + " cells)";
    if (tool === "add_sheet") return 'Add new sheet "' + (args.name || "") + '"';
    if (tool === "rename_sheet") return 'Rename sheet to "' + (args.to || "") + '"';
    if (tool === "protect_sheet") return (args.protect === false ? "Unprotect" : "Protect") + " sheet " + (args.sheet || "active");
    return describeOpShort(tool, args) + (cells ? " (" + cells + " cells)" : "");
  }

  // A small UI adapter so excel_op rendering works in both the Agent chat
  // (steps + action cards) and the Build tab (a flat progress log).
  function makeOpUi(logEl, cardEl) {
    return {
      addOpRow: (label) => addStep(logEl, label, "run"),
      finishOpRow: (row, ok, err) => {
        if (!row) return;
        const dot = row.querySelector(".dot");
        if (dot) dot.className = "dot " + (ok ? "ok" : "err");
        if (!ok && err) addStep(logEl, " ↳ " + err, "err");
      },
      showPreview: (summary) => new Promise((resolve) => {
        const card = document.createElement("div");
        card.className = "action";
        card.innerHTML =
          "<h4>Review bulk write</h4>" +
          '<div class="preview"></div>' +
          '<div class="row">' +
            '<button class="btn sm" data-act="ok">Apply</button>' +
            '<button class="btn ghost sm" data-act="no">Cancel build</button>' +
          "</div>";
        card.querySelector(".preview").textContent = summary;
        cardEl.appendChild(card);
        try { card.scrollIntoView({ block: "nearest" }); } catch (e) { /* ignore */ }
        const done = (val) => {
          card.style.opacity = "0.6";
          card.querySelectorAll("button").forEach((b) => { b.disabled = true; });
          resolve(val);
        };
        card.querySelector('[data-act="ok"]').onclick = () => done(true);
        card.querySelector('[data-act="no"]').onclick = () => done(false);
      }),
      // Aggregated "review all steps" card: lists every planned op (in order,
      // with per-op cell estimates) and asks for a single approve/reject before
      // the agent writes anything.
      showPlan: (ops) => new Promise((resolve) => {
        const card = document.createElement("div");
        card.className = "action";
        const heading = document.createElement("h4");
        const count = ops.length;
        heading.textContent =
          "Review build plan — " + count + " step" + (count === 1 ? "" : "s");
        const list = document.createElement("ol");
        list.className = "plan-list";
        ops.forEach((op) => {
          const cells = estimateOpCells(op.tool, op.args);
          const li = document.createElement("li");
          li.textContent = describeOp(op.tool, op.args, cells);
          list.appendChild(li);
        });
        const row = document.createElement("div");
        row.className = "row";
        const okBtn = document.createElement("button");
        okBtn.className = "btn sm";
        okBtn.textContent = "Approve & build";
        const noBtn = document.createElement("button");
        noBtn.className = "btn ghost sm";
        noBtn.textContent = "Cancel build";
        row.appendChild(okBtn);
        row.appendChild(noBtn);
        card.appendChild(heading);
        card.appendChild(list);
        card.appendChild(row);
        cardEl.appendChild(card);
        try { card.scrollIntoView({ block: "nearest" }); } catch (e) { /* ignore */ }
        const done = (val) => {
          card.style.opacity = "0.6";
          card.querySelectorAll("button").forEach((b) => { b.disabled = true; });
          resolve(val);
        };
        okBtn.onclick = () => done(true);
        noBtn.onclick = () => done(false);
      }),
    };
  }

  // Handle an aggregated `excel_plan` frame: one model turn's worth of mutating
  // ops, surfaced as a single review-and-approve card before anything is written.
  // On approve, the batch's subsequent excel_op frames auto-apply (session
  // approval); on reject, the run is cancelled so each op posts a cancel result.
  async function handleExcelPlan(j, runCtx, ui) {
    if (runCtx.cancelled) return;
    const ops = (j && j.ops) || [];
    if (!planNeedsApproval(ops, runCtx)) return;
    const ok = await ui.showPlan(ops);
    if (!ok) { runCtx.cancelled = true; return; }
    runCtx.approved = true; // whole plan approved — batch ops auto-apply
  }

  // Execute one streamed excel_op: gate it (preview/approve), run it through
  // Office.js, then POST the real result back to advance the agent loop.
  async function handleExcelOp(j, runCtx, ui) {
    const id = j.id;
    const tool = j.tool;
    const args = j.args || {};
    if (runCtx.cancelled) { await postToolResult(id, { ok: false, cancelled: true }); return; }
    const isRead = READ_OPS.has(tool);
    if (!isRead && opNeedsApproval(tool, args, runCtx)) {
      const cells = estimateOpCells(tool, args);
      const ok = await ui.showPreview(describeOp(tool, args, cells));
      if (!ok) {
        runCtx.cancelled = true;
        await postToolResult(id, { ok: false, cancelled: true });
        return;
      }
      runCtx.approved = true; // session approval — remaining ops auto-apply
    }
    const row = ui.addOpRow(describeOpShort(tool, args));
    try {
      const result = await executeExcelOp(tool, args);
      ui.finishOpRow(row, true);
      await postToolResult(id, { ok: true, result: result });
      if (state.sendContext) refreshSheetContext();
    } catch (e) {
      const msg = e && (e.message || String(e));
      ui.finishOpRow(row, false, msg);
      await postToolResult(id, { ok: false, error: msg });
    }
  }

  // ── Agentic build flow (Build tab) ────────────────────────────────────────
  async function build(goal) {
    if (!goal) return;
    if (state.inflightAbort) state.inflightAbort.abort();
    const cred = currentCredential();
    if (!cred) { showSignIn(); return; }

    const logEl = $("build-log");
    logEl.innerHTML = "";
    const heading = addStep(logEl, "Planning: " + goal, "run");
    const ui = makeOpUi(logEl, logEl);
    const runCtx = { autoExecute: state.autoExecute, approved: false, cancelled: false };
    const ctrl = new AbortController();
    state.inflightAbort = ctrl;
    const btn = $("btn-build");
    if (btn) btn.disabled = true;

    let summary = "";
    try {
      await streamAgent({
        question: goal,
        context: state.sendContext ? state.contextSummary : null,
        signal: ctrl.signal,
        onEvent: async (event, j) => {
          if (event === "excel_plan") { await handleExcelPlan(j, runCtx, ui); }
          else if (event === "excel_op") { await handleExcelOp(j, runCtx, ui); }
          else if (event === "step") { addStep(logEl, j.label || j.kind, "run"); }
          else if (event === "answer_chunk") { summary += j.text || ""; }
          else if (event === "error") { addStep(logEl, "Error: " + (j.message || "unknown"), "err"); }
        },
      });
      const hdot = heading.querySelector(".dot");
      if (hdot) hdot.className = "dot " + (runCtx.cancelled ? "err" : "ok");
      if (runCtx.cancelled) addStep(logEl, "Build cancelled.", "err");
      if (summary.trim()) {
        const s = document.createElement("div");
        s.className = "build-summary";
        s.innerHTML = renderMarkdown(summary);
        logEl.appendChild(s);
      }
    } catch (e) {
      if (!e || e.name !== "AbortError") {
        addStep(logEl, "Failed: " + (e && (e.message || e)), "err");
      }
    } finally {
      state.inflightAbort = null;
      if (btn) btn.disabled = false;
    }
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
    // Collect citations from tool_result SSE events during this request.
    const citations = [];
    let citationIndex = 1;

    const send = $("btn-send");
    send.disabled = true;

    const ctrl = new AbortController();
    state.inflightAbort = ctrl;

    // Agentic-build ops in the chat: gate bulk writes behind the "Confirm
    // writes" chip (off ⇒ auto-execute). Reuses the chat steps + action cards.
    const opUi = makeOpUi(stepsEl, actionsEl);
    const runCtx = { autoExecute: !state.confirmWrites, approved: false, cancelled: false };

    try {
      await streamAgent({
        question,
        context: state.sendContext ? state.contextSummary : null,
        signal: ctrl.signal,
        onEvent: async (event, j) => {
          if (event === "excel_plan") { await handleExcelPlan(j, runCtx, opUi); return; }
          if (event === "excel_op") { await handleExcelOp(j, runCtx, opUi); return; }
          handleSseEvent(event, j, {
            addStepRow,
            finishStep,
            appendStepRow,
            actionsEl,
            citations,
            getCitationIndex: () => citationIndex++,
            onChunk: (t) => {
              answerText += t;
              // Re-render with citation badges linked.
              bodyEl.innerHTML = renderMarkdown(answerText, citations);
              scrollChat();
            },
          });
        },
      });
      // Mark any in-flight steps as ok at the end.
      for (const k of Object.keys(stepRows)) {
        const dot = stepRows[k].querySelector(".dot");
        if (dot.classList.contains("run")) dot.className = "dot ok";
      }
      // Final render with complete answer + all citations collected.
      if (answerText) {
        bodyEl.innerHTML = renderMarkdown(answerText, citations);
      }
      // Append sources panel (always visible after answer).
      if (citations.length > 0) {
        appendSourcesPanel(actionsEl, citations, answerText);
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
      // Atomic excel ops render via their own excel_op rows — skip the generic
      // tool row so the chat doesn't double-log every build step.
      if (EXCEL_OP_TOOLS.has(j.name)) return;
      ui.addStepRow("tool:" + j.id, "Tool: " + j.name);
    } else if (event === "tool_result") {
      if (EXCEL_OP_TOOLS.has(j.name)) return;
      // Mark the originating tool_call row by id, then append the summary as
      // a child row scoped to *this* message (never the global selector).
      ui.finishStep("tool:" + j.id, j.ok !== false);
      if (j.summary) ui.appendStepRow(" ↳ " + j.summary, j.ok === false ? "err" : "ok");

      // Collect structured citations from tool results.
      const providerLabel = j.provider || j.summary || "";
      if (j.raw) {
        try {
          const payload = JSON.parse(j.raw);
          const articles = payload.articles || payload.news || [];
          articles.slice(0, 4).forEach((art) => {
            if (art.url || art.link) {
              ui.citations.push({
                index: ui.getCitationIndex(),
                source: art.source || art.publisher || providerLabel || "News",
                url: art.url || art.link || "",
                excerpt: (art.title || "").slice(0, 120),
              });
            }
          });
          const filings = payload.filings || [];
          filings.slice(0, 3).forEach((filing) => {
            if (filing.url) {
              ui.citations.push({
                index: ui.getCitationIndex(),
                source: "SEC EDGAR (" + (filing.form || "Filing") + ")",
                url: filing.url,
                excerpt: ((filing.description || filing.form || "") + (filing.filed ? " · " + filing.filed : "")).slice(0, 100),
              });
            }
          });
          const transcripts = payload.transcripts || [];
          transcripts.slice(0, 2).forEach((tr) => {
            if (tr.url || tr.symbol) {
              ui.citations.push({
                index: ui.getCitationIndex(),
                source: "Earnings call — " + (tr.symbol || "") + " " + (tr.year || "") + (tr.quarter ? "Q" + tr.quarter : ""),
                url: tr.url || "",
                excerpt: (typeof tr.excerpt === "string" ? tr.excerpt.slice(0, 100) : ""),
              });
            }
          });
          // Provider-level fallback when no finer items.
          if (articles.length === 0 && filings.length === 0 && transcripts.length === 0 && providerLabel) {
            ui.citations.push({
              index: ui.getCitationIndex(),
              source: providerLabel,
              url: "",
              excerpt: j.name ? "Tool: " + j.name : "",
            });
          }
        } catch (e) {
          if (providerLabel) {
            ui.citations.push({
              index: ui.getCitationIndex(),
              source: providerLabel,
              url: "",
              excerpt: j.name ? "Tool: " + j.name : "",
            });
          }
        }
      } else if (providerLabel) {
        ui.citations.push({
          index: ui.getCitationIndex(),
          source: providerLabel,
          url: "",
          excerpt: j.name ? "Tool: " + j.name : "",
        });
      }
    } else if (event === "action") {
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

    // ── Build tab ────────────────────────────────────────────────────────
    $("build-ctx-chip").onclick = () => {
      state.sendContext = !state.sendContext;
      $("build-ctx-chip").classList.toggle("on", state.sendContext);
      $("ctx-chip").classList.toggle("on", state.sendContext);
    };
    $("auto-chip").onclick = () => {
      state.autoExecute = !state.autoExecute;
      $("auto-chip").classList.toggle("on", state.autoExecute);
      $("auto-chip").title = state.autoExecute
        ? "On — every step applies automatically, bulk writes are not gated"
        : "Off — bulk writes (>10 cells) and structural changes ask first";
    };
    $("btn-build").onclick = () => {
      const g = ($("build-goal").value || "").trim();
      if (g) build(g);
    };
    $("build-goal").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $("btn-build").click(); }
    });

    document.querySelectorAll(".tab").forEach((t) => {
      t.onclick = () => activateTab(t.dataset.pane);
    });

    $("btn-prov-refresh").onclick = renderProvenanceTable;

    // Builder templates now compose a goal and run through the agentic loop so
    // the model lays out (and can adapt) the model live, rather than stamping a
    // static block.
    const TEMPLATE_PROMPTS = {
      dcf: (sym) => "Build a clean DCF model for " + sym + " on the active sheet. Start at the active cell. Include: an inputs block (last price, shares outstanding, market cap, net debt, tax rate, WACC, terminal growth) using live =FINSYT.QUOTE / =FINSYT.METRIC formulas where possible; a 5-year revenue → EBIT → NOPAT → FCF forecast; discounting to enterprise value, equity value and implied per-share value vs. the current price. Add bold headers, soft-yellow input cells, currency/percent number formats, sensible column widths and a freeze pane below the title.",
      comps: (sym) => "Build a trading-comparables table for " + sym + " and its key peers on the active sheet, starting at the active cell. Columns: market cap, P/E, EV/Sales, EV/EBITDA using live =FINSYT.* formulas. Add a mean and median row, bold the header row, and apply number formats and column widths.",
      sensitivity: (sym) => "Build a 2-D sensitivity table for " + sym + " on the active sheet starting at the active cell: WACC down the rows, terminal growth across the columns, implied equity value per share in the grid. Label both axes, bold the headers, and apply number formats.",
      wacc: (sym) => "Build a WACC build-up for " + sym + " on the active sheet starting at the active cell: cost of equity via CAPM (risk-free rate, equity risk premium, beta), after-tax cost of debt, capital structure weights, and the resulting weighted average cost of capital. Use live =FINSYT.* formulas where possible, bold headers, soft-yellow input cells and percent number formats.",
    };
    document.querySelectorAll(".tpl").forEach((t) => {
      t.onclick = () => {
        const kind = t.dataset.kind;
        const sym = ($("tpl-symbol").value || "AAPL").trim().toUpperCase() || "AAPL";
        const make = TEMPLATE_PROMPTS[kind];
        const goal = make ? make(sym) : ("Build a " + kind + " model for " + sym);
        $("build-goal").value = goal;
        activateTab("build");
        build(goal);
      };
    });

    bindSelectionEvents();

    if (currentCredential()) showApp();
    else showSignIn();
  });
})();
