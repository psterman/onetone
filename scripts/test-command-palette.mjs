// P9a command palette domain 单测：catalog / filter / merge。
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = resolve(root, 'src-islands/domain/commandPalette.ts');

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'neutral',
  logLevel: 'silent',
});
const code = result.outputFiles[0].text;
const tmp = path.join(os.tmpdir(), `command-palette-${Date.now()}.mjs`);
writeFileSync(tmp, code);

const mod = await import('file://' + tmp);
const {
  COMMAND_CATALOG,
  CORE_COMMAND_IDS,
  buildCommandItems,
  filterCommands,
  mergeCommandItems,
} = mod;

let failed = false;
function check(name, cond) {
  if (cond) console.log('  PASS', name);
  else {
    console.error('  FAIL', name);
    failed = true;
  }
}

const t = (key) => {
  const map = {
    homeWbCmdkHome: '回到首页',
    homeWbCmdkHintNav: '导航',
    homeWbQuickTest: '测试发送',
    homeWbCmdkHintAction: '动作',
    homeWbNavTriggers: '按键设置',
    homeWbCmdkHintSettings: '设置',
    homeWbQuickNewHabit: '新建习惯',
    homeWbQuickSwitchModel: '切换语音模型',
    homeWbNavSoftPad: '虚拟键盘',
    homeWbNavSchemes: '我的习惯',
    homeWbNavSounds: '声音',
    homeWbNavVoice: '语音设置',
    homeWbNavCamera: '摄像头',
    homeWbNavGeneral: '通用',
    homeWbNavRuntime: '运行状态',
  };
  return map[key] || key;
};

check('COMMAND_CATALOG 3 条（core nav only）', COMMAND_CATALOG.length === 3);
check('CORE_COMMAND_IDS 含 home/habit', CORE_COMMAND_IDS.has('home') && CORE_COMMAND_IDS.has('habit'));

const items = buildCommandItems(t);
check('buildCommandItems 3 条', items.length === 3);
check('title 来自 labelKey', items[0].title === '回到首页');
check('group 来自 hintKey', items[0].group === '导航');
check('每条有 run 函数', items.every((i) => typeof i.run === 'function'));

check('filter 空 query 全量', filterCommands(items, '').length === 3);
check('filter 按 title', filterCommands(items, '测试').length === 1 && filterCommands(items, '测试')[0].id === 'test');
check('filter 按 id', filterCommands(items, 'test').length === 1 && filterCommands(items, 'test')[0].id === 'test');
check('filter 无匹配', filterCommands(items, 'zzznomatch').length === 0);

// Test keywords filtering
const withKeywords = [
  { id: 'voice', title: '语音设置', keywords: ['voice', 'vosk', 'whisper'], group: '设置', run: () => {} },
  { id: 'camera', title: '摄像头', keywords: ['camera', '离席', '人脸'], group: '设置', run: () => {} },
];
const allItems = [...items, ...withKeywords];
check('filter 按 keyword 命中 vosk', filterCommands(allItems, 'vosk').length === 1 && filterCommands(allItems, 'vosk')[0].id === 'voice');
check('filter 按 keyword 命中 离席', filterCommands(allItems, '离席').length === 1 && filterCommands(allItems, '离席')[0].id === 'camera');
check('filter 复合 token voice/test', filterCommands(allItems, 'voice/test').some((i) => i.id === 'voice') && filterCommands(allItems, 'voice/test').some((i) => i.id === 'test'));

const merged = mergeCommandItems(items, [{ id: 'extra', title: 'Extra', run: () => {} }]);
check('merge 追加 extras', merged.length === 4);
check('merge 不覆盖 core id', mergeCommandItems(items, [{ id: 'home', title: 'X', run: () => {} }]).length === 3);

try {
  const fs = await import('node:fs');
  fs.unlinkSync(tmp);
} catch {
  /* ignore */
}

if (failed) {
  console.error('[command-palette] 单测失败');
  process.exit(1);
}
console.log('[command-palette] 单测通过：catalog/filter/merge 正确。');
