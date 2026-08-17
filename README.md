# Claude Code Status Line

[English](README.md) | [中文](README_zh.md)

A custom status line for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) that shows your working directory, git branch, model name, and **API usage stats** — right in the terminal.

Supports both **Anthropic** (rate limits, OAuth) and **3rd-party providers** like DeepSeek (live balance, monthly cost, Claude-equivalent pricing comparison).

![status line example](https://img.shields.io/badge/status_line-~/project_|_main_|_Opus_4.6_|_5h:23%25-blue?style=flat-square)

## What it looks like

**Anthropic:**
```
~/my-project  | main  | Claude 4.6 Opus  | 5h:23% | ↺ 3h42m  | 7d:8% | ↺ 5d12h0m
```
![Screenshot](screenshot.png)
| Segment | Description |
|---------|-------------|
| `~/my-project` | Shortened working directory |
| `main` | Current git branch |
| `Claude 4.6 Opus` | Active model name |
| `5h:23%` | 5-hour rate limit utilization |
| `↺ 3h42m` | Time until 5-hour limit resets |
| `7d:8%` | 7-day rate limit utilization |
| `↺ 5d12h0m` | Time until 7-day limit resets |

**DeepSeek (3rd-party):**
```
~/my-project  | deepseek-v4-pro[1m]  | ¥47.71  | ¥0.76  | $0.75 opus5
```
| Segment | Description |
|---------|-------------|
| `~/my-project` | Shortened working directory |
| `deepseek-v4-pro[1m]` | Active model name |
| `¥47.71` | Live DeepSeek balance (fetched from API every 1 min) |
| `¥0.76` | Monthly expenses in CNY (tracked from token counts × DeepSeek pricing) |
| `$0.75 opus5` | What the same tokens would cost on Claude Opus 5 (for comparison) |
## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- Node.js (for the JSON parser and API calls)
- Bash (Git Bash on Windows)
- Anthropic: A Claude Pro/Max subscription (for API usage endpoint access)
- DeepSeek: An API key configured via `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` in `settings.json`

## Installation

### Plugin install (recommended)

Install as a Claude Code plugin — no git clone needed:

```
/install-plugin https://github.com/DanWangDev/claude-code-status-line
```

Then run the setup command inside Claude Code:

```
/setup-statusline
```

This copies the scripts to `~/.claude/` and configures `settings.json` automatically.

### Shell install

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

**`statusline-parse.js`** parses the JSON and detects the provider from the `ANTHROPIC_BASE_URL` environment variable:

- **Anthropic:** Fetches API rate limit usage from the OAuth endpoint (`api.anthropic.com/api/oauth/usage`). Cached for 5 minutes.
- **DeepSeek:** Fetches live balance from the DeepSeek API (`api.deepseek.com/user/balance`). Cached for 1 minute. Monthly expenses are tracked locally by accumulating token deltas from `context_window.total_input_tokens` and `context_window.total_output_tokens`, multiplied by DeepSeek's native CNY pricing (peak/off-peak blended average, see below). A Claude Opus 5 cost equivalent is computed from the same token counts for comparison.

Monthly tracking data persists in `~/.claude/deepseek-usage.json` and auto-resets on month rollover.

### Available fields

The parser supports these fields (pass as argument):

| Field | Anthropic output | DeepSeek output |
|-------|-----------------|-----------------|
| `model` | Model display name | Model display name |
| `limit` | 5h/7d rate limit % + reset time | Balance + monthly cost + Claude equivalent |
| `ctx` | Context window usage % | Context window usage % |
| `cost` | Session cost in USD | Session cost in USD |
| `cwd` | Working directory path | Working directory path |

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
- Check that `~/.claude/.credentials.json` exists (Anthropic) or `ANTHROPIC_AUTH_TOKEN` is set in `settings.json` (DeepSeek)
- Try running manually: `echo '{"cwd":"/tmp","model":{"display_name":"test"}}' | bash ~/.claude/statusline-command.sh`

**Rate limits not showing (Anthropic):**
- You need a Claude Pro or Max subscription
- The OAuth token in `~/.claude/.credentials.json` must be valid
- Check if the cache file `~/.claude/usage-cache.json` is being created

**Balance or monthly cost not showing (DeepSeek):**
- Verify `ANTHROPIC_BASE_URL` contains `deepseek` in your `settings.json`
- Check that `ANTHROPIC_AUTH_TOKEN` is set and valid
- Test the balance API directly: `curl -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" https://api.deepseek.com/user/balance`
- Monthly tracking starts from zero — it won't match the DeepSeek dashboard for the current month until it accumulates sessions

**Monthly cost doesn't match DeepSeek dashboard:**
- The tracker started when you installed the status line — it doesn't have historical sessions from before that
- Input cache hits are priced at the cache-miss rate (¥4.5–9.0/M instead of ¥0.15–0.30/M), so the estimate skews higher — cumulative token totals don't distinguish hits from misses
- Numbers will converge at the start of a new month when both reset

## DeepSeek pricing

The parser uses DeepSeek's V4-Pro pricing in CNY per 1M tokens. Since 2026-08-17 DeepSeek uses a peak/off-peak scheme (Beijing time):

| Slot | Input (cache hit) | Input (cache miss) | Output |
|---|---|---|---|
| Peak (9:00–12:00, 14:00–18:00; 7h/day) | ¥0.30/M | ¥9.0/M | ¥27.0/M |
| Off-peak (17h/day) | ¥0.15/M | ¥4.5/M | ¥13.5/M |

Monthly token totals aren't timestamped, so the status line estimates cost with a time-weighted 24h average (¥5.8125/M input miss, ¥17.4375/M output) and prices cache hits at the miss rate (conservative).

The Claude comparison uses Claude Opus 5 rates ($5/M input, $25/M output).

To update pricing, edit the `DS_PRICING_PEAK`, `DS_PRICING_OFFPEAK`, `DS_PEAK_HOURS`, and `OPUS_PRICING` constants in `statusline-parse.js`.

## License

MIT
