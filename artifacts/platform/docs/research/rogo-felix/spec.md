# Rogo Felix Landing Page Clone Spec
**Source:** https://rogo.ai/felix
**Date extracted:** 2026-04-13

---

## Design Tokens

### Colors
- Background: `#F0F0EE` (warm off-white / light greige — NOT pure white)
- Primary text: `#0D0D0B` (near black, slightly warm)
- Secondary text: `#9B9B96` (warm gray)
- CTA button bg: `#1A3028` (very dark forest green)
- CTA button text: `#FFFFFF`
- Card / email UI bg: `#FFFFFF` white
- Card border: very subtle `rgba(0,0,0,0.07)`
- Logo text "rogo": lowercase, dark, likely `#0D0D0B`
- "by Rogo" caption: `#9B9B96` gray, bottom-right

### Typography
- Primary font: **Serif** — appears to be a classic oldstyle serif (Playfair Display, Cormorant, or similar)
- H1: ~`80-96px`, `font-weight: 400` (regular weight), `line-height: 1.05`
  - "Meet Felix." — first line
  - "Your new colleague." — second line
  - Centered
- Subheadline: `18px`, `font-weight: 400`, `color: #9B9B96`, centered
  - "Delegate tasks to Felix. Available 24/7 by email."
- Button text: `14-16px`, `font-weight: 500`, sans-serif
- Email UI text: `13-14px`, `font-weight: 400`, `color: #0D0D0B`
- Caption "by Rogo": `14px`, serif or sans, bottom-right

### Spacing
- Very generous vertical rhythm — minimal sections, lots of breathing room
- Hero padding top: ~`120px`
- Content max-width: `640px` centered for hero text

### Buttons
- Single CTA: `bg: #1A3028`, `color: #FFFFFF`, `border-radius: 9999px` (pill), `padding: 14px 32px`, `font-size: 16px`, `font-weight: 500`
- Hover: slight bg lightening (probably `#243d31`)
- Nav CTA (top-right): same style, smaller — `padding: 10px 22px`

---

## Page Structure (top to bottom)

### 1. NAV (minimal)
- Left: "rogo" wordmark in lowercase, dark, no icon — just text logo
- Right: [Request Access] pill button in dark green
- Very minimal — no nav links
- Transparent / white-ish bg, no border

### 2. HERO (full-width centered)
- Background: `#F0F0EE` greige
- Center-aligned layout
- H1 two lines:
  - Line 1: "Meet Felix."
  - Line 2: "Your new colleague."
  - Serif font, large, no gradient, pure dark text
- Subtext below: "Delegate tasks to Felix. Available 24/7 by email."
- CTA: [Request Access] dark green pill button, centered
- No product screenshot in hero — clean typographic only

### 3. EMAIL DEMO SECTION (animated card)
- White card on greige background
- Shows an email compose interface:
  - "To: Felix by Rogo ×" — with green avatar icon
  - Subject: "AAPL Deepdive" / "AAPL Discussion materials.pptx"
  - Body starts: "Hey Felix, We got this product deepdive for Apple..."
- Below the email card, output files shown:
  - "AAPL Discussion materials.pptx" — PPTX icon, `813KB`
  - "AAPL Operating Model.xlsx" — XLSX icon, `89KB`
- The section animates: email appears → pause → output files materialize below
- INTERACTION MODEL: time-driven CSS animation, not scroll or click
- Card has white bg, `border-radius: 16px`, `box-shadow: 0 4px 40px rgba(0,0,0,0.08)`

### 4. LARGE TYPOGRAPHIC SECTION — "Felix" watermark
- Full-width section showing massive "Felix" text as background watermark
- Very large serif, same greige color but slightly lighter — inset/embossed effect (CSS: `color: transparent`, `text-stroke`, or `mix-blend-mode`)
- "by Rogo" text bottom-right in small gray
- Purely decorative / brand section

### 5. NO FOOTER
- Page ends after the Felix watermark section
- No navigation footer, no links, extremely minimal

---

## Key Design Principles to Replicate
1. **Restraint** — fewer elements, more breathing room
2. **Serif-first** — elegant oldstyle serif for all display text
3. **Greige not white** — `#F0F0EE` not `#FFFFFF` for bg
4. **One CTA** — "Request Access" everywhere, nothing else
5. **Animated email demo** — this is the whole product proof, make it feel alive
6. **No social proof, no logos, no pricing** — maximum confidence through minimalism
