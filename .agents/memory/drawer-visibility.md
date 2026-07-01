---
name: Always-in-DOM Drawer visibility
description: The Drawer component in ui/index.tsx is always rendered in the DOM (open or closed), using only CSS transform to slide in/out. This makes toBeVisible() always pass and toBeHidden() always fail.
---

## Rule
Never assert `expect(drawer).toBeVisible()` or `expect(drawer).toBeHidden()` on the `aside[role="dialog"]` element from `ui/index.tsx`. Assert on the **content** inside the drawer instead.

## Why
`ui/index.tsx` Drawer uses:
```tsx
transform: open ? 'translateX(0)' : 'translateX(100%)',
```
The element is always in the DOM. CSS transform doesn't affect:
- `getBoundingClientRect()` (non-zero bounding box)
- `visibility: hidden` (not set)
- `display: none` (not set)
- `opacity: 0` (not set)

So Playwright's `isVisible()` always returns `true` → `toBeVisible()` always passes, `toBeHidden()` always fails.

## How to apply
- To check drawer OPENED: `expect(drawer.getByText(expectedContent).first()).toBeVisible({ timeout: 15_000 })`
- To check drawer CLOSED: `expect(drawer.getByText(previousContent).first()).toBeHidden({ timeout: 5_000 })`
- The content disappears when `setCitation({ open: false, source: undefined })` sets source to undefined
- Close via `×` button: `drawer.getByRole("button", { name: /Close drawer/i }).evaluate(el => el.click())`
- Escape key does NOT close this Drawer (no built-in onKeyDown handler)
