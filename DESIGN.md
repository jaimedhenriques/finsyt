# Finsyt Design System

> AI-powered financial research platform. Professional, institutional-grade UI with Bloomberg-level data density and Linear-level polish.

## Design Philosophy

**Core Principles:**
- **Data-first**: Information density over decoration. Every pixel earns its place.
- **Professional trust**: Institutional finance aesthetic. No playful elements.
- **Speed perception**: Instant feedback, skeleton states, optimistic updates.
- **Precision**: Exact spacing, consistent type scales, pixel-perfect alignment.

**What we are NOT:**
- Consumer fintech (no rounded playful cards like Robinhood)
- Generic SaaS (no purple gradients, no hero illustrations)
- Dashboard template (no generic chart-heavy layouts)

**Competitors we respect:**
- Bloomberg Terminal (data density, professional gravitas)
- AlphaSense (clean research interface)
- Linear (precision, minimal, fast)
- Stripe Dashboard (polish, attention to detail)

---

## Color Palette

### Light Mode (Default)
```css
--background: #FFFFFF;
--background-subtle: #FAFAFA;
--background-muted: #F5F5F5;

--foreground: #0A0A0A;
--foreground-muted: #525252;
--foreground-subtle: #A3A3A3;

--border: #E5E5E5;
--border-strong: #D4D4D4;

--accent: #0066FF;           /* Primary blue - trust, finance */
--accent-hover: #0052CC;
--accent-muted: #E6F0FF;

--success: #00875A;
--success-muted: #E3FCEF;

--danger: #DE350B;
--danger-muted: #FFEBE6;

--warning: #FF991F;
--warning-muted: #FFFAE6;
```

### Dark Mode
```css
--background: #0A0A0A;
--background-subtle: #141414;
--background-muted: #1F1F1F;

--foreground: #FAFAFA;
--foreground-muted: #A3A3A3;
--foreground-subtle: #525252;

--border: #2E2E2E;
--border-strong: #404040;

--accent: #3B82F6;
--accent-hover: #60A5FA;
--accent-muted: #1E3A5F;

--success: #22C55E;
--success-muted: #14532D;

--danger: #EF4444;
--danger-muted: #7F1D1D;

--warning: #F59E0B;
--warning-muted: #78350F;
```

### Financial Data Colors
```css
/* Stock movements */
--positive: #00875A;        /* Green for gains */
--negative: #DE350B;        /* Red for losses */
--neutral: #525252;         /* Gray for unchanged */

/* Charts */
--chart-primary: #0066FF;
--chart-secondary: #8B5CF6;
--chart-tertiary: #06B6D4;
--chart-quaternary: #F59E0B;
--chart-grid: #E5E5E5;
--chart-grid-dark: #2E2E2E;
```

---

## Typography

### Font Stack
```css
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
--font-mono: "JetBrains Mono", "SF Mono", "Fira Code", monospace;
```

### Type Scale
```css
/* Display - Hero headlines only */
--text-display: 3rem;       /* 48px */
--leading-display: 1.1;

/* Headings */
--text-h1: 2rem;            /* 32px */
--text-h2: 1.5rem;          /* 24px */
--text-h3: 1.25rem;         /* 20px */
--text-h4: 1rem;            /* 16px */
--leading-heading: 1.25;

/* Body */
--text-base: 0.875rem;      /* 14px - Primary body text */
--text-sm: 0.8125rem;       /* 13px - Secondary text */
--text-xs: 0.75rem;         /* 12px - Captions, labels */
--leading-body: 1.5;

/* Data */
--text-data: 0.8125rem;     /* 13px - Tables, numbers */
--text-data-lg: 1.5rem;     /* 24px - Key metrics */
--font-weight-data: 500;    /* Medium weight for numbers */
```

### Font Weights
```css
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

---

## Spacing System

Base unit: 4px

```css
--space-0: 0;
--space-1: 0.25rem;    /* 4px */
--space-2: 0.5rem;     /* 8px */
--space-3: 0.75rem;    /* 12px */
--space-4: 1rem;       /* 16px */
--space-5: 1.25rem;    /* 20px */
--space-6: 1.5rem;     /* 24px */
--space-8: 2rem;       /* 32px */
--space-10: 2.5rem;    /* 40px */
--space-12: 3rem;      /* 48px */
--space-16: 4rem;      /* 64px */
--space-20: 5rem;      /* 80px */
```

### Component Spacing
```css
/* Cards */
--card-padding: var(--space-4);
--card-padding-lg: var(--space-6);
--card-gap: var(--space-3);

/* Tables */
--table-cell-padding-x: var(--space-3);
--table-cell-padding-y: var(--space-2);
--table-header-padding-y: var(--space-3);

/* Forms */
--input-padding-x: var(--space-3);
--input-padding-y: var(--space-2);
--form-gap: var(--space-4);

/* Sections */
--section-gap: var(--space-8);
--page-padding: var(--space-6);
```

---

## Border Radius

```css
--radius-none: 0;
--radius-sm: 4px;      /* Inputs, small buttons */
--radius-md: 6px;      /* Cards, dropdowns */
--radius-lg: 8px;      /* Modals, large cards */
--radius-full: 9999px; /* Pills, avatars */
```

**Important:** Avoid excessive rounding. Financial interfaces need precision, not playfulness.

---

## Shadows

```css
/* Subtle elevation for cards */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
--shadow-md: 0 2px 4px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
--shadow-lg: 0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04);

/* Focus rings */
--ring-focus: 0 0 0 2px var(--background), 0 0 0 4px var(--accent);
```

---

## Components

### Buttons

```css
/* Primary */
.btn-primary {
  background: var(--accent);
  color: white;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  transition: background 150ms ease;
}
.btn-primary:hover {
  background: var(--accent-hover);
}

/* Secondary */
.btn-secondary {
  background: transparent;
  color: var(--foreground);
  border: 1px solid var(--border);
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
}
.btn-secondary:hover {
  background: var(--background-subtle);
  border-color: var(--border-strong);
}

/* Ghost */
.btn-ghost {
  background: transparent;
  color: var(--foreground-muted);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
}
.btn-ghost:hover {
  background: var(--background-muted);
  color: var(--foreground);
}
```

### Cards

```css
.card {
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--card-padding);
}

/* Data card - for metrics */
.card-data {
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}
.card-data-value {
  font-size: var(--text-data-lg);
  font-weight: var(--font-semibold);
  font-feature-settings: "tnum";  /* Tabular numbers */
}
.card-data-label {
  font-size: var(--text-xs);
  color: var(--foreground-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

### Tables

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-data);
}
.table th {
  text-align: left;
  font-weight: var(--font-medium);
  color: var(--foreground-muted);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: var(--table-header-padding-y) var(--table-cell-padding-x);
  border-bottom: 1px solid var(--border);
}
.table td {
  padding: var(--table-cell-padding-y) var(--table-cell-padding-x);
  border-bottom: 1px solid var(--border);
  font-feature-settings: "tnum";  /* Tabular numbers for alignment */
}
.table tr:hover {
  background: var(--background-subtle);
}

/* Numeric columns - right aligned */
.table td[data-type="number"] {
  text-align: right;
  font-family: var(--font-mono);
}
```

### Inputs

```css
.input {
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--input-padding-y) var(--input-padding-x);
  font-size: var(--text-base);
  color: var(--foreground);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.input:hover {
  border-color: var(--border-strong);
}
.input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--ring-focus);
}
.input::placeholder {
  color: var(--foreground-subtle);
}
```

### Badges/Tags

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
}
.badge-success {
  background: var(--success-muted);
  color: var(--success);
}
.badge-danger {
  background: var(--danger-muted);
  color: var(--danger);
}
.badge-neutral {
  background: var(--background-muted);
  color: var(--foreground-muted);
}
```

---

## Financial Data Patterns

### Stock Price Display
```css
.stock-price {
  font-family: var(--font-mono);
  font-size: var(--text-data-lg);
  font-weight: var(--font-semibold);
  font-feature-settings: "tnum";
}
.stock-change {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}
.stock-change.positive { color: var(--positive); }
.stock-change.negative { color: var(--negative); }
.stock-change.neutral { color: var(--neutral); }
```

### Metric Cards
```html
<div class="metric-card">
  <span class="metric-label">Market Cap</span>
  <span class="metric-value">$2.89T</span>
  <span class="metric-change positive">+2.4%</span>
</div>
```

### Data Tables
- Always right-align numeric columns
- Use tabular numbers (font-feature-settings: "tnum")
- Subtle row hover states
- Sticky headers for long tables
- Sortable columns with clear indicators

---

## Layout Patterns

### Dashboard Grid
```css
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-4);
}
```

### Sidebar Layout
```css
.app-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100vh;
}
.sidebar {
  background: var(--background-subtle);
  border-right: 1px solid var(--border);
  padding: var(--space-4);
}
.main-content {
  padding: var(--page-padding);
  overflow-y: auto;
}
```

### Research Chat
```css
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}
.chat-input-area {
  border-top: 1px solid var(--border);
  padding: var(--space-4);
}
```

---

## Motion & Transitions

```css
--transition-fast: 100ms ease;
--transition-base: 150ms ease;
--transition-slow: 300ms ease;

/* Use sparingly - financial interfaces prioritize speed over animation */
.fade-in {
  animation: fadeIn var(--transition-base);
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

**Rules:**
- No decorative animations
- Transitions should feel instant (150ms max)
- Skeleton loaders for data fetching
- Optimistic UI updates where possible

---

## Responsive Breakpoints

```css
--breakpoint-sm: 640px;
--breakpoint-md: 768px;
--breakpoint-lg: 1024px;
--breakpoint-xl: 1280px;
--breakpoint-2xl: 1536px;
```

### Mobile Considerations
- Sidebar collapses to bottom nav on mobile
- Tables become scrollable horizontally
- Data cards stack vertically
- Touch targets minimum 44px

---

## Accessibility Requirements

- WCAG 2.1 AA compliance minimum
- Color contrast ratio: 4.5:1 for text, 3:1 for large text
- All interactive elements keyboard accessible
- Focus indicators always visible
- Screen reader friendly data tables
- No color-only indicators (use icons/text alongside)

---

## Anti-Patterns (DO NOT USE)

- Purple/indigo as primary color (AI aesthetic cliche)
- Excessive gradients
- Rounded corners > 8px on cards
- Decorative illustrations
- Playful micro-interactions
- Generic dashboard templates
- Stock imagery
- Excessive shadows
- Animated backgrounds
- Glassmorphism effects

---

## File Naming Conventions

```
components/
  ui/
    button.tsx
    card.tsx
    input.tsx
    table.tsx
  charts/
    line-chart.tsx
    candlestick-chart.tsx
  data/
    stock-quote.tsx
    metric-card.tsx
    price-change.tsx
```

---

## Implementation Notes

1. **Use Tailwind CSS** - Configure with these design tokens
2. **shadcn/ui** - Customize components to match this system
3. **Recharts** - Style charts with our color palette
4. **Inter font** - Load via next/font for performance
5. **JetBrains Mono** - For financial data display

This design system ensures Finsyt looks like a professional financial platform, not a generic AI SaaS product.
