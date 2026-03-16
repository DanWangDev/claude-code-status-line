#!/usr/bin/env bash

# Claude Code Status Line - Main entry point
# Reads JSON from stdin (provided by Claude Code) and outputs a formatted status line.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSE="node ${SCRIPT_DIR}/statusline-parse.js"

input=$(cat)

# Extract raw cwd from JSON
raw_cwd=$(printf '%s' "$input" | node -e "
  let d='';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try { process.stdout.write(JSON.parse(d).cwd||''); } catch {}
  });
")

model=$(printf '%s' "$input" | $PARSE model)
limit=$(printf '%s' "$input" | $PARSE limit)

# Convert Windows backslashes to forward slashes, then shorten home path
cwd="${raw_cwd//\\//}"
home="${HOME//\\//}"
short_cwd="${cwd/#$home/~}"
# If path wasn't shortened (not under home), show just the folder name
if [ "$short_cwd" = "$cwd" ] && [ -n "$cwd" ]; then
  short_cwd=$(basename "$cwd")
fi

# Get git branch
git_branch=""
if [ -n "$cwd" ] && git -C "$cwd" rev-parse --git-dir > /dev/null 2>&1; then
  git_branch=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null || git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
fi

# Build status line
parts="${short_cwd}"

if [ -n "$git_branch" ]; then
  parts="${parts}  | ${git_branch}"
fi

if [ -n "$model" ]; then
  parts="${parts}  ${model}"
fi

if [ -n "$limit" ]; then
  parts="${parts}  ${limit}"
fi

printf "%s" "$parts"
