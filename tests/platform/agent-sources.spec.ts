import { test, expect, type Page, type Route } from "@playwright/test";
import { gotoWithRetry } from "./_nav";

/**
 * Smoke contract for the Research page's grounding UX (sources, citations,
 * source drawer, and follow-up chips).
 *
 * The test stubs the agent SSE endpoint so the research page receives a
 * canned stream — one tool call + result (get_news for NVDA), an answer
 * chunk that embeds an inline [1] marker, and a `done` event — without
 * needing a real OpenAI key or live data providers.
 *
 * Asserts:
 *   1. The right-rail Sources panel appears and shows at least one citation.
 *   2. The inline [1] citation button is visible inside the answer.
 *   3. Clicking the inline [1] button opens the SourceDrawer.
 *   4. Clicking "↗ Open" on a citation card also opens the SourceDrawer.
 *   5. The drawer closes on Escape.
 *   6. Follow-up suggestion chips appear under the "Dig deeper" label.
 *
 * Runs only in PLATFORM_OPEN_MODE (the no-login bypass), matching the
 * other UI smoke specs — the auth-gated path is covered by sign-in.spec.ts.
 */

const OPEN_MODE_RAW = (process.env.PLATFORM_OPEN_MODE ?? "").trim().toLowerCase();
const OPEN_MODE =
  OPEN_MODE_RAW === "1" || OPEN_MODE_RAW === "true" || OPEN_MODE_RAW === "yes";

// ── Canned SSE stream ─────────────────────────────────────────────────────────

/**
 * A minimal SSE event stream that the Research page's reader can parse.
 * Contains:
 *   - step (plan)
 *   - tool_call  → get_news for NVDA
 *   - tool_result → ok, citeIndex=1, raw payload with one article
 *   - answer_chunk with an inline [1] citation marker
 *   - done
 */
const CANNED_SSE = [
  `event: step\ndata: ${JSON.stringify({ kind: "plan", label: "Planning research approach" })}\n\n`,
  `event: tool_call\ndata: ${JSON.stringify({ id: "call_test_1", name: "get_news", args: { symbol: "NVDA" } })}\n\n`,
  `event: tool_result\ndata: ${JSON.stringify({
    id: "call_test_1",
    name: "get_news",
    ok: true,
    summary: "NVDA reported strong data-centre demand in Q4.",
    provider: "FMP",
    responseMs: 115,
    citeIndex: 1,
    raw: JSON.stringify({
      articles: [
        {
          title: "NVDA beats revenue estimates on data centre strength",
          url: "https://example.com/nvda-q4",
          symbol: "NVDA",
          publishedAt: "2026-06-09",
          source: "Reuters",
        },
      ],
    }),
  })}\n\n`,
  `event: answer_chunk\ndata: ${JSON.stringify({
    text: "According to recent news [1], NVDA reported strong data-centre demand that drove revenue above consensus estimates.",
  })}\n\n`,
  `event: done\ndata: {}\n\n`,
].join("");

// ── Route helpers ─────────────────────────────────────────────────────────────

/**
 * Block all background `/api/**` calls that the platform fires on load
 * (quotes, financials, news, screener rows, …). They don't feed the
 * surfaces under test and their absence keeps the run fast and deterministic.
 * Registered first so the more-specific agent stub below takes precedence.
 */
async function blockBackgroundApi(page: Page): Promise<void> {
  await page.route("**/api/**", async (route: Route) => {
    await route.abort();
  });
}

/**
 * Intercept POST requests to the agent SSE endpoint and return the canned
 * stream. The platform fetches `${NEXT_PUBLIC_BASE_PATH}/api/agent/ask`
 * which resolves to `/platform/api/agent/ask` through the shared proxy.
 */
async function stubAgentSse(page: Page): Promise<void> {
  await page.route("**/api/agent/ask", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
      body: CANNED_SSE,
    });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("agent sources, citations, drawer and follow-ups", () => {
  test.skip(
    !OPEN_MODE,
    "PLATFORM_OPEN_MODE not set — agent-sources smoke needs the no-login bypass.",
  );

  // Pre-dismiss the first-run welcome modal so it can't block citation chips.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("finsyt:firstrun:done", "1");
      } catch {
        /* localStorage unavailable — best-effort */
      }
    });
  });

  test("research page shows sources panel, inline citation, drawer, and follow-ups", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Install the background blocker first, then the more-specific agent stub.
    await blockBackgroundApi(page);
    await stubAgentSse(page);

    await gotoWithRetry(page, "/platform/app/research");

    // ── Ask a question ──────────────────────────────────────────────────────
    // The search input on the empty-state page has this placeholder text.
    const queryInput = page
      .getByPlaceholder(/Ask anything across the financial corpus/i)
      .first();
    await expect(queryInput).toBeVisible({ timeout: 30_000 });
    await queryInput.fill("What is the latest news on NVDA?");
    await queryInput.press("Enter");

    // ── 1. Sources panel ────────────────────────────────────────────────────
    // The right-rail header reads "Sources · N of M cited" once tool results
    // arrive. Wait up to 30 s for the canned stream to be fully processed.
    // Scope subsequent card/button assertions to the Sources aside so they
    // don't match similarly-named elements in the working timeline.
    const sourcesPanel = page
      .locator("aside")
      .filter({ hasText: /Sources\s*·/ })
      .first();
    await expect(sourcesPanel).toBeVisible({ timeout: 30_000 });

    // At least one citation card should be visible (our canned payload has 1).
    // Citation cards show the source label; ours is "Latest news" (get_news).
    const citationCard = sourcesPanel.getByText("Latest news").first();
    await expect(citationCard).toBeVisible({ timeout: 15_000 });

    // ── 2. Inline [1] citation button in the answer ──────────────────────────
    // AIMessage renders `[1]` as <button title="Jump to source [1]">{n}</button>.
    // The accessible name comes from text content ("1"), but `title` is the
    // stable, unique locator anchor here.
    const inlineCiteBtn = page
      .getByTitle(/Jump to source \[1\]/i)
      .first();
    await expect(inlineCiteBtn).toBeVisible({ timeout: 15_000 });

    // ── 3. Clicking inline [1] opens the SourceDrawer ────────────────────────
    await inlineCiteBtn.click();
    const drawer = page.locator('aside[role="dialog"]');
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    // Drawer header should show the citation source label.
    await expect(drawer.getByText("Latest news").first()).toBeVisible();

    // Close the drawer before the next assertion.
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden({ timeout: 5_000 });

    // ── 4. Clicking "↗ Open" on the citation card also opens the drawer ──────
    // Scope to the Sources panel to avoid hitting the timeline's step rows.
    const openBtn = sourcesPanel.getByRole("button", { name: /↗ Open/i }).first();
    await expect(openBtn).toBeVisible({ timeout: 10_000 });
    await openBtn.click();
    await expect(drawer).toBeVisible({ timeout: 10_000 });

    // The drawer shows the excerpt that came from `summary` in the SSE frame.
    await expect(
      drawer
        .getByText(/NVDA reported strong data-centre demand/i)
        .first(),
    ).toBeVisible();

    // Also confirm the raw payload "Records" section lists the article title.
    // (parseRecords in SourceDrawer extracts articles[].title from the raw JSON)
    await expect(
      drawer
        .getByText(/NVDA beats revenue estimates/i)
        .first(),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden({ timeout: 5_000 });

    // ── 5. Follow-up chips under "Dig deeper" ────────────────────────────────
    // buildFollowups with get_news ok + ticker=NVDA produces:
    //   "Summarise the most important NVDA news from the past week"
    //   "What could go wrong with this thesis on NVDA?"
    const digDeeper = page.getByText(/Dig deeper/i).first();
    await expect(digDeeper).toBeVisible({ timeout: 15_000 });

    // At least the news and critical-thinking chips should be present.
    await expect(
      page.getByRole("button", { name: /Summarise the most important NVDA news/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /What could go wrong with this thesis on NVDA/i }).first(),
    ).toBeVisible();
  });
});
