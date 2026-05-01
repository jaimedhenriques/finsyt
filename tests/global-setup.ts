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
  execSync("pnpm --filter @workspace/scripts run seed:demo", {
    stdio: "inherit",
    env: process.env,
  });
}
