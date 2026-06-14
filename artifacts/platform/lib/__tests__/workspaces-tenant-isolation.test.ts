/**
 * Workspace source tenant- and workspace-isolation tests. sourceIds are
 * namespaced `${userId}:${localId}`; chat/studio routes call
 * `resolveAuthorizedSourceIds(userId, workspaceId, ids)` which intersects
 * by both axes. These tests pin both behaviors. Supabase env vars are
 * unset so the store falls back to its in-memory map.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  __resetMemoryStoreForTests,
  deleteSource,
  getManySources,
  listSourcesForUser,
  resolveAuthorizedSourceIds,
  saveSource,
} from "../../app/api/workspaces/store.ts"

const ALICE = "user_alice"
const BOB = "user_bob"

function reset() {
  __resetMemoryStoreForTests()
}

test("listSourcesForUser only returns rows with the caller's prefix", async () => {
  reset()
  await saveSource(`${ALICE}:doc-1`, "Alice CIM", "pdf", ["chunk a1"], { byteSize: 1234, hash: "deadbeef", origin: "upload" })
  await saveSource(`${ALICE}:doc-2`, "Alice Q3 deck", "pptx", ["chunk a2"], { byteSize: 4567, origin: "upload" })
  await saveSource(`${BOB}:doc-1`, "Bob secret model", "xlsx", ["chunk b1"], { byteSize: 999, origin: "upload" })

  const aliceSources = await listSourcesForUser(ALICE)
  assert.equal(aliceSources.length, 2, "Alice should see exactly her two sources")
  for (const s of aliceSources) {
    assert.ok(s.sourceId.startsWith(`${ALICE}:`), `leaked source: ${s.sourceId}`)
  }

  const bobSources = await listSourcesForUser(BOB)
  assert.equal(bobSources.length, 1)
  assert.equal(bobSources[0].sourceId, `${BOB}:doc-1`)
})

test("deleteSource refuses cross-tenant deletes", async () => {
  reset()
  await saveSource(`${ALICE}:secret`, "Alice file", "pdf", ["chunk"])
  await saveSource(`${BOB}:other`, "Bob file", "pdf", ["chunk"])

  // Bob attempts to delete Alice's file — must be rejected before storage.
  const forbidden = await deleteSource(BOB, `${ALICE}:secret`)
  assert.equal(forbidden.ok, false)
  assert.equal(forbidden.reason, "forbidden")

  const aliceStill = await listSourcesForUser(ALICE)
  assert.equal(aliceStill.length, 1, "Alice's file must survive a cross-tenant delete")

  // Bob can delete his own file.
  const ok = await deleteSource(BOB, `${BOB}:other`)
  assert.equal(ok.ok, true)
  const bobAfter = await listSourcesForUser(BOB)
  assert.equal(bobAfter.length, 0)
})

test("getManySources returns chunks regardless of caller — guard MUST live in the route", async () => {
  // Routes call resolveAuthorizedSourceIds before getManySources.
  reset()
  await saveSource(`${ALICE}:a`, "A", "pdf", ["alice-chunk"])
  await saveSource(`${BOB}:b`, "B", "pdf", ["bob-chunk"])

  const got = await getManySources([`${ALICE}:a`, `${BOB}:b`])
  assert.equal(got.size, 2)
  assert.equal(got.get(`${ALICE}:a`)?.chunks[0], "alice-chunk")
  assert.equal(got.get(`${BOB}:b`)?.chunks[0], "bob-chunk")
})

test("prefix filter strips ids belonging to other tenants", () => {
  // Stand-alone tenant-prefix sanity check (per-id form). Workspace-scoped
  // path is exercised by the resolveAuthorizedSourceIds tests below.
  const callerId = ALICE
  const incoming: unknown[] = [
    `${ALICE}:doc-1`,
    `${ALICE}:doc-2`,
    `${BOB}:secret-stolen-id`, // attacker tries to inject Bob's id
    "user_alice2:lookalike",   // prefix similarity attack
    null,
    42,
  ]
  const filtered = incoming.filter(
    (id): id is string => typeof id === "string" && id.startsWith(`${callerId}:`),
  )
  assert.deepEqual(filtered, [`${ALICE}:doc-1`, `${ALICE}:doc-2`])
})

test("listSourcesForUser is empty for an unknown user", async () => {
  reset()
  await saveSource(`${ALICE}:a`, "A", "pdf", ["x"])
  const out = await listSourcesForUser("user_eve")
  assert.equal(out.length, 0)
})

// Cross-workspace isolation cases.
const WORKSPACE_A = "11111111-1111-1111-1111-111111111111"
const WORKSPACE_B = "22222222-2222-2222-2222-222222222222"

test("resolveAuthorizedSourceIds drops sources from a different workspace owned by the same user", async () => {
  reset()
  await saveSource(`${ALICE}:in-a`, "Workspace A CIM", "pdf", ["a-chunk"], { workspaceId: WORKSPACE_A })
  await saveSource(`${ALICE}:in-b`, "Workspace B CIM", "pdf", ["b-chunk"], { workspaceId: WORKSPACE_B })

  const allowed = await resolveAuthorizedSourceIds(
    ALICE,
    WORKSPACE_A,
    [`${ALICE}:in-a`, `${ALICE}:in-b`],
  )
  assert.deepEqual(allowed.sort(), [`${ALICE}:in-a`].sort())
})

test("resolveAuthorizedSourceIds returns the full workspace set when caller passes null", async () => {
  reset()
  await saveSource(`${ALICE}:a1`, "A1", "pdf", ["x"], { workspaceId: WORKSPACE_A })
  await saveSource(`${ALICE}:a2`, "A2", "pdf", ["x"], { workspaceId: WORKSPACE_A })
  await saveSource(`${ALICE}:b1`, "B1", "pdf", ["x"], { workspaceId: WORKSPACE_B })

  const allowed = await resolveAuthorizedSourceIds(ALICE, WORKSPACE_A, null)
  assert.equal(allowed.length, 2)
  for (const id of allowed) assert.ok(id.startsWith(`${ALICE}:a`), `bad id: ${id}`)
})

test("resolveAuthorizedSourceIds rejects cross-tenant sourceIds even if the workspace matches by guess", async () => {
  reset()
  await saveSource(`${ALICE}:secret`, "Alice secret", "pdf", ["x"], { workspaceId: WORKSPACE_A })
  await saveSource(`${BOB}:public`,   "Bob public",   "pdf", ["x"], { workspaceId: WORKSPACE_A })

  const allowed = await resolveAuthorizedSourceIds(
    BOB,
    WORKSPACE_A,
    [`${ALICE}:secret`, `${BOB}:public`],
  )
  assert.deepEqual(allowed, [`${BOB}:public`])
})

test("resolveAuthorizedSourceIds with workspaceId=null falls back to the tenant-only scope", async () => {
  reset()
  await saveSource(`${ALICE}:a`, "A", "pdf", ["x"], { workspaceId: WORKSPACE_A })
  await saveSource(`${ALICE}:b`, "B", "pdf", ["x"], { workspaceId: WORKSPACE_B })
  await saveSource(`${BOB}:c`,   "C", "pdf", ["x"], { workspaceId: WORKSPACE_A })

  const allowed = await resolveAuthorizedSourceIds(ALICE, null, [`${ALICE}:a`, `${ALICE}:b`, `${BOB}:c`])
  assert.deepEqual(allowed.sort(), [`${ALICE}:a`, `${ALICE}:b`].sort())
})

test("listSourcesForUser ?workspaceId style filtering scopes to the workspace", async () => {
  reset()
  await saveSource(`${ALICE}:a1`, "A1", "pdf", ["x"], { workspaceId: WORKSPACE_A })
  await saveSource(`${ALICE}:b1`, "B1", "pdf", ["x"], { workspaceId: WORKSPACE_B })

  const all = await listSourcesForUser(ALICE)
  const workspaceA = all.filter((r) => r.workspaceId === WORKSPACE_A)
  assert.equal(workspaceA.length, 1)
  assert.equal(workspaceA[0].sourceId, `${ALICE}:a1`)
})

test("reopen diligence workspace: hydrated sources query successfully via chat path", async () => {
  reset()
  // Simulate a previous session ingest into workspace A.
  await saveSource(
    `${ALICE}:cim-2024`,
    "Project Atlas CIM",
    "pdf",
    ["Atlas Corp generated $42M of revenue in FY2024 with 28% EBITDA margin."],
    { workspaceId: WORKSPACE_A, byteSize: 12345, hash: "deadbeef", origin: "upload" },
  )

  // 1. Hydration step (mirrors WorkspacesInner first-mount fetch).
  const hydrated = (await listSourcesForUser(ALICE)).filter(r => r.workspaceId === WORKSPACE_A)
  assert.equal(hydrated.length, 1)
  const hydratedIds = hydrated.map(r => r.sourceId)

  // 2. Chat send step (mirrors the chat route: authz -> fetch chunks).
  const allowed = await resolveAuthorizedSourceIds(ALICE, WORKSPACE_A, hydratedIds)
  assert.deepEqual(allowed, [`${ALICE}:cim-2024`])
  const chunks = await getManySources(allowed)
  assert.equal(chunks.size, 1)
  assert.match(chunks.get(`${ALICE}:cim-2024`)!.chunks[0]!, /Atlas Corp/)
})
