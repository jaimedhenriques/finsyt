#!/bin/bash
# Finsyt AutoPMF — First-run setup
echo "Setting up AutoPMF for Finsyt..."

# Create state files
touch local_feedback.jsonl
echo -e "cycle\tdate\tnps\tstatus\tdescription" > results.tsv
echo "cycle: 0" > .claude/autoloop-state.local.md
echo "nps: unknown" >> .claude/autoloop-state.local.md
echo "last_change: none" >> .claude/autoloop-state.local.md

echo "✓ AutoPMF ready. Run /autoloop in Claude Code to start."
echo ""
echo "Required env vars:"
echo "  FEEDBACK_SECRET=<your-secret>"
echo "  DEPLOY_URL=https://finsyt-platform.vercel.app"
echo "  ANTHROPIC_API_KEY=<your-key>"
