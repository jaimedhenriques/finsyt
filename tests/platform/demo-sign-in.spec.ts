import { test, expect, request as pwRequest } from "@playwright/test";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PASSWORD = process.env.DEMO_USER_PASSWORD || "";
const PLATFORM_DIR = path.resolve(__dirname, "..", "..", "artifacts", "platform");
const PREVIEW_ENV_PATH = path.join(PLATFORM_DIR, "lib", "preview-env.ts");
const ROUTE_PATH = path.join(
  PLATFORM_DIR,
  "app",
  "api",
  "dev",
  "demo-sign-in",
  "route.ts",
);

function runPreviewEnvHarness<T>(harnessSource: string, env: NodeJS.ProcessEnv): T {
  const harnessDir = path.join(PLATFORM_DIR, ".tmp-harness");
  fs.mkdirSync(harnessDir, { recursive: true });
  const tmpFile = path.join(
    harnessDir,
    `harness-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`,
  );
  fs.writeFileSync(tmpFile, harnessSource, "utf8");
  try {
    const out = execSync(`node --import tsx ${JSON.stringify(tmpFile)}`, {
      encoding: "utf8",
      env,
      cwd: PLATFORM_DIR,
    });
    const lastLine = out.trim().split("\n").filter(Boolean).pop()!;
    return JSON.parse(lastLine) as T;
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* best effort */
    }
  }
}

const OPEN_MODE_RAW = (process.env.PLATFORM_OPEN_MODE ?? "").trim().toLowerCase();
const OPEN_MODE = OPEN_MODE_RAW === "1" || OPEN_MODE_RAW === "true" || OPEN_MODE_RAW === "yes";

test.describe("platform demo sign-in (preview-only)", () => {
  test.skip(
    OPEN_MODE,
    "PLATFORM_OPEN_MODE=1 — login is disabled, /platform/sign-in redirects, and the demo button is no longer rendered. See open-mode.spec.ts.",
  );

  test.skip(
    !PASSWORD,
    "DEMO_USER_PASSWORD not set — preview demo button is disabled.",
  );

  test("SSR renders the demo button + helper line + secret hint", async ({
    baseURL,
  }) => {
    const ctx = await pwRequest.newContext({ baseURL });
    try {
      const res = await ctx.get("/platform/sign-in");
      expect(res.status()).toBe(200);
      const html = await res.text();

      expect(html).toContain('data-testid="demo-sign-in-button"');
      expect(html).toContain("Sign in as demo user");
      expect(html).toContain("demo@finsyt.com");
      expect(html).toContain("DEMO_USER_PASSWORD");
      expect(html).toContain("Demo access");
      expect(html, "literal password must never reach the browser").not.toContain(PASSWORD);
    } finally {
      await ctx.dispose();
    }
  });

  test("POST mints a single-use Clerk sign-in ticket and never leaks the password", async ({
    baseURL,
  }) => {
    const ctx = await pwRequest.newContext({ baseURL });
    try {
      const res = await ctx.post("/platform/api/dev/demo-sign-in");
      expect(res.status()).toBe(200);

      const body = (await res.json()) as {
        ticket?: string;
        redirectUrl?: string;
        email?: string;
      };
      expect(body.ticket).toBeTruthy();
      expect(typeof body.ticket).toBe("string");
      expect(body.ticket!.split(".").length).toBe(3);
      expect(body.redirectUrl).toBe("/platform/app");
      expect(body.email).toBe("demo@finsyt.com");
      expect(res.headers()["cache-control"]).toContain("no-store");

      const raw = await res.text();
      expect(raw, "literal password must never appear in the response").not.toContain(PASSWORD);
    } finally {
      await ctx.dispose();
    }
  });

  test("clicking the demo button signs the user in and lands them on /platform/app", async ({
    page,
  }) => {
    await page.goto("/platform/sign-in");

    const demoBtn = page.getByTestId("demo-sign-in-button");
    await expect(demoBtn).toBeVisible();
    await expect(demoBtn).toBeEnabled({ timeout: 10_000 });

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/platform/api/dev/demo-sign-in") &&
          r.request().method() === "POST",
        { timeout: 30_000 },
      ),
      demoBtn.click(),
    ]);
    expect(response.status()).toBe(200);

    const outcome = await Promise.race([
      page
        .waitForURL(/\/platform\/app(\/|$|\?)/, { timeout: 30_000 })
        .then(() => "navigated" as const)
        .catch(() => null),
      page
        .getByText(/2FA|seed:demo/i)
        .waitFor({ timeout: 30_000 })
        .then(() => "mfa-error" as const)
        .catch(() => null),
    ]);

    if (outcome === "mfa-error") {
      throw new Error(
        "Demo user has 2FA enabled — re-run `pnpm --filter @workspace/scripts run seed:demo` to disable it.",
      );
    }

    expect(outcome).toBe("navigated");
    await expect(page.locator('input[name="email"]')).toHaveCount(0);
    await expect(
      page.locator('a[href="/platform/app/watchlist"]').first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("GET on the demo-sign-in route returns 404 (no method-leak oracle)", async ({
    baseURL,
  }) => {
    const ctx = await pwRequest.newContext({ baseURL });
    try {
      const res = await ctx.get("/platform/api/dev/demo-sign-in");
      expect(res.status()).toBe(404);
    } finally {
      await ctx.dispose();
    }
  });

  test("preview-env helper: production env disables the demo affordance", () => {
    const harness = [
      `const raw = await import(${JSON.stringify(PREVIEW_ENV_PATH)});`,
      `const m = raw && typeof raw.isProductionDeployment === "function" ? raw : raw.default;`,
      `console.log(JSON.stringify({`,
      `  prod: m.isProductionDeployment(),`,
      `  preview: m.isPreviewEnvironment(),`,
      `  enabled: m.isDemoSignInPreviewEnabled(),`,
      `  email: m.DEMO_USER_EMAIL,`,
      `  secret: m.DEMO_PASSWORD_SECRET_NAME,`,
      `}));`,
    ].join("\n");

    const parsed = runPreviewEnvHarness<{
      prod: boolean;
      preview: boolean;
      enabled: boolean;
      email: string;
      secret: string;
    }>(harness, {
      ...process.env,
      NODE_ENV: "production",
      REPLIT_DEPLOYMENT: "1",
      DEMO_USER_PASSWORD: "anything",
      CLERK_SECRET_KEY: "sk_test_anything",
    });

    expect(parsed.prod).toBe(true);
    expect(parsed.preview).toBe(false);
    expect(parsed.enabled).toBe(false);
    expect(parsed.email).toBe("demo@finsyt.com");
    expect(parsed.secret).toBe("DEMO_USER_PASSWORD");
  });

  test("production-mode route handler: POST returns 404 and SSR omits the demo button", () => {
    const harness = [
      `const route = await import(${JSON.stringify(ROUTE_PATH)});`,
      `const env = await import(${JSON.stringify(PREVIEW_ENV_PATH)});`,
      `const envM = env && typeof env.isDemoSignInPreviewEnabled === "function" ? env : env.default;`,
      `const routeM = route && typeof route.POST === "function" ? route : route.default;`,
      `const { NextRequest } = await import("next/server");`,
      `const req = new NextRequest("http://localhost/platform/api/dev/demo-sign-in", { method: "POST" });`,
      `const post = await routeM.POST(req);`,
      `const get = await routeM.GET();`,
      `const postBody = await post.text();`,
      `const getBody = await get.text();`,
      `console.log(JSON.stringify({`,
      `  postStatus: post.status,`,
      `  getStatus: get.status,`,
      `  postBody,`,
      `  getBody,`,
      `  ssrEnabled: envM.isDemoSignInPreviewEnabled(),`,
      `}));`,
    ].join("\n");

    const parsed = runPreviewEnvHarness<{
      postStatus: number;
      getStatus: number;
      postBody: string;
      getBody: string;
      ssrEnabled: boolean;
    }>(harness, {
      ...process.env,
      NODE_ENV: "production",
      REPLIT_DEPLOYMENT: "1",
      DEMO_USER_PASSWORD: "anything",
      CLERK_SECRET_KEY: "sk_test_anything",
    });

    expect(parsed.postStatus).toBe(404);
    expect(parsed.getStatus).toBe(404);
    expect(parsed.postBody).toBe("Not Found");
    expect(parsed.getBody).toBe("Not Found");
    expect(parsed.ssrEnabled).toBe(false);
  });

  test("preview-env helper: missing DEMO_USER_PASSWORD disables the affordance even in preview", () => {
    const harness = [
      `const raw = await import(${JSON.stringify(PREVIEW_ENV_PATH)});`,
      `const m = raw && typeof raw.isPreviewEnvironment === "function" ? raw : raw.default;`,
      `console.log(JSON.stringify({`,
      `  preview: m.isPreviewEnvironment(),`,
      `  enabled: m.isDemoSignInPreviewEnabled(),`,
      `}));`,
    ].join("\n");

    const cleanEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v === undefined) continue;
      if (k === "DEMO_USER_PASSWORD") continue;
      cleanEnv[k] = v;
    }
    cleanEnv.NODE_ENV = "development";
    delete (cleanEnv as Record<string, string | undefined>).REPLIT_DEPLOYMENT;
    cleanEnv.CLERK_SECRET_KEY = cleanEnv.CLERK_SECRET_KEY || "sk_test_anything";

    const parsed = runPreviewEnvHarness<{
      preview: boolean;
      enabled: boolean;
    }>(harness, cleanEnv);
    expect(parsed.preview).toBe(true);
    expect(parsed.enabled).toBe(false);
  });
});
