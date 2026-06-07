/**
 * Lightweight MCP-over-HTTP client.
 *
 * MCP defines a JSON-RPC 2.0 protocol; the most common transport in the wild
 * is plain HTTPS POSTs of `{ jsonrpc, method, params, id }`. We support that
 * transport here. WebSocket / stdio transports are out of scope — the
 * connector hub only ingests HTTP-reachable MCP servers.
 *
 * Two methods we care about:
 *   - `tools/list`  → discover available tools (used at connect-time)
 *   - `tools/call`  → invoke a tool (used by executor.ts and /api/mcp)
 *
 * Auth: same scheme as REST connections — header / bearer / basic. The MCP
 * spec doesn't standardise auth, so we follow whatever the user configured.
 */
import { assertSafeUrl } from "./url-safety";

export interface McpTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpClientOptions {
  url: string;
  authHeaders?: Record<string, string>;
  timeoutMs?: number;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc?: string;
  id?: number | string | null;
  result?: T;
  error?: { code: number; message: string };
}

let nextId = 1;

async function rpc<T>(opts: McpClientOptions, method: string, params?: unknown): Promise<T> {
  // SSRF guard: re-resolve the host on every call so a swapped DNS record
  // can't sneak past us. Throws UrlSafetyError on private/loopback/etc.
  await assertSafeUrl(opts.url, "mcp");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25_000);
  try {
    const res = await fetch(opts.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(opts.authHeaders || {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params: params ?? {} }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`MCP server returned HTTP ${res.status}`);
    const body = (await res.json()) as JsonRpcResponse<T>;
    if (body.error) throw new Error(`MCP error ${body.error.code}: ${body.error.message}`);
    if (body.result === undefined) throw new Error(`MCP response missing 'result' field`);
    return body.result;
  } finally {
    clearTimeout(t);
  }
}

export async function listTools(opts: McpClientOptions): Promise<McpTool[]> {
  const result = await rpc<{ tools?: McpTool[] }>(opts, "tools/list");
  return result.tools || [];
}

export async function callTool(
  opts: McpClientOptions,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return rpc<unknown>(opts, "tools/call", { name, arguments: args });
}

export async function initialize(opts: McpClientOptions): Promise<unknown> {
  return rpc<unknown>(opts, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    clientInfo: { name: "finsyt-platform", version: "1.0.0" },
  });
}

/**
 * Build the auth header set from a connection's stored credentials.
 *
 * Accepts both snake_case (`api_key`, `access_token`, `header_name`) and
 * camelCase (`apiKey`, `accessToken`, `headerName`) keys so credentials
 * saved by either UI version (older Hub form was camelCase) keep working.
 */
export function authHeadersFromCreds(authType: string, creds: Record<string, string>): Record<string, string> {
  switch (authType) {
    case "bearer":
    case "oauth2": {
      const t = creds.access_token || creds.accessToken || creds.bearer || creds.token || creds.api_key || creds.apiKey || "";
      return t ? { Authorization: `Bearer ${t}` } : {};
    }
    case "api_key_header": {
      const name = creds.header_name || creds.headerName || "X-API-Key";
      const value = creds.api_key || creds.apiKey || creds.token || "";
      return value ? { [name]: value } : {};
    }
    case "basic": {
      const user = creds.username || creds.user || "";
      const pass = creds.password || creds.pass || "";
      if (!user && !pass) return {};
      return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` };
    }
    default:
      return {};
  }
}
