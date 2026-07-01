import { test, expect } from "@playwright/test";
import { gotoWithRetry } from "./_nav";

/**
 * End-to-end contract for the "Data sources used" footer on the Research
 * page (T253).
 *
 * This guards against the silent-regression mode the footer is most prone
 * to: the agent route stops emitting `provider`/`responseMs`, the SSE
 * parser drops the field, the workspace toggle accidentally hides the
 * footer, or the Connector Hub hyperlink stops pointing at the right
 * provider row. Without this test, any of those breakages would only
 * surface when a customer noticed.
 *
 * Strategy
 * --------
 * We don't drive the real agent (LLM tool-calling is non-deterministic
 * and depends on upstream provider keys). Instead, we intercept the
 * `POST /platform/api/agent/ask` request and replay a fixed SSE
 * transcript that exercises the three role buckets the footer renders:
 *
 *   • primary   — `get_quote` via Financial Modeling Prep
 *   • fallback  — `get_quote` via Yahoo Finance (RapidAPI)
 *   • citation  — `get_news` returning a single article
 *
 * Then we assert the footer mounts under the answer with the canonical
 * `aria-label`, the role pills + provider labels + response times are
 * visible, and the `Connector ↗` link deep-links to the FMP provider row.
 *
 * Runs only in `PLATFORM_OPEN_MODE` so we don't have to thread Clerk
 * sign-in through (the auth-gated path is covered by `sign-in.spec.ts`).
 */

const OPEN_MODE_RAW = (process.env.PLATFORM_OPEN_MODE ?? "").trim().toLowerCase();
const OPEN_MODE = OPEN_MODE_RAW === "1" || OPEN_MODE_RAW === "true" || OPEN_MODE_RAW === "yes";

/**
 * Build a single SSE frame in the wire format the Research page parses
 * (`event:` + `data:` lines separated by a blank line).
 */
function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Synthetic SSE transcript exercising primary / fallback / citation
 * trace rows. Mirrors what the real `/api/agent/ask` route emits in
 * `app/api/agent/ask/route.ts` (see the `tool_result` send around
 * line 897).
 */
const SYNTHETIC_SSE_BODY =
  sseFrame("step", { kind: "plan", label: "Planning" }) +
  sseFrame("step", { kind: "tools", label: "Calling tools" }) +
  sseFrame("tool_call", { id: "t-1", name: "get_quote", args: { symbol: "AAPL" } }) +
  sseFrame("tool_result", {
    id: "t-1",
    name: "get_quote",
    ok: true,
    summary: "AAPL · $189.42",
    provider: "FMP / EODHD",
    responseMs: 240,
    raw: JSON.stringify({ symbol: "AAPL", source: "FMP / EODHD" }),
  }) +
  sseFrame("tool_call", { id: "t-2", name: "get_quote", args: { symbol: "MSFT" } }) +
  sseFrame("tool_result", {
    id: "t-2",
    name: "get_quote",
    ok: true,
    summary: "MSFT · $412.10 (fallback)",
    provider: "Yahoo Finance",
    responseMs: 1450,
    raw: JSON.stringify({ symbol: "MSFT", source: "Yahoo Finance" }),
  }) +
  sseFrame("tool_call", { id: "t-3", name: "get_news", args: { symbol: "AAPL" } }) +
  sseFrame("tool_result", {
    id: "t-3",
    name: "get_news",
    ok: true,
    summary: "1 article",
    provider: "FMP / EODHD",
    responseMs: 320,
    raw: JSON.stringify({ source: "FMP / EODHD", articles: [{ symbol: "AAPL", title: "Headline" }] }),
  }) +
  sseFrame("step", { kind: "synthesise", label: "Synthesising" }) +
  sseFrame("answer_chunk", { text: "Here is your synthetic answer with three sources." }) +
  sseFrame("done", {});

test.describe("Research page: data sources used footer", () => {
  test.skip(
    !OPEN_MODE,
    "PLATFORM_OPEN_MODE not set — footer smoke needs the no-login bypass.",
  );

  test("footer renders with provider chip, response time, and Connector Hub link", async ({ page }) => {
    test.setTimeout(60_000);

    // Surface page errors as warnings so a silently-broken React handler
    // (e.g. stale `.next/` cache referencing missing chunks, which causes
    // hydration to fail and click handlers to never attach) shows up in
    // the test output instead of being hidden behind a "no request fired"
    // timeout.
    const pageErrors: string[] = [];
    const requests: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") pageErrors.push(`console.error: ${msg.text()}`);
    });
    page.on("request", (r) => requests.push(`${r.method()} ${r.url()}`));

    // Intercept the agent route before navigating so the very first ask
    // hits our fixture, not the live LLM. Glob covers both
    // `/api/agent/ask` and the basePath-prefixed `/platform/api/agent/ask`.
    await page.route("**/api/agent/ask", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-transform",
          "x-test-fixture": "data-sources-footer",
        },
        body: SYNTHETIC_SSE_BODY,
      });
    });

    await gotoWithRetry(page, "/platform/app/research");

    // Use a suggested-query card to trigger the ask. These call `ask(s.q)`
    // directly with a fixed prompt, so we sidestep the React-state race
    // introduced by typing-then-pressing-Enter on the composer input.
    const promptCard = page
      .getByRole("button", { name: /What are the key risks NVDA mentioned/i })
      .first();
    await expect(promptCard).toBeVisible({ timeout: 30_000 });

    // Click and wait for the resulting POST in one step — using
    // waitForRequest as a context manager avoids the listener-registration
    // race we hit when registering the predicate before navigation.
    let askRequest: import("@playwright/test").Request | null = null;
    try {
      const [r] = await Promise.all([
        page.waitForRequest(
          (req) => /\/api\/agent\/ask$/.test(req.url()) && req.method() === "POST",
          { timeout: 30_000 },
        ),
        promptCard.click(),
      ]);
      askRequest = r;
    } catch (err) {
      console.warn("[data-sources-footer] requests seen so far:\n" + requests.join("\n"));
      console.warn("[data-sources-footer] page errors:\n" + pageErrors.join("\n"));
      throw err;
    }

    expect(askRequest, "expected POST /api/agent/ask to fire").toBeTruthy();
    if (pageErrors.length) {
      console.warn("[data-sources-footer] page errors:\n" + pageErrors.join("\n"));
    }

    // The footer is rendered as <section aria-label="Data sources used">
    // and is always present once the synthetic stream finishes.
    const footer = page.getByRole("region", { name: "Data sources used" }).first();
    await expect(footer).toBeVisible({ timeout: 20_000 });

    // Footer is collapsed by default in some workspaces — open it if it
    // isn't already so the row assertions can resolve.
    const toggle = footer.getByRole("button").first();
    const expanded = await toggle.getAttribute("aria-expanded");
    if (expanded !== "true") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    // Role pills — one of each bucket the synthetic stream produced.
    await expect(footer.getByText("Primary",  { exact: true }).first()).toBeVisible();
    await expect(footer.getByText("Fallback", { exact: true }).first()).toBeVisible();
    await expect(footer.getByText("Citation", { exact: true }).first()).toBeVisible();

    // Provider labels resolved from the agent's `provider` hint via
    // `providerKeyFromSource` → PROVIDER_META.label.
    await expect(footer.getByText(/Financial Modeling Prep/).first()).toBeVisible();
    await expect(footer.getByText(/Yahoo Finance/).first()).toBeVisible();

    // Response times: 240 ms (primary), 1.45 s (fallback), 320 ms (citation).
    // The Yahoo hop crosses the 1s boundary so it must render with the
    // "X.XX s" formatter, not "1450 ms" — that's the visible signal that
    // `responseMs` is flowing end-to-end.
    await expect(footer.getByText(/240 ms/).first()).toBeVisible();
    await expect(footer.getByText(/1\.45 s/).first()).toBeVisible();

    // Connector Hub deep-links — at least one row's "Connector ↗" link
    // points at /app/connectors with a provider= query param.
    const fmpLink = footer.getByRole("link", { name: /Connector/i }).first();
    await expect(fmpLink).toBeVisible();
    const href = await fmpLink.getAttribute("href");
    expect(href, "Connector link must deep-link to a provider row").toMatch(
      /\/app\/connectors\?provider=(fmp|yahoo)/,
    );
  });
});
