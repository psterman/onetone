// Phase B：React 文案宿主不得被 domain apply textContent 覆盖
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.error('  FAIL ' + name); }
}

const voiceFlow = readFileSync(join(root, 'src-islands/domain/voiceFlowChrome.ts'), 'utf8');
check('voice flow 跳过 wake hint 双写', voiceFlow.includes("page === 'wake'") && voiceFlow.includes('React'));

const keysFlow = readFileSync(join(root, 'src-islands/domain/keysFlowChrome.ts'), 'utf8');
check('keys flow 跳过 trigger hint 双写', keysFlow.includes("page === 'trigger'"));

const cameraFlow = readFileSync(join(root, 'src-islands/domain/cameraFlowChrome.ts'), 'utf8');
check('camera flow 跳过 trigger hint 双写', cameraFlow.includes("tab === 'trigger'"));

const debugOv = readFileSync(join(root, 'src-islands/domain/debugOverview.ts'), 'utf8');
check('debug overview 不写 heroTitle', !/heroTitle\.textContent/.test(debugOv) && debugOv.includes('React'));

const keysFinish = readFileSync(join(root, 'src-islands/domain/keysFinishChrome.ts'), 'utf8');
check('keys finish chrome 不写 hint textContent', !/keysFinishModeHint[\s\S]{0,80}textContent/.test(keysFinish));

const keysDisplay = readFileSync(join(root, 'src-islands/domain/keysDisplayChrome.ts'), 'utf8');
check('keys display 不写 triggerTrace textContent', keysDisplay.includes('triggerTrace') && !/triggerTrace[\s\S]{0,120}textContent\s*=/.test(keysDisplay));

const voiceIsland = readFileSync(join(root, 'src-islands/islands/voice-flow-chrome-island.tsx'), 'utf8');
check('voice flow 岛渲染 wakeHint', voiceIsland.includes('model.wakeHint'));

console.log(`[island-host-ownership] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
