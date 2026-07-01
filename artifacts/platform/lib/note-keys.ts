// Shared validation + parsing for research-note "keys". A note key namespaces
// notes by the entity they belong to. Two shapes are supported:
//   - Public ticker:   AAPL, BRK.B, BF-B   (TICKER_RE)
//   - Private entity:   PRIVATE:12345       (PRIVATE_RE — numeric CoreSignal id)
//
// Both shapes are free of SQL `like` wildcards (`%`, `_`) and whitespace, so a
// validated key is safe to interpolate into the `[KEY] %` title-prefix filter
// used by /api/notes. This lives in its own module (not the route file) so it
// can be imported by both the route handler and unit tests — Next.js route
// files may only export the HTTP verb handlers, not arbitrary helpers.

// Public ticker: 1..12 chars of [A-Z0-9.-], must start alphanumeric.
export const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/
// Private-entity key: PRIVATE:<numeric coresignal id>, up to 20 digits.
export const PRIVATE_RE = /^PRIVATE:[0-9]{1,20}$/

// Max stored key length: `PRIVATE:` (8) + up to 20 digits = 28.
export const MAX_NOTE_KEY_LEN = 28

// True when `s` is either a public ticker or a private-entity key.
export function isValidNoteKey(s: string): boolean {
  return TICKER_RE.test(s) || PRIVATE_RE.test(s)
}

// Extracts the leading `[KEY]` prefix from a stored note title, supporting both
// ticker (`[AAPL]`) and private-entity (`[PRIVATE:123]`) shapes. Returns null
// when there is no recognised prefix.
export function readNoteSymbol(title: string): string | null {
  const m = title.match(/^\[([A-Z0-9.:\-]{1,28})\]/)
  return m ? m[1] : null
}
