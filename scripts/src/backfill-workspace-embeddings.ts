/**
 * Backfill chunk embeddings on existing `workspace_sources` rows.
 *
 * Why this exists: chat retrieval used to rank citations by raw keyword
 * overlap, so historical rows have no embeddings stored. The new ranker
 * blends BM25 + cosine similarity over OpenAI embeddings — rows that were
 * ingested before the change will quietly fall back to BM25 alone until
 * this script populates their `embeddings` column.
 *
 * The script is idempotent: rows whose `embeddings` array already has a
 * non-null entry for every chunk are skipped. Pass `--force` to re-embed
 * everything (e.g. after switching embedding models).
 *
 * Required env vars:
 *   SUPABASE_URL                        Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY           Service-role key (bypass RLS)
 *   OPENAI_API_KEY                      OpenAI key used for embeddings
 *   WORKSPACE_EMBEDDING_MODEL           (optional) defaults to text-embedding-3-small
 *
 * Usage (from repo root):
 *   pnpm --filter @workspace/scripts run backfill:workspace-embeddings
 *   pnpm --filter @workspace/scripts run backfill:workspace-embeddings -- --force --limit 50
 */

import { createClient } from "@supabase/supabase-js"

const TABLE_NAME = process.env.SUPABASE_WORKSPACE_SOURCES_TABLE || "workspace_sources"
const EMBEDDING_MODEL = process.env.WORKSPACE_EMBEDDING_MODEL || "text-embedding-3-small"
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "")

interface Row {
  source_id: string
  chunks: unknown
  embeddings: unknown
}

interface Args {
  force: boolean
  limit: number | null
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { force: false, limit: null, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--force") args.force = true
    else if (a === "--dry-run") args.dryRun = true
    else if (a === "--limit") {
      const next = argv[++i]
      const n = Number.parseInt(next ?? "", 10)
      if (Number.isFinite(n) && n > 0) args.limit = n
    } else if (a.startsWith("--limit=")) {
      const n = Number.parseInt(a.slice("--limit=".length), 10)
      if (Number.isFinite(n) && n > 0) args.limit = n
    }
  }
  return args
}

function normaliseChunks(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === "string")
}

function normaliseEmbeddings(value: unknown, expected: number): (number[] | null)[] | null {
  if (value == null || !Array.isArray(value)) return null
  const out: (number[] | null)[] = new Array(expected).fill(null)
  for (let i = 0; i < Math.min(value.length, expected); i++) {
    const v = value[i]
    if (Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === "number" && Number.isFinite(n))) {
      out[i] = v as number[]
    }
  }
  return out
}

async function embedBatch(apiKey: string, inputs: string[]): Promise<(number[] | null)[]> {
  const out: (number[] | null)[] = new Array(inputs.length).fill(null)
  const indexed = inputs
    .map((text, i) => ({ text: (text ?? "").trim(), i }))
    .filter((x) => x.text.length > 0)
  if (indexed.length === 0) return out
  const BATCH = 96
  for (let off = 0; off < indexed.length; off += BATCH) {
    const slice = indexed.slice(off, off + BATCH)
    const res = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: slice.map((s) => s.text.slice(0, 8000)) }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`embed call failed (${res.status}): ${body.slice(0, 200)}`)
    }
    const json = (await res.json()) as { data?: Array<{ embedding?: number[]; index?: number }>; error?: { message?: string } }
    if (json.error) throw new Error(json.error.message ?? "unknown embedding error")
    const data = json.data ?? []
    for (let k = 0; k < slice.length; k++) {
      const item = data.find((d) => d.index === k) ?? data[k]
      const vec = item?.embedding
      if (Array.isArray(vec) && vec.length > 0) out[slice[k].i] = vec
    }
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.finsyt_SUPABASE_URL ||
    ""
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.finsyt_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.finsyt_SUPABASE_SECRET_KEY ||
    ""
  const openaiKey = process.env.OPENAI_API_KEY || ""

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in environment.")
    process.exit(1)
  }
  if (!openaiKey) {
    console.error("Missing OPENAI_API_KEY in environment — cannot compute embeddings.")
    process.exit(1)
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(`[backfill] table=${TABLE_NAME} model=${EMBEDDING_MODEL} force=${args.force} limit=${args.limit ?? "∞"} dryRun=${args.dryRun}`)

  const pageSize = 100
  let from = 0
  let scanned = 0
  let updated = 0
  let skipped = 0
  let failed = 0

  while (true) {
    if (args.limit && scanned >= args.limit) break
    const to = from + pageSize - 1
    const { data, error } = await client
      .from(TABLE_NAME)
      .select("source_id,chunks,embeddings")
      .order("ingested_at", { ascending: true, nullsFirst: true })
      .range(from, to)
    if (error) {
      console.error(`[backfill] read failed at offset ${from}: ${error.message}`)
      process.exit(2)
    }
    if (!data || data.length === 0) break

    for (const row of data as Row[]) {
      if (args.limit && scanned >= args.limit) break
      scanned++
      const chunks = normaliseChunks(row.chunks)
      if (chunks.length === 0) {
        skipped++
        continue
      }
      const existing = normaliseEmbeddings(row.embeddings, chunks.length)
      const fullyEmbedded = existing != null && existing.every((e) => Array.isArray(e) && e.length > 0)
      if (fullyEmbedded && !args.force) {
        skipped++
        continue
      }

      try {
        let vectors: (number[] | null)[]
        if (existing && !args.force) {
          // Embed only the missing slots so we avoid re-billing for chunks
          // that already have a vector. Re-merge into the existing array.
          const missingIdx: number[] = []
          existing.forEach((v, i) => { if (!Array.isArray(v) || v.length === 0) missingIdx.push(i) })
          if (missingIdx.length === 0) {
            skipped++
            continue
          }
          const fresh = await embedBatch(openaiKey, missingIdx.map((i) => chunks[i]))
          vectors = existing.slice()
          missingIdx.forEach((idx, k) => { vectors[idx] = fresh[k] ?? null })
        } else {
          vectors = await embedBatch(openaiKey, chunks)
        }

        if (args.dryRun) {
          updated++
          console.log(`[backfill] (dry-run) would update ${row.source_id} (${chunks.length} chunks)`)
          continue
        }

        const { error: updErr } = await client
          .from(TABLE_NAME)
          .update({ embeddings: vectors })
          .eq("source_id", row.source_id)
        if (updErr) {
          failed++
          console.error(`[backfill] update failed for ${row.source_id}: ${updErr.message}`)
          continue
        }
        updated++
        console.log(`[backfill] updated ${row.source_id} (${vectors.filter((v) => v).length}/${chunks.length} vectors)`)
      } catch (err) {
        failed++
        console.error(`[backfill] embedding failed for ${row.source_id}: ${(err as Error).message}`)
      }
    }

    if (data.length < pageSize) break
    from += pageSize
  }

  console.log(`[backfill] done. scanned=${scanned} updated=${updated} skipped=${skipped} failed=${failed}`)
  if (failed > 0) process.exit(3)
}

main().catch((err) => {
  console.error(`[backfill] fatal: ${(err as Error).message}`)
  process.exit(1)
})
