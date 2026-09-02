#!/usr/bin/env node
/** ponytail: hero mic card keeps one voice switch; pause pill is keys-only */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(root, 'src/index.html'), 'utf8');
const wb = readFileSync(path.join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
const live = readFileSync(path.join(root, 'src/js/features/home/home-live-actions.js'), 'utf8');
const css = readFileSync(path.join(root, 'src/css/home-workbench.css'), 'utf8');

const must = [
  ['index', html.includes('id="wbHeroVoiceCtrl"') && html.includes('voiceSurfaceSwitchLabel')],
  ['label wraps switch', html.includes('wb-hero-voice-ctrl') && html.includes('wbHeroVoiceSwitchLabel')],
  ['status readonly css', css.includes('.wb-hero-mic.is-voice-surface .wb-hero-mic-status')],
  ['surface line1 only', wb.includes('line1=surface.line1||\'\'') && !wb.includes('line1=String(flow.trigger)')],
  ['keys listen pill', wb.includes("pill.action==='listen-toggle'") && wb.includes('keysListenPill')],
  ['paused resume', live.includes('cmd_resume') && live.includes('if(paused&&on')],
];

const fail = must.filter(([, ok]) => !ok).map(([name]) => name);
if (fail.length) {
  console.error('home voice mic card check failed:', fail.join(', '));
  process.exit(1);
}
console.log('ok home-voice-mic-card');
