import { randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Per-process internal-bypass secret.
 *
 * Some internal POST handlers (e.g. /api/dcf, /api/agent/persona) consume
 * paid upstream resources and require either a Clerk session or a Bearer
 * API key. When the public v1 mirror has already validated a Bearer key,
 * it composes a `new NextRequest()` against the inner handler — at that
 * point we want the inner handler to skip its Clerk check.
 *
 * A static header value (e.g. `x-finsyt-internal-call: 1`) would be
 * trivially spoofable by any external caller. Instead we generate a
 * fresh 32-byte random token at module load time. The token never leaves
 * this Node.js process — outbound responses do not include it, the public
 * mirrors only attach it to the synthetic in-process NextRequest, and the
 * inner handler verifies the token with `timingSafeEqual`.
 *
 * After a process restart the token rotates automatically.
 */
export const INTERNAL_BYPASS_HEADER = 'x-finsyt-internal-bypass'

const INTERNAL_BYPASS_TOKEN: string = randomBytes(32).toString('hex')

export function internalBypassHeaderValue(): string {
  return INTERNAL_BYPASS_TOKEN
}

/**
 * Constant-time comparison of a request header value against the
 * per-process internal-bypass token. Returns true ONLY when the inbound
 * header matches our in-process secret. Safe against timing attacks.
 */
export function isInternalBypass(headerValue: string | null | undefined): boolean {
  if (!headerValue || typeof headerValue !== 'string') return false
  // timingSafeEqual requires equal-length buffers — reject early on mismatch.
  const a = Buffer.from(headerValue)
  const b = Buffer.from(INTERNAL_BYPASS_TOKEN)
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
