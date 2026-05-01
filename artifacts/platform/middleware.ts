import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { OPEN_MODE } from "@/lib/open-mode";

const isProtectedRoute = createRouteMatcher(["/app(.*)"]);
const isProtectedApiRoute = createRouteMatcher([
  "/api/company-discovery(.*)",
  "/api/coresignal(.*)",
  "/api/eodhd(.*)",
  "/api/agent/ask(.*)",
  "/api/ai-research(.*)",
  "/api/research(.*)",
  "/api/sec(.*)",
  "/api/workspaces/(.*)",
  "/api/quote(.*)",
  "/api/aggs(.*)",
  "/api/financials(.*)",
  "/api/news(.*)",
  "/api/filings(.*)",
  "/api/insider(.*)",
  "/api/search(.*)",
  "/api/screener(.*)",
  "/api/census(.*)",
  "/api/macro(.*)",
  "/api/transcripts(.*)",
]);
const isAuthEntryRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/forgot-password(.*)",
  "/reset-password(.*)",
]);

/**
 * Edge-side per-IP throttle for the unauthenticated auth entry pages.
 * The bulk of brute-force defense lives in the API server (in front of the
 * Clerk Frontend API proxy); this is a defense-in-depth layer that prevents
 * abusers from hammering the heavy Next.js sign-in bundle itself.
 *
 * State is per-instance — for multi-region/multi-replica deployments back
 * this with Upstash Redis or Vercel KV.
 */
const AUTH_PAGE_WINDOW_MS = 60_000;
const AUTH_PAGE_LIMIT = 30;
const authPageHits = new Map<string, number[]>();

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function authPageThrottled(req: NextRequest): boolean {
  const ip = clientIp(req);
  const now = Date.now();
  const cutoff = now - AUTH_PAGE_WINDOW_MS;
  const hits = (authPageHits.get(ip) ?? []).filter((t) => t >= cutoff);
  hits.push(now);
  authPageHits.set(ip, hits);
  // Bound the map so a flood of unique IPs can't grow it without bound.
  if (authPageHits.size > 10_000) {
    const firstKey = authPageHits.keys().next().value;
    if (firstKey) authPageHits.delete(firstKey);
  }
  return hits.length > AUTH_PAGE_LIMIT;
}

function applySecurityHeaders(req: NextRequest): NextResponse {
  const isProd = process.env.NODE_ENV === "production";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `frame-ancestors ${isProd ? "'none'" : "*"}`,
    `frame-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://challenges.cloudflare.com`,
    `object-src 'none'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://*.clerk.com https://*.clerk.accounts.dev https://challenges.cloudflare.com${isProd ? "" : " 'unsafe-eval' 'unsafe-inline'"}`,
    `worker-src 'self' blob:`,
    `connect-src 'self' https: wss:`,
    `form-action 'self'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("content-security-policy", csp);

  const res = NextResponse.next({ request: { headers: reqHeaders } });

  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.headers.set("X-Content-Type-Options", "nosniff");
  if (isProd) {
    res.headers.set("X-Frame-Options", "DENY");
  }
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
  res.headers.delete("X-Powered-By");

  return res;
}

export default clerkMiddleware(async (auth, req) => {
  if (isAuthEntryRoute(req) && authPageThrottled(req)) {
    return new NextResponse(
      JSON.stringify({
        error: "Too Many Requests",
        message: "Too many sign-in attempts from your network. Try again shortly.",
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(Math.ceil(AUTH_PAGE_WINDOW_MS / 1000)),
        },
      },
    );
  }
  // PLATFORM_OPEN_MODE — temporary demo bypass.
  // When on, the request is allowed through without a Clerk session and
  // server code resolves to a fixed demo principal (see lib/auth-server.ts).
  // Off by default; flip on with PLATFORM_OPEN_MODE=1 in the workspace only.
  if (!OPEN_MODE) {
    if (isProtectedApiRoute(req)) {
      const { userId } = await auth();
      if (!userId) {
        return new NextResponse(
          JSON.stringify({ error: "Unauthorized", message: "Authentication required." }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          },
        );
      }
    }
    if (isProtectedRoute(req)) {
      const { userId } = await auth();
      if (!userId) {
        const signInUrl = new URL("/platform/sign-in", req.url);
        signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname + req.nextUrl.search);
        return NextResponse.redirect(signInUrl);
      }
    }
  }
  return applySecurityHeaders(req);
});

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt)$).*)",
    },
  ],
};
