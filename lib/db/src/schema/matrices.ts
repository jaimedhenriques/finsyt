import { pgTable, text, uuid, timestamp, index, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod";
import { organizationsTable } from "./tenancy";

// ── Matrices ─────────────────────────────────────────────────────────────────
// Hebbia-style multi-entity × multi-prompt research grids. One row per saved
// matrix definition; rows/columns/cells are stored as JSONB so the entire
// grid round-trips in a single fetch (matrices are O(rows × cols) ≤ 1000
// cells in practice). For larger grids we'd split cells into a child table —
// for the v1 product surface a single row is the right tradeoff.
//
// org_id is a UUID FK to organizations.id and the table is RLS-enforced via
// the standard `withOrgContext(localOrgId)` pattern (see rls.sql, alongside
// `workspaces`).

export const matricesTable = pgTable(
  "matrices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    // Source of rows: how the analyst populated the entity column.
    rowSourceKind: text("row_source_kind").notNull().default("manual"),
    rowSourceMeta: jsonb("row_source_meta").notNull().default({}),
    // Rows: [{ id, label, ticker?, kind?, meta? }, …]
    rows: jsonb("rows").notNull().default([]),
    // Columns: [{ id, label, prompt, width? }, …]
    columns: jsonb("columns").notNull().default([]),
    // Cells map: `${rowId}.${colId}` → { state, text?, citations?, steps?, runAt?, error? }
    cells: jsonb("cells").notNull().default({}),
    // Watch flags
    rerunOnFiling: boolean("rerun_on_filing").notNull().default(false),
    // Filing-watch bookkeeping. `lastFilingCheckAt` is the wall-clock time the
    // background watcher last polled this matrix's row tickers for new SEC
    // filings. `lastFilingMarkers` is a per-symbol cursor:
    // `{ [SYMBOL]: { date: 'YYYY-MM-DD', accession?: string, form?: string } }`
    // — the most recent filing the watcher has already processed. Cells are
    // only marked dirty when a freshly-fetched filing is strictly newer than
    // the recorded marker, so re-runs don't fire on every poll.
    lastFilingCheckAt: timestamp("last_filing_check_at"),
    lastFilingMarkers: jsonb("last_filing_markers").notNull().default({}),
    pinned: boolean("pinned").notNull().default(false),
    tags: jsonb("tags").notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("matrices_org_idx").on(t.orgId),
    byOrgPinned: index("matrices_org_pinned_idx").on(t.orgId, t.pinned),
  }),
);

export type MatrixRow = typeof matricesTable.$inferSelect;
export type InsertMatrixRow = typeof matricesTable.$inferInsert;

// ── Matrix snapshots ─────────────────────────────────────────────────────────
// A frozen-in-time copy of a matrix. The snapshot captures the rows/cols/cells
// at the moment of freeze so analysts can pin point-in-time research even as
// the live matrix continues to evolve.

export const matrixSnapshotsTable = pgTable(
  "matrix_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    matrixId: uuid("matrix_id")
      .notNull()
      .references(() => matricesTable.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull(),
    label: text("label").notNull().default(""),
    rows: jsonb("rows").notNull().default([]),
    columns: jsonb("columns").notNull().default([]),
    cells: jsonb("cells").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("matrix_snapshots_org_idx").on(t.orgId),
    byMatrix: index("matrix_snapshots_matrix_idx").on(t.matrixId, t.createdAt),
  }),
);

export type MatrixSnapshotRow = typeof matrixSnapshotsTable.$inferSelect;
export type InsertMatrixSnapshotRow = typeof matrixSnapshotsTable.$inferInsert;

// ── Validation schemas ──────────────────────────────────────────────────────

const ROW_SOURCE_KIND = z.enum(["manual", "watchlist", "screener", "csv", "connector"]);

const matrixRowSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  ticker: z.string().max(16).optional(),
  kind: z.string().max(40).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const matrixColSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  prompt: z.string().min(1).max(2000),
  width: z.number().int().min(80).max(800).optional(),
});

const matrixCellSchema = z.object({
  state: z.enum(["idle", "queued", "running", "done", "error"]),
  text: z.string().max(20_000).optional(),
  error: z.string().max(2_000).optional(),
  citations: z.array(z.object({
    label: z.string().max(200),
    summary: z.string().max(800).optional(),
    href: z.string().max(800).optional(),
    type: z.string().max(40).optional(),
  })).max(50).optional(),
  steps: z.array(z.object({
    kind: z.string().max(40),
    name: z.string().max(80).optional(),
    label: z.string().max(200).optional(),
    summary: z.string().max(400).optional(),
    ms: z.number().int().min(0).max(600_000).optional(),
    ok: z.boolean().optional(),
  })).max(40).optional(),
  provider: z.string().max(40).optional(),
  ms: z.number().int().min(0).max(600_000).optional(),
  runAt: z.string().max(40).optional(),
  dirty: z.boolean().optional(),
});

export const insertMatrixSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  rowSourceKind: ROW_SOURCE_KIND.optional(),
  rowSourceMeta: z.record(z.string(), z.unknown()).optional(),
  rows: z.array(matrixRowSchema).max(200).optional(),
  columns: z.array(matrixColSchema).max(40).optional(),
  cells: z.record(z.string(), matrixCellSchema).optional(),
  rerunOnFiling: z.boolean().optional(),
  pinned: z.boolean().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});
export type InsertMatrixInput = z.infer<typeof insertMatrixSchema>;

export const patchMatrixSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  rowSourceKind: ROW_SOURCE_KIND.optional(),
  rowSourceMeta: z.record(z.string(), z.unknown()).optional(),
  rows: z.array(matrixRowSchema).max(200).optional(),
  columns: z.array(matrixColSchema).max(40).optional(),
  cells: z.record(z.string(), matrixCellSchema).optional(),
  rerunOnFiling: z.boolean().optional(),
  pinned: z.boolean().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });
export type PatchMatrixInput = z.infer<typeof patchMatrixSchema>;

export const matrixSnapshotSchema = z.object({
  label: z.string().max(200).optional(),
});
export type MatrixSnapshotInput = z.infer<typeof matrixSnapshotSchema>;

export type MatrixCellState = "idle" | "queued" | "running" | "done" | "error";
export type MatrixCellPayload = z.infer<typeof matrixCellSchema>;
export type MatrixGridRow = z.infer<typeof matrixRowSchema>;
export type MatrixGridColumn = z.infer<typeof matrixColSchema>;
