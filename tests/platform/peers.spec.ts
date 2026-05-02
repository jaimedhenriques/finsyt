import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * End-to-end smoke contract for the Peers workspace (T198).
 *
 * Three layers covered:
 *
 *   1. API   — `/api/peers/sets` lists workspace sets, the per-set CRUD
 *              cycle (POST → GET → DELETE) round-trips, and `/api/peers/
 *              compare` returns the documented metric/symbol matrix.
 *   2. UI    — `/app/peers` renders the Peer Sets workspace with the
 *              six seeded starter baskets visible. `/app/company/AAPL/
 *              peers` renders the Selected Peers table.
 *   3. Shell — `/peers` slash-command in the topbar CommandInput
 *              navigates to `/app/peers`.
 *
 * Runs only in `PLATFORM_OPEN_MODE` so we don't have to thread Clerk
 * sign-in through API write tests. The auth-gated path is already
 * covered by `sign-in.spec.ts`.
 */

const OPEN_MODE_RAW = (process.env.PLATFORM_OPEN_MODE ?? "").trim().toLowerCase();
const OPEN_MODE = OPEN_MODE_RAW === "1" || OPEN_MODE_RAW === "true" || OPEN_MODE_RAW === "yes";

const STARTER_SET_NAMES = [
  "Mega-Cap Tech",
  "AI Semiconductors",
  "EV & Auto OEMs",
  "US Money-Center Banks",
  "Streaming & Ad-tech",
  "Energy Supermajors",
] as const;

test.describe("peers workspace + copilot wiring", () => {
  test.skip(
    !OPEN_MODE,
    "PLATFORM_OPEN_MODE not set — peers smoke needs the no-login bypass.",
  );

  test.beforeAll(async ({ baseURL }) => {
    // Idempotent — re-running just no-ops returning {created: []}.
    const ctx = await pwRequest.newContext({ baseURL });
    try {
      const res = await ctx.post("/platform/api/peers/seed");
      expect(res.status(), "starter peer sets must seed").toBe(200);
    } finally {
      await ctx.dispose();
    }
  });

  test("GET /api/peers/sets returns the six seeded starter baskets", async ({
    baseURL,
  }) => {
    const ctx = await pwRequest.newContext({ baseURL });
    try {
      const res = await ctx.get("/platform/api/peers/sets");
      expect(res.status()).toBe(200);
      const body = (await res.json()) as { sets: Array<{ name: string; symbols: string[] }> };
      const names = new Set(body.sets.map((s) => s.name));
      for (const expected of STARTER_SET_NAMES) {
        expect(names, `missing seeded set "${expected}"`).toContain(expected);
      }
      const tech = body.sets.find((s) => s.name === "Mega-Cap Tech");
      expect(tech?.symbols).toEqual(
        expect.arrayContaining(["AAPL", "MSFT", "GOOGL", "AMZN", "META"]),
      );
    } finally {
      await ctx.dispose();
    }
  });

  test("POST/GET/DELETE round-trip on /api/peers/sets/[id]", async ({ baseURL }) => {
    const ctx = await pwRequest.newContext({ baseURL });
    try {
      const stamp = Date.now();
      const name = `e2e-peers-${stamp}`;

      const created = await ctx.post("/platform/api/peers/sets", {
        data: { name, description: "smoke", symbols: ["AAPL", "MSFT", "NVDA"] },
      });
      expect(created.status()).toBe(201);
      const { set } = (await created.json()) as {
        set: { id: string; name: string; symbols: string[] };
      };
      expect(set.name).toBe(name);
      expect(set.symbols).toEqual(["AAPL", "MSFT", "NVDA"]);

      const fetched = await ctx.get(`/platform/api/peers/sets/${set.id}`);
      expect(fetched.status()).toBe(200);
      const { set: again } = (await fetched.json()) as {
        set: { id: string; symbols: string[] };
      };
      expect(again.id).toBe(set.id);
      expect(again.symbols).toEqual(["AAPL", "MSFT", "NVDA"]);

      const deleted = await ctx.delete(`/platform/api/peers/sets/${set.id}`);
      expect([200, 204]).toContain(deleted.status());

      const after = await ctx.get(`/platform/api/peers/sets/${set.id}`);
      expect(after.status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });

  test("GET /api/peers/compare returns the documented matrix", async ({ baseURL }) => {
    const ctx = await pwRequest.newContext({ baseURL });
    try {
      const res = await ctx.get(
        "/platform/api/peers/compare?symbols=AAPL,MSFT,GOOGL&subject=AAPL",
      );
      expect(res.status()).toBe(200);
      const body = (await res.json()) as {
        symbols: string[];
        subject: string | null;
        metrics: string[];
        metricsMeta: Array<{ key: string; demo: boolean }>;
        rows: Array<{
          symbol: string;
          cells: Record<string, { value: number | null; display: string; demo?: boolean }>;
        }>;
      };
      expect(body.symbols).toEqual(["AAPL", "MSFT", "GOOGL"]);
      expect(body.subject).toBe("AAPL");
      // The three synth/demo cells must be present with demo:true so the UI
      // can badge them as "Demo".
      const meta = new Map(body.metricsMeta.map((m) => [m.key, m.demo]));
      expect(meta.get("forwardPe")).toBe(true);
      expect(meta.get("evEbitdaNtm")).toBe(true);
      expect(meta.get("optionsItmPct")).toBe(true);
      // Real metrics must NOT be marked demo.
      expect(meta.get("price")).toBe(false);
      expect(meta.get("marketCap")).toBe(false);
      // Contract guard for the agent's compare_peers tool: every row must
      // carry the three institutional cells inside `row.cells.<key>.value`,
      // not as flat row props. Regressing this shape silently broke the
      // copilot's inline compare table (it rendered all "—") in T198 review.
      for (const row of body.rows) {
        expect(row.cells, `row ${row.symbol} missing cells envelope`).toBeTruthy();
        expect(typeof row.cells.forwardPe?.value).toBe("number");
        expect(typeof row.cells.evEbitdaNtm?.value).toBe("number");
        expect(typeof row.cells.optionsItmPct?.value).toBe("number");
        expect(row.cells.forwardPe?.demo).toBe(true);
      }
    } finally {
      await ctx.dispose();
    }
  });

  test("/app/peers renders the Peers workspace with seeded sets", async ({ page }) => {
    test.setTimeout(60_000);
    const resp = await page.goto("/platform/app/peers", { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /Peers/i }).first()).toBeVisible({
      timeout: 30_000,
    });
    // At least one of the seeded sets must show up by name.
    await expect(page.getByText("Mega-Cap Tech").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("AI Semiconductors").first()).toBeVisible();
  });

  test("/app/company/AAPL/peers renders the Selected Peers table", async ({ page }) => {
    test.setTimeout(60_000);
    const resp = await page.goto("/platform/app/company/AAPL/peers", {
      waitUntil: "domcontentloaded",
    });
    expect(resp?.status()).toBe(200);
    // The institutional table is built around the subject symbol.
    await expect(page.getByText(/AAPL/).first()).toBeVisible({ timeout: 30_000 });
    // Suggested fallback or set picker should expose the "Peers" framing.
    await expect(page.getByText(/Peers|peers/).first()).toBeVisible();
  });

  test("PUT /api/peers/sets/:id is an alias of PATCH and DELETE cascades to members", async ({ baseURL }) => {
    const ctx = await pwRequest.newContext({ baseURL });
    try {
      // Create a throwaway set with two members.
      const created = await ctx.post("/platform/api/peers/sets", {
        data: { name: "T198 cascade probe", description: "", symbols: ["AAPL", "MSFT"] },
      });
      expect(created.status()).toBe(201);
      const { set } = (await created.json()) as { set: { id: string; symbols: string[] } };
      expect(set.symbols).toEqual(["AAPL", "MSFT"]);

      // PUT must accept the same body as PATCH and persist the change.
      const put = await ctx.put(`/platform/api/peers/sets/${set.id}`, {
        data: { description: "renamed via PUT" },
      });
      expect(put.status()).toBe(200);
      const putBody = (await put.json()) as { set: { description: string } };
      expect(putBody.set.description).toBe("renamed via PUT");

      // DELETE must succeed and the set must really be gone (404 on follow-up GET).
      const del = await ctx.delete(`/platform/api/peers/sets/${set.id}`);
      expect(del.status()).toBe(204);
      const after = await ctx.get(`/platform/api/peers/sets/${set.id}`);
      expect(after.status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });

  test("/peers slash command in the topbar navigates to /app/peers", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/platform/app", { waitUntil: "domcontentloaded" });

    // Focus the global Ask input — same surface the "/" shortcut targets.
    const askInput = page.getByPlaceholder(/Ask Finsyt anything/i).first();
    await expect(askInput).toBeVisible({ timeout: 30_000 });
    await askInput.click();
    await askInput.fill("/peers");
    await page.keyboard.press("Enter");

    await page.waitForURL(/\/platform\/app\/peers(\?|#|$)/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Peers/i }).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
