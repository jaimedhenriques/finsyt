import { db, organizationsTable } from '@workspace/db'
import { eq } from 'drizzle-orm'

/**
 * Map a Clerk org id (e.g. `org_2abc…`) to the local `organizations.id`
 * UUID used by RLS-keyed-by-uuid tables (research_notes, chat_messages, …).
 *
 * The local row is provisioned on first use, with the Clerk org id stored as
 * the unique slug so a single Clerk workspace always resolves to the same
 * UUID.
 *
 * `withOrgContext` requires a valid UUID — without this resolver, calling it
 * with the raw Clerk text id would throw and the entire request would 500.
 *
 * ── Privileged access by design ─────────────────────────────────────────────
 * `organizations` has FORCE ROW LEVEL SECURITY with a policy that only permits
 * access when `app.current_org_id` matches the row's own id. Because we do not
 * yet know the UUID (that's what we're resolving), we cannot enter an
 * `withOrgContext` block. This function therefore intentionally queries through
 * the privileged `db` pool that bypasses RLS — exactly the bootstrap pattern
 * documented in `lib/db/src/rls.sql`.
 *
 * Security guarantee: all user-facing queries happen inside `withOrgContext`
 * or `withClerkContext`, which drop to the `app_runtime` role (if
 * DB_RUNTIME_ROLE is set) and bind `app.current_org_id`. The startup call to
 * `assertRlsSafe()` (lib/db/src/index.ts) enforces that DB_RUNTIME_ROLE is
 * configured whenever the connection role is privileged, so a privileged pool
 * only reaches this bootstrap path — not ordinary tenant queries.
 */
const cache = new Map<string, string>()

export async function resolveLocalOrgId(clerkOrgId: string, orgName?: string | null): Promise<string> {
  const cached = cache.get(clerkOrgId)
  if (cached) return cached

  const found = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, clerkOrgId))
    .limit(1)

  if (found.length) {
    cache.set(clerkOrgId, found[0].id)
    return found[0].id
  }

  const [created] = await db
    .insert(organizationsTable)
    .values({ name: orgName || clerkOrgId, slug: clerkOrgId })
    .onConflictDoNothing({ target: organizationsTable.slug })
    .returning({ id: organizationsTable.id })

  if (created?.id) {
    cache.set(clerkOrgId, created.id)
    return created.id
  }

  // Race: another request created it between SELECT and INSERT — re-read.
  const again = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.slug, clerkOrgId))
    .limit(1)
  if (!again.length) throw new Error(`Could not resolve local org id for ${clerkOrgId}`)
  cache.set(clerkOrgId, again[0].id)
  return again[0].id
}
