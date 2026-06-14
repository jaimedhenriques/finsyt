import { type Page, type Response } from "@playwright/test";

/**
 * Navigate with a small retry budget. Under full-suite load the platform dev
 * server cold-compiles heavy routes (company detail, valuations, peers, matrix)
 * for 10s+, and Next's RSC reload can abort the in-flight navigation
 * (`net::ERR_ABORTED`) or stall past the nav timeout. Each attempt is bounded so
 * one slow compile doesn't eat the whole test budget; retrying lets the
 * warmed-up pass succeed instead of flaking the suite. Returns the final
 * navigation response.
 */
export async function gotoWithRetry(
  page: Page,
  path: string,
  attempts = 3,
): Promise<Response | null> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      const retryable = msg.includes("ERR_ABORTED") || msg.includes("Timeout");
      if (attempt === attempts - 1 || !retryable) {
        throw err;
      }
    }
  }
  throw lastErr ?? new Error("gotoWithRetry: navigation failed");
}
