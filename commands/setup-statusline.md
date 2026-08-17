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

6. If the user's `ANTHROPIC_BASE_URL` points at DeepSeek, offer to set up the real cost data (month-to-date cost + cache hit rate from the DeepSeek console):
   - Explain that DeepSeek has no official usage API; the status line uses the console's private endpoints with a browser-session token.
   - Ask the user to open https://platform.deepseek.com in Chrome → DevTools (F12) → Application → Local Storage → the `userToken` entry is a JSON wrapper (`{"value":"...","__version":"0"}`) → copy only the inner `value` string, and paste it into the chat.
   - Write it to `~/.claude/deepseek-platform-token` (single line, no quotes). Alternatively set `DEEPSEEK_PLATFORM_TOKEN` in `settings.json`'s `env` block (env var takes precedence).
   - Verify: `curl -s -H "Authorization: Bearer $(cat ~/.claude/deepseek-platform-token)" "https://platform.deepseek.com/api/v0/usage/cost?month=$(date -u -d '+8 hours' +%-m)&year=$(date -u -d '+8 hours' +%Y)" | head -c 500`
   - If the user declines or the token is invalid, the status line still works — only the balance shows. Mention the token is a browser session credential that expires occasionally (auth codes 40002/40003 hide the cost segments until re-pasted), and that these endpoints are private/undocumented.

7. Tell the user to restart Claude Code to see the new status line

8. Show an example of what the status line looks like:
   ```
   ~/my-project  | main  | Claude 4.6 Opus  | 5h:23% | ↺ 3h42m  | 7d:8% | ↺ 5d12h30m
   ```
   For DeepSeek: `~/my-project  | deepseek-v4-pro[1m]  | ¥47.71  | ¥3.12 h87%  | $4.56 opus5`
