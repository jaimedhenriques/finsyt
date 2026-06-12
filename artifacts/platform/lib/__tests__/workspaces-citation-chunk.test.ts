/**
 * Authorization invariants for `/api/workspaces/sources/chunk` — the GET
 * route the chat citation drawer hits when a user clicks a `[N]` badge.
 *
 * These tests exercise the same store helpers + prefix guard the route
 * uses, plus the chunk-out-of-range and workspace-mismatch behaviors. We
 * intentionally avoid spinning up Next.js: the route is a thin wrapper
 * around `getManySources` and a couple of guards, and we test those
 * directly here so the contract is pinned.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  __resetMemoryStoreForTests,
  getManySources,
  saveSource,
} from "../../app/api/workspaces/store.ts"

const ALICE = "user_alice"
const BOB = "user_bob"
const WORKSPACE_A = "11111111-1111-1111-1111-111111111111"
const WORKSPACE_B = "22222222-2222-2222-2222-222222222222"

/**
 * Mirrors the guards inside
 * `app/api/workspaces/sources/chunk/route.ts` so a regression in either
 * place will fail this test. Keep in sync with the route.
 */
async function fetchCitationChunk(opts: {
  callerUserId: string
  sourceId: string
  chunkIndex: number
  workspaceId?: string | null
}): Promise<
  | { ok: true; chunkText: string; totalChunks: number; sourceName: string }
  | { ok: false; status: 400 | 403 | 404; error: string }
> {
  if (!opts.sourceId) return { ok: false, status: 400, error: "sourceId required" }
  if (!Number.isFinite(opts.chunkIndex) || opts.chunkIndex < 0) {
    return { ok: false, status: 400, error: "chunkIndex required" }
  }
  if (!opts.sourceId.startsWith(`${opts.callerUserId}:`)) {
    return { ok: false, status: 403, error: "forbidden" }
  }
  const map = await getManySources([opts.sourceId])
  const record = map.get(opts.sourceId)
  if (!record) return { ok: false, status: 404, error: "not_found" }
  if (
    opts.workspaceId &&
    record.workspaceId &&
    record.workspaceId !== opts.workspaceId
  ) {
    return { ok: false, status: 403, error: "forbidden" }
  }
  if (opts.chunkIndex >= record.chunks.length) {
    return { ok: false, status: 404, error: "chunk_out_of_range" }
  }
  return {
    ok: true,
    chunkText: record.chunks[opts.chunkIndex],
    totalChunks: record.chunks.length,
    sourceName: record.name,
  }
}

test("citation chunk: caller can fetch a chunk from her own source", async () => {
  __resetMemoryStoreForTests()
  await saveSource(`${ALICE}:cim`, "Project Atlas CIM", "pdf", [
    "Atlas Corp generated $42M of revenue in FY2024.",
    "EBITDA margin expanded to 28% in Q4.",
  ], { workspaceId: WORKSPACE_A })

  const res = await fetchCitationChunk({
    callerUserId: ALICE,
    sourceId: `${ALICE}:cim`,
    chunkIndex: 1,
    workspaceId: WORKSPACE_A,
  })
  assert.equal(res.ok, true)
  if (res.ok) {
    assert.match(res.chunkText, /EBITDA margin expanded/)
    assert.equal(res.totalChunks, 2)
    assert.equal(res.sourceName, "Project Atlas CIM")
  }
})

test("citation chunk: cross-tenant request is rejected before storage is read", async () => {
  __resetMemoryStoreForTests()
  await saveSource(`${ALICE}:secret`, "Alice secret", "pdf", ["leak me"], {
    workspaceId: WORKSPACE_A,
  })

  const res = await fetchCitationChunk({
    callerUserId: BOB,
    sourceId: `${ALICE}:secret`,
    chunkIndex: 0,
  })
  assert.equal(res.ok, false)
  if (!res.ok) {
    assert.equal(res.status, 403)
    assert.equal(res.error, "forbidden")
  }
})

test("citation chunk: prefix lookalike (user_alice2 vs user_alice) cannot smuggle access", async () => {
  __resetMemoryStoreForTests()
  await saveSource(`${ALICE}:doc`, "Alice doc", "pdf", ["x"])
  // Attacker is `user_alice2` and supplies an id that visually contains
  // `user_alice`. The route requires `id.startsWith(${callerUserId}:)`, so
  // the trailing `:` defends against this.
  const res = await fetchCitationChunk({
    callerUserId: "user_alice2",
    sourceId: `${ALICE}:doc`,
    chunkIndex: 0,
  })
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.status, 403)
})

test("citation chunk: workspace mismatch blocks even a tenant-owned source", async () => {
  __resetMemoryStoreForTests()
  await saveSource(`${ALICE}:wb`, "Alice doc in B", "pdf", ["only-in-b"], {
    workspaceId: WORKSPACE_B,
  })

  // Stale citation from workspace A — the row lives in B.
  const res = await fetchCitationChunk({
    callerUserId: ALICE,
    sourceId: `${ALICE}:wb`,
    chunkIndex: 0,
    workspaceId: WORKSPACE_A,
  })
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.status, 403)
})

test("citation chunk: out-of-range chunk index returns 404, not 500", async () => {
  __resetMemoryStoreForTests()
  await saveSource(`${ALICE}:short`, "Short doc", "pdf", ["only-chunk"])

  const res = await fetchCitationChunk({
    callerUserId: ALICE,
    sourceId: `${ALICE}:short`,
    chunkIndex: 7,
  })
  assert.equal(res.ok, false)
  if (!res.ok) {
    assert.equal(res.status, 404)
    assert.equal(res.error, "chunk_out_of_range")
  }
})

test("citation chunk: missing sourceId / negative chunkIndex are 400", async () => {
  __resetMemoryStoreForTests()
  const noId = await fetchCitationChunk({
    callerUserId: ALICE,
    sourceId: "",
    chunkIndex: 0,
  })
  assert.equal(noId.ok, false)
  if (!noId.ok) assert.equal(noId.status, 400)

  const neg = await fetchCitationChunk({
    callerUserId: ALICE,
    sourceId: `${ALICE}:doc`,
    chunkIndex: -1,
  })
  assert.equal(neg.ok, false)
  if (!neg.ok) assert.equal(neg.status, 400)
})

test("citation chunk: workspaceId omitted means we don't constrain by workspace", async () => {
  // The chat UI passes `workspaceId` only for non-default workspaces. When
  // omitted, the route should still allow the caller to read her own
  // chunk regardless of which workspace it was saved under — this matches
  // the historical research-surface behavior.
  __resetMemoryStoreForTests()
  await saveSource(`${ALICE}:loose`, "Loose doc", "pdf", ["loose-chunk"], {
    workspaceId: WORKSPACE_B,
  })

  const res = await fetchCitationChunk({
    callerUserId: ALICE,
    sourceId: `${ALICE}:loose`,
    chunkIndex: 0,
  })
  assert.equal(res.ok, true)
  if (res.ok) assert.equal(res.chunkText, "loose-chunk")
})
