import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

/**
 * Resolve the chromium binary Playwright should drive. On Replit/Nix the
 * Playwright-bundled chromium is missing system libs (libgbm.so.1) that
 * aren't shipped by the mesa output exposed in the Nix channel, so we
 * fall back to the system-provided `chromium` binary when present.
 */
function resolveChromiumExecutable(): string | undefined {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicit) return explicit;
  try {
    const which = execSync("command -v chromium", { encoding: "utf8" }).trim();
    if (which) return which;
  } catch {
    // not installed — let Playwright use its bundled binary
  }
  return undefined;
}

/**
 * Playwright config for end-to-end smoke tests against the Finsyt platform.
 *
 * The tests assume a platform Next.js dev server is reachable at
 * `PLATFORM_BASE_URL` (default `http://localhost:3000`). On Replit the
 * platform workflow already keeps that server running, so we don't spawn
 * a `webServer` here — that would race with the existing workflow and
 * waste resources. CI environments without a long-running server can
 * start one up-front via `pnpm --filter @workspace/platform dev` before
 * invoking `pnpm --filter @workspace/tests run test`.
 */
const baseURL = process.env.PLATFORM_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts$/,
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Heavy routes (company detail, valuations, matrix, peers, deck generation)
  // are warmed once in global-setup so first attempts run against a compiled
  // route instead of eating a 10–15s cold compile. Retries are a thin safety
  // net for the rare residual flake — e.g. a transient ECONNRESET when the dev
  // server recycles, or a cold first navigation that still exceeds the per-test
  // timeout because the suite runs concurrently with build/typecheck/lint/unit
  // tests and the dev server is CPU-starved. A genuine product regression still
  // fails both attempts. Keep one retry locally and two in CI.
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: resolveChromiumExecutable(),
        },
      },
    },
  ],
});
