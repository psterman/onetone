import { readFileSync } from 'node:fs';
const panelJs = readFileSync('src/js/features/voice/voice-lab-panel.js', 'utf8');
const checks = [
  ['截屏粗圈', /截屏粗圈/.test(panelJs)],
  ['圈住输入框', /圈住输入框/.test(panelJs)],
  ['蓝框内点一下', /蓝框内点一下/.test(panelJs)],
  ['之后回放同一蓝框', /之后回放同一蓝框/.test(panelJs)],
  ['data-vl-aim-mq', /data-vl-aim-mq/.test(panelJs)],
  ['aimMqAroundBox', /aimMqAroundBox/.test(panelJs)],
  ['录鼠标动作 still?', /录鼠标动作/.test(panelJs)],
];
for (const [n, ok] of checks) console.log((ok ? 'PASS' : 'FAIL') + ' ' + n);
