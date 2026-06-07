import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * E2E coverage for the "Recent decks" history panel (T246).
 *
 * Three layers:
 *   1. API   — `/api/copilot/decks` lists the user's recent generations
 *              including a deck we just created via `/api/copilot/deck`,
 *              and that entry surfaces template + slide count metadata.
 *   2. UI    — the company page (`/app/company/AAPL`) exposes a "Recent"
 *              button next to "Export to deck" that opens a drawer titled
 *              "Recent decks" with at least one row containing a
 *              "Re-download" action.
 *   3. Round-trip — clicking "Re-download" hits `/api/copilot/memo/<fileId>`
 *              and returns a non-empty PPTX response.
 *
 * Open-mode only — same convention as `peers.spec.ts`.
 */

const OPEN_MODE_RAW = (process.env.PLATFORM_OPEN_MODE ?? "").trim().toLowerCase();
const OPEN_MODE = OPEN_MODE_RAW === "1" || OPEN_MODE_RAW === "true" || OPEN_MODE_RAW === "yes";

test.describe("recent decks history panel", () => {
  test.skip(
    !OPEN_MODE,
    "PLATFORM_OPEN_MODE not set — recent-decks smoke needs the no-login bypass.",
  );

  test("GET /api/copilot/decks returns a freshly generated deck with template + slides metadata", async ({
    baseURL,
  }) => {
    const ctx = await pwRequest.newContext({ baseURL });
    try {
      const gen = await ctx.post("/platform/api/copilot/deck", {
        data: { template: "banker-pitch", ticker: "AAPL" },
        headers: { "Content-Type": "application/json" },
      });
      expect(gen.status(), "deck generation must succeed").toBe(200);
      const genBody = (await gen.json()) as { fileId: string; downloadUrl: string };
      expect(genBody.fileId).toBeTruthy();

      const list = await ctx.get("/platform/api/copilot/decks");
      expect(list.status()).toBe(200);
      const body = (await list.json()) as {
        items: Array<{
          fileId: string;
          ticker: string;
          template: string | null;
          slides: number | null;
          expired: boolean;
          downloadUrl: string;
        }>;
      };

      const match = body.items.find((i) => i.fileId === genBody.fileId);
      expect(match, "freshly generated deck must appear in /decks listing").toBeTruthy();
      expect(match!.template).toBe("banker-pitch");
      expect(match!.slides).toBeGreaterThan(0);
      expect(match!.ticker).toBe("AAPL");
      expect(match!.expired).toBe(false);

      // Round-trip: re-download via the listing's downloadUrl.
      const dl = await ctx.get(match!.downloadUrl);
      expect(dl.status()).toBe(200);
      const buf = await dl.body();
      expect(buf.byteLength).toBeGreaterThan(1024);
      expect(dl.headers()["content-type"]).toContain("presentation");
    } finally {
      await ctx.dispose();
    }
  });

  test("company page exposes a Recent decks drawer with re-download rows", async ({
    page,
    baseURL,
  }) => {
    // Seed at least one deck so the drawer has something to show.
    const ctx = await pwRequest.newContext({ baseURL });
    try {
      const gen = await ctx.post("/platform/api/copilot/deck", {
        data: { template: "banker-pitch", ticker: "AAPL" },
        headers: { "Content-Type": "application/json" },
      });
      expect(gen.status()).toBe(200);
    } finally {
      await ctx.dispose();
    }

    // Dismiss the first-run welcome modal up-front so it doesn't intercept
    // pointer events on the Recent button (see components/FirstRunWelcome.tsx).
    await page.addInitScript(() => {
      try { window.localStorage.setItem('finsyt:firstrun:done', String(Date.now())) } catch {}
    });

    await page.goto("/platform/app/company/AAPL");
    // Wait for the export button to mount — that's the surface that owns
    // the Recent button + drawer.
    await expect(page.getByRole("button", { name: /Export to deck/i })).toBeVisible({
      timeout: 30_000,
    });

    const recentBtn = page.getByRole("button", { name: /^Recent$/ });
    await expect(recentBtn).toBeVisible();
    await recentBtn.click();

    // The Drawer component renders an `aside[role=dialog]` with the
    // "Recent decks" title — pick that one, ignoring any other dialogs.
    const drawer = page.locator('aside[role="dialog"]').filter({
      hasText: /Recent decks/i,
    });
    await expect(drawer).toBeVisible();

    // At least one re-download button should appear (we just seeded a deck).
    const reDownload = drawer.getByRole("button", { name: /Re-download/i }).first();
    await expect(reDownload).toBeVisible({ timeout: 10_000 });
  });
});
