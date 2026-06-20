import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Source-details panel contract for the alt-data citation drawer (Task #342).
 *
 * The Insider Activity, People & Culture and Filing Signals cards each emit
 * a structured `AltDataCitation` (provider name + deep link + key fields +
 * retrieved-at) that the page-level Drawer renders via `AltDataCitationView`
 * instead of a raw JSON dump. There was no automated guard for this, so a
 * regression (a builder dropping the deep link, or a page reverting to
 * plain-body rendering) would ship unnoticed.
 *
 * This spec stubs the Apify Actors connector endpoints so the three cards
 * render deterministically (no real Apify spend, no real connection needed),
 * then for each card:
 *   1. clicks the `[1]` citation chip,
 *   2. asserts the drawer shows the structured source view — provider label,
 *      a clickable "View source ↗" upstream link, at least one key field,
 *      and a "Retrieved …" timestamp.
 *
 * It also confirms the *plain-body* fallback still works for a non-alt-data
 * (transcript) citation on the company page, where `onCite` is called without
 * a structured `source`.
 *
 * Runs only in `PLATFORM_OPEN_MODE` (the no-login bypass), matching the other
 * UI smoke specs — the auth-gated path is covered by `sign-in.spec.ts`.
 */

const OPEN_MODE_RAW = (process.env.PLATFORM_OPEN_MODE ?? "").trim().toLowerCase();
const OPEN_MODE =
  OPEN_MODE_RAW === "1" || OPEN_MODE_RAW === "true" || OPEN_MODE_RAW === "yes";

// ── Deterministic actor payloads ─────────────────────────────────────────────
// Each carries a `url` so the structured view must render a real deep link.
const CAPITOL_ROWS = [
  {
    politician: "Rep. Jane Doe",
    party: "D",
    chamber: "House",
    type: "Purchase",
    amount: "$15K–$50K",
    filed: "2026-05-01",
    traded: "2026-04-20",
    ticker: "AAPL",
    url: "https://www.capitoltrades.com/trades/EXAMPLE",
  },
];

const GLASSDOOR_ROWS = [
  {
    rating: 4.1,
    reviewCount: 4321,
    recommendPct: 82,
    ceoApprovePct: 91,
    pros: ["Strong engineering culture"],
    cons: ["Fast pace"],
    medianSalary: "$185,000",
    url: "https://www.glassdoor.com/Overview/EXAMPLE.htm",
  },
];

const SIGNAL_ROWS = [
  {
    accession: "0000320193-26-000010",
    signalScore: 84,
    materialSections: ["Risk Factors", "MD&A"],
    formType: "10-K",
    filedAt: "2026-02-01",
    url: "https://www.sec.gov/Archives/edgar/EXAMPLE",
  },
];

/**
 * Cut every background `/api/**` call the heavy screener / company pages fire
 * (quotes, financials, news, estimates, screener rows, census, …). None of
 * them feed the surfaces under test — the FocusPicker uses a client-side
 * fallback list and the alt-data cards are driven entirely by the stubbed
 * connector endpoints below — so aborting them keeps the run fast and
 * deterministic and avoids loading real providers (and the chromium memory
 * pressure that caused OOM kills). Registered FIRST so the more specific
 * connector / transcript stubs (added afterwards) take precedence.
 */
async function blockBackgroundApi(page: Page): Promise<void> {
  await page.route("**/api/**", async (route: Route) => {
    await route.abort();
  });
}

/**
 * Intercept the Apify Actors connector endpoints so the alt-data cards see an
 * active connection and get canned actor rows. Returns nothing — installs the
 * route on the page for the rest of the test.
 */
async function stubApifyConnector(page: Page): Promise<void> {
  await page.route("**/api/connectors/**", async (route: Route) => {
    const url = route.request().url();
    if (url.includes("/execute")) {
      const body = (route.request().postDataJSON() ?? {}) as { operation?: string };
      const data =
        body.operation === "capitol_trades"
          ? CAPITOL_ROWS
          : body.operation === "glassdoor_company"
            ? GLASSDOOR_ROWS
            : body.operation === "sec_filings_intelligence"
              ? SIGNAL_ROWS
              : [];
      await route.fulfill({ json: { ok: true, data } });
      return;
    }
    // Connection-detection call: advertise one active apify-actors connection.
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
 * Open the `[1]` citation chip inside the card whose header matches
 * `cardTitle`, then assert the drawer renders the structured source view.
 */
async function assertStructuredCitation(
  page: Page,
  cardTitle: string | RegExp,
  expectedProvider: string | RegExp,
): Promise<void> {
  const card = page.locator(".card").filter({ hasText: cardTitle }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });

  const chip = card.getByRole("button", { name: "[1]" }).first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  // Use the DOM's native click() via evaluate rather than Playwright's
  // pointer-event-based click. The screener page renders a positioned
  // `.card` container that Playwright reports as intercepting pointer
  // events; native `el.click()` dispatches a bubbling MouseEvent that
  // React's synthetic-event delegation (attached at the root) still
  // receives and routes to the button's onClick handler.
  await chip.evaluate((el) => (el as HTMLButtonElement).click());

  // The Drawer from ui/index.tsx is always rendered in the DOM regardless
  // of open/closed state — it just slides in/out via CSS transform. That
  // means `toBeVisible()` on the aside itself is always true and gives a
  // false positive. Assert on the specific content instead, which is only
  // present when onCite has been called with the AltDataCitation payload.
  const drawer = page.locator('aside[role="dialog"]');

  // 1. Provider label.
  await expect(drawer.getByText(expectedProvider).first()).toBeVisible({ timeout: 15_000 });
  // 2. Clickable upstream deep link with a real http(s) href.
  const link = drawer.getByRole("link", { name: /View source/i });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /^https?:\/\//);
  // 3. At least one structured key field (dt/dd pair).
  await expect(drawer.locator("dt").first()).toBeVisible();
  await expect(drawer.locator("dd").first()).toBeVisible();
  // 4. Retrieved-at timestamp.
  await expect(drawer.getByText(/Retrieved /i).first()).toBeVisible();

  // Close via the × button (aria-label="Close drawer"). Escape is NOT
  // bound to the Drawer's onClose — pressing it won't close the panel.
  // A toast/status notification (<div role="status">) can sit above the
  // button; use evaluate to dispatch the native click() directly so the
  // status overlay doesn't intercept it.
  await drawer
    .getByRole("button", { name: /Close drawer/i })
    .evaluate((el) => (el as HTMLButtonElement).click());
  // After close, citation.source becomes undefined, so the provider text
  // is no longer rendered; wait for it to disappear before the next chip.
  await expect(drawer.getByText(expectedProvider).first()).toBeHidden({ timeout: 5_000 });
}

test.describe("alt-data citation source panel", () => {
  test.skip(
    !OPEN_MODE,
    "PLATFORM_OPEN_MODE not set — alt-data citation smoke needs the no-login bypass.",
  );

  // The first-run welcome modal (`FirstRunWelcome`) renders a full-screen
  // `role="dialog"` overlay that intercepts pointer events until dismissed.
  // It persists its dismissal in localStorage under `finsyt:firstrun:done`,
  // so pre-seed that key before any document script runs to keep the modal
  // from blocking the citation chips / cite buttons under test.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("finsyt:firstrun:done", "1");
      } catch {
        /* localStorage unavailable — modal dismissal best-effort */
      }
    });
  });

  test("screener cards render the structured source view for all three card types", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await blockBackgroundApi(page);
    await stubApifyConnector(page);

    await page.goto("/platform/app/screener", { waitUntil: "domcontentloaded" });

    // The AltDataSection only mounts once a focus ticker is resolved from the
    // (fallback) screener list — wait for the section header to appear.
    await expect(page.getByText("Alt-data for").first()).toBeVisible({
      timeout: 30_000,
    });

    await assertStructuredCitation(page, "Insider Activity", "Capitol Trades");
    await assertStructuredCitation(page, /People & Culture/, "Glassdoor");
    await assertStructuredCitation(
      page,
      "Filing Signals",
      "SEC EDGAR Filings Intelligence",
    );
  });

  test("company page transcript citation falls back to the plain-body view", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await blockBackgroundApi(page);

    // The company page guards its main render behind `!quote?.price`. Without
    // a stubbed quote the page stays in "Symbol not found" state (blockBackgroundApi
    // aborts /api/quote) and the Transcripts tab — including the Cite buttons —
    // never renders. Return a minimal valid quote so the full page mounts.
    await page.route("**/api/quote*", async (route: Route) => {
      await route.fulfill({
        json: { price: 182.5, name: "Apple Inc.", symbol: "AAPL", changePct: 0.4 },
      });
    });

    // Provide one transcript so the Transcripts tab renders the synced player
    // (no year/quarter ⇒ it uses the built-in fallback paragraphs).
    await page.route("**/api/transcripts*", async (route: Route) => {
      await route.fulfill({
        json: {
          transcripts: [
            { title: "AAPL Q1 2026 Earnings Call", date: "2026-01-30" },
          ],
        },
      });
    });

    await page.goto("/platform/app/company/AAPL?tab=transcripts", {
      waitUntil: "domcontentloaded",
    });

    // Click the first "◆ Cite" affordance on a transcript paragraph.
    const cite = page.getByRole("button", { name: /Cite .* at /i }).first();
    await expect(cite).toBeVisible({ timeout: 30_000 });
    await cite.click();

    // The company page always keeps a "Recent decks" Drawer in the DOM
    // (even when closed), so `aside[role="dialog"]` resolves to 2 elements
    // in strict mode.  Filter to the citation drawer specifically, which is
    // the one that contains "Source citation" in its header.
    const drawer = page
      .locator('aside[role="dialog"]')
      .filter({ hasText: /Source citation/i });
    await expect(drawer).toBeVisible({ timeout: 10_000 });

    // Plain-body fallback: the auto-extracted context line shows and the
    // structured-view affordances (provider deep link) must be ABSENT.
    await expect(
      drawer.getByText(/auto-extracted from AAPL research context/i),
    ).toBeVisible();
    await expect(drawer.getByRole("link", { name: /View source/i })).toHaveCount(0);
  });
});
