#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="$ROOT_DIR/.skills"

mkdir -p "$SKILLS_DIR"

sync_repo() {
  local repo_url="$1"
  local target_dir="$2"

  if [ -d "$target_dir/.git" ]; then
    echo "Updating $(basename "$target_dir")..."
    git -C "$target_dir" fetch --all --prune
    git -C "$target_dir" pull --ff-only
  else
    echo "Cloning $(basename "$target_dir")..."
    git clone "$repo_url" "$target_dir"
  fi
}

sync_repo "https://github.com/addyosmani/agent-skills.git" "$SKILLS_DIR/agent-skills"
sync_repo "https://github.com/VoltAgent/awesome-design-md.git" "$SKILLS_DIR/awesome-design-md"
sync_repo "https://github.com/anthropics/skills.git" "$SKILLS_DIR/anthropic-skills"

echo
echo "Skill packs installed under $SKILLS_DIR"
echo "Next steps:"
echo "  1) bash scripts/select-design-system.sh finsyt-default"
echo "  2) Open docs/FRONTEND_EXECUTION_PLAYBOOK.md"
