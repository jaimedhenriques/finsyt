import { pgTable, text, timestamp, jsonb, integer, uuid, primaryKey } from "drizzle-orm/pg-core";

/**
 * Append-only audit log of security-relevant events.
 *
 * The underlying Postgres table is created as PARTITION BY RANGE (occurred_at)
 * with monthly partitions — see `ensureAuditSchema()` in `../audit.ts`.
 * Drizzle does not natively model partitioned tables, so this `pgTable`
 * definition is used purely for type-safe inserts / selects against the
 * partitioned parent. Do not run `drizzle-kit push` against this table —
 * the runtime helper owns the DDL.
 */
export const auditEventsTable = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    orgId: text("org_id").notNull(),
    actorId: text("actor_id"),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.id, t.occurredAt] }),
  }),
);

export type AuditEvent = typeof auditEventsTable.$inferSelect;
export type NewAuditEvent = typeof auditEventsTable.$inferInsert;

/**
 * Per-organization retention settings used by the scheduled purge job.
 * Values are days; 0 means "never purge".
 */
export const orgRetentionSettingsTable = pgTable("org_retention_settings", {
  orgId: text("org_id").primaryKey(),
  auditLogDays: integer("audit_log_days").notNull().default(365),
  transientLogDays: integer("transient_log_days").notNull().default(30),
  abandonedChatDays: integer("abandoned_chat_days").notNull().default(90),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type OrgRetentionSettings = typeof orgRetentionSettingsTable.$inferSelect;

/**
 * GDPR / DSAR self-serve account deletion requests.
 * Hard-deletion happens within the documented 30-day SLA — this table
 * records the queue and final completion timestamp.
 */
export const accountDeletionRequestsTable = pgTable("account_deletion_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: text("org_id").notNull(),
  actorId: text("actor_id").notNull(),
  reason: text("reason"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
});

export type AccountDeletionRequest = typeof accountDeletionRequestsTable.$inferSelect;

/**
 * GDPR data-export (DSAR) request log. The actual archive is generated
 * synchronously by the export endpoint and streamed to the client; we
 * record the request so it shows up in the audit trail.
 */
export const dataExportRequestsTable = pgTable("data_export_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: text("org_id").notNull(),
  actorId: text("actor_id").notNull(),
  format: text("format").notNull().default("json"),
  byteSize: integer("byte_size"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DataExportRequest = typeof dataExportRequestsTable.$inferSelect;
