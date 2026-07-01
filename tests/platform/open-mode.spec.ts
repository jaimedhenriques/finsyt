import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * Contract tests for the "PLATFORM_OPEN_MODE" demo bypass.
 *
 * When `PLATFORM_OPEN_MODE=1`:
 *   - The platform has no login wall (see middleware.ts + lib/auth-server.ts).
 *   - `/platform/sign-in` MUST NOT render the credentials form. It is a
 *     307 redirect to `/platform/app` (or to `redirect_url` when present),
 *     so users coming in from the marketing "Sign in" link land directly
 *     in the workspace.
 *   - The marketing nav's "Sign in" affordance points straight at
 *     `/platform/app` and skips the redirect entirely (defense-in-depth
 *     so a stale browser cache of /sign-in still works).
 *
 * These assertions are the visible contract of the open-mode demo and
 * fail loudly if anyone re-introduces a credentials page.
 */

const OPEN_MODE_RAW = (process.env.PLATFORM_OPEN_MODE ?? "").trim().toLowerCase();
const OPEN_MODE = OPEN_MODE_RAW === "1" || OPEN_MODE_RAW === "true" || OPEN_MODE_RAW === "yes";

test.describe("platform open-mode (no-login bypass)", () => {
  test.skip(
    !OPEN_MODE,
    "PLATFORM_OPEN_MODE not set — open-mode contract does not apply.",
  );

  test("/platform/sign-in 307s to /platform/app", async ({ baseURL }) => {
    const ctx = await pwRequest.newContext({ baseURL });
    try {
      const res = await ctx.get("/platform/sign-in", { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers()["location"]).toMatch(/\/platform\/app(\?|$|\/)/);
    } finally {
      await ctx.dispose();
    }
  });

  test("/platform/sign-in?redirect_url=… preserves the original target", async ({
    baseURL,
  }) => {
    const ctx = await pwRequest.newContext({ baseURL });
    try {
      const res = await ctx.get(
        "/platform/sign-in?redirect_url=/platform/app/calendar",
        { maxRedirects: 0 },
      );
      expect(res.status()).toBe(307);
      expect(res.headers()["location"]).toMatch(/\/platform\/app\/calendar(\?|$)/);
    } finally {
      await ctx.dispose();
    }
  });

  test("/platform/app loads without authenticating", async ({ page }) => {
    const resp = await page.goto("/platform/app");
    expect(resp?.status()).toBe(200);
    // We should NOT be bounced back to the sign-in page.
    expect(page.url()).not.toMatch(/\/platform\/sign-in/);
    // Sentinel: the workspace shell renders a Watchlist nav item.
    // Match by href so an icon glyph in the accessible name doesn't
    // throw the assertion off.
    await expect(
      page.locator('a[href="/platform/app/watchlist"]').first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});
