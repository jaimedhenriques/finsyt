/**
 * Agent / MCP integration helpers
 * ────────────────────────────────
 * Bridges the connector-hub's `connection_operations` rows to:
 *   - OpenAI-style tool definitions for `/api/agent/ask` and `/api/finsyt-agent/ask`
 *   - MCP-style tool definitions for `/api/mcp`
 *
 * Tool naming convention (kept identical across both surfaces):
 *   `conn__<safeDisplaySlug>__<operationName>__<connId6>`
 *
 * The `<connId6>` suffix is the first 6 hex chars of the connection UUID and
 * disambiguates connections that share a display name (e.g. two "Stripe"
 * connections for sandbox + production, or two custom REST connections both
 * called "internal-api"). Without it, two connections with the same name
 * exposing the same operation produce identical tool names and the second
 * silently overwrites the first in the agent/MCP registries — which would
 * mean tools/list lies and tools/call routes to the wrong upstream.
 *
 * The display slug is kept purely for readability — the lookup is still by
 * the canonical `connectionId` carried in the `_connectionId` field.
 */
import { eq } from "drizzle-orm";
import {
  connectionsTable,
  connectionOperationsTable,
  withOrgContext,
} from "@workspace/db";
import { executeConnectionOperation } from "./executor";

const TOOL_PREFIX = "conn__";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "conn";
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  /** Internal — used by the executor lookup table. */
  _connectionId: string;
  _operation: string;
  _kind: "rest" | "mcp" | "first_party";
}

/**
 * Build an OpenAI-tools array of every active connection operation owned by
 * `orgId`. Returns an empty array if the workspace has no connections.
 *
 * The 64-char tool name limit (OpenAI) is respected by truncating the
 * connection slug aggressively — `slugify` already caps at 32, leaving room
 * for the prefix + operation name.
 */
export async function buildConnectorAgentTools(orgId: string): Promise<AgentTool[]> {
  return withOrgContext(orgId, async (tx) => {
    const rows = await tx
      .select({
        connectionId: connectionsTable.id,
        connectionName: connectionsTable.displayName,
        connectionStatus: connectionsTable.status,
        connectionKind: connectionsTable.kind,
        operationId: connectionOperationsTable.id,
        operationName: connectionOperationsTable.name,
        operationDescription: connectionOperationsTable.description,
        operationEnabled: connectionOperationsTable.enabled,
        paramSchema: connectionOperationsTable.paramSchema,
      })
      .from(connectionOperationsTable)
      .innerJoin(connectionsTable, eq(connectionOperationsTable.connectionId, connectionsTable.id))
      .where(eq(connectionsTable.orgId, orgId));

    return rows
      .filter((r) => r.operationEnabled && r.connectionStatus === "active")
      .map<AgentTool>((r) => {
        const slug = slugify(r.connectionName);
        const opName = slugify(r.operationName);
        // Take the first 6 hex chars of the connection UUID and use them as
        // a stable suffix. UUIDs always start with hex so we can rely on
        // the prefix being valid in OpenAI's tool-name regex
        // (`^[a-zA-Z0-9_-]{1,64}$`). Probability of two random UUIDs
        // colliding on 6 hex chars is 1/16^6 ≈ 1/16M, well below the per-
        // workspace connection cap.
        const connId6 = r.connectionId.replace(/-/g, "").slice(0, 6).toLowerCase();
        // Reserve the suffix budget first, then truncate the readable middle.
        const suffix = `__${connId6}`;
        const head = `${TOOL_PREFIX}${slug}__${opName}`;
        const name = `${head.slice(0, 64 - suffix.length)}${suffix}`;
        return {
          name,
          description: `${r.operationDescription || r.operationName} (via "${r.connectionName}" connection)`,
          parameters: normalizeParamSchema(r.paramSchema),
          _connectionId: r.connectionId,
          _operation: r.operationName,
          _kind: r.connectionKind as "rest" | "mcp" | "first_party",
        };
      });
  });
}

function normalizeParamSchema(raw: unknown): { type: "object"; properties: Record<string, unknown>; required?: string[] } {
  if (!raw || typeof raw !== "object") return { type: "object", properties: {} };
  const obj = raw as Record<string, unknown>;
  // If the user already supplied a JSON-Schema-shaped object, pass it through.
  if (obj.type === "object" && obj.properties && typeof obj.properties === "object") {
    return obj as { type: "object"; properties: Record<string, unknown>; required?: string[] };
  }
  // Otherwise treat the bag as `{ paramName: { type, required, description } }`
  // (the shape used by catalog operationTemplates).
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && "type" in (v as object)) {
      const spec = v as { type: string; required?: boolean; description?: string };
      properties[k] = { type: spec.type || "string", description: spec.description || "" };
      if (spec.required) required.push(k);
    } else {
      properties[k] = { type: "string" };
    }
  }
  const out: { type: "object"; properties: Record<string, unknown>; required?: string[] } = {
    type: "object",
    properties,
  };
  if (required.length) out.required = required;
  return out;
}

/**
 * Invoke a tool that was produced by `buildConnectorAgentTools`. Routes REST
 * connections to the executor and MCP connections to the MCP client.
 *
 * Returns a JSON-serialisable result the agent can pass straight back into
 * the message history.
 */
export async function invokeConnectorTool(
  orgId: string,
  tool: AgentTool,
  args: Record<string, unknown>,
  actorId: string | null = null,
): Promise<unknown> {
  // Both REST and MCP go through the same executor now — audit, rate-limit,
  // and health metrics all live there so every invocation surface (agent
  // loop, public /api/v1, in-app /execute) is observed identically.
  const result = await executeConnectionOperation({
    orgId,
    connectionId: tool._connectionId,
    operation: tool._operation,
    params: args,
    actorId,
  });
  return { ok: result.ok, status: result.status, data: result.data, error: result.error };
}

/**
 * Lightweight connector inventory for the scheduled workflow agent
 * (`agent-executor.ts`). That path is completion-style (Groq / Perplexity)
 * with no tool-calling loop, so we surface available connectors as a static
 * inventory the LLM can reference in its findings ("(via Stripe connector)").
 *
 * Returns a short, prompt-friendly text block — empty string if no
 * connections are configured. Capped at ~12 connections × 6 ops each so the
 * prompt does not blow past context for large workspaces.
 */
export async function buildConnectorInventoryContext(orgId: string): Promise<string> {
  const tools = await buildConnectorAgentTools(orgId);
  if (!tools.length) return "";

  const byConn = new Map<string, { name: string; ops: string[] }>();
  for (const t of tools) {
    // Tool name format: conn__<connSlug>__<opSlug>. Group by the connSlug.
    const parts = t.name.replace(/^conn__/, "").split("__");
    const connSlug = parts[0] || "conn";
    const opName = t._operation;
    const entry = byConn.get(connSlug) || { name: connSlug, ops: [] };
    if (entry.ops.length < 6) entry.ops.push(opName);
    byConn.set(connSlug, entry);
  }

  const lines: string[] = ["Workspace has the following connector tools available (read-only inventory — cite as the source where appropriate):"];
  let n = 0;
  for (const [, v] of byConn) {
    if (n++ >= 12) break;
    lines.push(`  - ${v.name}: ${v.ops.join(", ")}`);
  }
  return lines.join("\n");
}
