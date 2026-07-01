import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, desc, eq, like } from 'drizzle-orm'
import { withOrgContext, researchNotesTable } from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'
import { isValidNoteKey, readNoteSymbol, MAX_NOTE_KEY_LEN } from '@/lib/note-keys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Notes are scoped per (org, ticker). The ticker is encoded as a leading
// `[SYMBOL]` prefix in `title` so we don't need a schema migration to filter
// by symbol. Body holds the user-authored markdown plus an optional pin block.
//
// IMPORTANT: research_notes.org_id is a UUID FK to `organizations.id`, *not*
// a Clerk text id (unlike screener_presets). We must therefore resolve the
// active Clerk org id to its local UUID and use `withOrgContext` (which sets
// `app.current_org_id` for RLS) — using `withClerkContext` against this table
// would silently miss every RLS policy and break inserts/selects.

interface NoteBody { symbol?: unknown; body?: unknown; title?: unknown }

// Note keys are validated by `isValidNoteKey` (see lib/note-keys): a public
// ticker OR a private-entity key like `PRIVATE:123`. Both shapes are free of
// SQL `like` wildcards (`%`, `_`) and whitespace before they are interpolated
// into the title-prefix filter below.

function tag(symbol: string, ts: number) { return `[${symbol}] ${new Date(ts).toISOString()}` }

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ notes: [], synced: false, reason: 'no_workspace' })

  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  // Accept a public ticker (BRK.B / BF-B) or a private-entity key
  // (PRIVATE:<id>). Both shapes are wildcard- and whitespace-free, so the value
  // cannot reach the SQL `like` clause as a wildcard. Anything else is rejected.
  if (!symbol || !isValidNoteKey(symbol)) {
    return NextResponse.json({ error: 'invalid symbol' }, { status: 400 })
  }

  const localOrgId = await resolveLocalOrgId(orgId)

  // Defense-in-depth: explicit org_id filter mirrors the RLS tenant-isolation
  // policy so cross-tenant reads are blocked at the query level even if the
  // connection role bypasses RLS. The title-prefix filter further narrows
  // results to the requested ticker.
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx.select()
      .from(researchNotesTable)
      .where(
        and(
          eq(researchNotesTable.orgId, localOrgId),
          like(researchNotesTable.title, `[${symbol}] %`),
        ),
      )
      .orderBy(desc(researchNotesTable.createdAt))
      .limit(200),
  )

  return NextResponse.json({
    synced: true,
    currentUserId: userId,
    notes: rows.map(r => ({
      id: r.id,
      ts: r.createdAt.getTime(),
      symbol: readNoteSymbol(r.title),
      body: r.body,
      authorUserId: r.authorUserId,
      mine: r.authorUserId === userId,
    })),
  })
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: NoteBody = {}
  try { raw = (await req.json()) as NoteBody } catch { /* fall through with empty body */ }
  const symbol = String(raw.symbol ?? '').toUpperCase().slice(0, MAX_NOTE_KEY_LEN)
  const text   = String(raw.body ?? '').slice(0, 50_000).trim()
  const title  = raw.title ? String(raw.title).slice(0, 200) : null
  if (!isValidNoteKey(symbol)) return NextResponse.json({ error: 'invalid symbol' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)
  const ts = Date.now()
  const finalTitle = title ? `[${symbol}] ${title}` : tag(symbol, ts)
  const [row] = await withOrgContext(localOrgId, (tx) =>
    tx.insert(researchNotesTable)
      .values({ orgId: localOrgId, authorUserId: userId, title: finalTitle, body: text })
      .returning(),
  )
  return NextResponse.json({
    note: { id: row.id, ts: row.createdAt.getTime(), symbol, body: row.body },
  }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const localOrgId = await resolveLocalOrgId(orgId)
  // Defense-in-depth: explicit (org_id, id, author_user_id) filter ensures the
  // delete is scoped to the current tenant and row-owner even if the connection
  // role bypasses RLS. .returning() lets us distinguish "not found / not yours"
  // (403) from a successful delete so the UI doesn't optimistically remove rows.
  const removed = await withOrgContext(localOrgId, (tx) =>
    tx.delete(researchNotesTable)
      .where(
        and(
          eq(researchNotesTable.id, id),
          eq(researchNotesTable.orgId, localOrgId),
          eq(researchNotesTable.authorUserId, userId),
        ),
      )
      .returning({ id: researchNotesTable.id }),
  )
  if (!removed.length) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })
  return NextResponse.json({ ok: true })
}
