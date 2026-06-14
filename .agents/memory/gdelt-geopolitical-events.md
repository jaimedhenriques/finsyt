---
name: GDELT geopolitical events provider
description: Quirks of the keyless GDELT DOC 2.0 API used for the geopolitical events feed
---

# GDELT DOC 2.0 API quirks

The geopolitical-events feed is built on the public, keyless GDELT DOC 2.0 API
(`https://api.gdeltproject.org/api/v2/doc/doc`), mirroring the prediction-markets
keyless pattern (lib → route → tile → agent-tool → tracer).

**Rate limiting is aggressive (~1 req / 5s).** When throttled it returns
HTTP 429 *and/or a plain-text notice instead of JSON* — never assume the body
parses. The provider must degrade to a structured empty state
(`source:'none'`, `providerError` set, empty `events`) rather than throw, so the
UI/tile/agent tool render a neutral "no events" state instead of an error.
**Why:** repeated smoke-test curls in the same minute will all return 429; that
is expected, not a bug. Wait ~30s between manual probes to see real data.

**Severity is category-derived, NOT a forecast.** GDELT gives no severity field;
we map keyword-categorized events (conflict/political/disaster/economic/
geopolitical) to high/medium/low. Keep this transparent in copy — the task
brief explicitly forbids any predictive scoring model.

**Country codes:** GDELT uses FIPS country codes in `sourcecountry`, but the
platform passes HQ country as ISO-2 (from `/api/quote` `quote.country`). The
provider keeps an ISO2→FIPS map; pass ISO-2 at the call site.
