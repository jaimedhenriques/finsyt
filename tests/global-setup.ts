import { execSync } from "node:child_process";

/**
 * Playwright global setup. Runs once before any test in this project.
 *
 * Re-runs the demo seed so the smoke tests start from a known state:
 *   - the `demo@finsyt.com` Clerk user exists
 *   - its password is in sync with the current `DEMO_USER_PASSWORD` secret
 *   - the demo workspace is provisioned with sample agents and notes
 *
 * The seed is fully idempotent (see `scripts/src/seed-demo.ts`), so this
 * is safe to run on every test invocation.
 *
 * Skipped when `SKIP_SEED_DEMO=1` is set — useful for fast local
 * iteration when you've just re-seeded by hand.
 */
export default async function globalSetup() {
  if (process.env.SKIP_SEED_DEMO === "1") {
    console.log("[tests] SKIP_SEED_DEMO=1 — skipping demo seed");
    return;
  }
  if (!process.env.DEMO_USER_PASSWORD) {
    console.warn(
      "[tests] DEMO_USER_PASSWORD not set — sign-in tests will skip. " +
        "Set the secret to enable them.",
    );
    return;
  }
  if (!process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL) {
    console.warn(
      "[tests] CLERK_SECRET_KEY or DATABASE_URL missing — cannot run demo seed; " +
        "sign-in tests may fail if the demo user is not already provisioned.",
    );
    return;
  }
  console.log("[tests] Running demo seed (idempotent)…");
  // The seed talks to Clerk over the network. A transient `fetch failed` /
  // Clerk 5xx must not abort the entire suite — the open-mode specs don't need
  // the seed at all, and the demo user is almost always already provisioned
  // from a prior run. Retry a few times for self-healing, then warn-and-continue
  // (same philosophy as the missing-env-var guards above) instead of throwing.
  // Either way we fall through to prewarming so a seed hiccup never skips it.
  const attempts = 3;
  for (let i = 1; i <= attempts; i++) {
    try {
      execSync("pnpm --filter @workspace/scripts run seed:demo", {
        stdio: "inherit",
        env: process.env,
      });
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (i < attempts) {
        console.warn(
          `[tests] Demo seed attempt ${i}/${attempts} failed (${msg}); retrying…`,
        );
        // Small backoff to ride out transient Clerk/network hiccups.
        const until = Date.now() + 2000;
        while (Date.now() < until) {
          /* busy-wait: globalSetup is sync-friendly and this is a rare path */
        }
        continue;
      }
      console.warn(
        `[tests] Demo seed failed after ${attempts} attempts (${msg}). ` +
          "Continuing — open-mode specs run without it; sign-in specs rely on " +
          "the demo user already being provisioned.",
      );
    }
  }

  await prewarmHeavyRoutes();
}

/**
 * Trigger compilation of the platform's heaviest routes once, before any test
 * runs, so the suite's first navigation to each doesn't eat a 10–15s Next.js
 * dev-server cold compile (which under full-suite load can abort a navigation
 * or push first-paint past an assertion window). Best-effort: warming is done
 * sequentially (to avoid a thundering herd of concurrent compiles that would
 * recreate the very overload we're avoiding) and every failure is swallowed —
 * an unreachable server simply means the tests warm the routes themselves.
 */
async function prewarmHeavyRoutes(): Promise<void> {
  const baseURL = (process.env.PLATFORM_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  // GET pages cascade into their data-route compiles (quote/financials/
  // estimates/dcf/etc.), so warming the pages warms most of the API surface.
  const pages = [
    "/platform/app/company/AAPL",
    "/platform/app/valuations/AAPL",
    "/platform/app/matrix",
    "/platform/app/peers",
    "/platform/app/watchlist",
  ];

  console.log("[tests] Prewarming heavy platform routes…");
  for (const path of pages) {
    await warmOnce(`${baseURL}${path}`, "GET");
  }
  // Deck generation is the single heaviest endpoint (slide build ~20s on a
  // cold compile) and is exercised by recent-decks.spec.ts — warm it directly.
  await warmOnce(`${baseURL}/platform/api/copilot/deck`, "POST", {
    template: "banker-pitch",
    ticker: "AAPL",
  });
}

async function warmOnce(
  url: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    await fetch(url, {
      method,
      signal: controller.signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Best-effort warm-up — ignore timeouts / connection resets.
  } finally {
    clearTimeout(timer);
  }
}
