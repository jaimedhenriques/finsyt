/**
 * Connection accessor — single read path for the executor + UI.
 *
 * Responsibilities
 *   - Load a connection row scoped to an org (RLS via withOrgContext)
 *   - Decrypt credentials only when explicitly requested
 *   - Append `connection_events` rows for audit / health
 *
 * Why a thin wrapper instead of inlining drizzle calls everywhere: the
 * encrypted credential blob and the audit row are too easy to forget. By
 * forcing every call site through `loadConnection({ withCredentials: true })`,
 * we guarantee the credential read is always recorded.
 */
import { and, eq } from "drizzle-orm";
import {
  connectionsTable,
  connectionCredentialsTable,
  connectionOperationsTable,
  connectionEventsTable,
  withOrgContext,
  auditLog,
  type Connection,
  type ConnectionOperation,
} from "@workspace/db";
import { decryptCredentials } from "./crypto";

export interface LoadedConnection {
  connection: Connection;
  credentials?: Record<string, string>;
  operations: ConnectionOperation[];
}

/**
 * Fetch a connection (and optionally its decrypted credentials + operations).
 * Returns null when the row does not exist or belongs to a different org.
 */
export async function loadConnection(
  orgId: string,
  connectionId: string,
  opts: { withCredentials?: boolean; withOperations?: boolean; actorId?: string | null } = {},
): Promise<LoadedConnection | null> {
  return withOrgContext(orgId, async (tx) => {
    const rows = await tx
      .select()
      .from(connectionsTable)
      .where(and(eq(connectionsTable.id, connectionId), eq(connectionsTable.orgId, orgId)))
      .limit(1);
    const connection = rows[0];
    if (!connection) return null;

    const out: LoadedConnection = { connection, operations: [] };

    if (opts.withOperations) {
      out.operations = await tx
        .select()
        .from(connectionOperationsTable)
        .where(eq(connectionOperationsTable.connectionId, connection.id));
    }

    if (opts.withCredentials) {
      const credRows = await tx
        .select()
        .from(connectionCredentialsTable)
        .where(eq(connectionCredentialsTable.connectionId, connection.id))
        .limit(1);
      if (credRows[0]) {
        try {
          out.credentials = decryptCredentials(credRows[0].payload);
          // Audit every successful credential read. This is the single
          // chokepoint the codebase uses to fetch decrypted secrets, so
          // recording here gives operators a complete trail of who
          // dereferenced credentials and when (req'd by threat model).
          await recordEventInternal(tx, {
            connectionId: connection.id,
            orgId,
            kind: "credential.read",
            actorId: opts.actorId ?? null,
            metadata: { fields: Object.keys(out.credentials) },
          });
          // Mirror to the canonical compliance `audit_events` table so this
          // event participates in the same retention + RLS policies as every
          // other auth/membership/data action. `connection_events` is a
          // shorter-lived health-and-usage stream; `audit_events` is the
          // authoritative trail compliance reviewers query.
          //
          // Fire-and-forget — `auditLog` swallows its own failures and we
          // never want a credential read to fail because audit-log writes
          // are degraded.
          void auditLog({
            orgId,
            actorId: opts.actorId ?? null,
            actorType: opts.actorId ? "user" : "system",
            action: "connector.credential.read",
            resourceType: "connection",
            resourceId: connection.id,
            metadata: {
              definitionId: connection.definitionId,
              kind: connection.kind,
              fields: Object.keys(out.credentials),
            },
          });
        } catch (err) {
          // Decryption failure means the master key changed or the row was
          // tampered with. We surface this as a recordable event but do not
          // throw — the caller should treat as "no credential".
          await recordEventInternal(tx, {
            connectionId: connection.id,
            orgId,
            kind: "credential.read",
            actorId: opts.actorId ?? null,
            error: `decrypt_failed: ${(err as Error).message}`,
          });
          void auditLog({
            orgId,
            actorId: opts.actorId ?? null,
            actorType: opts.actorId ? "user" : "system",
            action: "connector.credential.read.failed",
            resourceType: "connection",
            resourceId: connection.id,
            metadata: { error: (err as Error).message },
          });
        }
      }
    }

    return out;
  });
}

/** Append a row to `connection_events`. Best-effort, never throws. */
export async function recordEvent(input: {
  orgId: string;
  connectionId: string;
  kind: string;
  operation?: string | null;
  actorId?: string | null;
  latencyMs?: number | null;
  status?: number | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await withOrgContext(input.orgId, (tx) => recordEventInternal(tx, input));
  } catch {
    // Swallow — telemetry must never break a request.
  }
}

async function recordEventInternal(
  tx: Parameters<Parameters<typeof withOrgContext>[1]>[0],
  input: {
    orgId: string;
    connectionId: string;
    kind: string;
    operation?: string | null;
    actorId?: string | null;
    latencyMs?: number | null;
    status?: number | null;
    error?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  await tx.insert(connectionEventsTable).values({
    connectionId: input.connectionId,
    orgId: input.orgId,
    kind: input.kind,
    operation: input.operation ?? null,
    actorId: input.actorId ?? null,
    latencyMs: input.latencyMs ?? null,
    status: input.status ?? null,
    error: input.error ?? null,
    metadata: input.metadata ?? null,
  });
}
