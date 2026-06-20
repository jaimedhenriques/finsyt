/**
 * Verifies that the Excel custom-function `pickMacroSeries` helper accepts
 * every shape `/api/macro` and `/api/v1/macro` may return, since the public
 * worksheet functions (`=FINSYT.MACRO`, `=FINSYT.MACRO_LATEST`) and the
 * Builder's WACC template all depend on it.
 *
 * The helper lives inline in `artifacts/platform/public/excel-addin/functions.js`
 * (it is loaded by Office's custom-functions runtime, not bundled). We extract
 * its source from that file and evaluate it in this Node test so the test
 * tracks the real implementation rather than a divergent copy.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_JS = path.resolve(
  __dirname,
  "../../artifacts/platform/public/excel-addin/functions.js",
);

async function loadPickMacroSeries(): Promise<(d: unknown) => unknown[]> {
  const src = await fs.readFile(FUNCTIONS_JS, "utf8");
  const match = src.match(/function pickMacroSeries\(data\)\s*{[\s\S]*?\n}/);
  if (!match) throw new Error("pickMacroSeries not found in functions.js");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function(`${match[0]}; return pickMacroSeries;`)();
  return fn as (d: unknown) => unknown[];
}

test("pickMacroSeries", async (t) => {
  const pick = await loadPickMacroSeries();

  await t.test("accepts /api/macro shape (history)", () => {
    const obs = [{ date: "2024-01-01", value: 4.2 }, { date: "2024-02-01", value: 4.3 }];
    const out = pick({ country: "US", indicator: "YIELD_10Y", history: obs, source: "fred" });
    assert.deepEqual(out, obs);
  });

  await t.test("accepts /api/v1/macro shape (series)", () => {
    const obs = [{ date: "2024-01-01", value: 4.2 }];
    const out = pick({ series: obs });
    assert.deepEqual(out, obs);
  });

  await t.test("accepts {data: [...]} shape", () => {
    const obs = [{ date: "2024-01-01", value: 4.2 }];
    const out = pick({ data: obs });
    assert.deepEqual(out, obs);
  });

  await t.test("accepts a bare array", () => {
    const obs = [{ date: "2024-01-01", value: 4.2 }];
    const out = pick(obs);
    assert.deepEqual(out, obs);
  });

  await t.test("returns [] for missing or empty payload", () => {
    assert.deepEqual(pick(null), []);
    assert.deepEqual(pick(undefined), []);
    assert.deepEqual(pick({}), []);
    assert.deepEqual(pick({ history: [] }), []);
  });

  await t.test("prefers `series` over `history` when both are present", () => {
    const series = [{ date: "2024-01-01", value: 1 }];
    const history = [{ date: "1999-01-01", value: 9 }];
    const out = pick({ series, history });
    assert.deepEqual(out, series);
  });
});
