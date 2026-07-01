---
name: Screener Drawer two-element strict mode
description: The company page always keeps a "Recent decks" Drawer in the DOM (always-rendered, never unmounted), causing aside[role="dialog"] to match 2 elements in strict mode when the citation Drawer is also open.
---

## Rule
On pages that render more than one `aside[role="dialog"]` (e.g. company page with "Recent decks" + citation drawer), always filter the locator:

```typescript
const drawer = page
  .locator('aside[role="dialog"]')
  .filter({ hasText: /Source citation/i });
```

## Why
`ui/index.tsx` Drawer is always-in-DOM. The company page (`/app/company/[symbol]`) always renders the "Recent decks" Drawer. When a second Drawer (citation) is opened, Playwright's strict mode finds 2 `aside[role="dialog"]` elements and throws a strict mode violation.

## How to apply
- Company page transcript/citation tests: filter by unique title text visible in the open drawer
  - `{ hasText: /Source citation/i }` — citation Drawer header
  - `{ hasText: /Recent decks/i }` — the always-present "Recent decks" Drawer
- Agent-sources tests use `aside[role="dialog"][aria-label]` because SourceDrawer sets `aria-label="Source N: label"` while Alert/Library drawers have no aria-label — this uniquely identifies the sources drawer
- Always prefer `.filter({ hasText: ... })` over `.first()` / `.last()` — positional selectors break when DOM order changes
