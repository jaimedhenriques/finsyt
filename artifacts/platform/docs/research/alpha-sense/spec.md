# AlphaSense Landing Page Clone Spec
**Source:** https://www.alpha-sense.com
**Date extracted:** 2026-04-13

---

## Design Tokens

### Colors
- Background: `#FFFFFF` (pure white)
- Primary text: `#0D1117` (near black)
- Accent / CTA blue: `#1A56FF` (bright electric blue)
- Secondary text: `#6B7280` (gray)
- Nav background: `#FFFFFF` with subtle bottom border `#E5E7EB`
- Section bg alternate: `#F9FAFB` (very light gray)
- Number labels (01/02/03): `#6B7280` small
- Tag pills (WEBINARS, ON-DEMAND): `#F0F4FF` bg, `#1A56FF` text, `border-radius: 4px`

### Typography
- Font: System sans-serif stack, likely **Inter** or similar
- H1: `~56px`, `font-weight: 700`, `line-height: 1.1`, dark `#0D1117`
  - Contains blue gradient span for "AI insights you can trust"
- H2: `~40px`, `font-weight: 700`
- H3: `~24px`, `font-weight: 600`
- Body: `16px`, `font-weight: 400`, `color: #4B5563`
- Nav links: `14px`, `font-weight: 500`

### Spacing
- Section padding: `96px 0` on desktop
- Max content width: `1280px`, centered
- Grid gap: `48px`

### Buttons
- Primary: `bg: #1A56FF`, `color: white`, `border-radius: 6px`, `padding: 12px 24px`, `font-weight: 600`, `→` arrow icon on right
- Secondary/outline: `border: 1.5px solid #0D1117`, `bg: transparent`, `color: #0D1117`, same radius/padding
- Nav CTA: Same as primary but slightly smaller

---

## Page Structure (top to bottom)

### 1. NAV
- Logo: "AlphaSense" wordmark, dark text, top-left
- Links: Platform ▾, Solutions ▾, Resources ▾, About ▾, Pricing
- Right: 🔍 search icon | Log In ↗ | Customer Support | [Get Started for Free →] blue CTA
- Sticky on scroll, white bg, 1px bottom border

### 2. HERO (split layout)
- Left col (50%): 
  - Headline: `Accelerate your workflow with` (dark) + `AI insights you can trust` (blue, same line wrapping)
  - Subheadline: "Your biggest decisions deserve the most trusted AI platform for actionable insights. See why the best choose AlphaSense."
  - Two buttons: [Start Free Trial] primary blue + [Take the Tour] outline
- Right col (50%): 
  - Product screenshot / UI mockup showing "Ask AlphaSense" chat interface
  - Shows: Sources selector, Auto / Think Longer / Deep Research pills
  - Background: blue `#1A56FF` card, floating on white

### 3. TRUST STRIP
- Text: "Trusted by 6,500+ of the world's largest enterprises"
- Row of company logos (scrolling or static)

### 4. SOLUTIONS GRID — "AI workflows that speak your market's language"
- Label: `EXPLORE SOLUTIONS` small caps
- Two-column list of industries:
  - Investment Banking | Life Sciences & Healthcare
  - Hedge Funds | Tech, Media, & Telecom
  - Private Equity | Energy
  - Asset Management | Industrials
  - Consulting | Consumer Goods & Retail
- Each row has a subtle bottom border `#E5E7EB`
- On hover: text shifts to blue

### 5. CONTENT SECTION — "The most expansive collection of curated sources, all in one place"
- Numbered tab navigation: 01 | 02 | 03 | 04 on left vertical strip (sticky sidebar)
- Active tab has blue left border
- Right side shows platform UI screenshot
- INTERACTION MODEL: scroll-driven — as user scrolls through the section, active number changes via IntersectionObserver
- Content per tab:
  - 01: "500+ million premium financial and business documents" — Tegus transcripts, broker research, filings
  - 02: "Integrated workflows, not isolated insights" — UI showing All/Transcripts/Earnings Calls tabs
  - 03: "Decisions made with confidence, not hesitance" — GenAI real-time insights
  - 04: "Highly synthesized insights for hard-to-answer questions" — Deep Research CTA

### 6. FEATURE CALLOUT — "The Next Generation of AlphaSense's Generative Search"
- Label: `FEATURE CALLOUT` small caps gray
- Large headline left, body text right
- Body: "Eliminate fragmented workflows with the next generation of Generative Search..."
- Background: white, subtle left accent line or badge

### 7. CUSTOMER STORIES — "Our customers instantly gain a competitive edge"
- Intro: "AlphaSense gives thousands of teams the precise answers..."
- Cards grid (2-col on desktop):
  - Label: `Powering Competitive Intelligence` + company name Salesforce
  - Label: `Faster Innovation for Smarter Strategy` + Dow
  - Label: `Boost Investment Confidence` + ODDO BHF
  - Label: `Defy the Unknown and Drive Conviction` + YH2 Capital
  - + 2 more
- Each card: white bg, subtle border, hover shadow, "Read Full Story →"

### 8. RESOURCES — "GenAI from AlphaSense redefines what market intelligence can achieve"
- Row of 3 cards: article/report type
- Each card: image top, tag (PRODUCT ARTICLE / REPORT), headline, description

### 9. ALPHASUMMIT SECTION
- "Insights from AlphaSummit 2025" + "Watch All Session Recordings →"
- 3-col cards with video thumbnails + title + tags (WEBINARS & VIDEOS, ON-DEMAND)

### 10. CTA BANNER — "Transform intelligence into advantage"
- Centered, dark bg (`#0D1117`), white text
- Subtext: "Develop bold strategies, seize opportunities, and lead with clarity and confidence."
- CTA: [Get Started for Free] blue button

### 11. FOOTER
- 5-col layout: PLATFORM | SOLUTIONS | CUSTOMERS | ABOUT + legal links
- Bottom bar: copyright + Legal & Compliance | Cookie Preferences | Privacy Policy | Terms | DNSMPI
