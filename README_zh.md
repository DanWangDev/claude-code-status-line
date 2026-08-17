# Claude Code Status Line

[English](README.md) | [中文](README_zh.md)

专为 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 打造的自定义状态栏，可以直接在终端中显示您的工作目录、Git分支、模型名称以及 **API 用量统计**。

支持 **Anthropic**（额度限制、OAuth）和 **第三方服务商**（如 DeepSeek：实时余额、月度费用、Claude 等效价格对比）。

![status line example](https://img.shields.io/badge/status_line-~/project_|_main_|_Opus_4.6_|_5h:23%25-blue?style=flat-square)

## 外观展示

**Anthropic：**
```
~/my-project  | main  | Claude 4.6 Opus  | 5h:23% | ↺ 3h42m  | 7d:8% | ↺ 5d12h0m
```
![Screenshot](screenshot.png)

| 字段 | 说明 |
|---------|-------------|
| `~/my-project` | 当前工作目录 |
| `main` | 当前 Git 分支 |
| `Claude 4.6 Opus` | 当前激活的模型名称 |
| `5h:23%` | 5小时额度使用率 |
| `↺ 3h42m` | 5小时额度重置的剩余时间 |
| `7d:8%` | 7天额度使用率 |
| `↺ 5d12h0m` | 7天额度重置的剩余时间 |

**DeepSeek（第三方）：**
```
~/my-project  | deepseek-v4-pro[1m]  | ¥47.71  | ¥3.12 h87%  | $4.56 opus5
```
| 字段 | 说明 |
|---------|-------------|
| `~/my-project` | 当前工作目录 |
| `deepseek-v4-pro[1m]` | 当前激活的模型名称 |
| `¥47.71` | DeepSeek 实时余额（每分钟从 API 获取） |
| `¥3.12` | 当月实际费用，来自 DeepSeek 控制台（缓存 5 分钟） |
| `h87%` | 当月输入 token 的缓存命中占比（来自控制台） |
| `$4.56 opus5` | 相同月度 token 量在 Claude Opus 5 上的等效费用（假设性对比） |

## 环境要求

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- Node.js (用于 JSON 解析和 API 调用)
- Bash (Windows 环境请使用 Git Bash)
- Anthropic：Claude Pro/Max 订阅（用于访问 API 使用情况的接口）
- DeepSeek：在 `settings.json` 中配置 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL`；如需显示真实费用和缓存命中率，还需配置平台会话令牌（见下文）

## 安装指南

### 插件安装（推荐）

作为 Claude Code 插件安装，无需 git clone：

```
/install-plugin https://github.com/DanWangDev/claude-code-status-line
```

然后在 Claude Code 中运行配置命令：

```
/setup-statusline
```

会自动将脚本复制到 `~/.claude/` 并配置 `settings.json`。

### 脚本安装

```bash
git clone https://github.com/DanWangDev/claude-code-status-line.git
cd claude-code-status-line
bash install.sh
```

安装脚本会将脚本复制到 `~/.claude/` 目录并自动更新您的 `settings.json` (需要安装 `jq`)。如果没有安装 `jq`，脚本会打印出手动配置的步骤供您参考。

### 手动安装

1. 将以下两个脚本复制到 `~/.claude/` 目录：

```bash
cp statusline-command.sh ~/.claude/statusline-command.sh
cp statusline-parse.js ~/.claude/statusline-parse.js
chmod +x ~/.claude/statusline-command.sh
```

2. 将以下内容添加到 `~/.claude/settings.json`：

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash ~/.claude/statusline-command.sh"
  }
}
```

> **Windows 提示:** 路径中请使用正斜杠，例如 `"bash C:/Users/yourname/.claude/statusline-command.sh"`

3. 重启 Claude Code。

## 工作原理

Claude Code 会通过标准输入 (stdin) 将一段 JSON 数据传递给状态栏命令。该 JSON 包含 `cwd`、`model`、`context_window` 和 `cost` 等字段。

**`statusline-command.sh`** 是入口点 —— 它读取 JSON，提取工作目录和 git 分支，然后委托 `statusline-parse.js` 获取模型名称和用量信息。

**`statusline-parse.js`** 解析 JSON 并通过 `ANTHROPIC_BASE_URL` 环境变量自动检测服务商：

- **Anthropic：** 从 OAuth 接口 (`api.anthropic.com/api/oauth/usage`) 获取额度使用率。缓存 5 分钟。
- **DeepSeek：** 从 DeepSeek API (`api.deepseek.com/user/balance`) 获取实时余额。缓存 1 分钟。当月实际费用和缓存命中/未命中 token 数来自 DeepSeek 控制台的私有用量接口（`platform.deepseek.com/api/v0/usage/cost` 和 `/usage/amount`），使用平台会话令牌认证 —— 与控制台显示的数字一致。缓存 5 分钟。Claude Opus 5 等效费用基于真实的月度 token 量计算（假设性对比 —— 这些请求从未发给 Anthropic）。

未配置平台令牌或会话过期（认证码 40002/40003）时，费用相关片段自动隐藏，余额始终显示。

### 支持的字段

解析器支持以下字段（作为参数传递）：

| 字段 | Anthropic 输出 | DeepSeek 输出 |
|-------|-----------------|-----------------|
| `model` | 模型显示名称 | 模型显示名称 |
| `limit` | 5小时/7天额度使用率 + 重置时间 | 余额 + 月度费用 + Claude 等效对比 |
| `ctx` | 上下文窗口使用率百分比 | 上下文窗口使用率百分比 |
| `cost` | 会话成本 (美元) | 会话成本 (美元) |
| `cwd` | 工作目录路径 | 工作目录路径 |

## 自定义修改

### 修改显示内容

编辑 `statusline-command.sh` 可添加或删除显示片段。例如，要添加上下文窗口使用情况：

```bash
ctx=$(printf '%s' "$input" | $PARSE ctx)

# 然后将其添加到 parts 字符串中:
if [ -n "$ctx" ]; then
  parts="${parts}  ctx:${ctx}%"
fi
```

### 修改缓存时间

编辑 `statusline-parse.js` 中的 `CACHE_TTL_MS` 常量 (默认：5 分钟)：

```js
const CACHE_TTL_MS = 10 * 60 * 1000; // 10分钟
```

## 故障排除

**状态栏为空 (没有内容显示):**
- 确保 Node.js 已添加到系统 PATH 中
- Anthropic：检查 `~/.claude/.credentials.json` 是否存在 (需要先登录 Claude Code)
- DeepSeek：检查 `settings.json` 中是否配置了 `ANTHROPIC_AUTH_TOKEN`
- 尝试手动执行排查错误：`echo '{"cwd":"/tmp","model":{"display_name":"test"}}' | bash ~/.claude/statusline-command.sh`

**未显示额度使用情况 (Anthropic):**
- 需要有 Claude Pro 或 Max 订阅
- `~/.claude/.credentials.json` 中的 OAuth 令牌必须有效
- 检查缓存文件 `~/.claude/usage-cache.json` 是否被正常创建

**未显示余额或费用 (DeepSeek):**
- 确认 `settings.json` 中 `ANTHROPIC_BASE_URL` 包含 `deepseek`
- 检查 `ANTHROPIC_AUTH_TOKEN` 是否已设置且有效
- 直接测试余额 API：`curl -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" https://api.deepseek.com/user/balance`
- 费用片段需要平台会话令牌（见下文）。未配置或过期时，只显示余额

## 从 DeepSeek 控制台获取真实用量数据

DeepSeek 没有官方的用量 API，但控制台的私有接口会返回真实的月度费用和缓存命中/未命中 token 数。状态栏使用你的浏览器会话令牌调用这些接口：

```
GET https://platform.deepseek.com/api/v0/usage/cost?month=8&year=2026
GET https://platform.deepseek.com/api/v0/usage/amount?month=8&year=2026
Authorization: Bearer <userToken>
```

**获取令牌（只需一次）：** 在 Chrome 中打开 [platform.deepseek.com](https://platform.deepseek.com) → DevTools (F12) → Application → Local Storage → `userToken` 条目是 JSON 包装（`{"value":"...","__version":"0"}`）—— 只需复制内层的 `value` 字符串，然后二选一：

- 保存到文件：`echo "<token>" > ~/.claude/deepseek-platform-token`，或
- 在 `settings.json` 的 `env` 块中设置为 `DEEPSEEK_PLATFORM_TOKEN`。

环境变量 `DEEPSEEK_PLATFORM_TOKEN` 优先，文件作为后备。两者都只保存在你的本机，不会进入仓库。

注意事项：

- 这些是私有、未公开的接口，可能随时变动。
- 令牌是浏览器会话凭证，偶尔会过期 —— DeepSeek 以认证码 `40002`/`40003` 拒绝请求，此时费用片段自动隐藏，重新粘贴令牌即可恢复。
- `opus5` 片段属于假设性对比（这些请求从未发给 Anthropic）：输入按 Claude Opus 5 的缓存感知价格计算（命中 × $0.50/百万缓存读取价，未命中 × $5/百万，输出 × $25/百万）。

## 许可

MIT
