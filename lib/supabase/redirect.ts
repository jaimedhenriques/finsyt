const DEFAULT_APP_PATH = "/app/research"

export function getSafeNextPath(candidate?: string | null): string {
  if (!candidate) return DEFAULT_APP_PATH
  if (!candidate.startsWith("/")) return DEFAULT_APP_PATH
  if (candidate.startsWith("//")) return DEFAULT_APP_PATH
  if (candidate.startsWith("/app/auth")) return DEFAULT_APP_PATH

  return candidate
}
