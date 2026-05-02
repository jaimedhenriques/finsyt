import { test, expect } from "@playwright/test";

/**
 * Smoke contract for the Football Field valuations surface.
 *
 * Covers the three required surfaces:
 *   • `/platform/app/valuations`           — picker landing page
 *   • `/platform/app/valuations/AAPL`      — chart page (real ticker)
 *   • `/platform/app/company/AAPL?tab=…`   — Valuations tab on company page
 *
 * Plus the deliberate empty-state branch:
 *   • `/platform/app/valuations/INVALID_TICKER_XYZ` — empty Card with
 *     "Back to ticker picker" link, no fabricated chart.
 *
 * Runs only in PLATFORM_OPEN_MODE so we don't have to thread Clerk auth
 * into a smoke test (the existing sign-in spec covers the auth flow).
 */

const OPEN_MODE_RAW = (process.env.PLATFORM_OPEN_MODE ?? "").trim().toLowerCase();
const OPEN_MODE = OPEN_MODE_RAW === "1" || OPEN_MODE_RAW === "true" || OPEN_MODE_RAW === "yes";

test.describe("football field valuations surface", () => {
  test.skip(
    !OPEN_MODE,
    "PLATFORM_OPEN_MODE not set — valuations smoke needs the no-login bypass.",
  );

  test("picker page mounts at /platform/app/valuations", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/platform/app/valuations", { waitUntil: "domcontentloaded" });
    // PageHero renders eyebrow "Valuation" and title "Football Field".
    await expect(
      page.getByRole("heading", { name: /Football Field/i }).first(),
    ).toBeVisible({ timeout: 45_000 });
    // The "Pick a ticker" section and at least one popular ticker chip should render.
    await expect(page.getByText(/Pick a ticker/i).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /AAPL/i }).first(),
    ).toBeVisible();
  });

  test("chart page renders Football Field for /AAPL", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/platform/app/valuations/AAPL", { waitUntil: "domcontentloaded" });
    // The chart titles every render: "Valuation Overview · AAPL".
    await expect(
      page.getByText(/Valuation Overview\s*·\s*AAPL/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    // Renders the canonical row labels for the four band groups.
    for (const label of ["52 Week Stock Price", "DCF"]) {
      await expect(page.getByText(label, { exact: true }).first())
        .toBeVisible({ timeout: 15_000 });
    }
    // Legend includes all four band groups with their canonical names.
    for (const legend of [/Peer Comps Range/i, /Transaction Comps Range/i, /DCF Range/i]) {
      await expect(page.getByText(legend).first()).toBeVisible();
    }
    // Transaction Comps must render as honest placeholder copy, not as a
    // fabricated band. Default placeholderCaption is "Not yet wired up".
    await expect(page.getByText(/Not yet wired up/i).first()).toBeVisible();
    // Current Price overlay (green) must render with its inline label —
    // we wait up to 30s because the subject /api/quote can be slow.
    await expect(
      page.getByText(/Current Price\s+\$/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    // Weighted Valuation overlay (dashed) renders once at least one
    // real-data band median has resolved (DCF resolves quickly even
    // when peer quotes lag).
    await expect(
      page.getByText(/Weighted Valuation\s+\$/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("invalid ticker shows the no-quote empty state, not a fabricated chart", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/platform/app/valuations/INVALID_TICKER_XYZ", { waitUntil: "domcontentloaded" });
    // Honest empty-state copy plus the back-to-picker action.
    await expect(
      page.getByText(/We could not load a real quote for this ticker/i).first(),
    ).toBeVisible({ timeout: 45_000 });
    await expect(
      page.getByRole("link", { name: /Back to ticker picker/i }).first(),
    ).toBeVisible();
  });

  test("Valuations tab on company page mounts the same chart", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/platform/app/company/AAPL?tab=valuations", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(/Valuation Overview\s*·\s*AAPL/i).first(),
    ).toBeVisible({ timeout: 45_000 });
  });
});
