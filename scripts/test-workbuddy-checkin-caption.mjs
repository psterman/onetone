/**
 * Guard: WorkBuddy Soft Pad personal usage prefers Buddy 加油站 check-in
 * (community path) over get-user-resource which returns 10085 for free accounts.
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

assert.ok(src.includes('parse_workbuddy_checkin'), 'parse_workbuddy_checkin exported');
assert.ok(
  src.includes('checkin-activity-status'),
  'fetches Buddy check-in status'
);
assert.ok(
  /个人号：Buddy 加油站优先/.test(src) || /Buddy 加油站优先/.test(src),
  'personal path prefers check-in'
);
assert.ok(src.includes('fn parse_checkin_checked_in'), 'unit test: checked in');
assert.ok(src.includes('fn parse_checkin_not_yet'), 'unit test: not yet');
assert.ok(src.includes('今日+'), 'caption includes today credit');
assert.ok(src.includes('连签'), 'caption includes streak');
assert.ok(src.includes('可领'), 'caption includes claimable');

/** Mirror caption bits used by Soft Pad (keep in sync with parse_workbuddy_checkin). */
function caption(data) {
  if (!data.active) throw new Error('inactive');
  const bits = ['加油站'];
  const daily = Number(data.daily_credit || 0);
  const todayCredit = Number(data.today_credit != null ? data.today_credit : daily);
  if (data.today_checked_in) {
    bits.push('已签');
    if (todayCredit > 0) bits.push(`今日+${Math.round(todayCredit)}`);
  } else {
    bits.push('未签');
    if (daily > 0) bits.push(`可领${Math.round(daily)}`);
  }
  const streak = Math.round(Number(data.streak_days || 0));
  if (streak > 0) bits.push(`连签${streak}天`);
  const total = Number(data.total_credits || 0);
  if (total > 0) bits.push(`本期${Math.round(total)}`);
  return bits.join(' · ');
}

assert.equal(
  caption({
    active: true,
    today_checked_in: true,
    streak_days: 3,
    daily_credit: 100,
    today_credit: 100,
    total_credits: 300,
  }),
  '加油站 · 已签 · 今日+100 · 连签3天 · 本期300'
);
assert.equal(
  caption({
    active: true,
    today_checked_in: false,
    streak_days: 2,
    daily_credit: 100,
    today_credit: 0,
    total_credits: 200,
  }),
  '加油站 · 未签 · 可领100 · 连签2天 · 本期200'
);

console.log('ok workbuddy-checkin-caption');
