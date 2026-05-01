#!/bin/bash
# Sync the current `main` branch up to the user's GitHub mirror at
# https://github.com/jaimedhenriques/finsyt. Designed to be called from
# scripts/post-merge.sh so every merged task lands on GitHub too, but
# safe to run manually as well.
#
# Idempotent:
#   - Wires the `github` remote on first run, leaves it alone afterward.
#   - Refuses to force-push: if remote `main` has diverged from local
#     `main`, prints the two heads and exits 0 without pushing.
#   - Exits 0 (with a "nothing to push" log line) when remote already
#     matches local.
#
# Auth:
#   - Uses scripts/git-credential-replit-github.mjs which fetches the
#     access token from the Replit GitHub connector at runtime. No
#     PATs, no secrets persisted in .git/config or remote URLs.

set -u

REMOTE_NAME="github"
REMOTE_URL="https://github.com/jaimedhenriques/finsyt.git"
HELPER_SCRIPT="$PWD/scripts/git-credential-replit-github.mjs"

log() { echo "[sync-to-github] $*"; }

if [ ! -x "$HELPER_SCRIPT" ]; then
  log "credential helper not found or not executable at $HELPER_SCRIPT — skipping push"
  exit 0
fi

# Ensure git knows to use our credential helper for github.com. Use
# --replace-all so re-runs don't accumulate duplicates.
git config --local --replace-all credential.https://github.com.helper "!node $HELPER_SCRIPT" || {
  log "could not configure credential helper — skipping push"
  exit 0
}

# Ensure the remote exists and points at the right URL. Don't fail the
# whole post-merge if this is somehow blocked.
if git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  CURRENT_URL=$(git remote get-url "$REMOTE_NAME")
  if [ "$CURRENT_URL" != "$REMOTE_URL" ]; then
    log "updating $REMOTE_NAME url $CURRENT_URL -> $REMOTE_URL"
    git remote set-url "$REMOTE_NAME" "$REMOTE_URL" || { log "remote set-url failed — skipping push"; exit 0; }
  fi
else
  log "adding remote $REMOTE_NAME -> $REMOTE_URL"
  git remote add "$REMOTE_NAME" "$REMOTE_URL" || { log "remote add failed — skipping push"; exit 0; }
fi

LOCAL_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "")
if [ -z "$LOCAL_HEAD" ]; then
  log "no local HEAD found — skipping push"
  exit 0
fi

log "fetching $REMOTE_NAME/main"
if ! git fetch --no-tags "$REMOTE_NAME" main 2>&1 | sed 's/^/[sync-to-github]   /'; then
  # Could be that remote main does not exist yet (empty repo); we'll
  # try the push below regardless.
  log "fetch returned non-zero (possibly empty remote) — continuing"
fi

REMOTE_HEAD=$(git rev-parse "$REMOTE_NAME/main" 2>/dev/null || echo "")

if [ -n "$REMOTE_HEAD" ]; then
  if [ "$REMOTE_HEAD" = "$LOCAL_HEAD" ]; then
    log "remote already at $LOCAL_HEAD — nothing to push"
    exit 0
  fi
  if ! git merge-base --is-ancestor "$REMOTE_HEAD" "$LOCAL_HEAD" 2>/dev/null; then
    log "REFUSING TO PUSH: $REMOTE_NAME/main has diverged from local main"
    log "  local  HEAD: $LOCAL_HEAD"
    log "  remote HEAD: $REMOTE_HEAD"
    log "  Resolve manually (merge or force-overwrite) and rerun this script."
    exit 0
  fi
fi

log "pushing local main -> $REMOTE_NAME/main"
if git push "$REMOTE_NAME" "HEAD:refs/heads/main" 2>&1 | sed 's/^/[sync-to-github]   /'; then
  log "push complete: $LOCAL_HEAD"
else
  log "push failed (see above)"
  exit 0
fi
