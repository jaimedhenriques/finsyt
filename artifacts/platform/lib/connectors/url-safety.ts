/**
 * Outbound URL safety / SSRF guard for the Connector Hub.
 *
 * Even though only org admins can register custom REST/MCP endpoints, an
 * admin should never be able to point a connector at the host's internal
 * network — doing so would let them exfiltrate cloud-metadata creds, hit
 * unprotected internal services, or scan the VPC.
 *
 * Policy
 *   - Only `http:` and `https:` are allowed.
 *   - Hostnames that resolve (or are written) as loopback, link-local,
 *     RFC1918 private ranges, IPv6 ULAs, the metadata IPs (169.254.169.254,
 *     fd00:ec2::254) or `*.internal` / `*.local` are rejected.
 *   - Numeric-IP hosts are checked literally.
 *   - DNS hostnames are resolved at call time (Node `dns.lookup`) so a
 *     trickster can't paper over the check by registering `evil.example.com`
 *     that resolves to 169.254.169.254 — re-validated on every call.
 *
 * The functions throw `UrlSafetyError` on rejection so callers can map to a
 * 400 / 502 with a useful message.
 */
import { lookup } from "node:dns/promises";
import net from "node:net";

export class UrlSafetyError extends Error {
  constructor(message: string, public readonly reason: string) {
    super(message);
    this.name = "UrlSafetyError";
  }
}

const HOST_DENYLIST = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

const SUFFIX_DENYLIST = [".internal", ".local", ".localhost"];

/** Quick string-level checks before we even try DNS. */
function classifyIpv4(ip: string): { kind: string; deny: boolean } | null {
  if (!net.isIPv4(ip)) return null;
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  if (a === 127) return { kind: "loopback", deny: true };
  if (a === 10) return { kind: "rfc1918-10", deny: true };
  if (a === 0) return { kind: "this-network", deny: true };
  if (a === 169 && b === 254) return { kind: "link-local/metadata", deny: true };
  if (a === 172 && b >= 16 && b <= 31) return { kind: "rfc1918-172", deny: true };
  if (a === 192 && b === 168) return { kind: "rfc1918-192", deny: true };
  if (a === 100 && b >= 64 && b <= 127) return { kind: "cgnat", deny: true };
  if (a >= 224) return { kind: "multicast/reserved", deny: true };
  return { kind: "public", deny: false };
}

function classifyIpv6(ip: string): { kind: string; deny: boolean } | null {
  if (!net.isIPv6(ip)) return null;
  const lower = ip.toLowerCase();
  if (lower === "::1") return { kind: "loopback", deny: true };
  if (lower === "::") return { kind: "unspecified", deny: true };
  if (lower.startsWith("fe80:")) return { kind: "link-local", deny: true };
  if (lower.startsWith("fc") || lower.startsWith("fd")) return { kind: "unique-local", deny: true };
  if (lower.startsWith("ff")) return { kind: "multicast", deny: true };
  if (lower === "fd00:ec2::254") return { kind: "ec2-metadata", deny: true };
  // Map to v4-equivalent for ::ffff:a.b.c.d
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    const c = classifyIpv4(v4);
    if (c) return c;
  }
  return { kind: "public", deny: false };
}

function classifyHostString(host: string): { kind: string; deny: boolean } {
  // Node's `URL.hostname` keeps the surrounding brackets for IPv6 literals
  // (e.g. `http://[::1]/` → hostname `[::1]`). Strip them before any IP
  // classification so loopback / unique-local IPv6 don't slip through.
  let h = host.toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (h === "localhost") return { kind: "localhost", deny: true };
  if (HOST_DENYLIST.has(h)) return { kind: "metadata", deny: true };
  if (SUFFIX_DENYLIST.some((s) => h.endsWith(s))) return { kind: "internal-suffix", deny: true };
  return classifyIpv4(h) ?? classifyIpv6(h) ?? { kind: "public", deny: false };
}

/**
 * Validate a URL synchronously (no DNS). Use this at user-input time —
 * e.g. POST /connections — to reject obviously bad inputs early.
 */
export function assertSafeUrlSync(rawUrl: string, kind: "rest" | "mcp" = "rest"): URL {
  let u: URL;
  try { u = new URL(rawUrl); }
  catch { throw new UrlSafetyError(`Invalid ${kind} URL: ${rawUrl}`, "parse"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new UrlSafetyError(`Only http/https are supported (got ${u.protocol})`, "scheme");
  }
  // Strip surrounding [ ] for IPv6 literals; URL.hostname does that already
  const c = classifyHostString(u.hostname);
  if (c.deny) {
    throw new UrlSafetyError(
      `Refusing to connect to ${kind === "mcp" ? "MCP" : "REST"} host '${u.hostname}' (${c.kind})`,
      c.kind,
    );
  }
  return u;
}

/**
 * Validate at call time, including DNS resolution. Re-validates the host's
 * resolved IPs on every call so a DNS-rebinding attacker cannot point a
 * previously-public hostname at an internal IP between connect & call.
 */
export async function assertSafeUrl(rawUrl: string, kind: "rest" | "mcp" = "rest"): Promise<URL> {
  const u = assertSafeUrlSync(rawUrl, kind);
  // If hostname is already a numeric IP, the sync check is sufficient.
  if (net.isIP(u.hostname)) return u;
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(u.hostname, { all: true });
  } catch (err) {
    throw new UrlSafetyError(`DNS lookup failed for ${u.hostname}: ${(err as Error).message}`, "dns");
  }
  for (const a of addrs) {
    const c = classifyHostString(a.address);
    if (c.deny) {
      throw new UrlSafetyError(
        `Host ${u.hostname} resolves to ${a.address} (${c.kind}) — refusing to connect`,
        c.kind,
      );
    }
  }
  return u;
}
