# Earnings call audio configuration

The transcripts API (`app/api/transcripts/route.ts`) returns an `audioUrl`
for each call. The `MiniAudioPlayer` streams that URL when present and
falls back to silent timed playback (the synced transcript still scrolls)
when it is missing. There are **no** demo / placeholder audio URLs in
the codebase — if no real source is configured, `audioUrl` is `null` and
the UI advertises "synced transcript (silent playback)".

## Wiring up a real audio source

There are two supported paths.

### 1. Self-hosted MP3s (recommended for pilots)

Set a single env var pointing at a directory of MP3s named by ticker /
year / quarter:

```bash
# .env.local  (or Vercel project env)
TRANSCRIPT_AUDIO_BASE_URL=https://cdn.example.com/earnings
```

The API will request files at:

```
${TRANSCRIPT_AUDIO_BASE_URL}/{SYMBOL}_{YEAR}_Q{QUARTER}.mp3
# e.g. https://cdn.example.com/earnings/AAPL_2025_Q4.mp3
```

Any HTTPS object store works (S3, R2, Vercel Blob, GCS). The bucket
must allow public GET (or signed URLs that the browser can stream).

`NEXT_PUBLIC_TRANSCRIPT_AUDIO_BASE` is honored as a fallback name so
the value can also be exposed at build time if needed.

### 2. Vendor feed (Quartr / Earnings Call Pro / S&P Capital IQ / etc.)

Replace the body of `audioUrlFor()` in
`app/api/transcripts/route.ts` with a lookup against the vendor's
catalog API. The function signature is intentionally
`(symbol, year, quarter) => string | null` so it can be swapped without
changing the response contract or the player.

When a vendor returns short-lived signed URLs, return the URL as-is —
the player streams it directly and does not cache it server-side.

## Word-level timing (forced alignment)

By default the API estimates each word's `startSec`/`endSec` from the
average speaking rate and reports `timingSource: 'estimated'`. Once a
real audio source is wired in (see above), set one of the following
keys to upgrade to **real word-level timings derived from the
recording** (`timingSource: 'aligned'`):

```bash
# .env.local — pick one
DEEPGRAM_API_KEY=...        # https://developers.deepgram.com (preferred)
ASSEMBLYAI_API_KEY=...      # https://www.assemblyai.com
```

How it works (`lib/transcript-alignment.ts`):

1. The transcripts route POSTs the configured `audioUrl` to the STT
   provider and gets back word-level timestamps.
2. Those STT words are sequence-aligned to the canonical FMP transcript
   text using a greedy two-pointer match (with bounded look-ahead) so
   minor STT errors don't poison the timeline.
3. Unmatched canonical words are filled in by linear interpolation
   between the surrounding matched anchors.
4. Results are cached in-process keyed by `{symbol}-{year}-Q{quarter}`.

For multi-instance / serverless deployments, replace the in-memory
`cache` Map in `lib/transcript-alignment.ts` with a shared store
(Redis, KV, blob, Postgres) — STT is expensive and should be run at
most once per call.

If alignment is unconfigured, the audio URL is missing, the STT call
fails, or fewer than ~20% of canonical words can be anchored to the
STT stream, the API silently falls back to estimated timings so the
synced transcript keeps working.

## What the player expects

- `audioUrl` may be `null`. The UI must not assume it is present.
- When `audioUrl` is present, the `<audio>` element streams it and
  transcript-domain seconds are mapped onto real audio time
  proportionally, so transcript timing estimates do not need to match
  the recording's exact length.
- `audioAvailable: boolean` is included in the response for clients
  that want to gate UI on real-audio availability without re-checking
  `audioUrl`.
