import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { organizationsTable } from "./tenancy";

// ── Connector Hub ───────────────────────────────────────────────────────────
// `connector_definitions` is the global, seeded catalog of "supported" APIs.
// `connections` are workspace-scoped instances (a user has actually connected
// the API or MCP server). Credentials live in a separate table so the row
// lookup can avoid pulling encrypted material into memory by accident.
//
// Org id is the LOCAL UUID (organizations.id), same shape as `api_keys`, so
// the existing audit logger and `withOrgContext` helpers apply unchanged.

export const CONNECTION_KINDS = ["rest", "mcp", "first_party"] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

export const CONNECTION_STATUSES = ["draft", "active", "error", "disabled"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const AUTH_TYPES = ["none", "api_key_header", "api_key_query", "bearer", "basic", "oauth2"] as const;
export type AuthType = (typeof AUTH_TYPES)[number];

// ── connector_definitions ───────────────────────────────────────────────────
// Globally-shared catalog. Seeded from the curated manifest at boot.
export const connectorDefinitionsTable = pgTable(
  "connector_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    authType: text("auth_type").notNull().default("api_key_header"),
    baseUrl: text("base_url").notNull().default(""),
    docUrl: text("doc_url").notNull().default(""),
    logoUrl: text("logo_url").notNull().default(""),
    /** OAuth client config (clientId env-name, scopes, authorize/token urls). */
    oauthConfig: jsonb("oauth_config"),
    /** Reusable operation templates: name, method, path, description, paramSchema. */
    operationTemplates: jsonb("operation_templates").notNull().default(`[]`),
    /** True when Finsyt already speaks this provider via data-providers.ts. */
    isFirstParty: boolean("is_first_party").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqSlug: uniqueIndex("connector_definitions_slug_uniq").on(t.slug),
    byCat: index("connector_definitions_category_idx").on(t.category),
  }),
);

// ── connections ─────────────────────────────────────────────────────────────
// Workspace-scoped instance. Either references a definition or carries enough
// state to act as a custom REST/MCP source.
export const connectionsTable = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    definitionId: uuid("definition_id").references(() => connectorDefinitionsTable.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull().default("rest"),
    status: text("status").notNull().default("draft"),
    displayName: text("display_name").notNull(),
    /** For custom REST: base URL the executor will prefix all paths with. */
    baseUrl: text("base_url").notNull().default(""),
    /** For MCP: server URL to dial. */
    mcpUrl: text("mcp_url").notNull().default(""),
    authType: text("auth_type").notNull().default("none"),
    /** Optional category override (defaults to definition.category). */
    category: text("category").notNull().default("custom"),
    createdBy: text("created_by").notNull(),
    lastTestAt: timestamp("last_test_at", { withTimezone: true }),
    lastTestOk: boolean("last_test_ok"),
    lastTestError: text("last_test_error"),
    /**
     * Last-seen rate-limit headers from the upstream (most-recent call wins).
     * Populated by the executor whenever the upstream sets `x-ratelimit-*`
     * (FactSet, CapIQ, Refinitiv RDP, Bloomberg DL, PitchBook, GitHub, …).
     * Surfaced on the Connector Hub card so finance teams can see how much
     * headroom they have before a workflow blows through the daily cap.
     */
    quotaRemaining: integer("quota_remaining"),
    quotaLimit: integer("quota_limit"),
    quotaResetAt: timestamp("quota_reset_at", { withTimezone: true }),
    quotaUpdatedAt: timestamp("quota_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byOrg: index("connections_org_idx").on(t.orgId),
    byOrgKind: index("connections_org_kind_idx").on(t.orgId, t.kind),
  }),
);

// ── connection_credentials ─────────────────────────────────────────────────
// Encrypted credential blob (envelope encryption). Held in a separate table
// so a `SELECT * FROM connections` never pulls the encrypted material.
export const connectionCredentialsTable = pgTable(
  "connection_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connectionsTable.id, { onDelete: "cascade" }),
    /** Identifier of the master key used to wrap this row's data key. */
    keyId: text("key_id").notNull().default("v1"),
    /** Base64 of {iv, encryptedDataKey, ciphertext, tag}. */
    payload: text("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqConn: uniqueIndex("connection_credentials_conn_uniq").on(t.connectionId),
  }),
);

// ── connection_operations ───────────────────────────────────────────────────
// Concrete callable operations on a connection. For catalog connections this
// is seeded from `connector_definitions.operationTemplates` on connect; for
// custom REST/MCP the user (or MCP discovery) adds them.
export const connectionOperationsTable = pgTable(
  "connection_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connectionsTable.id, { onDelete: "cascade" }),
    /** Stable name used both in the unified API path and as the agent tool name. */
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** REST: GET/POST/etc. MCP: ignored (always "TOOL"). */
    method: text("method").notNull().default("GET"),
    /** REST path (may contain {param} placeholders). MCP: tool name. */
    path: text("path").notNull().default(""),
    /** JSON-Schema-like shape used by the agent and the public API for validation. */
    paramSchema: jsonb("param_schema").notNull().default(`{}`),
    /** Cache TTL seconds for GETs (0 = no cache). */
    cacheTtlSeconds: integer("cache_ttl_seconds").notNull().default(60),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byConn: index("connection_operations_conn_idx").on(t.connectionId),
    uniqConnName: uniqueIndex("connection_operations_conn_name_uniq").on(t.connectionId, t.name),
  }),
);

// ── connection_events ───────────────────────────────────────────────────────
// Per-call audit + health surface. The connection-health view derives error
// rate / p50 latency from this table.
export const connectionEventsTable = pgTable(
  "connection_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connectionsTable.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").notNull(),
    /** call | test | create | update | delete | credential.read | discover */
    kind: text("kind").notNull(),
    operation: text("operation"),
    actorId: text("actor_id"),
    latencyMs: integer("latency_ms"),
    status: integer("status"),
    error: text("error"),
    metadata: jsonb("metadata"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byConn: index("connection_events_conn_idx").on(t.connectionId),
    byOrg: index("connection_events_org_idx").on(t.orgId),
    byOccurred: index("connection_events_occurred_idx").on(t.occurredAt),
  }),
);

// ── Types & Zod ─────────────────────────────────────────────────────────────
export type ConnectorDefinition = typeof connectorDefinitionsTable.$inferSelect;
export type Connection = typeof connectionsTable.$inferSelect;
export type ConnectionCredential = typeof connectionCredentialsTable.$inferSelect;
export type ConnectionOperation = typeof connectionOperationsTable.$inferSelect;
export type ConnectionEvent = typeof connectionEventsTable.$inferSelect;

export const createConnectionSchema = z.object({
  definitionSlug: z.string().min(1).max(120).optional(),
  kind: z.enum(CONNECTION_KINDS),
  displayName: z.string().min(1).max(160),
  baseUrl: z.string().url().optional().or(z.literal("")),
  mcpUrl: z.string().url().optional().or(z.literal("")),
  authType: z.enum(AUTH_TYPES).default("none"),
  category: z.string().min(1).max(80).default("custom"),
  /** Free-form credential bag — encrypted at rest, never re-served. */
  credentials: z.record(z.string()).optional(),
});
export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;

export const createOperationSchema = z.object({
  name: z.string().min(1).max(120).regex(/^[a-z0-9_-]+$/i, "alphanumeric, _ or - only"),
  description: z.string().max(800).default(""),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  path: z.string().min(1).max(500),
  paramSchema: z.record(z.unknown()).default({}),
  cacheTtlSeconds: z.number().int().min(0).max(86400).default(60),
});
export type CreateOperationInput = z.infer<typeof createOperationSchema>;
