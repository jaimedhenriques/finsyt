# /autoloop-prepare — Phase 1: Read state, check deployment

## Steps

1. Read `product.md` — understand current product state and priorities
2. Read `autoloop.md` iteration log — what was the last NPS? What changed?
3. Check Vercel deployment health:
   ```bash
   curl -s https://finsyt-platform.vercel.app/api/health | head -5
   ```
4. Read `results.tsv` — check NPS trend (3 consecutive ≥9.0 = PMF)
5. Report:
   - Current NPS average
   - Last change made
   - Deployment status
   - Whether PMF stop condition is met

## Output

Summarise readiness. Then hand off to `/autoloop-feedback`.
