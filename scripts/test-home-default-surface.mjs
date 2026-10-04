import fs from 'node:fs';

const workbench = fs.readFileSync('src/js/features/home/home-workbench.js', 'utf8');
const nowHome = fs.readFileSync('src/js/features/now/now-home.js', 'utf8');

if (!nowHome.includes('function isEnabled()')) {
  throw new Error('Now Home must expose an explicit enable gate');
}
if (!nowHome.includes("q.get('now') === '0'") || !nowHome.includes('return true')) {
  throw new Error('thin desk home must default on; opt out with ?now=0');
}
if (!nowHome.includes('setSmokeFeedbackHidden')) {
  throw new Error('Now Home must hide dual smoke ask boxes while desk is shown');
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

console.log('home-default-surface: ok (desk default on)');
