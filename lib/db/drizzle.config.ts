import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // drizzle-managed.ts intentionally excludes compliance tables
  // (audit_events, org_retention_settings, account_deletion_requests,
  // data_export_requests) whose DDL is owned by ensureAuditSchema() in
  // src/audit.ts.  Application code should import from src/schema/index.ts
  // which re-exports everything including compliance types for type-safe queries.
  schema: path.join(__dirname, "./src/schema/drizzle-managed.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Exclude audit_events* from DB introspection so drizzle-kit never computes
  // a diff for them.  audit_events is a partitioned table (relkind='p') that
  // drizzle-kit cannot model; its monthly partition children
  // (audit_events_YYYYMM, relkind='r') would otherwise be treated as
  // stray tables to drop, or trigger an interactive rename prompt.
  // The combined effect of drizzle-managed.ts (schema side) +
  // tablesFilter (DB side) is that audit_events* tables are invisible to
  // drizzle-kit in both directions — no diff, no prompt, no data-loss warning.
  tablesFilter: ["!audit_events*"],
});
