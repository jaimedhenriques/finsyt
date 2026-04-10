# AGENTS.md

## Cursor Cloud specific instructions

### Product overview
Finsyt is an AI-powered financial intelligence SaaS frontend prototype built with React 19 + Vite 8 + Tailwind CSS 3. All data is mocked — there is no backend, database, or external API dependency.

### Running the app
- `npm run dev` — starts Vite dev server on `http://localhost:5173/` with HMR
- `npm run build` — production build to `dist/`
- `npm run lint` — runs ESLint (flat config, see `eslint.config.js`)
- `npm run preview` — serves the production build locally

### Known lint issues
`npm run lint` exits with code 1 due to 2 pre-existing unused-variable errors (`Navbar.jsx`, `Settings.jsx`). These are in the existing codebase and are not caused by agent changes.

### Notes
- The lockfile is `package-lock.json` — always use `npm` (not pnpm/yarn).
- No tests exist in the repository; there is no test script in `package.json`.
- Auth is cosmetic (state toggle only); no real auth provider is wired up.
- Dashboard sidebar tabs (Watchlist, Insights, Alerts) update the URL query param but share the same Overview view in the current prototype.
