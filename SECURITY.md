# Finsyt — Security Runbook

This document captures Finsyt's current security posture, the threat model we
defend against, and the steps to take when something goes wrong. It is the
single source of truth for engineers, on-call, and anyone preparing for a
SOC 2, ISO 27001, or GDPR review.

> Status: **In progress.** Core HTTP hardening, secrets validation, CORS
> allowlist, rate limiting, CSRF helper, request IDs, PII redaction, and
> `security.txt` are live across `api-server`, `platform`, and `marketing`.
> Authentication, RBAC, RLS, audit logging, KMS-backed envelope encryption,
> DSAR/retention, SSO/SCIM, and CI security gates are tracked as the next
> wave of work — see "Roadmap" below.

---

## 1. Reporting a vulnerability

- Email: **security@finsyt.com**
- Public discovery file: `/.well-known/security.txt` (served by both `marketing`
  and `platform`).
- We aim to acknowledge new reports within **2 business days** and triage to a
  fix or mitigation within **30 days** for Critical/High findings.

Do **not** file vulnerabilities as public GitHub issues.

---

## 2. Threat model (summary)

| Asset | Threats we defend against |
| --- | --- |
| Customer data in Postgres | Cross-tenant reads/writes; SQL injection; backup theft |
| Provider API keys (FMP, Groq, Perplexity, Finnhub, FRED, SEC, etc.) | Exfiltration via client bundle, log scraping, or repo leak |
| User sessions | Hijacking via XSS, CSRF, MITM |
| Lead-capture and AI research endpoints | Abuse, scraping, bot traffic, cost amplification |
| CI / supply chain | Malicious npm releases, dependency confusion |

We assume an attacker can read all public marketing pages, attempt arbitrary
HTTP requests against any of our hosts, and may already have a low-privileged
account. We do **not** assume protection from a fully compromised cloud
provider account or KMS root key.

---

## 3. Network & HTTP hardening (current)

Every artifact applies a hardened header baseline:

- **`api-server`** (`artifacts/api-server`): Helmet for CSP/HSTS/COOP/CORP,
  `frame-ancestors 'none'`, `X-Frame-Options: DENY`, env-driven CORS
  allowlist (`CORS_ALLOWED_ORIGINS`), per-IP rate limits (general / auth /
  write / expensive buckets), request IDs (`X-Request-Id`), centralized error
  handler that never returns stack traces, JSON body limit 100 KB.
- **`platform`** (Next.js): edge `middleware.ts` injects a per-request CSP
  nonce, HSTS, COOP, COEP-friendly defaults, Permissions-Policy, and
  Referrer-Policy. The previous wildcard CORS on `/api/*` has been removed.
- **`marketing`** (Vite): `securityHeadersPlugin` applies HSTS, COOP, X-Frame
  DENY, Permissions-Policy, and Referrer-Policy on dev and preview servers.
  These must be re-asserted at the production CDN/edge.

HTTPS-only: HSTS includes `preload` and `includeSubDomains`. HTTP-to-HTTPS
redirects are expected to happen at the platform / load balancer (Replit
Deployments handle this automatically).

CSRF: `artifacts/api-server/src/middlewares/csrf.ts` ships a double-submit
cookie helper. It is exported but not yet wired globally — apply it on
cookie-authenticated mutating routes once the auth provider lands.

---

## 4. Secrets & configuration

- All `api-server` env reads go through `src/lib/config.ts`, which validates
  with Zod and **fails fast in production** if `CORS_ALLOWED_ORIGINS` or
  `CSRF_SECRET` are missing.
- `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (24 h) to mitigate
  npm supply-chain attacks. Do not lower this value.
- Secrets are loaded via the Replit-managed environment. **No provider API
  key may be inlined into a client bundle.** The `next.config.ts` `env` block
  intentionally exposes only `NEXT_PUBLIC_*` keys to the browser; everything
  else is server-only.
- Key rotation: rotate provider keys in the Replit Secrets panel, then
  redeploy. Until KMS-backed envelope encryption ships (see Roadmap), rotation
  of stored integration credentials still requires a manual database update.

---

## 5. Logging & observability

- Pino is the standard logger across services. The api-server logger redacts
  `Authorization`, `Cookie`, `Set-Cookie`, `X-CSRF-Token`, `X-Api-Key`, and a
  long list of sensitive body fields (`password`, `token`, `apiKey`, `ssn`,
  `cardNumber`, etc.) — see `artifacts/api-server/src/lib/logger.ts`.
- Every inbound request is tagged with an `X-Request-Id` (echoed on the
  response) so traces can be stitched across services.
- Lead emails are **not** logged on capture — only the lead id is recorded.

---

## 6. Incident response

1. **Detect** — page on-call via the security@finsyt.com address. Anyone can
   raise an incident.
2. **Triage** — determine severity (S0 data exposure, S1 service outage,
   S2 hardening gap). Open a private incident channel.
3. **Contain** — rotate the compromised secret in Replit Secrets, revoke
   sessions if necessary (`platform` cookie scope), block the offending
   IP/UA at the CDN.
4. **Eradicate** — ship the fix. Run `pnpm` audits and SAST scans (see
   `.local/skills/security_scan/SKILL.md`).
5. **Recover** — re-deploy, monitor request-id traces and rate-limit dashboards.
6. **Postmortem** — within 5 business days, write a blameless write-up.
   Track action items as project tasks.

On-call rotation and pager wiring belong here once formalized — TODO.

---

## 7. Roadmap (planned but not yet implemented)

These items map directly to the "Enterprise Security Hardening" task and are
intentionally deferred to follow-on tasks because each one is multi-day work
and several require external services or schema changes:

1. **Authentication & MFA** — Clerk-based signup/login/logout/reset, email
   verification, TOTP MFA, secure HttpOnly session cookies. Remove the demo
   user from `/platform/app` and gate every `/platform/*` route behind
   middleware.
2. **Organizations, RBAC, RLS** — Drizzle schema for `organizations`,
   `memberships`, `roles`; `org_id` on every tenant table; Postgres RLS
   policies enforced via `SET app.current_org_id` on each connection.
3. **Enterprise SSO + SCIM** — SAML 2.0 + OIDC connectors, per-org SSO
   admin UI, SCIM user provisioning where the IdP supports it.
4. **Envelope encryption** — wrap a per-row data key with a cloud KMS key
   for SSO secrets, integration tokens, and OAuth refresh tokens.
5. **Audit log** — *partially shipped.* The append-only `audit_events`
   table (monthly partitioning), owner-only admin UI to filter / export,
   and the internal `auditLog()` helper exist (see §9). Audit emission
   from the auth, MFA, role-change, SSO, and integration surfaces is
   **not** in this milestone because those surfaces themselves do not
   yet exist — they are part of Roadmap items 1–3. When those endpoints
   are built they MUST call `auditLog({ action: "auth.login.success" })`
   etc. (the canonical action names are already enumerated in
   `lib/db/src/audit.ts`).
6. **Retention & DSAR** — *partially shipped.* Per-org retention
   settings, the nightly purge job (audit + transient logs + abandoned
   chats), self-serve account deletion with a 30-day SLA, and the GDPR
   data-export endpoint are all live (see §9). Hard-deletion clears
   every actor-linked row across the tables we own and pseudonymises
   the identifier in the completion event so PII is not reintroduced
   post-deletion. **Still pending:** the self-serve flows currently
   identify the caller via a development-only demo identity, which is
   why the platform route handlers refuse with HTTP 503 in production
   unless `ALLOW_DEMO_IDENTITY=1` is explicitly set. Wire the routes to
   the authenticated Clerk session (Roadmap item 1) before exposing the
   UI to customers.
7. **CI security gates** — dependency audit + SAST + secret scan that block
   on Critical/High findings on every push.
8. **Wire CSRF middleware globally** — currently the helper exists but is
   only attached on demand; once cookie auth lands, wire it on all
   state-changing routes.

---

## 8. Compliance posture

- **GDPR** — Lawful basis: contract + legitimate interest. Right to access,
  rectification, deletion, and portability will be served via the DSAR
  endpoints listed in the roadmap.
- **SOC 2 Type 2** — Targeting an observation window once auth, RBAC, RLS,
  audit logging, and CI gates are live. Controls: access management,
  change management, monitoring, incident response, vendor management.
- **ISO 27001** — Same baseline as SOC 2; ISMS documentation will live next
  to this runbook once the controls above are operationalized.

We do **not** train third-party AI models on customer prompts or research
artifacts. All AI provider calls are made server-side with explicit no-train
flags where supported (Anthropic, OpenAI enterprise endpoints, Groq).

---

---

## 9. Audit logging, retention & DSAR

**Audit log.** Every security-relevant event is appended to the
`audit_events` Postgres table. The table is `PARTITION BY RANGE
(occurred_at)` with monthly partitions (`audit_events_YYYYMM`) created on
demand by `ensureAuditPartition()` in `lib/db/src/audit.ts`. The
api-server calls `ensureAuditSchema()` at boot, which is idempotent and
provisions:

- the partitioned parent table + `(org_id, occurred_at desc)` and
  `(action, occurred_at desc)` indexes,
- `org_retention_settings`, `account_deletion_requests`, and
  `data_export_requests` companion tables,
- partitions for the current and next month.

The canonical helper is `audit.log({ orgId, actorId, action, … })` — see
the `AuditAction` union in `lib/db/src/audit.ts` for the recognized event
names (logins, MFA changes, role changes, SSO config edits, exports,
deletions, retention changes). Failures to write are logged to stderr but
never break the calling request.

**Admin UI.** `/platform/app/admin/audit` (Owner role only) lets
organisation owners filter the audit trail by action, actor, and date
range, and export the filtered slice to CSV. Retention settings are
edited from the same page.

**Retention.** Per-org settings live in `org_retention_settings`
(`audit_log_days`, `transient_log_days`, `abandoned_chat_days`; 0 ==
"never purge"). The nightly job at `scripts/run-retention-purge.ts`
sweeps every org and emits `retention.purge.ran` audit rows for the work
it performs. Owners can also trigger an immediate purge from the admin
UI.

**DSAR / right to be forgotten.** Two self-serve endpoints power the
GDPR flow, both surfaced from `/platform/app/settings → Account → Danger
Zone`:

- `POST /api/account/export` — returns a downloadable JSON archive
  containing every record we hold for the calling actor (currently audit
  events, retention settings, and any pending deletion request). Logged
  as `data.export.requested` and `data.export.completed`.
- `POST /api/account/delete` — schedules a hard-deletion 30 days out
  (the documented SLA). Idempotent. The same nightly purge job picks up
  due requests, hard-deletes the actor's rows, marks the request
  `completed`, and emits `account.delete.completed`.
- `DELETE /api/account/delete` — cancels a pending deletion within the
  grace window.

As new tenant tables are added (per the Roadmap §7.2 work), extend the
DELETE block in `scripts/run-retention-purge.ts` so they participate in
the same 30-day SLA.

---

_Last reviewed: 2026-04-20._
