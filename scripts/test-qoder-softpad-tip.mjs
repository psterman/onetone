/**
 * Narrow self-check for Qoder Soft Pad tip enrichment (no native DLL).
 */
import assert from 'node:assert/strict';

function friendlyQoderPlan(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  const lower = t.toLowerCase();
  if (lower === 'free' || lower.includes('free')) return '免费';
  if (lower === 'pro' || lower.includes('pro')) return 'Pro';
  if (lower.includes('team') || lower.includes('org')) return '团队';
  if (lower.includes('enterprise')) return '企业';
  return t;
}

function humanQoderMessage({ plan, used, total, rem, addon, exceeded, started }) {
  const bits = [];
  if (plan) bits.push(plan);
  if (used != null && total != null) bits.push(`套餐额度 ${used} / ${total}`);
  else if (!(exceeded && rem <= 0)) bits.push(`剩余 ${rem} Credits`);
  if (exceeded && rem <= 0) bits.push('已用尽');
  if (addon != null && addon > 0) bits.push(`额外购买 ${addon}`);
  if (started) bits.push(`开通自${started}`);
  return bits.join(' · ');
}

assert.equal(friendlyQoderPlan('Free'), '免费');
assert.equal(
  humanQoderMessage({
    plan: '免费',
    used: 0,
    total: 0,
    rem: 0,
    exceeded: true,
    started: '2025年9月22日',
  }),
  '免费 · 套餐额度 0 / 0 · 已用尽 · 开通自2025年9月22日'
);
assert.equal(
  humanQoderMessage({
    plan: 'Pro',
    used: 250,
    total: 1000,
    rem: 750,
    addon: 40,
    exceeded: false,
  }),
  'Pro · 套餐额度 250 / 1000 · 额外购买 40'
);
console.log('ok qoder-softpad-tip');
