#!/bin/bash
# Sync the current `main` branch up to the user's GitHub mirror at
# https://github.com/jaimedhenriques/finsyt. Designed to be called from
# scripts/post-merge.sh so every merged task lands on GitHub too, but
# safe to run manually as well.
#
# Push model:
#   - Each run builds a fresh "mirror commit" — a snapshot of local HEAD's
#     tree with .github/workflows/ excluded — and pushes it to refs/heads/main
#     on the GitHub mirror with --force-with-lease.
#   - .github/workflows/ is excluded because the Replit GitHub OAuth app
#     does not include the `workflow` scope; GitHub rejects any push that
#     creates or modifies files under that path. Stripping it lets the rest
#     of the monorepo mirror cleanly. The local working tree, index, and
#     refs are never modified.
#   - The mirror commit is parentless. Each run rewrites the remote `main`
#     to a single snapshot. We do not preserve git history on the mirror;
#     full history lives in the Replit workspace and its checkpoints.
#
# Idempotency:
#   - If the remote tree already equals what we would push (same content),
#     the script logs "nothing to push" and exits without making a push.
#
# Safety:
#   - Always uses --force-with-lease=main:<observed remote sha>. If someone
#     pushed to the GitHub mirror between our fetch and our push, the lease
#     fails and we abort instead of clobbering their work.
#   - Never persists secrets in .git/config or remote URLs. Auth happens via
#     scripts/git-credential-replit-github.mjs, which fetches a short-lived
#     access token from the Replit GitHub connector at request time.

set -u

REMOTE_NAME="github"
REMOTE_URL="https://github.com/jaimedhenriques/finsyt.git"
HELPER_SCRIPT="$PWD/scripts/git-credential-replit-github.mjs"

log() { echo "[sync-to-github] $*"; }

if [ ! -x "$HELPER_SCRIPT" ]; then
  log "credential helper not found or not executable at $HELPER_SCRIPT — skipping push"
  exit 0
fi

# Wire the credential helper for github.com. --replace-all keeps re-runs from
# stacking duplicates.
git config --local --replace-all credential.https://github.com.helper "!node $HELPER_SCRIPT" || {
  log "could not configure credential helper — skipping push"
  exit 0
}

# Make sure the remote exists and points at the right URL.
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
  # Could be that remote main does not exist yet (empty repo). Continue
  # and let the push attempt sort it out.
  log "fetch returned non-zero (possibly empty remote) — continuing"
fi

REMOTE_HEAD=$(git rev-parse "$REMOTE_NAME/main" 2>/dev/null || echo "")
REMOTE_TREE=$(git rev-parse "$REMOTE_NAME/main^{tree}" 2>/dev/null || echo "")

# Build the mirror tree (snapshot of HEAD minus .github/workflows/) using a
# temporary index so the real index, working tree, and refs are untouched.
build_mirror_tree() {
  local source_sha="$1"
  local tmp_idx
  tmp_idx=$(mktemp)
  GIT_INDEX_FILE="$tmp_idx" git read-tree "$source_sha" >/dev/null
  GIT_INDEX_FILE="$tmp_idx" git ls-files .github/workflows 2>/dev/null \
    | xargs -r -I{} env GIT_INDEX_FILE="$tmp_idx" git update-index --force-remove "{}" >/dev/null
  GIT_INDEX_FILE="$tmp_idx" git write-tree
  rm -f "$tmp_idx"
}

# Wrap the tree in a parentless commit, copying author/committer metadata
# and message from the source commit so the mirror commit looks the same on
# GitHub as the local commit it was synthesized from.
build_mirror_commit() {
  local source_sha="$1"
  local tree_sha="$2"
  local subject body
  subject=$(git log -1 --format=%s "$source_sha")
  body=$(git log -1 --format=%b "$source_sha")
  local message="$subject"
  [ -n "$body" ] && message="$subject

$body"
  GIT_AUTHOR_NAME=$(git log -1 --format=%an "$source_sha") \
  GIT_AUTHOR_EMAIL=$(git log -1 --format=%ae "$source_sha") \
  GIT_AUTHOR_DATE=$(git log -1 --format=%aI "$source_sha") \
  GIT_COMMITTER_NAME=$(git log -1 --format=%cn "$source_sha") \
  GIT_COMMITTER_EMAIL=$(git log -1 --format=%ce "$source_sha") \
  GIT_COMMITTER_DATE=$(git log -1 --format=%cI "$source_sha") \
    git commit-tree "$tree_sha" -m "$message"
}

log "building mirror tree (snapshot of $LOCAL_HEAD without .github/workflows/)"
MIRROR_TREE=$(build_mirror_tree "$LOCAL_HEAD")
if [ -z "$MIRROR_TREE" ]; then
  log "failed to build mirror tree — skipping push"
  exit 0
fi

# Idempotency check: if the remote already has the same tree, the workspace
# state is already mirrored and there's nothing to push.
if [ -n "$REMOTE_TREE" ] && [ "$REMOTE_TREE" = "$MIRROR_TREE" ]; then
  log "remote tree already matches local mirror tree ($MIRROR_TREE) — nothing to push"
  exit 0
fi

MIRROR_SHA=$(build_mirror_commit "$LOCAL_HEAD" "$MIRROR_TREE")
if [ -z "$MIRROR_SHA" ]; then
  log "failed to build mirror commit — skipping push"
  exit 0
fi
log "  mirror tree:   $MIRROR_TREE"
log "  mirror commit: $MIRROR_SHA"

# Always use --force-with-lease keyed to the remote SHA we just observed.
# If the remote moved underneath us, the push aborts safely.
LEASE_VALUE="${REMOTE_HEAD:-}"
log "pushing mirror commit -> $REMOTE_NAME/main (--force-with-lease=main:${LEASE_VALUE:-<empty>})"
PUSH_ARGS=("--force-with-lease=main:${LEASE_VALUE}" "$REMOTE_NAME" "$MIRROR_SHA:refs/heads/main")

PUSH_OK=0
git push "${PUSH_ARGS[@]}" > /tmp/sync-to-github.push.out 2>&1 && PUSH_OK=1
sed 's/^/[sync-to-github]   /' /tmp/sync-to-github.push.out
rm -f /tmp/sync-to-github.push.out

if [ "$PUSH_OK" = "1" ]; then
  log "push complete: local $LOCAL_HEAD -> github/main $MIRROR_SHA"
else
  log "push failed (see above) — leaving remote untouched"
  exit 0
fi
