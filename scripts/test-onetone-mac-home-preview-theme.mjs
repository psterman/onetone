import fs from 'fs';

const h = fs.readFileSync('design-mock/onetone-mac-home-preview.html', 'utf8');
const m = h.match(/<script>([\s\S]*?)<\/script>/);
if (!m) {
  console.error('NO_SCRIPT');
  process.exit(1);
}
try {
  new Function(m[1]);
  console.log('script_ok');
} catch (e) {
  console.error(e);
  process.exit(1);
}

const checks = {
  accent: h.includes('--accent: #2a9cc4'),
  ok: h.includes('--ok: #1a9b5f'),
  themeToggle: h.includes('id="themeToggle"'),
  localStorage: h.includes('onetone-home-theme'),
  noPurple: !/113,\s*91,\s*180|105,\s*83,\s*166|6d28d9/.test(h),
  runningDotOk: /\.pulse \.chip\[data-st="running"\] \.dot \{[\s\S]*?background: var\(--ok\)/.test(h),
  runningChipOk: /\.pulse \.chip\[data-st="running"\] \{ color: var\(--ok\)/.test(h),
  capVoiceAccent: /\.cap\.on-voice \{[\s\S]*?color: var\(--accent\)/.test(h),
  darkAccent: /body\[data-theme="dark"\] \{[\s\S]*?--accent: #4eb6d9/.test(h),
};

for (const [k, v] of Object.entries(checks)) console.log(k + ':', v);
if (Object.values(checks).some((v) => !v)) process.exit(1);
