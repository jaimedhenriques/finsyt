/**
 * Tests for the smarter workspace-chat retriever in
 * `app/api/workspaces/retrieval.ts`. These pin the two big behaviour
 * promises the citation UI depends on:
 *
 *   1. BM25 surfaces the on-topic chunk over a vocabulary-matching but
 *      irrelevant boilerplate chunk — the failure mode the legacy
 *      "count overlapping words" scorer hit constantly.
 *   2. When per-chunk embeddings are present and a query embedding is
 *      provided, cosine similarity drives ranking and BM25 is used only
 *      as a small tie-breaker boost.
 *
 * The cosine-path tests use synthetic vectors directly — no network — so
 * they're stable in CI and don't depend on `OPENAI_API_KEY`.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  bm25Scores,
  cosineSimilarity,
  rankChunks,
  tokenize,
} from "../../app/api/workspaces/retrieval.ts"

test("tokenize: drops stop-words but keeps numbers and percentages", () => {
  const tokens = tokenize("What was the FY2024 EBITDA margin? It was 28% in Q4.")
  // Stop-words ("what", "was", "the", "it", "in") are dropped; numbers, %,
  // and identifiers survive — financial questions need them.
  assert.ok(tokens.includes("fy2024"))
  assert.ok(tokens.includes("ebitda"))
  assert.ok(tokens.includes("margin"))
  assert.ok(tokens.includes("28%"))
  assert.ok(tokens.includes("q4"))
  assert.ok(!tokens.includes("the"))
  assert.ok(!tokens.includes("was"))
})

test("bm25Scores: prefers an on-topic chunk over keyword-matching boilerplate", () => {
  // The boilerplate chunk parrots the question's vocabulary ("revenue",
  // "guidance", "EBITDA", "margin") inside a forward-looking-statements
  // passage that doesn't actually answer anything. The on-topic chunk is
  // shorter and uses the terms in context. Old retriever failed this case.
  const onTopic =
    "FY2024 EBITDA margin expanded to 28% on operating leverage from new ARR cohorts, with revenue of $42M."
  const boilerplate = [
    "Forward-looking statements: This document includes forward-looking statements relating to revenue,",
    "guidance, EBITDA, margin, growth, expectations, and other terms about future performance that involve",
    "risks and uncertainties. Such terms — revenue, guidance, EBITDA, margin, expectations, plans, and",
    "outlook — should not be relied upon. Revenue and EBITDA references are illustrative.",
  ].join(" ")
  const unrelated = "Board meeting minutes from January 2022 — quorum reached and prior minutes approved."

  const query = "What was FY2024 EBITDA margin and revenue?"
  const scores = bm25Scores([boilerplate, onTopic, unrelated], query)
  assert.ok(scores[1] > scores[0], `on-topic ${scores[1]} should beat boilerplate ${scores[0]}`)
  assert.ok(scores[1] > scores[2], `on-topic ${scores[1]} should beat unrelated ${scores[2]}`)
})

test("cosineSimilarity: returns 0 for mismatched lengths and zero vectors", () => {
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2]), 0)
  assert.equal(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0)
  // Identical direction vectors → 1.
  assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [2, 0, 0]) - 1) < 1e-9)
  // Orthogonal vectors → 0.
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0)
})

test("rankChunks: cosine path beats keyword-only path when embeddings are present", () => {
  // Two chunks: one is the actual answer (semantically near the query) but
  // shares few exact tokens with it; the other is a glossary that shares
  // many exact tokens but is semantically far. Without embeddings BM25
  // would pick the glossary; with embeddings cosine should pull the answer
  // to the top.
  const answer = "Net dollar retention reached 118% in the latest fiscal year."
  const glossary =
    "Glossary: NDR, ARR, GRR, NRR, dollar retention, net retention, gross retention, churn, expansion."
  const query = "what is the company's net dollar retention rate?"

  const candidates = [
    {
      sourceId: "u:doc",
      sourceName: "doc",
      sourceType: "pdf",
      chunkIndex: 0,
      text: answer,
      // Synthetic 4-d embedding: aligned with the query vector below.
      embedding: [0.9, 0.1, 0.0, 0.0],
    },
    {
      sourceId: "u:doc",
      sourceName: "doc",
      sourceType: "pdf",
      chunkIndex: 1,
      text: glossary,
      embedding: [0.0, 0.0, 1.0, 0.0],
    },
  ]
  const queryEmbedding = [1.0, 0.0, 0.0, 0.0]

  const ranked = rankChunks(candidates, query, queryEmbedding, 2)
  assert.equal(ranked.length, 2)
  assert.equal(ranked[0].chunkIndex, 0, "cosine should put the answer first")
  assert.equal(ranked[1].chunkIndex, 1)

  // Sanity check: with no query embedding, BM25 alone would prefer the
  // glossary on this query because it overlaps more keywords.
  const rankedNoEmbed = rankChunks(
    candidates.map((c) => ({ ...c, embedding: null })),
    query,
    null,
    2,
  )
  assert.equal(rankedNoEmbed[0].chunkIndex, 1)
})

test("rankChunks: drops zero-score chunks and respects topK", () => {
  const candidates = [
    { sourceId: "u:s", sourceName: "s", sourceType: "pdf", chunkIndex: 0, text: "alpha beta gamma" },
    { sourceId: "u:s", sourceName: "s", sourceType: "pdf", chunkIndex: 1, text: "totally unrelated content" },
    { sourceId: "u:s", sourceName: "s", sourceType: "pdf", chunkIndex: 2, text: "alpha gamma delta" },
  ]
  const ranked = rankChunks(candidates, "alpha gamma", null, 5)
  // Two chunks contain the query terms, one doesn't — that one must be
  // dropped, not merely sorted to the bottom.
  assert.equal(ranked.length, 2)
  for (const r of ranked) assert.ok(r.text.includes("alpha"))
})

test("rankChunks: empty inputs are safe", () => {
  assert.deepEqual(rankChunks([], "anything", null, 8), [])
  const ranked = rankChunks(
    [{ sourceId: "u:s", sourceName: "s", sourceType: "pdf", chunkIndex: 0, text: "hello world" }],
    "",
    null,
    8,
  )
  // Empty query → no terms → BM25 returns 0 → chunk dropped.
  assert.equal(ranked.length, 0)
})

test("rankChunks: hybrid uses BM25 only as a tie-breaker, not as a dominant signal", () => {
  // Two chunks with near-identical cosine. The one matching the query's
  // exact tokens should come first via the BM25 boost, but a chunk with
  // strictly worse cosine cannot overtake the better-cosine chunk just by
  // packing in keywords.
  const query = "alpha beta"
  const candidates = [
    {
      sourceId: "u:s", sourceName: "s", sourceType: "pdf", chunkIndex: 0,
      text: "the answer",
      embedding: [1.0, 0.0],
    },
    {
      sourceId: "u:s", sourceName: "s", sourceType: "pdf", chunkIndex: 1,
      text: "alpha beta alpha beta alpha beta",
      // Strictly worse cosine: orthogonal to the query.
      embedding: [0.0, 1.0],
    },
  ]
  const ranked = rankChunks(candidates, query, [1.0, 0.0], 2)
  assert.equal(ranked[0].chunkIndex, 0, "high-cosine chunk should still beat keyword-stuffed chunk")
})
