import fs from 'node:fs';

const workbench = fs.readFileSync('src/js/features/home/home-workbench.js', 'utf8');
const nowHome = fs.readFileSync('src/js/features/now/now-home.js', 'utf8');
const indexHtml = fs.readFileSync('src/index.html', 'utf8');

if (!nowHome.includes('function isEnabled()')) {
  throw new Error('Now Home must expose an explicit enable gate');
}
if (!nowHome.includes("q.get('now') === '0'") || !nowHome.includes('return true')) {
  throw new Error('thin desk home must default on; opt out with ?now=0');
}
if (!nowHome.includes('setSmokeFeedbackHidden')) {
  throw new Error('Now Home must hide dual smoke ask boxes while desk is shown');
}
if (!nowHome.includes('voice.listening && voiceArmed') && !nowHome.includes('voice.listening&&voiceArmed')) {
  throw new Error('home command mode must require voiceArmed (开始听写), not engine-live alone');
}
if (!nowHome.includes('isVoiceArmed')) {
  throw new Error('OneToneNowHome must expose isVoiceArmed');
}
// Cold-start: smoke must be hidden in HTML so it never paints before Now.show().
if (!/id="codexSmokeFeedback"[^>]*\bhidden\b/.test(indexHtml)) {
  throw new Error('codexSmokeFeedback must start hidden in index.html');
}
if (!/id="claudeSmokeFeedback"[^>]*\bhidden\b/.test(indexHtml)) {
  throw new Error('claudeSmokeFeedback must start hidden in index.html');
}
// Left-nav: hide() must keep smoke buried while Now is the product home.
if (!nowHome.includes('if (isEnabled())') || !nowHome.includes('setSmokeFeedbackHidden(true)')) {
  throw new Error('hide() must keep smoke hidden when Now is enabled');
}
const smokeCss = fs.readFileSync('src/css/codex-smoke-feedback.css', 'utf8');
const nowCss = fs.readFileSync('src/css/now-home.css', 'utf8');
if (!smokeCss.includes('.codex-smoke-feedback[hidden]')) {
  throw new Error('smoke CSS must honor [hidden] over display:flex');
}
if (!nowCss.includes('.codex-smoke-feedback') || !nowCss.includes('#nowHomeRoot:not([hidden])')) {
  throw new Error('now-home CSS must hide smoke while Now root is visible');
}
if (!workbench.includes("if(api.isEnabled&&api.isEnabled())")) {
  throw new Error('workbench must still gate Now via isEnabled()');
}
if (!workbench.includes('}else if(api.hide)')) {
  throw new Error('workbench must hide Now when disabled / not on home');
}
// Now desk: hide workbench setup banner; empty dto must not invent「未发现应用」Hero.
if (!workbench.includes('Thin desk (Now) owns home-center') || !workbench.includes('wbHomeAlerts')) {
  throw new Error('renderAlerts must suppress setup banner when Now is enabled');
}
if (!nowCss.includes('.wb-home-alert')) {
  throw new Error('now-home CSS must hide wb-home-alert under visible Now');
}
const adapter = fs.readFileSync('src/js/features/now/home-focus-adapter.js', 'utf8');
if (!adapter.includes('_bootShell') || !adapter.includes('hasSnap')) {
  throw new Error('empty Home Focus dto must return quiet boot shell, not 未发现应用 Hero');
}
if (!nowHome.includes('Warm Home Focus cache BEFORE paint')) {
  throw new Error('show() must warm Home Focus cache before first paint');
}

console.log('home-default-surface: ok (desk default on; smoke boot-hidden; no empty-hero flash)');
