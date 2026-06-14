/**
 * Alias for `/api/agent/ask` introduced when the in-app assistant was
 * renamed to "Finsyt Agent". Existing clients calling `/api/agent/ask`
 * keep working.
 *
 * Next.js's static analyser cannot follow re-exported `runtime` / `dynamic`
 * across files, so we re-declare them locally and re-export only `POST`.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export { POST } from '../../agent/ask/route'
