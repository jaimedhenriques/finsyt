// Resolve a Next.js basePath-aware URL for client-side `fetch()` calls.
//
// `next.config.ts` sets `basePath: '/platform'`, which means the Next dev
// server serves every route — including `/api/*` — under `/platform`. The
// outer Replit reverse proxy only routes the `/platform/*` path to this
// service; bare `/api/...` requests get sent to the separate api-server
// service and return 401. Because Next does NOT auto-prefix raw `fetch()`
// calls (only `<Link>`, `<Image>`, `useRouter()`), every browser-side fetch
// to an internal route handler must include the basePath itself.
export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
  if (!path.startsWith('/')) path = `/${path}`
  if (base && path.startsWith(`${base}/`)) return path
  return `${base}${path}`
}
