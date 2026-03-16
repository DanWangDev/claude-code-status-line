---
description: Install and configure the custom status line (directory, git branch, model, rate limits)
allowed-tools: [Bash, Read, Write, Edit]
---

# Setup Status Line

Install the custom status line that shows directory, git branch, model name, and API rate limit usage.

## Instructions

1. Determine the plugin's install directory by finding where this command file lives:
   - Run: `dirname "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")"` or check the plugin cache at `~/.claude/plugins/cache/` for `claude-code-status-line`
   - The plugin root contains `statusline-command.sh` and `statusline-parse.js`

2. Copy the two script files to `~/.claude/`:
   - Find `statusline-command.sh` and `statusline-parse.js` in the plugin directory
   - Copy them to `~/.claude/statusline-command.sh` and `~/.claude/statusline-parse.js`
   - Make `statusline-command.sh` executable: `chmod +x ~/.claude/statusline-command.sh`

3. Read the user's current `~/.claude/settings.json`

4. Add or update the `statusLine` field:
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "bash <path-to-statusline-command.sh>"
     }
   }
   ```
   - On Windows (Git Bash/MSYS2): use forward slashes, e.g. `bash C:/Users/username/.claude/statusline-command.sh`
   - On macOS/Linux: use `bash ~/.claude/statusline-command.sh` or the expanded absolute path

5. Preserve all existing settings — only add/update the `statusLine` key

6. Tell the user to restart Claude Code to see the new status line

7. Show an example of what the status line looks like:
   ```
   ~/my-project  | main  | Claude 4.6 Opus  | 5h:23% | ↺ 3h42m  | 7d:8% | ↺ 5d12h30m
   ```
