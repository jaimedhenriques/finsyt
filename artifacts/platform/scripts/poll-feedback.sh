#!/bin/bash
# Finsyt AutoPMF — Feedback Poller
# Polls /api/feedback every 30s until new entries arrive, then writes to local_feedback.jsonl

DEPLOY_URL="${DEPLOY_URL:-https://finsyt-platform.vercel.app}"
SECRET="${FEEDBACK_SECRET:-}"
OUTFILE="local_feedback.jsonl"
INTERVAL=30
MAX_WAIT=7200  # 2 hours
elapsed=0

echo "[poll] Waiting for new feedback from $DEPLOY_URL..."

LAST_COUNT=$(jq '. | length' "$OUTFILE" 2>/dev/null || echo "0")

while [ $elapsed -lt $MAX_WAIT ]; do
  RESPONSE=$(curl -s -H "Authorization: Bearer $SECRET" "$DEPLOY_URL/api/feedback" 2>/dev/null)
  COUNT=$(echo "$RESPONSE" | jq '.count // 0' 2>/dev/null || echo "0")
  
  if [ "$COUNT" -gt "$LAST_COUNT" ]; then
    echo "[poll] $COUNT entries found (was $LAST_COUNT). Writing to $OUTFILE..."
    echo "$RESPONSE" | jq -c '.entries[]' >> "$OUTFILE"
    echo "[poll] Done. New entries: $((COUNT - LAST_COUNT))"
    exit 0
  fi
  
  sleep $INTERVAL
  elapsed=$((elapsed + INTERVAL))
  echo "[poll] Still waiting... ($elapsed s elapsed, $COUNT entries)"
done

echo "[poll] Timeout after ${MAX_WAIT}s. No new feedback."
exit 1
