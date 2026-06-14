---
name: Company page tab registration
description: Adding a tab to /app/company/[symbol] requires updating THREE places, not two.
---

# Company page tab registration

Adding a new tab to `artifacts/platform/app/app/company/[symbol]/page.tsx` requires updating **three** spots — missing the third silently breaks deep-linking:

1. The `CompanyTab` union type.
2. The `tabs` array passed to `<Tabs>` (controls what's visible/clickable).
3. The `allowed` string array inside the `useEffect` that reads `?tab=` from the URL on mount.

**Why:** The mount effect only applies `?tab=<id>` if `<id>` is in its own hardcoded `allowed` list (separate from the `tabs` array). If you add the tab to the type + tabs array but not `allowed`, clicking the tab works, but navigating directly to `?tab=<id>` (deep link, agent quick-action, e2e test) silently falls back to Overview.

**How to apply:** When adding/renaming a company tab, grep for the `allowed = [` array in that file and keep it in sync with the `tabs` array. (Discovered when `?tab=technicals` rendered Overview until `technicals` — and the also-missing `options` — were added to `allowed`.)
