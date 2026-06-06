# Finsyt MVP Launch — Billing & Go-to-Market Checklist

This document covers everything needed to sell Finsyt Pro ($29/mo) with real Stripe subscriptions.

## Prerequisites

- Clerk production instance (users sign in at `/platform/sign-in`)
- Postgres with `DATABASE_URL` set (billing tables auto-bootstrap on server start)
- **`PLATFORM_OPEN_MODE` must be OFF** in production (otherwise every org gets Pro for free)

## 1. Stripe Dashboard Setup

### Create product & price

1. [Stripe Dashboard](https://dashboard.stripe.com) → **Products** → **Add product**
2. Name: `Finsyt Pro`
3. Pricing: **Recurring**, **$29/month**, USD
4. Copy the **Price ID** (e.g. `price_1ABC…`) → set as `STRIPE_PRO_PRICE_ID`

### Enable Customer Portal

1. **Settings** → **Billing** → **Customer portal**
2. Enable subscription cancellation and payment method updates
3. Save — used by **Settings → Manage Plan**

### Webhook endpoint

1. **Developers** → **Webhooks** → **Add endpoint**
2. URL: `https://<your-domain>/platform/api/webhooks/stripe`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

### API keys

- **Secret key** → `STRIPE_SECRET_KEY` (starts with `sk_live_` in production)

## 2. Vercel Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `STRIPE_SECRET_KEY` | Yes | Server-only |
| `STRIPE_WEBHOOK_SECRET` | Yes | From webhook endpoint |
| `STRIPE_PRO_PRICE_ID` | Yes | Monthly Pro price |
| `APP_URL` | Yes | e.g. `https://finsyt.com` (no trailing slash) |
| `DATABASE_URL` | Yes | Postgres connection string (`POSTGRES_URL` also accepted) |
| `CLERK_SECRET_KEY` | Yes | Auth |
| `CLERK_PUBLISHABLE_KEY` | Yes | Public Clerk key |
| `PLATFORM_OPEN_MODE` | **Must be unset** | Demo bypass |

## 3. Golden Path (Manual QA)

1. **Sign in** via Clerk at `/platform/sign-in`
2. **Create or select a workspace** (Clerk org) — billing is org-scoped
3. **Free tier:** Run AI research queries — after 10/month, API returns upgrade message
4. **Upgrade:** Visit `/platform/app/upgrade` → **Upgrade to Pro** → Stripe Checkout
5. Complete test payment (use Stripe test card `4242 4242 4242 4242` in test mode)
6. **Webhook:** Confirm `org_subscriptions` row for org with `tier=pro`, `status=active`
7. **Settings:** `/platform/app/settings` shows **Pro Plan · $29/month** with renewal date
8. **Pro features:** Unlimited AI queries, transcripts, insider data unlock
9. **Manage Plan:** Opens Stripe Customer Portal (cancel/update card)

## 4. Architecture Reference

```
User → /platform/app/upgrade
     → GET /platform/api/stripe/create-checkout?plan=pro
     → Stripe Checkout
     → POST /platform/api/webhooks/stripe (signed)
     → upsert org_subscriptions (clerk_org_id)
     → lib/billing.ts gates API routes
     → lib/tier.ts + BillingPlanCard read /platform/api/billing/status
```

**Tables** (auto-created by `ensureBillingSchema()`):

- `org_subscriptions` — tier, Stripe IDs, period end, keyed on `clerk_org_id`
- `usage_counters` — monthly AI query counts per org

## 5. Local Development

```bash
# Install deps (from repo root)
pnpm install

# Stripe CLI — forward webhooks to local server
stripe listen --forward-to localhost:3000/platform/api/webhooks/stripe

# Use test keys + test price ID in .env.local
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # from stripe listen output
STRIPE_PRO_PRICE_ID=price_...
APP_URL=http://localhost:3000
DATABASE_URL=postgres://...
```

## 6. CI / Tests

```bash
pnpm --filter @workspace/platform run test:ci
```

Runs DB-free unit tests including `billing-entitlements.test.ts`.

## 7. Production Checklist

- [ ] Stripe live keys + live price ID
- [ ] Webhook endpoint on production URL with correct events
- [ ] `APP_URL` matches production domain
- [ ] `PLATFORM_OPEN_MODE` unset
- [ ] Clerk production keys
- [ ] Postgres migrations/bootstrap verified on deploy
- [ ] Golden path tested end-to-end on preview → promote
