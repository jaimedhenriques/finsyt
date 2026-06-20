#!/bin/bash
# Pull a branch or PR from the GitHub mirror into a local tracking branch.
#
# Usage:
#   bash scripts/pull-from-github.sh <branch-name>
#   bash scripts/pull-from-github.sh --pr <pr-number>
#
# The script creates a local branch named github/<branch> pointing at the
# fetched remote branch and prints instructions for reviewing and merging.
#
# Auth: reuses scripts/git-credential-replit-github.mjs — no new secrets needed.

set -euo pipefail

REMOTE_NAME="github"
REMOTE_URL="https://github.com/jaimedhenriques/finsyt.git"
REPO_API="https://api.github.com/repos/jaimedhenriques/finsyt"
HELPER_SCRIPT="$PWD/scripts/git-credential-replit-github.mjs"

log()  { echo "[pull-from-github] $*"; }
die()  { echo "[pull-from-github] ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
  cat >&2 <<EOF
Usage:
  bash scripts/pull-from-github.sh <branch-name>
  bash scripts/pull-from-github.sh --pr <pr-number>

Examples:
  bash scripts/pull-from-github.sh feat/my-feature
  bash scripts/pull-from-github.sh --pr 42
EOF
  exit 1
}

# ---------------------------------------------------------------------------
# Parse args
# ---------------------------------------------------------------------------
BRANCH=""
PR_NUMBER=""

if [ $# -eq 0 ]; then
  usage
elif [ "$1" = "--pr" ]; then
  [ $# -ge 2 ] || die "--pr requires a PR number"
  PR_NUMBER="$2"
elif [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  usage
else
  BRANCH="$1"
fi

# ---------------------------------------------------------------------------
# Resolve PR number → branch name (unauthenticated; repo is public)
# ---------------------------------------------------------------------------
if [ -n "$PR_NUMBER" ]; then
  log "resolving PR #${PR_NUMBER} via GitHub API …"
  PR_URL="${REPO_API}/pulls/${PR_NUMBER}"
  if command -v curl >/dev/null 2>&1; then
    PR_JSON=$(curl -fsSL -H "Accept: application/vnd.github+json" "$PR_URL") \
      || die "GitHub API call failed for PR #${PR_NUMBER} (is the PR number correct?)"
  else
    die "curl is required to resolve PR numbers but was not found"
  fi

  # Extract head.ref using node (already available in the Replit environment)
  BRANCH=$(node -e "
    const d = JSON.parse(process.argv[1]);
    if (!d || !d.head || !d.head.ref) { process.stderr.write('unexpected API response\n'); process.exit(1); }
    process.stdout.write(d.head.ref);
  " "$PR_JSON") || die "could not parse head branch from PR API response"

  PR_TITLE=$(node -e "
    const d = JSON.parse(process.argv[1]);
    process.stdout.write(d.title || '');
  " "$PR_JSON")

  log "  PR #${PR_NUMBER}: \"${PR_TITLE}\""
  log "  head branch: ${BRANCH}"
fi

[ -n "$BRANCH" ] || die "no branch resolved — aborting"

LOCAL_BRANCH="github/${BRANCH}"

# ---------------------------------------------------------------------------
# Wire the credential helper
# ---------------------------------------------------------------------------
if [ ! -f "$HELPER_SCRIPT" ]; then
  die "credential helper not found at $HELPER_SCRIPT"
fi
if [ ! -x "$HELPER_SCRIPT" ]; then
  chmod +x "$HELPER_SCRIPT"
fi

git config --local --replace-all credential.https://github.com.helper "!node $HELPER_SCRIPT" || \
  die "could not configure credential helper"

# ---------------------------------------------------------------------------
# Ensure the remote exists
# ---------------------------------------------------------------------------
if git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  CURRENT_URL=$(git remote get-url "$REMOTE_NAME")
  if [ "$CURRENT_URL" != "$REMOTE_URL" ]; then
    log "updating $REMOTE_NAME url: $CURRENT_URL -> $REMOTE_URL"
    git remote set-url "$REMOTE_NAME" "$REMOTE_URL"
  fi
else
  log "adding remote $REMOTE_NAME -> $REMOTE_URL"
  git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi

# ---------------------------------------------------------------------------
# Fetch the branch
# ---------------------------------------------------------------------------
log "fetching ${REMOTE_NAME}/${BRANCH} …"
if ! git fetch --no-tags "$REMOTE_NAME" "${BRANCH}:refs/remotes/${REMOTE_NAME}/${BRANCH}" 2>&1 \
     | sed "s/^/[pull-from-github]   /"; then
  die "fetch failed — does the branch '${BRANCH}' exist on the GitHub mirror?"
fi

REMOTE_SHA=$(git rev-parse "${REMOTE_NAME}/${BRANCH}" 2>/dev/null) \
  || die "could not resolve ${REMOTE_NAME}/${BRANCH} after fetch"

# ---------------------------------------------------------------------------
# Create (or reset) the local tracking branch
# ---------------------------------------------------------------------------
if git show-ref --verify --quiet "refs/heads/${LOCAL_BRANCH}"; then
  log "branch '${LOCAL_BRANCH}' already exists — resetting to ${REMOTE_SHA}"
  git branch -f "${LOCAL_BRANCH}" "${REMOTE_SHA}"
else
  log "creating local branch '${LOCAL_BRANCH}' at ${REMOTE_SHA}"
  git branch "${LOCAL_BRANCH}" "${REMOTE_SHA}"
fi

# ---------------------------------------------------------------------------
# Validate resolved branch name before using it in git refspecs
# ---------------------------------------------------------------------------
git check-ref-format --branch "$BRANCH" >/dev/null 2>&1 \
  || die "resolved branch name '${BRANCH}' is not a valid git ref — aborting"

# ---------------------------------------------------------------------------
# Summary of commits relative to main
# ---------------------------------------------------------------------------
MAIN_SHA=$(git rev-parse main 2>/dev/null || git rev-parse HEAD 2>/dev/null || echo "")
COMMIT_COUNT=0
if [ -n "$MAIN_SHA" ]; then
  COMMIT_COUNT=$(git rev-list --count "${MAIN_SHA}..${REMOTE_SHA}" 2>/dev/null || echo 0)
fi

echo ""
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│              pull-from-github: branch ready                 │"
echo "└─────────────────────────────────────────────────────────────┘"
echo ""
if [ -n "$PR_NUMBER" ]; then
  echo "  PR:           #${PR_NUMBER}  (${PR_TITLE:-n/a})"
fi
echo "  Remote branch: ${REMOTE_NAME}/${BRANCH}"
echo "  Local branch:  ${LOCAL_BRANCH}  (${REMOTE_SHA})"
echo "  Commits ahead of main: ${COMMIT_COUNT}"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Review the diff:"
echo "       git log main..${LOCAL_BRANCH} --oneline"
echo "       git diff main..${LOCAL_BRANCH}"
echo ""
echo "  2. Check out the branch to test it:"
echo "       git checkout ${LOCAL_BRANCH}"
echo ""
echo "  3. Run validations before merging:"
echo "       pnpm run typecheck"
echo "       pnpm run lint"
echo ""
echo "  4. Merge into main when satisfied:"
echo "       git checkout main"
echo "       git merge --no-ff ${LOCAL_BRANCH} -m \"Merge ${LOCAL_BRANCH}\""
echo ""
echo "  The outbound mirror (sync-to-github.sh) will push the result"
echo "  back to GitHub on the next post-merge run."
echo ""
