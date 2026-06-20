import type { Request } from "express";
import { config } from "./config";

/**
 * Returns the canonical client IP address for rate limiting and abuse guards.
 *
 * When `TRUSTED_PROXY_IPS` is configured, Express's `trust proxy` is set to
 * exactly those IPs, so `req.ip` is safely derived by walking X-Forwarded-For
 * only through the verified proxy chain. We use `req.ip` in that case.
 *
 * When no trusted proxies are configured, `trust proxy` is disabled and
 * `req.ip` equals the raw TCP socket address — same as `req.socket.remoteAddress`.
 * We read `req.socket.remoteAddress` directly so that the intent is explicit
 * and cannot be silently changed by toggling `trust proxy` elsewhere.
 *
 * `req.socket.remoteAddress` is always the address of the peer that opened the
 * TCP connection; it cannot be spoofed via HTTP headers. This is the correct
 * fallback when no authenticated proxy chain is in place.
 */
export function getClientIp(req: Request): string {
  if (config.trustedProxyList.length > 0) {
    return req.ip ?? req.socket.remoteAddress ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}
