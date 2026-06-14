/**
 * Smarter retrieval for workspace chat citations.
 *
 * The original `/api/workspaces/chat` retriever scored chunks by counting how
 * many >3-char question words appeared anywhere in each chunk. That picks up
 * boilerplate (forward-looking statements, glossaries, table-of-contents) any
 * time it shares vocabulary with the user's question, even when the chunk is
 * topically irrelevant. Reviewers clicking the resulting `[N]` badges quickly
 * lose trust in citations.
 *
 * This module provides two complementary scorers and a hybrid that blends
 * them. We always run BM25 — a well-known TF-IDF refinement that handles
 * term saturation and chunk length. When the operator has configured
 * `OPENAI_API_KEY`, we additionally compute (and persist) chunk embeddings
 * and rank primarily by cosine similarity, with BM25 as a small tie-breaker
 * boost. Embeddings are persisted on the `workspace_sources` row alongside
 * the chunks so we don't re-embed on every chat turn — the ingest pipeline
 * computes them once and a backfill script (`scripts/src/backfill-workspace-embeddings.ts`)
 * brings older rows up to date.
 *
 * Both code paths are deterministic: given the same chunks and query the
 * ranker returns the same top-K ordering. That makes citations stable from
 * one chat turn to the next, which the citation-drawer UX relies on.
 */

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","else","when","while","of","in",
  "on","at","by","for","to","from","as","is","are","was","were","be","been",
  "being","have","has","had","do","does","did","will","would","should","could",
  "may","might","must","can","shall","this","that","these","those","i","you",
  "he","she","it","we","they","them","his","her","its","our","their","what",
  "which","who","whom","whose","why","how","there","here","with","about","into",
  "over","under","between","than","also","not","no","nor","so","such","very",
  "just","more","most","some","any","each","every","other","another","both",
  "few","many","much","several","own","same","up","down","out","off","again",
  "further","once","because","through","during","before","after","above","below",
])

const TOKEN_RE = /[A-Za-z][A-Za-z0-9_-]*|[0-9]+(?:\.[0-9]+)?%?/g

export interface RetrievalChunk {
  sourceId: string
  sourceName: string
  sourceType: string
  chunkIndex: number
  text: string
  /** Optional precomputed embedding for the chunk. */
  embedding?: number[] | null
}

export interface RetrievedChunk {
  sourceId: string
  sourceName: string
  sourceType: string
  chunkIndex: number
  text: string
  /** Final ranking score — exposed for tests/diagnostics, not the UI. */
  score: number
}

/**
 * Tokenise a piece of text into lowercase, stop-word-filtered terms. Numbers
 * and percentages survive because financial questions like "what was the FY24
 * EBITDA margin" depend on `28%` matching `28%`, not on stripping punctuation.
 */
export function tokenize(text: string): string[] {
  if (!text) return []
  const out: string[] = []
  const matches = text.toLowerCase().match(TOKEN_RE)
  if (!matches) return out
  for (const tok of matches) {
    if (tok.length < 2) continue
    if (STOPWORDS.has(tok)) continue
    out.push(tok)
  }
  return out
}

/**
 * Standard BM25 ranking over the chunk corpus. Chosen over the previous
 * "count of overlapping question words" because:
 *   - it down-weights frequent terms via IDF, so "revenue" doesn't dominate
 *   - it saturates per-chunk term frequency (k1 caps the contribution of
 *     a term that's repeated 100 times in a glossary)
 *   - it normalises by chunk length, so long boilerplate sections stop
 *     out-scoring tighter, on-topic paragraphs.
 */
export function bm25Scores(chunks: string[], query: string): number[] {
  const k1 = 1.5
  const b = 0.75
  const N = chunks.length
  if (N === 0) return []

  const docTokens: string[][] = chunks.map(tokenize)
  const docLengths = docTokens.map((t) => t.length)
  const avgdl = docLengths.reduce((a, n) => a + n, 0) / Math.max(1, N)

  // Document frequency per term.
  const df = new Map<string, number>()
  for (const tokens of docTokens) {
    const seen = new Set<string>()
    for (const t of tokens) {
      if (seen.has(t)) continue
      seen.add(t)
      df.set(t, (df.get(t) ?? 0) + 1)
    }
  }

  const queryTerms = Array.from(new Set(tokenize(query)))
  if (queryTerms.length === 0) return new Array(N).fill(0)

  const idf = new Map<string, number>()
  for (const term of queryTerms) {
    const n = df.get(term) ?? 0
    // BM25 IDF with the +1 floor so common-but-present terms still contribute.
    const value = Math.log(1 + (N - n + 0.5) / (n + 0.5))
    idf.set(term, Math.max(0, value))
  }

  const scores = new Array<number>(N).fill(0)
  for (let i = 0; i < N; i++) {
    const tokens = docTokens[i]
    if (tokens.length === 0) continue
    const tf = new Map<string, number>()
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
    const dl = docLengths[i]
    let s = 0
    for (const term of queryTerms) {
      const f = tf.get(term)
      if (!f) continue
      const numer = f * (k1 + 1)
      const denom = f + k1 * (1 - b + b * (dl / Math.max(1, avgdl)))
      s += (idf.get(term) ?? 0) * (numer / denom)
    }
    scores[i] = s
  }
  return scores
}

/**
 * Cosine similarity between two equal-length vectors. Returns 0 for invalid
 * inputs (mismatched lengths, zero norms) so the hybrid scorer simply falls
 * back to BM25 in that case rather than throwing.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (!a || !b) return 0
  if (a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/**
 * The embedding model we use when `OPENAI_API_KEY` is set. Cheap and small
 * (1536 dim) so we can afford to embed every chunk on ingest and the query
 * on every chat turn. Override via `WORKSPACE_EMBEDDING_MODEL`.
 */
export const EMBEDDING_MODEL =
  process.env.WORKSPACE_EMBEDDING_MODEL || "text-embedding-3-small"

const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "")

export function embeddingsEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY
}

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>
  error?: { message?: string }
}

/**
 * Embed an arbitrary list of strings via OpenAI. Returns one vector per
 * input in the same order. Empty inputs come back as `null` so callers can
 * preserve chunk indexing without storing junk vectors.
 *
 * Throws on transport / HTTP error so the caller can decide whether to
 * fall back to BM25-only retrieval. Ingest swallows the error and stores
 * the chunks without embeddings; chat retrieval treats absent embeddings
 * as "use BM25".
 */
export async function embedTexts(inputs: string[]): Promise<(number[] | null)[]> {
  if (!embeddingsEnabled()) {
    return inputs.map(() => null)
  }
  const apiKey = process.env.OPENAI_API_KEY!
  const out: (number[] | null)[] = new Array(inputs.length).fill(null)
  // Filter empty inputs but remember their original index so we can splice
  // results back in order. OpenAI rejects empty strings.
  const indexed = inputs
    .map((text, i) => ({ text: text?.trim() ?? "", i }))
    .filter((x) => x.text.length > 0)
  if (indexed.length === 0) return out

  // Batch in groups of 96 — well under the 2048-input limit but keeps each
  // request payload small enough to retry quickly on transient failures.
  const BATCH = 96
  for (let off = 0; off < indexed.length; off += BATCH) {
    const slice = indexed.slice(off, off + BATCH)
    const res = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: slice.map((s) => s.text.slice(0, 8000)),
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`embedTexts: ${res.status} ${res.statusText} ${body.slice(0, 200)}`)
    }
    const json = (await res.json()) as OpenAIEmbeddingResponse
    if (json.error) throw new Error(`embedTexts: ${json.error.message ?? "unknown error"}`)
    const data = json.data ?? []
    for (let k = 0; k < slice.length; k++) {
      // OpenAI returns embeddings in the order requested; trust the index
      // when present, but fall back to positional order.
      const item = data.find((d) => d.index === k) ?? data[k]
      const vec = item?.embedding
      if (Array.isArray(vec) && vec.length > 0) {
        out[slice[k].i] = vec
      }
    }
  }
  return out
}

/**
 * Convenience wrapper around `embedTexts` for a single string. Returns null
 * if embeddings are disabled or the request fails — the caller is expected
 * to fall back to BM25-only ranking in that case.
 */
export async function embedQuery(query: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) return null
  if (!query || !query.trim()) return null
  try {
    const [vec] = await embedTexts([query])
    return vec ?? null
  } catch (err) {
    console.warn(`[workspaces/retrieval] embedQuery failed, falling back to BM25: ${(err as Error).message}`)
    return null
  }
}

/**
 * Rank a flat list of candidate chunks against the query.
 *
 * Strategy:
 *   - Always compute BM25.
 *   - If a query embedding is provided AND chunks expose embeddings, blend:
 *       finalScore = 0.85 * cosine + 0.15 * normalisedBM25
 *     The keyword boost is intentionally small — it acts as a tie-breaker
 *     when two chunks have near-identical semantic similarity but one of
 *     them quotes the question's exact terminology (e.g. a CIK, a ticker,
 *     a fund name). BM25 is rescaled to its own [0,1] range first so the
 *     constants don't drift when one query has a very high BM25 ceiling.
 *   - Otherwise fall back to BM25 alone.
 *
 * Returns at most `topK` chunks, sorted descending by final score, with
 * zero-score chunks dropped (they would only be noise in the prompt).
 */
export function rankChunks(
  candidates: RetrievalChunk[],
  query: string,
  queryEmbedding: number[] | null,
  topK: number,
): RetrievedChunk[] {
  if (candidates.length === 0) return []
  const texts = candidates.map((c) => c.text)
  const bm25 = bm25Scores(texts, query)
  const maxBm25 = bm25.reduce((m, v) => Math.max(m, v), 0)

  const useVectors = !!queryEmbedding && candidates.some((c) => Array.isArray(c.embedding) && c.embedding.length > 0)

  const scored: RetrievedChunk[] = candidates.map((chunk, i) => {
    const bm = bm25[i] ?? 0
    const bmNorm = maxBm25 > 0 ? bm / maxBm25 : 0
    let score = bm
    if (useVectors) {
      const cosScore = chunk.embedding && queryEmbedding ? cosineSimilarity(chunk.embedding, queryEmbedding) : 0
      score = 0.85 * cosScore + 0.15 * bmNorm
    }
    return {
      sourceId: chunk.sourceId,
      sourceName: chunk.sourceName,
      sourceType: chunk.sourceType,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      score,
    }
  })

  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
