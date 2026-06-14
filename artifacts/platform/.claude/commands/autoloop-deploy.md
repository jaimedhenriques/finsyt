# /autoloop-deploy — Phase 3: Commit, push, deploy, log

## Steps

1. Stage and commit:
   ```bash
   git add -A
   git commit -m "autopmf(cycle-N): <one-line description of change>"
   git push origin main
   ```

2. Deploy to Vercel:
   ```bash
   vercel --prod --yes
   ```

3. Verify deployment:
   ```bash
   curl -s https://finsyt-platform.vercel.app/api/health
   ```

4. Log the cycle to `results.tsv`:
   ```
   <cycle>\t<date>\t<NPS>\t<status>\t<description>
   ```

5. Update `autoloop.md` state file with cycle count and NPS

6. Check stop conditions (3 consecutive NPS ≥ 9.0)

## Output

Confirm deploy success. Log cycle. Then hand off back to `/autoloop-prepare`.
