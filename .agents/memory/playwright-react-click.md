---
name: Playwright click vs evaluate for React
description: When positioned overlays (card containers, toast/status divs) intercept Playwright pointer events, use el.evaluate() instead of click({ force: true }) to reliably trigger React onClick handlers.
---

## Rule
Use `locator.evaluate((el) => (el as HTMLButtonElement).click())` instead of `locator.click({ force: true })` whenever Playwright reports that a positioned element is intercepting pointer events.

## Why
`click({ force: true })` dispatches pointer events (pointerdown/up + click) via `element.dispatchEvent()` with synthesized coordinates. When a CSS-positioned overlay (`<div class="card">`, `<div role="status">`, etc.) sits on top, the React synthetic event may not bubble correctly to the intended handler.

`el.click()` (the DOM's native HTMLElement.click() method) fires a trusted-style click event that bubbles up through the DOM. React's synthetic event delegation (attached at the root container in React 17+) receives it and routes it to the element's onClick handler regardless of any visual overlay.

## How to apply
- Screener `.card` container intercepts chip [1] click → use evaluate
- Toast `<div role="status">` intercepts Drawer close button → use evaluate
- Any time Playwright logs "element intercepts pointer events" → prefer evaluate over force: true
- Pattern: `await el.evaluate((el) => (el as HTMLButtonElement).click())`
