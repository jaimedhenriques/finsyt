import { test, expect } from "@playwright/test";

/**
 * Smoke contract for the platform-wide contextual ask surface (T185).
 *
 * Covers three high-traffic pages where the `ContextualAskBar` is the primary
 * conversational entry point:
 *
 *   • `/platform/app`              — Overview / morning brief
 *   • `/platform/app/watchlist`    — Watchlist
 *   • `/platform/app/company/AAPL` — Company detail
 *
 * For each page we verify the ContextualAskBar mounts (its textarea is
 * exposed with the canonical `Ask Finsyt about <context>` accessible name).
 *
 * On the Overview page we additionally verify two global keyboard shortcuts
 * documented in the shortcuts modal:
 *   • "/" focuses the topbar CommandInput (Ask Finsyt input)
 *   • ⌘J / Ctrl+J opens the Ask AI drawer
 *
 * Runs only in PLATFORM_OPEN_MODE so we don't have to thread Clerk auth
 * into a smoke test (the existing sign-in spec covers the auth flow).
 */

const OPEN_MODE_RAW = (process.env.PLATFORM_OPEN_MODE ?? "").trim().toLowerCase();
const OPEN_MODE = OPEN_MODE_RAW === "1" || OPEN_MODE_RAW === "true" || OPEN_MODE_RAW === "yes";

const PAGES_WITH_ASK_BAR = [
  { path: "/platform/app",              label: "overview" },
  { path: "/platform/app/watchlist",    label: "watchlist" },
  { path: "/platform/app/company/AAPL", label: "company detail (AAPL)" },
] as const;

test.describe("contextual ask surface", () => {
  test.skip(
    !OPEN_MODE,
    "PLATFORM_OPEN_MODE not set — contextual-ask smoke needs the no-login bypass.",
  );

  for (const { path, label } of PAGES_WITH_ASK_BAR) {
    test(`ContextualAskBar mounts on ${label}`, async ({ page }) => {
      // Heavy pages (company detail in particular) can take a bit to compile
      // on first visit in dev mode — give the suite room to wait.
      test.setTimeout(60_000);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const ask = page.getByRole("textbox", { name: /^Ask Finsyt about/i }).first();
      await expect(ask).toBeVisible({ timeout: 45_000 });
    });
  }

  test("global shortcuts: '/' focuses Ask input and ⌘J opens drawer", async ({ page }) => {
    await page.goto("/platform/app", { waitUntil: "domcontentloaded" });

    // Wait for the AppShell to mount (its CommandInput is the "/" target).
    const askInput = page.getByPlaceholder(/Ask Finsyt anything/i).first();
    await expect(askInput).toBeVisible({ timeout: 15_000 });

    // Click an inert area first so the focus is somewhere outside the input.
    await page.locator("body").click({ position: { x: 4, y: 4 } });
    await page.keyboard.press("/");
    await expect(askInput).toBeFocused({ timeout: 5_000 });

    // ⌘J / Ctrl+J opens the Ask AI drawer.
    await page.keyboard.press("Escape");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+J" : "Control+J");
    const drawer = page.getByRole("dialog", { name: /Ask Finsyt|Finsyt Copilot|Ask drawer/i }).first();
    await expect(drawer).toBeVisible({ timeout: 5_000 });
  });
});
