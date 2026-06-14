import { test, expect, request as pwRequest, type Page, type Route } from "@playwright/test";
import { gotoWithRetry } from "./_nav";

/**
 * Row-click → alt-data focus contract (Task #340).
 *
 * The screener, portfolio and peers tables each let the user click a row to
 * make that company the *single* focus ticker for the shared alt-data cards
 * (Insider Activity / People & Culture / Filing Signals), while keeping the
 * `FocusPicker` chip row in sync. The cards are deliberately bounded to one
 * ticker so we never fan out a paid Apify run per visible row.
 *
 * There was no automated guard for any of this, so a future change to
 * `onRowClick` / `isRowActive` / `AltDataSection` could silently:
 *   - stop a row click from re-focusing the cards,
 *   - desync the FocusPicker chip from the clicked row, or
 *   - regress the one-ticker bound and fan an actor run out across every row.
 *
 * For each page this spec:
 *   1. stubs the Apify Actors connector (active connection + canned actor
 *      rows) and *records the ticker each actor run is requested with*;
 *   2. asserts that on load only the default focus ticker's alt-data is
 *      requested (no per-row fan-out);
 *   3. clicks a non-default table row and asserts BOTH the FocusPicker chip
 *      and the alt-data requests now reflect the clicked ticker — and *only*
 *      that ticker.
 *
 * Runs only in `PLATFORM_OPEN_MODE` (the no-login bypass), matching the other
 * UI smoke specs.
 */

const OPEN_MODE_RAW = (process.env.PLATFORM_OPEN_MODE ?? "").trim().toLowerCase();
const OPEN_MODE =
  OPEN_MODE_RAW === "1" || OPEN_MODE_RAW === "true" || OPEN_MODE_RAW === "yes";

// ── Deterministic actor payloads (one row each is enough to render) ───────────
const CAPITOL_ROWS = [
  { politician: "Rep. Jane Doe", party: "D", chamber: "House", type: "Purchase", amount: "$15K–$50K", filed: "2026-05-01" },
];
const GLASSDOOR_ROWS = [
  { rating: 4.1, reviewCount: 4321, recommendPct: 82, ceoApprovePct: 91, pros: ["Strong culture"], cons: ["Fast pace"] },
];
const SIGNAL_ROWS = [
  { accession: "0000320193-26-000010", signalScore: 84, materialSections: ["Risk Factors"], formType: "10-K", filedAt: "2026-02-01" },
];

interface ActorCall {
  operation: string;
  ticker?: string;
  companyName?: string;
}

/**
 * Intercept the Apify Actors connector endpoints: advertise one active
 * `apify-actors` connection and return canned actor rows, while pushing every
 * actor run's params into `calls` so the test can assert which ticker(s) the
 * cards requested.
 */
async function stubConnectors(page: Page, calls: ActorCall[]): Promise<void> {
  await page.route("**/api/connectors/**", async (route: Route) => {
    const url = route.request().url();
    if (url.includes("/execute")) {
      const body = (route.request().postDataJSON() ?? {}) as {
        operation?: string;
        params?: { ticker?: string; companyName?: string };
      };
      const op = body.operation ?? "";
      calls.push({
        operation: op,
        ticker: body.params?.ticker,
        companyName: body.params?.companyName,
      });
      const data =
        op === "capitol_trades"
          ? CAPITOL_ROWS
          : op === "glassdoor_company"
            ? GLASSDOOR_ROWS
            : op === "sec_filings_intelligence"
              ? SIGNAL_ROWS
              : [];
      await route.fulfill({ json: { ok: true, data } });
      return;
    }
    await route.fulfill({
      json: {
        connections: [
          { id: "conn-test", definitionSlug: "apify-actors", status: "active" },
        ],
      },
    });
  });
}

/**
 * Distinct tickers across the ticker-bearing actor ops (capitol_trades and
 * sec_filings_intelligence always carry the uppercase symbol; glassdoor uses
 * a free-form company name that differs per page, so it's excluded here).
 */
function requestedTickers(calls: ActorCall[]): string[] {
  return Array.from(
    new Set(
      calls
        .filter(
          (c) =>
            c.operation === "capitol_trades" ||
            c.operation === "sec_filings_intelligence",
        )
        .map((c) => c.ticker)
        .filter((t): t is string => !!t),
    ),
  );
}

/**
 * Whether BOTH ticker-bearing actor ops (capitol_trades AND
 * sec_filings_intelligence) have fired for a given ticker. Focusing a company
 * always dispatches both, so this is the signal that the focus's alt-data
 * requests have fully settled — used to avoid clearing the recorder mid-flight
 * (a late initial request would otherwise leak into the post-click window).
 */
function bothOpsFired(calls: ActorCall[], ticker: string): boolean {
  const ops = new Set(
    calls
      .filter(
        (c) =>
          c.ticker === ticker &&
          (c.operation === "capitol_trades" ||
            c.operation === "sec_filings_intelligence"),
      )
      .map((c) => c.operation),
  );
  return ops.has("capitol_trades") && ops.has("sec_filings_intelligence");
}

/**
 * Resolve the FocusPicker region (the chip row labelled "Alt-data for"),
 * the currently-pressed default ticker, and a different target ticker to
 * click. Throws if fewer than two tickers are available.
 */
async function readFocus(page: Page): Promise<{
  region: ReturnType<Page["locator"]>;
  def: string;
  target: string;
}> {
  const region = page
    .locator('div:has(> span:text-is("Alt-data for"))')
    .first();
  await expect(region).toBeVisible({ timeout: 30_000 });
  const btns = region.getByRole("button");
  await expect(btns.first()).toBeVisible({ timeout: 30_000 });
  const count = await btns.count();
  const all: { t: string; pressed: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    const t = (await btns.nth(i).innerText()).trim();
    const pressed = (await btns.nth(i).getAttribute("aria-pressed")) === "true";
    all.push({ t, pressed });
  }
  const pressed = all.find((x) => x.pressed);
  expect(pressed, "a focus chip must be pressed on load").toBeTruthy();
  const def = pressed!.t;
  const target = all.find((x) => x.t && x.t !== def)?.t ?? "";
  expect(def, "a default focus ticker must be pressed").toBeTruthy();
  expect(target, "need a second ticker to click").toBeTruthy();
  return { region, def, target };
}

/**
 * The shared assertion body once a page is loaded and a stubbed connector is
 * in place: default-only on load, then clicked-ticker-only after a row click,
 * with the FocusPicker chip kept in sync both times.
 */
async function assertRowClickFocus(page: Page, calls: ActorCall[]): Promise<void> {
  const { region, def, target } = await readFocus(page);

  // 1. On load, only the default focus ticker's alt-data is requested. Wait
  //    for both ticker-bearing ops to settle so a late initial request can't
  //    leak into the post-click window after the reset below.
  await expect
    .poll(() => bothOpsFired(calls, def), { timeout: 20_000 })
    .toBe(true);
  expect(requestedTickers(calls)).toEqual([def]);

  // Reset so the post-click window is clean.
  calls.length = 0;

  // 2. Click a non-default row (a numeric/metric cell — never the symbol link
  //    in column 0, which would navigate to the company page).
  const row = page
    .locator("table.data-table tbody tr")
    .filter({ hasText: target })
    .first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.locator("td").nth(1).click();

  // 3. FocusPicker chip is in sync with the clicked row.
  await expect(
    region.getByRole("button", { name: target, exact: true }),
  ).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
  await expect(
    region.getByRole("button", { name: def, exact: true }),
  ).toHaveAttribute("aria-pressed", "false");

  // 4. Alt-data now reflects the clicked ticker — and ONLY that ticker
  //    (one ticker → one Apify run; no per-row fan-out).
  await expect
    .poll(() => bothOpsFired(calls, target), { timeout: 20_000 })
    .toBe(true);
  expect(requestedTickers(calls)).toEqual([target]);
}

test.describe("row click drives alt-data focus", () => {
  test.skip(
    !OPEN_MODE,
    "PLATFORM_OPEN_MODE not set — alt-data focus smoke needs the no-login bypass.",
  );

  // Seed the starter peer sets so /app/peers has a populated comparison table.
  test.beforeAll(async ({ baseURL }) => {
    const ctx = await pwRequest.newContext({ baseURL });
    try {
      await ctx.post("/platform/api/peers/seed");
    } finally {
      await ctx.dispose();
    }
  });

  // Dismiss the first-run welcome modal (full-screen dialog that would
  // intercept clicks) before any document script runs.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("finsyt:firstrun:done", "1");
      } catch {
        /* localStorage unavailable — best-effort */
      }
    });
  });

  test("screener: clicking a row focuses its alt-data", async ({ page }) => {
    test.setTimeout(120_000);
    const calls: ActorCall[] = [];
    // Abort all background API so the screener keeps its deterministic
    // client-side FALLBACK list; then stub connectors (registered last → wins).
    await page.route("**/api/**", (route) => route.abort());
    await stubConnectors(page, calls);

    await gotoWithRetry(page, "/platform/app/screener");
    await assertRowClickFocus(page, calls);
  });

  test("portfolio: clicking a row focuses its alt-data", async ({ page }) => {
    test.setTimeout(120_000);
    const calls: ActorCall[] = [];
    await page.route("**/api/**", (route) => route.abort());
    // Deterministic book: three holdings so there's a clear non-default row.
    await page.route("**/api/portfolio*", async (route: Route) => {
      if (route.request().method() !== "GET") return route.abort();
      await route.fulfill({
        json: {
          synced: true,
          positions: [
            { id: "p1", symbol: "NVDA", name: "NVIDIA", shares: 100, costBasis: 400 },
            { id: "p2", symbol: "AAPL", name: "Apple", shares: 50, costBasis: 150 },
            { id: "p3", symbol: "TSLA", name: "Tesla", shares: 25, costBasis: 200 },
          ],
        },
      });
    });
    await stubConnectors(page, calls);

    await gotoWithRetry(page, "/platform/app/portfolio");
    await assertRowClickFocus(page, calls);
  });

  test("peers: clicking a row focuses its alt-data", async ({ page }) => {
    test.setTimeout(120_000);
    const calls: ActorCall[] = [];
    // Peers needs the real /api/peers/sets + /api/peers/compare to render the
    // comparison table, so only the connector endpoints are stubbed here.
    await stubConnectors(page, calls);

    await gotoWithRetry(page, "/platform/app/peers");
    await assertRowClickFocus(page, calls);
  });
});
