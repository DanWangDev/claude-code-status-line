#!/usr/bin/env bash

# Claude Code Status Line - Installer
# Copies scripts to ~/.claude/ and configures settings.json

set -e

CLAUDE_DIR="$HOME/.claude"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing Claude Code Status Line..."

# Copy scripts
cp "$SCRIPT_DIR/statusline-command.sh" "$CLAUDE_DIR/statusline-command.sh"
cp "$SCRIPT_DIR/statusline-parse.js" "$CLAUDE_DIR/statusline-parse.js"
chmod +x "$CLAUDE_DIR/statusline-command.sh"

# Determine the path format for the command
# On Windows (Git Bash/MSYS2), convert to forward-slash path
SHELL_PATH="$CLAUDE_DIR/statusline-command.sh"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "mingw"* || "$OSTYPE" == "cygwin" ]]; then
  SHELL_PATH=$(cygpath -m "$SHELL_PATH")
fi

SETTINGS_FILE="$CLAUDE_DIR/settings.json"

# Check if settings.json exists
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

# Check if jq is available for JSON manipulation
if command -v jq &> /dev/null; then
  tmp=$(mktemp)
  jq --arg cmd "bash $SHELL_PATH" '.statusLine = {"type": "command", "command": $cmd}' "$SETTINGS_FILE" > "$tmp" && mv "$tmp" "$SETTINGS_FILE"
  echo "Settings updated automatically."
else
  echo ""
  echo "jq not found. Please add the following to your $SETTINGS_FILE manually:"
  echo ""
  echo '  "statusLine": {'
  echo '    "type": "command",'
  echo "    \"command\": \"bash $SHELL_PATH\""
  echo '  }'
fi

echo ""
echo "Done! Restart Claude Code to see your new status line."
echo ""
echo "Example output:"
echo "  ~/my-project  | main  | Claude 4.6 Opus  | 5h:23% | ↺ 3h42m  | 7d:8% | ↺ 5d12h0m"
