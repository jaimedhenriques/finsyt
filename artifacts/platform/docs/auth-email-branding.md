# Branded Transactional Auth Emails

This runbook covers what's needed for sign-up, password-reset, magic-link
and 2FA emails to be sent from `auth@finsyt.com` with Finsyt branding,
instead of from the default Clerk sender.

## Status

- **In code (this repo):** Sign-in / sign-up / verification / reset
  prompts use Finsyt voice via the `localization` prop on `ClerkProvider`
  (`artifacts/platform/app/layout.tsx`).
- **Out of band (must be done in the workspace Auth pane and DNS):**
  custom email-sending domain, DKIM/SPF/DMARC records, and the HTML
  template branding.

The remaining work cannot be performed from code — it requires changes
in the Auth configuration pane (workspace toolbar) and DNS records on
the `finsyt.com` zone.

## 1. Add and verify the sending domain

In the workspace toolbar, open the **Auth** pane and switch to the
production instance. Add `finsyt.com` (or the dedicated subdomain
`auth.finsyt.com`) as the sending domain for transactional email.

The pane will surface DNS records that must be published.

## 2. Publish DNS records

Add the following records to the `finsyt.com` DNS zone with the registrar:

- **SPF** — `TXT @ "v=spf1 include:<value from Auth pane> ~all"`
  (merge with any existing SPF record; do not publish two SPF records).
- **DKIM** — one or two `CNAME` records under
  `<selector>._domainkey.finsyt.com` pointing at the targets shown in
  the Auth pane.
- **DMARC** — `TXT _dmarc.finsyt.com
  "v=DMARC1; p=quarantine; rua=mailto:dmarc@finsyt.com; fo=1"`.
  Start with `p=none` for a few days to monitor reports, then move to
  `quarantine` and finally `reject` once aligned.
- **Return-Path** (if shown) — `CNAME` for the bounce subdomain.

After the records propagate, hit "Verify" in the Auth pane. The sender
address (`auth@finsyt.com`) becomes available once verification passes.

## 3. Brand the email templates

In the Auth pane → Email templates, edit each of:

- Verification code (sign-up)
- Verification code (sign-in)
- Magic link
- Password reset code
- Password reset (magic link)
- 2FA / one-time code

For each template:

- **From name:** `Finsyt`
- **From address:** `auth@finsyt.com`
- **Reply-to:** `support@finsyt.com`
- **Subject:** Finsyt-branded (e.g. "Your Finsyt verification code",
  "Reset your Finsyt password", "Your Finsyt 2FA code").
- **Header:** Finsyt logo (use `public/logo.svg` or the equivalent
  hosted asset).
- **Body:** Finsyt voice — short, declarative, no emoji. Reference the
  user's first name when available.
- **Footer:** "Finsyt, Inc. · finsyt.com · You received this email
  because you have an account with Finsyt. If this wasn't you,
  contact support@finsyt.com."

## 4. Smoke test

After verification + template edits:

1. Sign up a fresh test account → confirm the verification email
   arrives from `auth@finsyt.com` with Finsyt branding.
2. Trigger "Forgot password" on that account → confirm the reset email.
3. Enable 2FA in the user profile → confirm the 2FA code email.
4. In Gmail, expand the message header and verify "signed-by:
   finsyt.com" and "mailed-by: finsyt.com" (DKIM + SPF aligned).
5. Check `https://mxtoolbox.com/dmarc.aspx?domain=finsyt.com` for a
   passing DMARC record.

## Code-side hooks

- Voice for in-product Clerk strings (titles, subtitles, OTP labels,
  resend buttons) is set in
  `artifacts/platform/app/layout.tsx` via the `localization` prop on
  `ClerkProvider`. Update that prop if marketing changes the auth voice.
- Email *body* HTML is **not** controlled by `localization` — it lives
  in the Auth pane templates (step 3).
