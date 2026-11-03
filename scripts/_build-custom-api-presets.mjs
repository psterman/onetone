/**
 * Build CUSTOM_API_PRESETS from models.dev api.json (OpenAI-compatible only).
 * Source: https://models.dev/api.json — same catalog as Cherry/MiniMax-style provider pickers.
 *
 * Usage: node scripts/_build-custom-api-presets.mjs
 * Writes: src/js/features/now/custom-api-presets.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = path.join(root, 'scripts', '_tmp_models_dev_api.json');
const outPath = path.join(root, 'src', 'js', 'features', 'now', 'custom-api-presets.js');

const LOCAL_ICON = {
  deepseek: 'icons/model-brand/deepseek.png',
  zhipuai: 'icons/model-brand/zhipu.png',
  'zhipuai-coding-plan': 'icons/model-brand/zhipu.png',
  zai: 'icons/model-brand/zhipu.png',
  'zai-coding-plan': 'icons/model-brand/zhipu.png',
  moonshotai: 'icons/model-brand/kimi.png',
  'moonshotai-cn': 'icons/model-brand/kimi.png',
  minimax: 'icons/model-brand/minimax.png',
  'minimax-cn': 'icons/model-brand/minimax.png',
  'minimax-openai': 'icons/model-brand/minimax.png',
  'minimax-cn-openai': 'icons/model-brand/minimax.png',
  openai: 'icons/provider/openai.png',
  alibaba: 'icons/model-brand/qwen.png',
  'alibaba-cn': 'icons/model-brand/qwen.png',
  siliconflow: 'icons/model-brand/siliconflow.png',
  openrouter: 'icons/model-brand/openrouter.png',
  xiaomi: 'icons/model-brand/xiaomi.png',
  'xiaomi-cn': 'icons/model-brand/xiaomi.png',
  'xiaomi-token-plan': 'icons/model-brand/xiaomi.png',
  stepfun: 'icons/model-brand/stepfun.png',
  hunyuan: 'icons/model-brand/hunyuan.png',
  opencode: 'icons/model-brand/opencode.png',
  'opencode-go': 'icons/model-brand/opencode.png'
};

/** models.dev marks some vendors Anthropic-only / missing api — we still need OpenAI-compat hosts. */
const EXTRA_PRESETS = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    icon: LOCAL_ICON.openai
  },
  {
    id: 'minimax-cn-openai',
    label: 'MiniMax (minimax.cn)',
    baseUrl: 'https://api.minimaxi.com/v1',
    model: 'MiniMax-M3.1-Flash',
    icon: LOCAL_ICON['minimax-cn'],
    models: [
      'MiniMax-M3.1-Flash',
      'MiniMax-M3',
      'MiniMax-M2.7',
      'MiniMax-M2.7-highspeed',
      'MiniMax-M2.5',
      'MiniMax-M2.5-highspeed'
    ]
  },
  {
    id: 'minimax-openai',
    label: 'MiniMax (minimax.io)',
    baseUrl: 'https://api.minimax.io/v1',
    model: 'MiniMax-M3.1-Flash',
    icon: LOCAL_ICON.minimax,
    models: [
      'MiniMax-M3.1-Flash',
      'MiniMax-M3',
      'MiniMax-M2.7',
      'MiniMax-M2.7-highspeed',
      'MiniMax-M2.5',
      'MiniMax-M2.5-highspeed'
    ]
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/auto',
    icon: LOCAL_ICON.openrouter
  }
];

function isOpenAiCompatibleNpm(npm) {
  npm = String(npm || '');
  if (!npm) return false;
  if (/openai-compatible/.test(npm)) return true;
  if (npm === '@ai-sdk/openai') return true;
  if (npm === '@openrouter/ai-sdk-provider') return true;
  if (npm === '@aihubmix/ai-sdk-provider') return true;
  return false;
}

/** Prefer chat-ish model ids; skip embedding/tts/image when possible. */
function scoreModel(id, m) {
  m = m || {};
  const s = String(id).toLowerCase();
  const name = String(m.name || '').toLowerCase();
  let score = 0;
  if (m.tool_call || m.tools) score += 3;
  if (m.reasoning) score += 1;
  if (/embed|tts|whisper|image|vision-only|rerank|moderation|speech|video|music/.test(s + ' ' + name)) {
    score -= 20;
  }
  if (/chat|instruct|turbo|flash|plus|mini|sonnet|opus|haiku|coder|code/.test(s)) score += 2;
  if (/m3\.1|m3-1|gpt-4o-mini|deepseek-chat|glm-4-flash|qwen-plus|kimi-k2/.test(s)) {
    score += 10;
  }
  if (/minimax-m2\.7|minimax-m2\.5/.test(s)) score += 1;
  return score;
}

function pickModel(models) {
  const ids = Object.keys(models || {});
  if (!ids.length) return '';
  const scored = ids.map((id) => ({ id, score: scoreModel(id, models[id]) }));
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored[0].id;
}

/** Top chat models for the provider picker datalist (latest first). */
function pickModelsList(models, limit) {
  limit = limit || 24;
  const ids = Object.keys(models || {});
  const scored = ids
    .map((id) => ({ id, score: scoreModel(id, models[id]) }))
    .filter((x) => x.score >= 0);
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, limit).map((x) => x.id);
}

function normalizeBaseUrl(api) {
  let u = String(api || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  // models.dev already includes /v1 for openai-compatible; keep as-is.
  return u;
}

function slugId(id) {
  return String(id || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

const raw = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const providers = raw && typeof raw === 'object' ? raw : {};

const rows = EXTRA_PRESETS.map((r) => ({ ...r }));
for (const [pid, p] of Object.entries(providers)) {
  if (!p || typeof p !== 'object') continue;
  if (!isOpenAiCompatibleNpm(p.npm)) continue;
  const api = normalizeBaseUrl(p.api);
  if (!api) continue;
  if (!/^https?:\/\//i.test(api)) continue;
  // Skip localhost-only defaults from the public catalog (user can use 其他).
  if (/localhost|127\.0\.0\.1/i.test(api)) continue;

  const id = slugId(pid);
  if (!id) continue;
  const label = String(p.name || pid).trim() || id;
  const modelList = pickModelsList(p.models, 24);
  const model = modelList[0] || pickModel(p.models);
  const icon = LOCAL_ICON[pid] || LOCAL_ICON[id] || '';
  const row = { id, label, baseUrl: api, model, icon };
  if (modelList.length) row.models = modelList;
  rows.push(row);
}

rows.sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));

// Dedupe by id (prefer EXTRA_PRESETS / first).
const seen = new Set();
const unique = [];
for (const r of rows) {
  if (seen.has(r.id)) continue;
  seen.add(r.id);
  unique.push(r);
}

const header = `/**
 * OpenAI-compatible custom API presets for home-agent-v2.
 * Generated from models.dev api.json — do not hand-edit the list body.
 * Regenerate: node scripts/_build-custom-api-presets.mjs
 * Source: https://models.dev (openai-compatible providers with public api base URL)
 */
(function (global) {
  'use strict';
  var PRESETS = `;

const footer = `;
  global.OneToneCustomApiPresets = PRESETS;
})(window);
`;

fs.writeFileSync(outPath, header + JSON.stringify(unique, null, 2) + footer);
console.log('wrote', path.relative(root, outPath), 'count=', unique.length);
console.log('sample:', unique.slice(0, 5).map((r) => r.label).join(', '), '…');
console.log('with icon:', unique.filter((r) => r.icon).length);
console.log('with model:', unique.filter((r) => r.model).length);
