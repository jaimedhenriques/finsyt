#!/usr/bin/env bash
set -e

echo "Iterance installer"
echo "------------------"

# Check Python 3
if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 is not installed. Install it and try again."
    exit 1
fi

PYTHON_VERSION=$(python3 --version)
echo "Found $PYTHON_VERSION"

# Install dependencies
echo "Installing dependencies..."
pip install watchdog textual --break-system-packages --quiet
echo "Dependencies installed."

# Make scripts executable
REPO_DIR="$(dirname "$0")"
chmod +x "$REPO_DIR/iterance/cli.py"
chmod +x "$REPO_DIR/iterance/watcher/watcher.py"
chmod +x "$REPO_DIR/iterance/crystallizer/crystallizer.py"
chmod +x "$REPO_DIR/iterance/ledger/ledger.py"
chmod +x "$REPO_DIR/iterance/witness/witness.py"
chmod +x "$REPO_DIR/iterance/reflector/reflector.py"

# Add shell alias
CLI_PATH="$(realpath "$REPO_DIR/iterance/cli.py")"
ALIAS_LINE="alias iterance='python3 $CLI_PATH'"

for RC in "$HOME/.bashrc" "$HOME/.zshrc"; do
    if [ -f "$RC" ]; then
        if grep -q "alias iterance=" "$RC"; then
            echo "[Iterance] Alias already in $RC, skipping."
        else
            echo "$ALIAS_LINE" >> "$RC"
            echo "[Iterance] Added alias to $RC"
        fi
    fi
done

FISH_CONF="$HOME/.config/fish/config.fish"
FISH_ALIAS="alias iterance='python3 $CLI_PATH'"
if [ -f "$FISH_CONF" ]; then
    if grep -q "alias iterance=" "$FISH_CONF"; then
        echo "[Iterance] Alias already in $FISH_CONF, skipping."
    else
        echo "$FISH_ALIAS" >> "$FISH_CONF"
        echo "[Iterance] Added alias to $FISH_CONF"
    fi
fi

echo ""
echo "Done."
echo ""
echo "Run: source ~/.bashrc  # or restart terminal"
echo ""
echo "Then start the TUI:"
echo ""
echo "  iterance"
echo ""
echo "Or watch a directory directly:"
echo ""
echo "  iterance watch /path/to/your/agent/workspace"
echo ""
