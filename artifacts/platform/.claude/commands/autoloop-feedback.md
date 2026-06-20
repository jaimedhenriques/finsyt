# /autoloop-feedback — Phase 2: Fetch feedback, plan, build

## Steps

1. Poll for new feedback:
   ```bash
   bash scripts/poll-feedback.sh
   ```
   This blocks until new feedback arrives (checks every 30s, max 2h).

2. Parse feedback from `local_feedback.jsonl`:
   - Calculate NPS for this batch
   - Identify top 3 patterns (what's working, what's broken, what's missing)
   - Quote specific user comments

3. Read `product.md` — match feedback patterns to priority list

4. Plan ONE change:
   - Must address the most common complaint
   - Must be achievable in this session
   - Must not break existing functionality
   - Describe it in plain English before touching code

5. Build the change:
   - Read the file(s) you'll edit first
   - Make surgical edits only
   - TypeScript strict, no `any`, no hardcoded secrets

6. Update `product.md` iteration log with: cycle, date, NPS, change description

## Output

State the NPS score, the pattern identified, and the change made. Then hand off to `/autoloop-deploy`.
