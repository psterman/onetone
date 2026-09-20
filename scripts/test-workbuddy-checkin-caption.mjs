/**
 * Guard: WorkBuddy Soft Pad tip inventory — check-in fields + paymentType,
 * message segments split by ` · ` (no nested ·), overlay expands tip lines.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(
  join(root, 'src-tauri/src/shell_agent_usage/official/workbuddy.rs'),
  'utf8'
);
const overlay = readFileSync(join(root, 'src/codex-micro-overlay.html'), 'utf8');

assert.ok(src.includes('parse_workbuddy_checkin'), 'parse_workbuddy_checkin exported');
assert.ok(src.includes('checkin-activity-status'), 'fetches Buddy check-in status');
assert.ok(src.includes('get-payment-type'), 'fetches payment type');
assert.ok(src.includes('fetch_payment_type'), 'fetch_payment_type helper');
assert.ok(
  /个人号：Buddy 加油站优先/.test(src) || /Buddy 加油站优先/.test(src),
  'personal path prefers check-in'
);
assert.ok(src.includes('签到 已签'), 'tip inventory: checked-in label');
assert.ok(src.includes('本周 {w}/7') || src.includes('本周 '), 'tip inventory: week progress');
assert.ok(src.includes('类型 {acct}/{pay}') || src.includes('类型 '), 'tip inventory: account/pay');
assert.ok(src.includes('活动 {name}') || src.includes('活动 '), 'tip inventory: theme');
assert.ok(src.includes('截止 '), 'tip inventory: end date');
assert.ok(src.includes('账号 {account_label}') || src.includes('账号 '), 'tip inventory: nickname');

assert.ok(
  /kind===['"]workbuddy['"][\s\S]*?split\(['"] · ['"]\)/.test(overlay),
  'overlay expands workbuddy tip by · segments'
);

/** Mirror Soft Pad tip inventory segments (keep in sync with parse_workbuddy_checkin). */
function caption(data, meta) {
  if (!data.active) throw new Error('inactive');
  const bits = [];
  const daily = Number(data.daily_credit || 0);
  const todayCredit = Number(data.today_credit != null ? data.today_credit : daily);
  if (data.today_checked_in) {
    bits.push('签到 已签');
    if (todayCredit > 0) bits.push(`今日 +${Math.round(todayCredit)}`);
  } else {
    bits.push('签到 未签');
    if (daily > 0) bits.push(`可领 ${Math.round(daily)}`);
  }
  const streak = Math.round(Number(data.streak_days || 0));
  if (streak > 0) bits.push(`连签 ${streak} 天`);
  const total = Number(data.total_credits || 0);
  if (total > 0) bits.push(`本期 ${Math.round(total)}`);
  const week =
    data.week_checkin_days != null
      ? Math.round(Number(data.week_checkin_days))
      : Array.isArray(data.week_progress)
        ? data.week_progress.filter(Boolean).length
        : null;
  if (week != null && week >= 0) bits.push(`本周 ${week}/7`);
  if (data.theme_name) bits.push(`活动 ${data.theme_name}`);
  if (data.end_time && String(data.end_time).length >= 10) {
    const md = String(data.end_time).slice(5, 10);
    const [m, d] = md.split('-');
    bits.push(`截止 ${String(m).replace(/^0/, '')}/${String(d).replace(/^0/, '')}`);
  }
  meta = meta || {};
  if (meta.nickname) bits.push(`账号 ${meta.nickname}`);
  const acct = meta.account_type || 'personal';
  const pay = meta.payment_type || '';
  bits.push(pay ? `类型 ${acct}/${pay}` : `类型 ${acct}`);
  return bits.join(' · ');
}

assert.equal(
  caption(
    {
      active: true,
      today_checked_in: true,
      streak_days: 3,
      daily_credit: 100,
      today_credit: 100,
      total_credits: 300,
      week_checkin_days: 3,
      theme_name: 'Buddy加油站',
      end_time: '2026-09-29 23:59:59',
    },
    { nickname: '小白', account_type: 'personal', payment_type: 'free' }
  ),
  '签到 已签 · 今日 +100 · 连签 3 天 · 本期 300 · 本周 3/7 · 活动 Buddy加油站 · 截止 9/29 · 账号 小白 · 类型 personal/free'
);

assert.equal(
  caption(
    {
      active: true,
      today_checked_in: false,
      streak_days: 2,
      daily_credit: 100,
      today_credit: 0,
      total_credits: 200,
      week_checkin_days: 2,
    },
    { account_type: 'personal', payment_type: 'free' }
  ),
  '签到 未签 · 可领 100 · 连签 2 天 · 本期 200 · 本周 2/7 · 类型 personal/free'
);

// Pill compact: first two segments
const full = caption(
  {
    active: true,
    today_checked_in: true,
    streak_days: 3,
    daily_credit: 100,
    today_credit: 100,
    total_credits: 300,
  },
  { payment_type: 'free' }
);
assert.equal(full.split(' · ').slice(0, 2).join(' · '), '签到 已签 · 今日 +100');

console.log('ok workbuddy-checkin-caption');
