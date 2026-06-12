#!/bin/bash
# Retrieve all Finsyt feedback and mark as processed
DEPLOY_URL="${DEPLOY_URL:-https://finsyt-platform.vercel.app}"
SECRET="${FEEDBACK_SECRET:-}"

echo "=== Finsyt Feedback ==="
curl -s -H "Authorization: Bearer $SECRET" "$DEPLOY_URL/api/feedback" | jq '.'
echo ""
echo "Mark as processed? (y/N)"
read -r confirm
if [ "$confirm" = "y" ]; then
  curl -s -X POST -H "Authorization: Bearer $SECRET" "$DEPLOY_URL/api/feedback/mark-processed"
  echo "Marked."
fi
