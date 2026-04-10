#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="${ROOT_DIR}/.skills"
DESIGN_ROOT="${SKILLS_DIR}/awesome-design-md/design-md"
LOCAL_DESIGN_ROOT="${ROOT_DIR}/design-systems"

if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/select-design-system.sh <design-system-slug>"
  echo
  echo "Examples:"
  echo "  bash scripts/select-design-system.sh finsyt-default"
  echo "  bash scripts/select-design-system.sh linear.app"
  echo "  bash scripts/select-design-system.sh apple"
  echo "  bash scripts/select-design-system.sh airbnb"
  exit 1
fi

SLUG="$1"
TARGET="${ROOT_DIR}/DESIGN.md"

# 1) Local first-party design profiles.
LOCAL_MATCH="${LOCAL_DESIGN_ROOT}/${SLUG}/DESIGN.md"
if [[ -f "${LOCAL_MATCH}" ]]; then
  cp "${LOCAL_MATCH}" "${TARGET}"
  echo "Selected local design system:"
  echo "  ${LOCAL_MATCH}"
  echo
  echo "Copied to:"
  echo "  ${TARGET}"
  exit 0
fi

if [[ ! -d "${DESIGN_ROOT}" ]]; then
  echo "Design systems not installed. Run: bash scripts/install-design-skills.sh"
  exit 1
fi

# 2) Prefer local DESIGN.md from awesome-design-md, if available.
MATCH_PATH="$(
  rg --files "${DESIGN_ROOT}" \
    | rg -i "/${SLUG}[-_a-z0-9]*/DESIGN\\.md$" \
    | head -n 1 || true
)"

if [[ -n "${MATCH_PATH}" ]]; then
  cp "${MATCH_PATH}" "${TARGET}"
  echo "Selected design system:"
  echo "  ${MATCH_PATH}"
  echo
  echo "Copied to:"
  echo "  ${TARGET}"
  exit 0
fi

# 3) Fallback: parse README redirect and fetch remote DESIGN.md.
README_MATCH="$(
  rg --files "${DESIGN_ROOT}" \
    | rg -i "/${SLUG}[-_a-z0-9]*/README\\.md$" \
    | head -n 1 || true
)"

if [[ -z "${README_MATCH}" ]]; then
  echo "Could not find a design system for slug '${SLUG}'."
  echo "Inspect available slugs:"
  echo "  rg --files \"${DESIGN_ROOT}\" | rg '/README\\.md$'"
  exit 1
fi

REMOTE_URL="$(
  awk 'match($0, /https:\/\/getdesign\.md\/[^ )]+/) { print substr($0, RSTART, RLENGTH); exit }' "${README_MATCH}"
)"

if [[ -z "${REMOTE_URL}" ]]; then
  echo "Found ${README_MATCH} but no getdesign.md URL inside it."
  exit 1
fi

TMP_FILE="$(mktemp)"
if ! curl -fsSL "${REMOTE_URL}" -o "${TMP_FILE}"; then
  echo "Failed to fetch remote design system from: ${REMOTE_URL}"
  rm -f "${TMP_FILE}"
  exit 1
fi

if [[ ! -s "${TMP_FILE}" ]]; then
  echo "Remote design system content is empty: ${REMOTE_URL}"
  rm -f "${TMP_FILE}"
  exit 1
fi

cp "${TMP_FILE}" "${TARGET}"
rm -f "${TMP_FILE}"

echo "Selected design system:"
echo "  ${README_MATCH}"
echo "Fetched from:"
echo "  ${REMOTE_URL}"
echo
echo "Copied to:"
echo "  ${TARGET}"
