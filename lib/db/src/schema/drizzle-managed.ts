/**
 * Schema entry-point for drizzle-kit (push / generate / migrate).
 *
 * The compliance tables (audit_events, org_retention_settings,
 * account_deletion_requests, data_export_requests) are intentionally
 * excluded here.  Their DDL is owned by ensureAuditSchema() in
 * src/audit.ts because audit_events is a partitioned table that
 * drizzle-kit cannot introspect correctly — it treats the monthly
 * partition children (audit_events_YYYYMM, relkind='r') as rename
 * candidates for the partitioned parent (relkind='p'), which triggers
 * an interactive prompt that breaks non-interactive CI runs.
 *
 * Application code should import from the main index.ts which re-exports
 * everything including compliance types.
 */
export * from "./tenancy";
export * from "./leads";
export * from "./research";
export * from "./portfolio";
export * from "./developer";
export * from "./agents";
export * from "./connectors";
export * from "./peers";
export * from "./alerts";
export * from "./workspaces";
export * from "./user-preferences";
export * from "./blueprints";
export * from "./matrices";
export * from "./deck-overrides";
export * from "./live-highlights";
export * from "./excel-ops";
export * from "./billing";
