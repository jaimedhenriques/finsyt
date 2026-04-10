#!/usr/bin/env bash

set -euo pipefail

REPO_URL="${AGENT_SKILLS_REPO:-https://github.com/addyosmani/agent-skills.git}"
TARGET_DIR="${1:-.agent-skills}"
REF="${AGENT_SKILLS_REF:-main}"

echo "Installing agent-skills from: ${REPO_URL}"
echo "Target directory: ${TARGET_DIR}"

if [ -d "${TARGET_DIR}/.git" ]; then
  echo "Existing clone found. Updating..."
  git -C "${TARGET_DIR}" fetch origin "${REF}" --depth=1
  git -C "${TARGET_DIR}" checkout "${REF}"
  git -C "${TARGET_DIR}" pull --ff-only origin "${REF}"
else
  echo "Cloning fresh copy..."
  git clone --depth=1 --branch "${REF}" "${REPO_URL}" "${TARGET_DIR}"
fi

if [ ! -d "${TARGET_DIR}/skills" ]; then
  echo "ERROR: ${TARGET_DIR}/skills was not found after install." >&2
  exit 1
fi

echo "agent-skills installed successfully."
echo "Skills directory: ${TARGET_DIR}/skills"
