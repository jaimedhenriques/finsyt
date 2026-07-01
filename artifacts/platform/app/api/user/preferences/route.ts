import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth-server'
import {
  withClerkUserContext,
  userPreferencesTable,
  userPreferencesPatchSchema,
  type UserPreferencesRow,
} from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Default preferences returned when the signed-in user has not saved any yet.
// Mirrors the column defaults on `user_preferences` so a brand-new row and a
// "no row yet" response are indistinguishable to the client.
const DEFAULT_PREFS = {
  dataSourcesFooterEnabled: true,
  dataSourcesFooterCollapsed: false,
} as const

function serialize(row: UserPreferencesRow) {
  return {
    dataSourcesFooterEnabled: row.dataSourcesFooterEnabled,
    dataSourcesFooterCollapsed: row.dataSourcesFooterCollapsed,
    updatedAt: row.updatedAt.getTime(),
  }
}

// GET /api/user/preferences — returns the signed-in user's persisted
// preference row, or the column defaults when nothing has been saved yet.
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Defense-in-depth: the (user_id) filter mirrors the RLS select policy so
  // tenant isolation holds even if a privileged connection role bypasses RLS.
  const rows = await withClerkUserContext(userId, (tx) =>
    tx
      .select()
      .from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, userId))
      .limit(1),
  )

  if (rows.length === 0) {
    return NextResponse.json({ preferences: { ...DEFAULT_PREFS, updatedAt: null } })
  }
  return NextResponse.json({ preferences: serialize(rows[0]) })
}

// PATCH /api/user/preferences — upsert the signed-in user's row. Both flags
// are optional in the body; unspecified fields keep their existing value (or
// the column default if the row is being created on first write).
export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    raw = {}
  }
  const parsed = userPreferencesPatchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const now = new Date()
  const [row] = await withClerkUserContext(userId, (tx) =>
    tx
      .insert(userPreferencesTable)
      .values({
        userId,
        dataSourcesFooterEnabled:
          parsed.data.dataSourcesFooterEnabled ?? DEFAULT_PREFS.dataSourcesFooterEnabled,
        dataSourcesFooterCollapsed:
          parsed.data.dataSourcesFooterCollapsed ?? DEFAULT_PREFS.dataSourcesFooterCollapsed,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userPreferencesTable.userId,
        // Only overwrite the columns the client explicitly sent, so a PATCH
        // with one flag does not clobber the other.
        set: {
          ...(parsed.data.dataSourcesFooterEnabled !== undefined && {
            dataSourcesFooterEnabled: parsed.data.dataSourcesFooterEnabled,
          }),
          ...(parsed.data.dataSourcesFooterCollapsed !== undefined && {
            dataSourcesFooterCollapsed: parsed.data.dataSourcesFooterCollapsed,
          }),
          updatedAt: now,
        },
      })
      .returning(),
  )

  return NextResponse.json({ preferences: serialize(row) })
}
