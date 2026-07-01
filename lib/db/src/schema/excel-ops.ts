import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

// ── Excel agentic-build op bridge (cross-instance coordination) ──────────────
// Ephemeral coordination rows that let the server agent loop pause on an
// `excel_op` until the Excel task pane POSTs back the result — even when the
// SSE stream and the tool-result POST land on *different* Node instances in a
// horizontally-scaled deployment.
//
// This is NOT tenant data in the usual sense: rows are short-lived (deleted on
// resolution / timeout, swept after a TTL) and addressed only by an opaque,
// per-run op id (`<runId>:<toolCallId>`) that is never enumerated. It is
// therefore intentionally excluded from `TENANT_TABLES` / RLS and accessed
// directly by the op-bridge using the exact primary key.

export const excelPendingOpsTable = pgTable(
  "excel_pending_ops",
  {
    // `<runId>:<toolCallId>` — globally unique per agent run.
    id: text("id").primaryKey(),
    // "pending" until the task pane responds, then "resolved".
    status: text("status").notNull().default("pending"),
    // The serialized ExcelOpResult once the client responds.
    result: jsonb("result"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("excel_pending_ops_created_at_idx").on(t.createdAt)],
);

export type ExcelPendingOpRow = typeof excelPendingOpsTable.$inferSelect;
