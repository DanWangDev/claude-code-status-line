#!/usr/bin/env node

// Claude Code Status Line - JSON parser & API usage fetcher
// Parses the status line JSON from Claude Code and fetches rate limit info.

const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const CREDS_FILE = path.join(CLAUDE_DIR, '.credentials.json');
const CACHE_FILE = path.join(CLAUDE_DIR, 'usage-cache.json');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function fetchUsage(token) {
  return new Promise((resolve) => {
    const req = https.request(
      'https://api.anthropic.com/api/oauth/usage',
      { headers: { 'Authorization': `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' } },
      (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(4000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function formatReset(isoString) {
  const diffMs = new Date(isoString) - Date.now();
  if (diffMs <= 0) return '0m';
  const totalMins = Math.round(diffMs / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}

async function getUsage() {
  const cache = readJson(CACHE_FILE);
  if (cache && (Date.now() - cache.fetchedAt) < CACHE_TTL_MS) {
    return cache.data;
  }

  const creds = readJson(CREDS_FILE);
  const token = creds?.claudeAiOauth?.accessToken;
  if (!token) return null;

  const data = await fetchUsage(token);
  if (data) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: Date.now(), data }));
  }
  return data;
}

async function main() {
  let d = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', async () => {
    try {
      const j = JSON.parse(d);
      const field = process.argv[2];
      let val;

      if (field === 'cwd') {
        val = (j.cwd || j.workspace?.current_dir || '');
      } else if (field === 'model') {
        val = '| ' + (j.model?.display_name || '');
      } else if (field === 'ctx') {
        const p = j.context_window?.used_percentage;
        val = p != null ? '|' + String(Math.round(p)) : '';
      } else if (field === 'cost') {
        const cost = j.cost?.total_cost_usd;
        val = cost != null ? '$' + cost.toFixed(2) : '';
      } else if (field === 'limit') {
        const u = await getUsage();
        if (u) {
          const fiveH = u.five_hour;
          const sevenD = u.seven_day;
          const parts = [];
          if (fiveH) parts.push(`| 5h:${Math.round(fiveH.utilization)}% | ↺ ${formatReset(fiveH.resets_at)}`);
          if (sevenD) parts.push(`| 7d:${Math.round(sevenD.utilization)}% | ↺ ${formatReset(sevenD.resets_at)}`);
          val = parts.join('  ');
        } else {
          val = '';
        }
      }

      if (val != null) process.stdout.write(String(val));
    } catch (e) { }
  });
}

main();
