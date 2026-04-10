# Finsyt DESIGN.md

## Brand Intent

Finsyt is an institutional-grade financial intelligence platform. The interface should feel:

- Precise
- Trustworthy
- Efficient
- Data-dense without feeling cluttered

Avoid decorative consumer-style design. Favor operational clarity.

## Visual Language

### Color System

- Background primary: `#F8FAFC`
- Background elevated: `#FFFFFF`
- Surface border: `#E2E8F0`
- Text primary: `#0F172A`
- Text secondary: `#334155`
- Accent primary: `#2563EB`
- Accent hover: `#1D4ED8`
- Success: `#16A34A`
- Warning: `#D97706`
- Danger: `#DC2626`
- Info: `#0284C7`

### Typography

- Primary font stack: `Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`
- Numeric/data rows: `JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

Scale:

- H1: 32/40, 700
- H2: 24/32, 700
- H3: 18/28, 600
- Body: 14/22, 400
- Small/meta: 12/18, 500

### Spacing + Radius

- Base spacing unit: `4px`
- Card padding: `16-24px`
- Section gap: `24-32px`
- Border radius:
  - Inputs/buttons: `8px`
  - Cards: `12px`
  - Pills: `999px`

### Shadows + Depth

Use subtle shadows only for elevated cards and overlays:

- Card: `0 1px 2px rgba(15,23,42,0.06), 0 4px 12px rgba(15,23,42,0.04)`
- Modal: `0 8px 24px rgba(15,23,42,0.16)`

## Component Behavior

### Navigation

- Left sidebar for platform modules
- Top utility bar for search, alerts, profile, org switcher
- Active nav states must be unambiguous

### Tables and Data Grids

- Always include sortable headers where relevant
- Sticky header on scroll for dense datasets
- Numeric cells right-aligned
- Positive/negative deltas color coded with icon + text (not color alone)

### Forms and Inputs

- Label always visible (no unlabeled icon-only inputs)
- Validation messages inline with actionable copy
- Keyboard navigation and visible focus states required

### Loading and Empty States

- Skeletons for primary data blocks
- Empty states must suggest next action
- Errors should include retry action and short root-cause hint

## Accessibility Baseline

- WCAG AA contrast minimum
- Full keyboard operability for interactive components
- Visible focus ring on all actionable elements
- `aria-label` for icon-only controls
- Semantic landmarks for page structure

## Motion Guidelines

- Keep animations subtle and functional
- Duration target: `120ms-220ms`
- Use motion to clarify state transitions only
- Respect `prefers-reduced-motion`

## Content and Information Design

- Prefer concise, analyst-friendly wording
- Use explicit units (USD, %, bps, YoY, QoQ)
- Timestamp all market-sensitive widgets
- Cite data source/provider near insight surfaces

## Competitive UX Quality Bar

Every page should meet this bar:

- Bloomberg-grade data legibility
- AlphaSense-like research workflow speed
- Rogo-like AI interaction clarity
- PitchBook/FactSet-level information architecture discipline

## SEO and Discoverability Checklist (Marketing surfaces)

- Unique title + meta description for each indexable page
- Open Graph tags present
- Structured headings (`h1` -> `h2` hierarchy)
- Fast initial render and optimized media
- Internal links to core product pages (research, market monitor, screeners, pricing)
