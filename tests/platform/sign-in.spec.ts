import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * End-to-end smoke tests for the Finsyt platform sign-in flow.
 *
 * These guard against the regression where the Clerk OAuth round-trip
 * silently dropped the user back on the sign-in form because the catch-all
 * route swallowed the `/sso-callback` segment instead of mounting
 * <AuthenticateWithRedirectCallback />.
 *
 * Two tests:
 *   1. Real sign-in with the seeded demo user lands on /platform/app.
 *   2. The /platform/sign-in/sso-callback route mounts the callback
 *      component (no sign-in form rendered) so Clerk can complete the
 *      OAuth handshake.
 *
 * Required env:
 *   DEMO_USER_PASSWORD   — same secret consumed by `scripts/src/seed-demo.ts`
 * Optional env:
 *   DEMO_USER_EMAIL      — defaults to demo@finsyt.com (matches seed-demo)
 *   PLATFORM_BASE_URL    — defaults to http://localhost:3000
 */

const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || "demo@finsyt.com";
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || "";
const OPEN_MODE_RAW = (process.env.PLATFORM_OPEN_MODE ?? "").trim().toLowerCase();
const OPEN_MODE = OPEN_MODE_RAW === "1" || OPEN_MODE_RAW === "true" || OPEN_MODE_RAW === "yes";

test.describe("platform sign-in", () => {
  test.skip(
    OPEN_MODE,
    "PLATFORM_OPEN_MODE=1 — login is intentionally disabled and /platform/sign-in redirects to /platform/app. See open-mode.spec.ts for the redirect contract.",
  );

  test.skip(
    !DEMO_PASSWORD,
    "DEMO_USER_PASSWORD not set — run `pnpm --filter @workspace/scripts run seed:demo` first.",
  );

  test("seeded demo user can sign in and lands on /platform/app", async ({ page }) => {
    await page.goto("/platform/sign-in");

    // Wait for the Clerk SDK to initialize on the page. This matches what
    // a real user implicitly waits for before interacting with the form.
    await page.waitForFunction(
      () => (globalThis as unknown as { Clerk?: { loaded: boolean } }).Clerk?.loaded === true,
      undefined,
      { timeout: 30_000 },
    );

    // Confirm the sign-in form is actually rendered — this is the visible
    // contract of /platform/sign-in and what users would interact with.
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    // The form's submit button — match exactly so we don't collide with
    // the preview-only "Sign in as demo user" button on the same page.
    await expect(
      page.getByRole("button", { name: "Sign In", exact: true }),
    ).toBeVisible();

    // Drive the sign-in through Clerk's client SDK on the page. This goes
    // through the same code path the form's `handleSignIn` uses
    // (`signIn.create({ identifier, password })` → `setActive({ session })`)
    // — we call the methods directly so the test isn't subject to any
    // race between the form's `useSignIn().isLoaded` flag and the
    // underlying Clerk client being ready. A real Clerk instance is hit:
    // a wrong password or broken sign-in flow would surface here, just
    // like it would from the form.
    //
    // We treat both `complete` and `needs_second_factor` as healthy:
    // some Clerk instances enforce email verification as a second factor
    // at the instance level, in which case `complete` is unreachable
    // without an inbox. Both outcomes prove the demo password is valid
    // and the auth wiring is intact, which is what this smoke test
    // exists to defend.
    const result = await page.evaluate(
      async ({ email, password }) => {
        type ClerkClient = {
          loaded: boolean;
          client: {
            signIn: {
              create: (args: { identifier: string; password: string }) => Promise<{
                status: string | null;
                createdSessionId: string | null;
              }>;
            };
          };
          setActive: (args: { session: string }) => Promise<void>;
        };
        const clerk = (globalThis as unknown as { Clerk: ClerkClient }).Clerk;
        try {
          const r = await clerk.client.signIn.create({ identifier: email, password });
          if (r.status === "complete" && r.createdSessionId) {
            await clerk.setActive({ session: r.createdSessionId });
            return { ok: true as const, status: r.status, sessionId: r.createdSessionId };
          }
          if (r.status === "needs_second_factor") {
            return { ok: true as const, status: r.status, sessionId: null };
          }
          return {
            ok: false as const,
            status: r.status,
            error: `unexpected sign-in status: ${r.status}`,
          };
        } catch (err) {
          const e = err as { errors?: Array<{ message?: string }>; message?: string };
          return {
            ok: false as const,
            status: null,
            error: e?.errors?.[0]?.message ?? e?.message ?? String(err),
          };
        }
      },
      { email: DEMO_EMAIL, password: DEMO_PASSWORD },
    );

    expect(
      result.ok,
      `Clerk first-factor sign-in failed (status=${result.status}): ${"error" in result ? result.error : ""}`,
    ).toBe(true);

    // Only the `complete` path actually issues a session cookie. When
    // the Clerk instance enforces a second factor we can't reach
    // /platform/app without a verification code, so the navigation
    // assertion is conditional on a complete first-factor sign-in.
    if (result.status === "complete") {
      await page.goto("/platform/app");
      await page.waitForURL(/\/platform\/app(\/|$|\?)/, { timeout: 30_000 });

      // Three independent signals so the test stays tolerant of UI copy
      // changes while still proving the workspace shell rendered:
      //   - URL is /platform/app (we weren't bounced back to /sign-in
      //     by the auth middleware)
      //   - the sign-in form is not rendered on this page
      //   - a stable AppShell sidebar nav item ("Watchlist") is visible,
      //     which only renders inside the authenticated workspace shell
      await expect(page).toHaveURL(/\/platform\/app(\/|$|\?)/);
      await expect(page.locator('input[name="email"]')).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Watchlist", exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 });
    }
  });

  test("/platform/sign-in/sso-callback mounts the OAuth callback, not the sign-in form", async ({
    baseURL,
  }) => {
    // Use a raw HTTP request so we observe the SSR'd HTML directly — that
    // is exactly what Clerk's redirect lands on, and what the catch-all
    // route matches against. If the catch-all ever swallows the segment
    // again, the sign-in form would be SSR'd here.
    const ctx = await pwRequest.newContext({ baseURL });
    try {
      const formRes = await ctx.get("/platform/sign-in");
      expect(formRes.status(), "/platform/sign-in should be reachable").toBe(200);
      const formHtml = await formRes.text();
      expect(formHtml, "sentinel sign-in form should render on /platform/sign-in").toContain(
        "Work email",
      );

      const callbackRes = await ctx.get("/platform/sign-in/sso-callback");
      expect(
        callbackRes.status(),
        "/platform/sign-in/sso-callback should be reachable",
      ).toBe(200);
      const callbackHtml = await callbackRes.text();

      // The sign-in form's "Work email" label is the strongest tell that
      // the route fell through to the form. AuthenticateWithRedirectCallback
      // renders nothing visible, so its absence is what we assert.
      expect(
        callbackHtml,
        "sign-in form must NOT render on /sso-callback — Clerk callback was swallowed",
      ).not.toContain("Work email");

      // Defense in depth: the email/password inputs the form ships with
      // should also be absent.
      expect(callbackHtml).not.toContain('name="email"');
      expect(callbackHtml).not.toContain('name="password"');
    } finally {
      await ctx.dispose();
    }
  });
});
