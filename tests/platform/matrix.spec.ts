import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * End-to-end smoke contract for the Hebbia-class Matrix workspace (T271).
 *
 * Coverage:
 *
 *   1. Mount    — `/platform/app/matrix` returns 200 and renders the page hero
 *                 ("Read every entity at once.") plus the three default rows
 *                 (Apple/Microsoft/NVIDIA).
 *   2. RowPicker — the "+ Add rows" toolbar button opens the picker, the
 *                  paste tab textarea accepts free-form ticker lines, and
 *                  clicking "Add rows" appends them to the grid (regression
 *                  guard for the comma-splitting bug caught in manual QA).
 *   3. Add column — the "+ Add column" toolbar button drives two
 *                   `window.prompt` dialogs (label + prompt) and inserts a
 *                   new column header in the grid.
 *   4. Cell drawer — clicking any cell opens the CellInspector aside with
 *                    the entity label, column label and prompt visible.
 *   5. Snapshots — after a matrix doc is provisioned (POST /api/matrices)
 *                  and the page loads with `?id=…`, the toolbar
 *                  "⏱ Snapshots" button opens the SnapshotsDrawer aside.
 *
 * Runs only in `PLATFORM_OPEN_MODE` so we get the demo workspace context
 * (`org_demo_open_mode`) without threading Clerk sign-in. The auth-gated
 * path is already covered by `sign-in.spec.ts`. See `open-mode.spec.ts`
 * for the open-mode redirect contract.
 */

const OPEN_MODE_RAW = (process.env.PLATFORM_OPEN_MODE ?? "").trim().toLowerCase();
const OPEN_MODE = OPEN_MODE_RAW === "1" || OPEN_MODE_RAW === "true" || OPEN_MODE_RAW === "yes";

test.describe("matrix workspace", () => {
  test.skip(
    !OPEN_MODE,
    "PLATFORM_OPEN_MODE not set — matrix smoke needs the no-login bypass.",
  );

  // The workspace shell ships a one-time `FirstRunWelcome` modal gated on
  // a localStorage key. It's a full-viewport overlay at z-index 1200, so
  // any test that clicks a toolbar button after the modal mounts races
  // with it. Pre-set the dismissed flag so the modal never opens.
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        localStorage.setItem("finsyt:firstrun:done", String(Date.now()));
      } catch {
        /* noop */
      }
    });
  });

  test("/app/matrix mounts with the three default entity rows", async ({ page }) => {
    test.setTimeout(60_000);
    const resp = await page.goto("/platform/app/matrix", { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBe(200);

    // Page hero copy from MatrixPage. `accentWord` splits the heading so we
    // match the stable suffix instead of the full string.
    await expect(page.getByText("Read every entity at once.").first()).toBeVisible({
      timeout: 30_000,
    });
    // The three DEFAULT_ROWS are Apple/AAPL, Microsoft/MSFT, NVIDIA/NVDA.
    await expect(page.getByText("Apple", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Microsoft", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("NVIDIA", { exact: true }).first()).toBeVisible();
    // Sentinel for the three DEFAULT_COLS column headers.
    await expect(page.getByText("Headline take", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Key risks", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Recent catalysts", { exact: true }).first()).toBeVisible();
  });

  test("RowPicker paste-tab adds a new ticker row to the grid", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/platform/app/matrix", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Read every entity at once.").first()).toBeVisible({
      timeout: 30_000,
    });

    // Open the row picker via the toolbar "+ Add rows" button.
    await page.getByRole("button", { name: "+ Add rows" }).click();
    await expect(page.getByText("Add rows to matrix")).toBeVisible({ timeout: 10_000 });

    // Default tab is "paste". Fill the textarea with a single ticker so we
    // exercise the line-splitter (regression guard: the original bug
    // comma-split a one-token line into a phantom second column).
    const textarea = page.locator('textarea[placeholder*="AAPL"]').first();
    await expect(textarea).toBeVisible();
    await textarea.fill("TSLA, Tesla");

    await page.getByRole("button", { name: "Add rows", exact: true }).click();

    // Picker dialog should close and the new row should be visible in the grid.
    await expect(page.getByText("Add rows to matrix")).toHaveCount(0);
    await expect(page.getByText("Tesla", { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("TSLA", { exact: true }).first()).toBeVisible();
  });

  test("'+ Add column' prompts append a new question column", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/platform/app/matrix", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Read every entity at once.").first()).toBeVisible({
      timeout: 30_000,
    });

    // addColumn() drives two sequential window.prompt dialogs: label, then
    // prompt. Playwright fires `dialog` events for each — accept them in
    // order with the values we want to assert on.
    const promptAnswers = [
      "Moat depth",
      "Describe the durability of this entity's competitive moat in two sentences.",
    ];
    page.on("dialog", async (dialog) => {
      const next = promptAnswers.shift();
      if (typeof next === "string") {
        await dialog.accept(next);
      } else {
        await dialog.dismiss();
      }
    });

    await page.getByRole("button", { name: "+ Add column" }).click();

    // The new column header renders in the grid <thead>.
    await expect(page.getByText("Moat depth", { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("clicking an idle cell opens the CellInspector drawer", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/platform/app/matrix", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Read every entity at once.").first()).toBeVisible({
      timeout: 30_000,
    });

    // Idle cells render a "▷ Run" button inside the <td>. Clicking the
    // <td> (not the run button) opens the inspector. Target the AAPL row
    // × Headline take cell by clicking its enclosing <td>.
    const runButtons = page.getByRole("button", { name: /^▷ Run$/ });
    await expect(runButtons.first()).toBeVisible({ timeout: 10_000 });
    // The first idle cell belongs to Apple × Headline take. Use the <td>
    // ancestor so we exercise the cell click handler, not the button's
    // stopPropagation+runCell path (which would dispatch a real agent run).
    const firstCell = runButtons.first().locator("xpath=ancestor::td[1]");
    await firstCell.click();

    // CellInspector renders an aside dialog labelled by `matrix-cell-title`
    // (the column label).
    const drawer = page.getByRole("dialog", { name: "Headline take" });
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    // The eyebrow shows the row label + ticker.
    await expect(drawer.getByText(/Apple/)).toBeVisible();
    await expect(drawer.getByText(/AAPL/)).toBeVisible();
    // The prompt block echoes the column prompt.
    await expect(drawer.getByText(/investment-relevant signal/i)).toBeVisible();
  });

  test("Snapshots toolbar button opens the SnapshotsDrawer", async ({ page, baseURL }) => {
    test.setTimeout(60_000);

    // The Snapshots button is no-op until the matrix has been persisted
    // (matrixId set). Provision one up-front via the API so the click
    // path that opens the drawer is reachable without first running a
    // real agent cell.
    const ctx = await pwRequest.newContext({ baseURL });
    let matrixId: string | null = null;
    try {
      const created = await ctx.post("/platform/api/matrices", {
        data: {
          name: `t271-matrix-${Date.now()}`,
          description: "e2e snapshots open",
          rowSourceKind: "manual",
          rowSourceMeta: {},
          rows: [{ id: "r1", label: "Apple", ticker: "AAPL", kind: "ticker" }],
          columns: [
            { id: "c1", label: "Headline take", prompt: "Summarise.", width: 280 },
          ],
          cells: {},
          rerunOnFiling: false,
        },
      });
      expect(
        created.status(),
        "POST /platform/api/matrices must succeed in open mode (demo workspace).",
      ).toBe(201);
      const body = (await created.json()) as { matrix: { id: string } };
      matrixId = body.matrix.id;
    } finally {
      await ctx.dispose();
    }
    expect(matrixId).toBeTruthy();

    await page.goto(`/platform/app/matrix?id=${matrixId}`, { waitUntil: "domcontentloaded" });
    // Wait for the matrix to hydrate from the API so the in-page matrixId
    // ref is set; the persisted name is the most reliable hydration tell.
    await expect(page.locator('input[placeholder="Matrix name"]')).toHaveValue(
      /t271-matrix-/,
      { timeout: 30_000 },
    );

    await page.getByRole("button", { name: /Snapshots/ }).click();

    // SnapshotsDrawer renders an aside with the "Snapshots" heading and
    // the empty-state copy. Either is enough to prove the drawer mounted.
    await expect(page.getByText("Frozen point-in-time copies", { exact: false })).toBeVisible({
      timeout: 10_000,
    });
  });
});
