#!/usr/bin/env node
const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const CREDS_FILE = path.join(CLAUDE_DIR, '.credentials.json');
const CACHE_FILE = path.join(CLAUDE_DIR, 'usage-cache.json');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// DeepSeek platform (console) session — private, undocumented endpoints.
// Token sources: DEEPSEEK_PLATFORM_TOKEN env, else ~/.claude/deepseek-platform-token.
const PLATFORM_HOST = 'https://platform.deepseek.com';
const PLATFORM_TOKEN_FILE = path.join(CLAUDE_DIR, 'deepseek-platform-token');
const PLATFORM_CACHE_FILE = path.join(CLAUDE_DIR, 'platform-usage-cache.json');
const PLATFORM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function detectProvider() {
  const baseUrl = process.env.ANTHROPIC_BASE_URL || '';
  if (baseUrl.includes('deepseek')) return 'deepseek';
  return 'anthropic';
}

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
  const d = Math.floor(totalMins / 1440);
  const h = Math.floor((totalMins % 1440) / 60);
  const m = totalMins % 60;
  if (d > 0) return `${d}d${h}h${m}m`;
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}

function fetchDeepSeekBalance(apiKey) {
  return new Promise((resolve) => {
    const req = https.request(
      'https://api.deepseek.com/user/balance',
      { headers: { 'Authorization': `Bearer ${apiKey}` } },
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

// Claude Opus 5 pricing per 1M tokens (USD) — hypothetical comparison only.
// cacheRead = prompt-cache read rate (10% of input), applied to DeepSeek cache hits.
const OPUS_PRICING = { input: 5, output: 25, cacheRead: 0.5 };

// --- DeepSeek platform (console) usage ---

function readPlatformToken() {
  const envToken = (process.env.DEEPSEEK_PLATFORM_TOKEN || '').trim();
  if (envToken) return envToken;
  try {
    const fileToken = fs.readFileSync(PLATFORM_TOKEN_FILE, 'utf8').trim();
    return fileToken || null;
  } catch { return null; }
}

function fetchPlatformEndpoint(pathname, token) {
  return new Promise((resolve) => {
    const req = https.request(
      PLATFORM_HOST + pathname,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } },
      (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(body); } catch {}
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on('error', () => resolve({ status: 0, json: null }));
    req.setTimeout(4000, () => { req.destroy(); resolve({ status: 0, json: null }); });
    req.end();
  });
}

// 40002/40003 are DeepSeek's expired-session codes (per CodexBar's provider docs).
function isPlatformAuthFailure(res) {
  if (res.status === 401 || res.status === 403) return true;
  const code = res.json?.code ?? res.json?.data?.biz_code;
  return code === 40002 || code === 40003;
}

// Month boundaries follow the console, which displays Beijing time.
function getBeijingMonth() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  return { year: bj.getUTCFullYear(), month: bj.getUTCMonth() + 1 };
}

function sumUsageAmounts(entries, typePredicate) {
  let total = 0;
  for (const entry of entries || []) {
    for (const item of entry?.usage || []) {
      if (typePredicate(item?.type || '')) total += parseFloat(item?.amount) || 0;
    }
  }
  return total;
}

function parsePlatformUsage(costRes, amountRes) {
  const costBiz = costRes?.json?.data?.biz_data;
  const amountBiz = amountRes?.json?.data?.biz_data;
  if (!costBiz && !amountBiz) return null;

  // usage/cost: biz_data is an array of per-currency entries
  let mtdCost = null;
  let currency = 'CNY';
  const costItems = Array.isArray(costBiz) ? costBiz : [];
  const costEntry = costItems.find(e => e?.currency === 'CNY') || costItems[0];
  if (costEntry) {
    currency = costEntry.currency || 'CNY';
    const total = sumUsageAmounts(costEntry.total, () => true);
    if (total > 0) mtdCost = total;
  }

  // usage/amount: biz_data.total[].usage[] keyed by type string
  const amountTotals = amountBiz?.total || [];
  const hitTokens = sumUsageAmounts(amountTotals, t => /cache.?hit/i.test(t));
  const missTokens = sumUsageAmounts(amountTotals, t => /cache.?miss/i.test(t));
  const outTokens = sumUsageAmounts(amountTotals, t => /response|completion|output/i.test(t));

  return { mtdCost, currency, hitTokens, missTokens, outTokens };
}

async function getPlatformUsage() {
  const cache = readJson(PLATFORM_CACHE_FILE);
  if (cache?.summary && cache.fetchedAt && (Date.now() - cache.fetchedAt) < PLATFORM_CACHE_TTL_MS) {
    return cache.summary;
  }

  const token = readPlatformToken();
  if (!token) return null;

  const { year, month } = getBeijingMonth();
  const qs = `?month=${month}&year=${year}`;
  const [costRes, amountRes] = await Promise.all([
    fetchPlatformEndpoint(`/api/v0/usage/cost${qs}`, token),
    fetchPlatformEndpoint(`/api/v0/usage/amount${qs}`, token),
  ]);
  if (isPlatformAuthFailure(costRes) || isPlatformAuthFailure(amountRes)) return null;

  const summary = parsePlatformUsage(costRes, amountRes);
  if (summary && (summary.mtdCost != null || summary.hitTokens + summary.missTokens + summary.outTokens > 0)) {
    try { fs.writeFileSync(PLATFORM_CACHE_FILE, JSON.stringify({ fetchedAt: Date.now(), summary })); } catch {}
    return summary;
  }
  return null;
}

async function getBalance() {
  const cache = readJson(CACHE_FILE);
  // Balance cached for 1 minute (fresher for "real-time" feel)
  if (cache && cache.provider === 'deepseek' && cache.balance && (Date.now() - cache.fetchedAt) < 60000) {
    return cache.balance;
  }

  const apiKey = process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey) return null;

  const balance = await fetchDeepSeekBalance(apiKey);
  if (balance) {
    // Preserve existing cache keys (for Anthropic path) and merge balance
    const existing = readJson(CACHE_FILE) || {};
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ ...existing, fetchedAt: Date.now(), provider: 'deepseek', balance }));
  }
  return balance;
}

async function getDeepSeekStatus() {
  const [balance, usage] = await Promise.all([getBalance(), getPlatformUsage()]);

  let s = '';
  if (balance?.balance_infos?.length) {
    const infos = balance.balance_infos;
    const info = infos.find(i => parseFloat(i.total_balance) > 0) || infos[0];
    const symbol = info.currency === 'USD' ? '$' : '¥';
    s += `| ${symbol}${info.total_balance}  `;
  }
  if (usage) {
    const inTokens = usage.hitTokens + usage.missTokens;
    if (usage.mtdCost != null) {
      const symbol = usage.currency === 'USD' ? '$' : '¥';
      s += `| ${symbol}${usage.mtdCost.toFixed(2)}`;
      if (inTokens > 0) s += ` h${Math.round((usage.hitTokens / inTokens) * 100)}%`;
      s += '  ';
    }
    if (inTokens + usage.outTokens > 0) {
      const opusUsd = (usage.missTokens / 1_000_000) * OPUS_PRICING.input
        + (usage.hitTokens / 1_000_000) * OPUS_PRICING.cacheRead
        + (usage.outTokens / 1_000_000) * OPUS_PRICING.output;
      s += `| $${opusUsd.toFixed(2)} opus5`;
    }
  }
  return s;
}

async function getUsage(j) {
  const provider = detectProvider();

  // DeepSeek: balance (cached 1min) + real console usage (cached 5min)
  if (provider === 'deepseek') {
    return getDeepSeekStatus();
  }

  // Anthropic: OAuth usage API (cached 5min)
  const cache = readJson(CACHE_FILE);
  if (cache && cache.provider === 'anthropic' && (Date.now() - cache.fetchedAt) < CACHE_TTL_MS) {
    return cache.data;
  }

  const creds = readJson(CREDS_FILE);
  const token = creds?.claudeAiOauth?.accessToken;
  if (!token) return null;

  const data = await fetchUsage(token);
  if (data && !data.error) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: Date.now(), provider: 'anthropic', data }));
  }
  return data?.error ? null : data;
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
        const u = await getUsage(j);
        if (typeof u === 'string') {
          // DeepSeek / other providers return pre-formatted string
          val = u;
        } else if (u) {
          // Anthropic returns raw data object
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
