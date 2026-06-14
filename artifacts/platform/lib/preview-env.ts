/**
 * Preview vs production gating for the demo sign-in affordance.
 * Functions re-read process.env on every call so tests can flip
 * env vars without re-importing.
 */

export function isProductionDeployment(): boolean {
  return (
    process.env.REPLIT_DEPLOYMENT === "1" &&
    process.env.NODE_ENV === "production"
  );
}

export function isPreviewEnvironment(): boolean {
  return !isProductionDeployment();
}

export function isDemoSignInPreviewEnabled(): boolean {
  if (!isPreviewEnvironment()) return false;
  if (!process.env.DEMO_USER_PASSWORD) return false;
  if (!process.env.CLERK_SECRET_KEY) return false;
  return true;
}

export const DEMO_USER_EMAIL =
  process.env.DEMO_USER_EMAIL || "demo@finsyt.com";

export const DEMO_PASSWORD_SECRET_NAME = "DEMO_USER_PASSWORD";
