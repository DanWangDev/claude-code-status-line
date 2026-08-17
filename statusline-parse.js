#!/usr/bin/env node
const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const CREDS_FILE = path.join(CLAUDE_DIR, '.credentials.json');
const CACHE_FILE = path.join(CLAUDE_DIR, 'usage-cache.json');
const DEEPSEEK_TRACKER_FILE = path.join(CLAUDE_DIR, 'deepseek-usage.json');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

// DeepSeek V4-Pro pricing in CNY per 1M tokens (effective 2026-08-17):
// peak/off-peak scheme — peak = 9:00–12:00 & 14:00–18:00 Beijing time (7h/day), off-peak = half price.
// Cache hits are priced as misses (conservative) since cumulative token totals don't distinguish them.
const DS_PEAK_HOURS = 7;
const DS_PRICING_PEAK = { input: 9.0, output: 27.0 };
const DS_PRICING_OFFPEAK = { input: 4.5, output: 13.5 };
// Blended 24h average used for monthly estimates
const DS_PRICING_CNY = {
  input: (DS_PRICING_OFFPEAK.input * (24 - DS_PEAK_HOURS) + DS_PRICING_PEAK.input * DS_PEAK_HOURS) / 24,
  output: (DS_PRICING_OFFPEAK.output * (24 - DS_PEAK_HOURS) + DS_PRICING_PEAK.output * DS_PEAK_HOURS) / 24,
};
// Claude Opus 5 pricing per 1M tokens (USD)
const OPUS_PRICING = { input: 5, output: 25 };

function trackDeepSeekMonthly(j) {
  const inputTokens = j?.context_window?.total_input_tokens || 0;
  const outputTokens = j?.context_window?.total_output_tokens || 0;

  let t = readJson(DEEPSEEK_TRACKER_FILE) || { month: '', inTok: 0, outTok: 0, lastIn: 0, lastOut: 0 };
  const currentMonth = new Date().toISOString().substring(0, 7);

  if (t.month !== currentMonth) {
    t = { month: currentMonth, inTok: 0, outTok: 0, lastIn: 0, lastOut: 0 };
  }

  const inDelta = inputTokens - t.lastIn;
  const outDelta = outputTokens - t.lastOut;
  if (inDelta > 0) t.inTok += inDelta;
  if (outDelta > 0) t.outTok += outDelta;
  t.lastIn = inputTokens;
  t.lastOut = outputTokens;

  try { fs.writeFileSync(DEEPSEEK_TRACKER_FILE, JSON.stringify(t)); } catch {}

  // Return monthly totals: DS in native CNY, Opus in USD
  const dsCny = (t.inTok / 1_000_000) * DS_PRICING_CNY.input + (t.outTok / 1_000_000) * DS_PRICING_CNY.output;
  const opusUsd = (t.inTok / 1_000_000) * OPUS_PRICING.input + (t.outTok / 1_000_000) * OPUS_PRICING.output;
  return { dsCny, opusUsd };
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

function formatDeepSeekStatus(j, balance) {
  const { dsCny, opusUsd } = trackDeepSeekMonthly(j);

  if (balance?.balance_infos?.length) {
    const infos = balance.balance_infos;
    const info = infos.find(i => parseFloat(i.total_balance) > 0) || infos[0];
    const symbol = info.currency === 'USD' ? '$' : '¥';
    return `| ${symbol}${info.total_balance}  | ¥${dsCny.toFixed(2)}  | $${opusUsd.toFixed(2)} opus5`;
  }
  return '';
}

async function getUsage(j) {
  const provider = detectProvider();

  // DeepSeek: balance (cached 1min) + live session costs
  if (provider === 'deepseek') {
    const balance = await getBalance();
    return formatDeepSeekStatus(j, balance);
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
