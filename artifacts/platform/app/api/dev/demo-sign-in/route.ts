/**
 * POST /platform/api/dev/demo-sign-in
 *
 * Mints a single-use Clerk sign-in ticket for the seeded demo user
 * (preview only). The client consumes it with
 *   signIn.create({ strategy: "ticket", ticket })
 * so the demo password never crosses the wire. Returns 404 in
 * production. GET also returns 404 to avoid a method-leak oracle.
 */
import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import {
  DEMO_USER_EMAIL,
  isPreviewEnvironment,
} from "@/lib/preview-env";

const TICKET_TTL_SECONDS = 60;
const MAX_PER_MINUTE = 10;
const RATE_WINDOW_MS = 60_000;

const ipHits = new Map<string, number[]>();

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function rateLimited(req: NextRequest): boolean {
  const ip = clientIp(req);
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const hits = (ipHits.get(ip) ?? []).filter((t) => t >= cutoff);
  hits.push(now);
  ipHits.set(ip, hits);
  if (ipHits.size > 5_000) {
    const firstKey = ipHits.keys().next().value;
    if (firstKey) ipHits.delete(firstKey);
  }
  return hits.length > MAX_PER_MINUTE;
}

function notFound() {
  return new NextResponse("Not Found", { status: 404 });
}

export async function POST(req: NextRequest) {
  if (!isPreviewEnvironment()) return notFound();

  if (!process.env.DEMO_USER_PASSWORD) {
    return NextResponse.json(
      {
        error: "demo_password_unset",
        message:
          "DEMO_USER_PASSWORD secret is not set. Set it in the Replit Secrets pane and run `pnpm --filter @workspace/scripts run seed:demo`.",
      },
      { status: 503 },
    );
  }
  if (!process.env.CLERK_SECRET_KEY) {
    return NextResponse.json(
      {
        error: "clerk_unconfigured",
        message: "CLERK_SECRET_KEY is not set in this environment.",
      },
      { status: 503 },
    );
  }
  if (rateLimited(req)) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many demo sign-in requests. Try again shortly.",
      },
      {
        status: 429,
        headers: { "retry-after": String(Math.ceil(RATE_WINDOW_MS / 1000)) },
      },
    );
  }

  try {
    const clerk = await clerkClient();
    const users = await clerk.users.getUserList({
      emailAddress: [DEMO_USER_EMAIL],
      limit: 1,
    });
    const user = users.data[0];
    if (!user) {
      return NextResponse.json(
        {
          error: "demo_user_missing",
          message: `No Clerk user for ${DEMO_USER_EMAIL}. Run \`pnpm --filter @workspace/scripts run seed:demo\` first.`,
        },
        { status: 503 },
      );
    }
    const token = await clerk.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: TICKET_TTL_SECONDS,
    });
    return NextResponse.json(
      {
        ticket: token.token,
        redirectUrl: "/platform/app",
        email: DEMO_USER_EMAIL,
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "ticket_failed",
        message: `Could not mint demo sign-in ticket: ${msg}`,
      },
      { status: 502 },
    );
  }
}

export function GET() {
  return notFound();
}
