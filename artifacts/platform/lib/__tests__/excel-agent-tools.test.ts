import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

import {
  EXCEL_TOOLS,
  EXCEL_TOOL_NAMES,
  isExcelOpTool,
  isExcelMutatingTool,
  excelOpKind,
  type ExcelToolDef,
} from "../excel-addin/tools.ts";
import {
  waitForOp,
  resolveOp,
  pendingOpCount,
  __setSharedStoreEnabledForTests,
} from "../excel-addin/op-bridge.ts";

// Keep the in-memory behavioural tests deterministic and DB-independent: force
// the shared Postgres store OFF before each test. The cross-instance test below
// re-enables it with a mocked store.
beforeEach(() => {
  __setSharedStoreEnabledForTests(false);
});

// ── tools schema ────────────────────────────────────────────────────────────

const EXPECTED_NAMES = [
  "write_cell", "write_range", "insert_formula", "write_header_row",
  "write_bulk_rows", "clear_range", "apply_number_format", "apply_fill_color",
  "apply_font_style", "apply_border", "apply_conditional_format",
  "auto_fit_columns", "set_column_width", "set_row_height", "merge_cells",
  "apply_freeze_panes", "set_validation", "insert_named_table", "insert_chart",
  "add_sheet", "rename_sheet", "protect_sheet", "read_range", "get_sheet_names",
  "get_used_range",
];

test("exposes exactly the 25 expected atomic tools", () => {
  assert.equal(EXCEL_TOOLS.length, 25);
  assert.deepEqual(
    [...EXCEL_TOOL_NAMES].sort(),
    [...EXPECTED_NAMES].sort(),
  );
});

test("every tool has a valid OpenAI function shape", () => {
  for (const t of EXCEL_TOOLS as ExcelToolDef[]) {
    assert.ok(t.name, "tool has a name");
    assert.ok(t.description && t.description.length > 0, `${t.name} has a description`);
    assert.ok(["read", "write", "structure"].includes(t.kind), `${t.name} has a valid kind`);
    const p = t.parameters as Record<string, unknown>;
    assert.equal(p.type, "object", `${t.name} params are an object schema`);
    assert.ok(p.properties && typeof p.properties === "object", `${t.name} has properties`);
  }
});

test("tool names are unique", () => {
  assert.equal(EXCEL_TOOL_NAMES.size, EXCEL_TOOLS.length);
});

test("kinds classify reads, writes and structural ops", () => {
  const byKind = (k: string) => EXCEL_TOOLS.filter((t) => t.kind === k).map((t) => t.name);
  assert.deepEqual(byKind("read").sort(), ["get_sheet_names", "get_used_range", "read_range"]);
  assert.deepEqual(byKind("structure").sort(), ["add_sheet", "protect_sheet", "rename_sheet"]);
  // everything else is a write
  assert.equal(byKind("write").length, 25 - 3 - 3);
});

test("isExcelOpTool recognises members and rejects others", () => {
  assert.equal(isExcelOpTool("write_range"), true);
  assert.equal(isExcelOpTool("get_quote"), false);
  assert.equal(isExcelOpTool("propose_formula"), false);
});

test("excelOpKind returns the tool's kind, undefined for non-members", () => {
  assert.equal(excelOpKind("write_range"), "write");
  assert.equal(excelOpKind("add_sheet"), "structure");
  assert.equal(excelOpKind("read_range"), "read");
  assert.equal(excelOpKind("get_quote"), undefined);
});

test("isExcelMutatingTool flags writes/structure, not reads or non-members", () => {
  assert.equal(isExcelMutatingTool("write_range"), true);
  assert.equal(isExcelMutatingTool("add_sheet"), true);
  assert.equal(isExcelMutatingTool("read_range"), false);
  assert.equal(isExcelMutatingTool("get_sheet_names"), false);
  assert.equal(isExcelMutatingTool("get_quote"), false);
});

// ── op-bridge round trip ────────────────────────────────────────────────────

test("resolveOp delivers the client result to a waiting op", async () => {
  const before = pendingOpCount();
  const p = waitForOp("run:1", 5_000);
  assert.equal(pendingOpCount(), before + 1, "op is registered while waiting");

  const delivered = await resolveOp("run:1", { ok: true, result: { sheets: ["Sheet1"] } });
  assert.equal(delivered, true);

  const out = await p;
  assert.equal(out.ok, true);
  assert.deepEqual(out.result, { sheets: ["Sheet1"] });
  assert.equal(pendingOpCount(), before, "op is cleared after resolution");
});

test("resolveOp returns false for an unknown id when no shared store is available", async () => {
  assert.equal(await resolveOp("does-not-exist", { ok: true }), false);
});

test("waitForOp times out (DB unavailable → pure in-memory) when nobody responds", async () => {
  const out = await waitForOp("run:timeout", 10);
  assert.equal(out.ok, false);
  assert.equal(out.timedOut, true);
});

test("cancelled result flows through the bridge", async () => {
  const p = waitForOp("run:cancel", 5_000);
  await resolveOp("run:cancel", { ok: false, cancelled: true });
  const out = await p;
  assert.equal(out.ok, false);
  assert.equal(out.cancelled, true);
});

// ── cross-instance shared store ─────────────────────────────────────────────
// In a horizontally-scaled deploy the tool-result POST (resolveOp) and the SSE
// stream (waitForOp) can land on *different* Node instances, in any order. A
// process-local Map alone would stall the build until timeout. These tests back
// the bridge with an in-memory fake of the drizzle query surface and prove the
// resolve-before-register race is handled.

function makeFakeStore() {
  const rows = new Map<
    string,
    { id: string; status: string; result: unknown; createdAt: Date; resolvedAt: Date | null }
  >();
  const table = {
    id: "id",
    status: "status",
    result: "result",
    createdAt: "createdAt",
    resolvedAt: "resolvedAt",
  } as const;

  const eq = (c: string, v: unknown) => ({ kind: "eq" as const, c, v });
  const and = (...preds: unknown[]) => ({ kind: "and" as const, preds });
  const lt = (c: string, v: unknown) => ({ kind: "lt" as const, c, v });

  const idOf = (pred: unknown): string | undefined => {
    const p = pred as { kind?: string; c?: string; v?: unknown; preds?: unknown[] };
    if (!p) return undefined;
    if (p.kind === "eq" && p.c === "id") return p.v as string;
    if (p.kind === "and" && p.preds) {
      for (const sub of p.preds) {
        const v = idOf(sub);
        if (v !== undefined) return v;
      }
    }
    return undefined;
  };

  const db = {
    insert() {
      let values: { id: string; status?: string; result?: unknown; resolvedAt?: Date } = { id: "" };
      const api = {
        values(v: typeof values) {
          values = v;
          return api;
        },
        onConflictDoNothing() {
          if (!rows.has(values.id)) {
            rows.set(values.id, {
              id: values.id,
              status: values.status ?? "pending",
              result: values.result ?? null,
              createdAt: new Date(),
              resolvedAt: values.resolvedAt ?? null,
            });
          }
          return Promise.resolve();
        },
        onConflictDoUpdate({ set }: { set: Record<string, unknown> }) {
          const existing = rows.get(values.id);
          if (existing) Object.assign(existing, set);
          else
            rows.set(values.id, {
              id: values.id,
              status: (values.status ?? "pending") as string,
              result: values.result ?? null,
              createdAt: new Date(),
              resolvedAt: values.resolvedAt ?? null,
            });
          return { returning: () => Promise.resolve([{ id: values.id }]) };
        },
      };
      return api;
    },
    select() {
      return {
        from() {
          return {
            where(pred: unknown) {
              return {
                limit() {
                  const id = idOf(pred);
                  const row = id !== undefined ? rows.get(id) : undefined;
                  return Promise.resolve(row ? [row] : []);
                },
              };
            },
          };
        },
      };
    },
    delete() {
      return {
        where(pred: unknown) {
          const id = idOf(pred);
          if (id !== undefined) rows.delete(id);
          return Promise.resolve();
        },
      };
    },
  };

  return { db, table, eq, and, lt, rows };
}

test("cross-instance: a resolve recorded before the waiter registers still unblocks it via the shared store", async () => {
  const fake = makeFakeStore();
  const dbMock = mock.module("@workspace/db", {
    namedExports: { db: fake.db, excelPendingOpsTable: fake.table },
  });
  const ormMock = mock.module("drizzle-orm", {
    namedExports: { eq: fake.eq, and: fake.and, lt: fake.lt },
  });
  __setSharedStoreEnabledForTests(true);

  try {
    const id = "xinst:resolve-before-register";

    // Instance B receives the tool-result POST first. There is no in-memory
    // waiter here, so the outcome must be persisted to the shared store.
    const delivered = await resolveOp(id, { ok: true, result: "X" });
    assert.equal(delivered, true);
    assert.equal(fake.rows.get(id)?.status, "resolved");

    // Instance A's SSE stream registers its waiter afterwards and must still
    // observe the result (via the immediate post-register fetch), not hang.
    const out = await waitForOp(id, 5_000);
    assert.equal(out.ok, true);
    assert.equal(out.result, "X");
  } finally {
    dbMock.restore();
    ormMock.restore();
    __setSharedStoreEnabledForTests(false);
  }
});
