# Claude Code Status Line

A custom status line for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that shows your working directory, git branch, model name, and **Anthropic API rate limit usage** — right in the terminal.

![status line example](https://img.shields.io/badge/status_line-~/project_|_main_|_Opus_4.6_|_5h:23%25-blue?style=flat-square)

## What it looks like

```
~/my-project  | main  | Claude 4.6 Opus  | 5h:23% | ↺ 3h42m  | 7d:8% | ↺ 5d12h0m
```

| Segment | Description |
|---------|-------------|
| `~/my-project` | Shortened working directory |
| `main` | Current git branch |
| `Claude 4.6 Opus` | Active model name |
| `5h:23%` | 5-hour rate limit utilization |
| `↺ 3h42m` | Time until 5-hour limit resets |
| `7d:8%` | 7-day rate limit utilization |
| `↺ 5d12h0m` | Time until 7-day limit resets |

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- Node.js (for the JSON parser and API calls)
- Bash (Git Bash on Windows)
- A Claude Pro/Max subscription (for API usage endpoint access)

## Installation

### Quick install

```bash
git clone https://github.com/DanWangDev/claude-code-status-line.git
cd claude-code-status-line
bash install.sh
```

The installer copies scripts to `~/.claude/` and updates your `settings.json` automatically (requires `jq`). If `jq` is not installed, it prints the manual config for you.

### Manual install

1. Copy the two scripts to your `~/.claude/` directory:

```bash
cp statusline-command.sh ~/.claude/statusline-command.sh
cp statusline-parse.js ~/.claude/statusline-parse.js
chmod +x ~/.claude/statusline-command.sh
```

2. Add the following to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash ~/.claude/statusline-command.sh"
  }
}
```

> **Windows note:** Use forward slashes in the path, e.g. `"bash C:/Users/yourname/.claude/statusline-command.sh"`

3. Restart Claude Code.

## How it works

Claude Code passes a JSON blob to the status line command via stdin. The JSON contains fields like `cwd`, `model`, `context_window`, and `cost`.

**`statusline-command.sh`** is the entry point — it reads the JSON, extracts the working directory and git branch, then delegates to `statusline-parse.js` for model name and rate limit info.

**`statusline-parse.js`** parses the JSON and fetches your API usage from the Anthropic OAuth endpoint. Usage data is cached for 5 minutes at `~/.claude/usage-cache.json` to avoid excessive API calls.

### Available fields

The parser supports these fields (pass as argument):

| Field | Output |
|-------|--------|
| `model` | Model display name |
| `limit` | 5h and 7d rate limit utilization + reset time |
| `ctx` | Context window usage percentage |
| `cost` | Session cost in USD |
| `cwd` | Working directory path |

## Customization

### Change what's displayed

Edit `statusline-command.sh` to add or remove segments. For example, to add context window usage:

```bash
ctx=$(printf '%s' "$input" | $PARSE ctx)

# Then add to the parts string:
if [ -n "$ctx" ]; then
  parts="${parts}  ctx:${ctx}%"
fi
```

### Change cache duration

Edit the `CACHE_TTL_MS` constant in `statusline-parse.js` (default: 5 minutes):

```js
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
```

## Troubleshooting

**Status line is blank:**
- Make sure Node.js is in your PATH
- Check that `~/.claude/.credentials.json` exists (you need to be logged in to Claude Code)
- Try running manually: `echo '{"cwd":"/tmp","model":{"display_name":"test"}}' | bash ~/.claude/statusline-command.sh`

**Rate limits not showing:**
- You need a Claude Pro or Max subscription
- The OAuth token in `~/.claude/.credentials.json` must be valid
- Check if the cache file `~/.claude/usage-cache.json` is being created

## License

MIT
