#!/usr/bin/env bash
# Per-route smoke tests for Task #72 — runs against the local Next dev server
# (default http://localhost:3000) and prints PASS/FAIL with HTTP status.
#
# Usage:  bash artifacts/platform/scripts/smoke-providers.sh [BASE_URL] [TICKER]
# Exit:   0 if all routes return either 200 (data) or 503 (clean exhaustion).
#
# Acceptance per route:
#   200 → upstream provider returned data (good)
#   503 → all configured providers exhausted (clean failure, expected when
#         no upstream key has coverage for the requested resource)
#   500 / 4xx-other / network → FAIL (route is broken)

set -u
BASE="${1:-http://localhost:3000/platform}"
SYM="${2:-AAPL}"
PASS=0; FAIL=0
declare -a FAILED

probe () {
  local label="$1" path="$2" expect_extra="${3:-}"
  local code
  code=$(curl -sS -o /tmp/smoke_body -w '%{http_code}' -m 12 "$BASE$path" 2>/dev/null || echo 000)
  if [[ "$code" == "200" || "$code" == "503" || "$code" == "$expect_extra" ]]; then
    printf '  ✓ %-22s %s  →  %s\n' "$label" "$path" "$code"
    PASS=$((PASS+1))
  else
    printf '  ✗ %-22s %s  →  %s  (body: %s)\n' "$label" "$path" "$code" "$(head -c 120 /tmp/smoke_body)"
    FAIL=$((FAIL+1)); FAILED+=("$label=$code")
  fi
}

echo "Smoke-testing provider-backed routes against $BASE  (ticker=$SYM)"
echo "──────────────────────────────────────────────────────────────"

probe quote          "/api/quote?symbol=$SYM"
probe aggs           "/api/aggs?symbol=$SYM&from=2025-09-01&to=2025-10-01"
probe financials_rev "/api/financials?symbol=$SYM&metric=iq_total_rev"
probe news           "/api/news?symbol=$SYM&limit=5"
probe insider        "/api/insider?symbol=$SYM"
probe filings        "/api/filings?symbol=$SYM"
probe earnings_cal   "/api/earnings-calendar"
probe market_status  "/api/market-status"
probe macro_cpi      "/api/macro?series=CPIAUCSL"
probe search         "/api/search?q=apple"
probe screener       "/api/screener?marketCapMoreThan=10000000000&limit=5"

# Admin endpoint should auth-gate, not crash
probe admin_health   "/api/admin/providers/health" "401"

echo "──────────────────────────────────────────────────────────────"
echo "Result: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] || { echo "Failed: ${FAILED[*]}"; exit 1; }
