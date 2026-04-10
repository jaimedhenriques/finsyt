#!/usr/bin/env bash

set -euo pipefail

SKILLS_ROOT="${1:-.agent-skills}"
RULES_DIR="${2:-.cursor/rules/agent-skills}"

REQUIRED_SKILLS=(
  "using-agent-skills"
  "incremental-implementation"
  "test-driven-development"
  "api-and-interface-design"
  "debugging-and-error-recovery"
  "code-review-and-quality"
  "security-and-hardening"
)

if [ ! -d "${SKILLS_ROOT}/skills" ]; then
  echo "ERROR: ${SKILLS_ROOT}/skills not found. Run scripts/install-agent-skills.sh first." >&2
  exit 1
fi

mkdir -p "${RULES_DIR}"

for skill in "${REQUIRED_SKILLS[@]}"; do
  src="${SKILLS_ROOT}/skills/${skill}/SKILL.md"
  dest="${RULES_DIR}/${skill}.md"

  if [ ! -f "${src}" ]; then
    echo "ERROR: missing skill file: ${src}" >&2
    exit 1
  fi

  cp "${src}" "${dest}"
done

echo "Synced ${#REQUIRED_SKILLS[@]} skills into ${RULES_DIR}"
