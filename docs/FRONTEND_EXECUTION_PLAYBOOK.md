# Frontend Execution Playbook (Finsyt)

This file is mandatory context for any frontend implementation task.

## 1) Input sources (priority order)

1. `DESIGN.md` (project root)
2. Product requirements / user story
3. Existing component patterns in this repo
4. Skill packs in `.skills/`

## 2) UX standards

- Build for professional finance users first.
- Prioritize information hierarchy over decorative visuals.
- Support dense datasets without sacrificing readability.
- Keep interactions deterministic and explainable.

## 3) Visual standards

- Light, institutional UI with blue accents.
- Neutral surfaces and low-noise shadows.
- 8px spacing rhythm.
- High-contrast typography for tabular and numeric data.
- Strong affordances for status, trend, and risk indicators.

## 4) Accessibility checklist

- Keyboard navigable interactive controls.
- Visible focus rings.
- Semantic headings and landmarks.
- Form labels and error messages.
- Minimum contrast ratio of 4.5:1 for body text.

## 5) Performance checklist

- Avoid unnecessary client-side rendering for static sections.
- Lazy-load non-critical visualizations.
- Optimize images and third-party scripts.
- Track page-level Core Web Vitals for key routes.

## 6) SEO checklist (marketing pages)

- Unique title and meta description per page.
- Open Graph + Twitter card metadata.
- Canonical URL where needed.
- Descriptive heading structure.
- Internal links to key product pages.

## 7) Done definition for frontend tasks

A frontend task is not complete until:

1. UI follows `DESIGN.md`.
2. Responsive behavior is verified (mobile/tablet/desktop).
3. Accessibility checklist is satisfied.
4. Performance and SEO checks are validated for affected pages.
5. Notes are added to PR description describing design decisions.
