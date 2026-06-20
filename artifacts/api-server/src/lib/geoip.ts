/**
 * Best-effort country derivation for an inbound request.
 *
 * Most edge proxies (Cloudflare, Vercel, Fly, Render) inject an ISO country
 * code header alongside the forwarded IP. We read whichever one is present
 * and return `null` if none are. This deliberately avoids bundling a GeoIP
 * database in the API server; for a richer lookup, replace this helper with
 * a MaxMind/ipapi-backed service.
 */
import type { Request } from "express";

const COUNTRY_HEADERS = [
  "cf-ipcountry",            // Cloudflare
  "x-vercel-ip-country",     // Vercel Edge
  "x-country-code",          // Generic
  "fly-client-country",      // Fly.io
  "x-appengine-country",     // Google App Engine
] as const;

function readHeader(req: Request, name: string): string | null {
  const v = req.headers[name];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export function getCountry(req: Request): string | null {
  for (const h of COUNTRY_HEADERS) {
    const v = readHeader(req, h);
    if (v && v !== "XX" && v !== "ZZ") return v.toUpperCase();
  }
  return null;
}
