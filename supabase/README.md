# Finsyt Supabase Setup

## Required Environment Variables

Set these in Vercel project settings (or `.env.local` for local dev):

```
NEXT_PUBLIC_finsyt_finsytSUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY=your-anon-key
finsyt_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...
NEXT_PUBLIC_APP_URL=https://finsyt.com
```

## Database Setup

Run the migration in Supabase SQL Editor:

```sql
-- Copy and execute: supabase/migrations/001_initial_schema.sql
```

Or via CLI:
```bash
supabase db push
```

## Tables Created

| Table | Purpose |
|-------|---------|
| `profiles` | Extended user profiles (auto-created on signup) |
| `subscriptions` | Stripe subscription state |
| `watchlists` | User symbol watchlists |
| `alerts` | Price/news/event alerts |
| `research_sessions` | Chat history for AI research |
| `saved_screens` | Saved screener filters |
| `api_usage` | Query/token tracking |

## Auth Setup in Supabase Dashboard

1. **Google OAuth**: Authentication > Providers > Google — add Client ID + Secret
2. **Email**: Authentication > Providers > Email — enable (default)
3. **Site URL**: Authentication > URL Configuration → set your domain
4. **Redirect URLs**: Add `https://finsyt.com/app/auth/callback`

## Stripe Webhook Setup

1. Install [Stripe CLI](https://stripe.com/docs/stripe-cli)
2. For local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
3. For production: Add endpoint `https://finsyt.com/api/webhooks/stripe` with events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
