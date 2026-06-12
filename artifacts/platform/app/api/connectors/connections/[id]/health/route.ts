import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  connectionsTable,
  connectionEventsTable,
  withOrgContext,
} from "@workspace/db";
import { resolveLocalOrgId } from "@/lib/org-resolver";
import { requireConnectorActor } from "@/lib/connectors/permissions";

export const runtime = "nodejs";

/**
 * GET /api/connectors/connections/:id/health
 *
 * Connection-level health summary used by the My Connections UI and the
 * provider-health admin surface. We compute everything from the rolling
 * `connection_events` window (last 24h) so adding the view did not need a
 * schema migration.
 *
 * Returned shape:
 *   {
 *     connection: { id, status, lastTestAt, lastTestOk, lastTestError },
 *     window: { hours: 24 },
 *     callCount, errorCount, errorRate, p50LatencyMs, p95LatencyMs,
 *     lastCallAt, lastErrorAt,
 *     rateLimit: { remaining, limit, resetAt } | null,
 *     recentEvents: [{ kind, operation, status, latencyMs, error, occurredAt }, ...]
 *   }
 *
 * `rateLimit` is the most recent call event whose metadata recorded
 * `x-ratelimit-*` headers. Members can read this surface — it never returns
 * credentials and is the basis for the per-row health badges in the UI.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireConnectorActor();
  if (!guard.ok) return guard.response;
  const { clerkOrgId: orgId } = guard.actor;

  const { id } = await params;
  const localOrgId = await resolveLocalOrgId(orgId);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const result = await withOrgContext(localOrgId, async (tx) => {
    const conn = await tx
      .select()
      .from(connectionsTable)
      .where(and(eq(connectionsTable.id, id), eq(connectionsTable.orgId, localOrgId)))
      .limit(1);
    if (!conn.length) return null;
    const c = conn[0];

    // Aggregate over the last 24h of `kind=call` events so the UI shows
    // "real" usage health, not test pings.
    const aggRows = await tx.execute(sql`
      SELECT
        COUNT(*)::int                                                        AS call_count,
        COUNT(*) FILTER (WHERE status >= 400 OR error IS NOT NULL)::int      AS error_count,
        percentile_disc(0.5)  WITHIN GROUP (ORDER BY latency_ms)::int        AS p50,
        percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms)::int        AS p95,
        MAX(occurred_at)                                                     AS last_call_at,
        MAX(occurred_at) FILTER (WHERE status >= 400 OR error IS NOT NULL)   AS last_error_at
      FROM connection_events
      WHERE connection_id = ${id}
        AND kind = 'call'
        AND occurred_at >= ${since.toISOString()}
    `);
    const agg = (aggRows.rows?.[0] || {}) as {
      call_count?: number; error_count?: number;
      p50?: number | null; p95?: number | null;
      last_call_at?: string | null; last_error_at?: string | null;
    };

    const recent = await tx
      .select({
        kind: connectionEventsTable.kind,
        operation: connectionEventsTable.operation,
        status: connectionEventsTable.status,
        latencyMs: connectionEventsTable.latencyMs,
        error: connectionEventsTable.error,
        metadata: connectionEventsTable.metadata,
        occurredAt: connectionEventsTable.occurredAt,
      })
      .from(connectionEventsTable)
      .where(
        and(
          eq(connectionEventsTable.connectionId, id),
          gte(connectionEventsTable.occurredAt, since),
        ),
      )
      .orderBy(desc(connectionEventsTable.occurredAt))
      .limit(20);

    // Pick the freshest call whose metadata included rate-limit headers.
    let rateLimit: {
      remaining: number | null; limit: number | null; resetAt: string | null;
    } | null = null;
    for (const ev of recent) {
      const md = ev.metadata as Record<string, unknown> | null;
      if (md && (md.rateLimitRemaining !== undefined || md.rateLimitLimit !== undefined)) {
        rateLimit = {
          remaining: typeof md.rateLimitRemaining === "number" ? md.rateLimitRemaining : null,
          limit:     typeof md.rateLimitLimit     === "number" ? md.rateLimitLimit     : null,
          resetAt:   typeof md.rateLimitReset     === "string" ? md.rateLimitReset     : null,
        };
        break;
      }
    }

    const callCount  = agg.call_count  ?? 0;
    const errorCount = agg.error_count ?? 0;
    return {
      connection: {
        id: c.id,
        status: c.status,
        kind: c.kind,
        displayName: c.displayName,
        category: c.category,
        lastTestAt: c.lastTestAt,
        lastTestOk: c.lastTestOk,
        lastTestError: c.lastTestError,
      },
      window: { hours: 24 },
      callCount,
      errorCount,
      errorRate: callCount > 0 ? errorCount / callCount : 0,
      p50LatencyMs: agg.p50 ?? null,
      p95LatencyMs: agg.p95 ?? null,
      lastCallAt:   agg.last_call_at ?? null,
      lastErrorAt:  agg.last_error_at ?? null,
      rateLimit,
      recentEvents: recent,
    };
  });

  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}
