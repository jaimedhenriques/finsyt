# /autoloop — Finsyt AutoPMF Loop

You are running the Finsyt Product-Market Fit automation loop. Your job is to iterate the product until users consistently score it 9+/10.

## Loop Phases

Execute in order, then repeat:

1. **PREPARE** — `/autoloop-prepare`
2. **FEEDBACK** — `/autoloop-feedback`
3. **DEPLOY** — `/autoloop-deploy`

## Stop Conditions (check after every cycle)

- PMF reached: 3 consecutive cycles with NPS ≥ 9.0 → announce and stop
- User cancel: `/cancel-autoloop`
- Deploy failure: 2 consecutive `vercel --prod` failures → stop and report

## Rules

- Read `product.md` before every change. It is the source of truth.
- Never change auth, payments, or database schema.
- TypeScript only. No `any`. No hardcoded secrets.
- Surgical changes only — don't refactor what wasn't asked.
- Log every cycle to `autoloop.md` iteration log.
- Run the feedback poll script — don't waste tokens polling manually.

## Start

Begin with Phase 1. Go.
