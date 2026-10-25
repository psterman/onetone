/**
 * Contract: left directory pages must stay enterable.
 * - 「更多设置」opens basic (not general→debug)
 * - focus-mode lifts while drawer open / after session expand
 * - bindNav resolves ShellIa at click time
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;

function check(name, cond) {
  if (cond) {
    pass++;
    console.log('  PASS ' + name);
  } else {
    fail++;
    console.error('  FAIL ' + name);
  }
}

const wb = readFileSync(join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
const shell = readFileSync(join(root, 'src/js/features/home/home-shell.js'), 'utf8');
const drawer = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
const runtime = readFileSync(join(root, 'src/js/core/app-home-runtime.js'), 'utf8');
const ia = readFileSync(join(root, 'src/js/shared/shell-ia-convergence.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/home-workbench.css'), 'utf8');

check('ShellIa general → basic', /general:\s*\{\s*panel:\s*'basic'/.test(ia));
check('resolveSettingsPanelRequest general → basic', /if\(panel==='general'\)\{\s*return \{panel:'basic'/.test(drawer));
check('general no longer remaps to debug repair', !/panel==='general'\)\{\s*return \{\s*panel:'debug'/.test(drawer));
check('更多设置 opens basic', /wbNavMoreSettings[\s\S]*open\(\{panel:'basic'\}\)/.test(wb));
check('更多设置 does not open general', !/wbNavMoreSettings[\s\S]{0,400}open\(\{panel:'general'\}\)/.test(wb));
check('更多设置 expands focus nav', /expandHomeFocusNav/.test(wb) && /expandHomeFocusNav/.test(runtime));
check('session expand clears focus mode', /vp_focus_nav_expanded/.test(runtime));
check('home-shell focus-mode respects drawerOpen', /focusMode&&useWorkbench&&!ui\.drawerOpen/.test(shell));
check('syncSettingsChrome clears focus-mode when drawer open', /syncSettingsChrome[\s\S]*is-focus-mode[\s\S]*drawerOpen/.test(drawer) || /is-focus-mode[\s\S]*focusHome&&isWorkbenchShell/.test(drawer));
check('bindNav resolves ShellIa on click', /Resolve at click time[\s\S]*OneToneShellIaConvergence/.test(wb));
check('keys panel maps to triggers nav', /keys:'triggers'/.test(wb));
check('agentData maps to agent nav (not agentData button)', /agentData:'agent'/.test(wb));
check('navKeyForPanel helper present', /function navKeyForPanel\(panel\)/.test(wb));
check('nav sync prefers live settingsPanel when drawer open', /if\(ui&&ui\.settingsPanel\) panel=String\(ui\.settingsPanel\)/.test(wb) && /activeNav=navKeyForPanel\(panel\)/.test(wb));
check('bindNav optimistic navKey before channel open', /syncNavActiveState\(row\.panel,\{navKey:action\}\)/.test(wb));
check('bindNav re-syncs after channel open', /openHabitChannelChip\(ch\);\s*\r?\n\s*syncNavActiveState\(row\.panel\)/.test(wb));
check('softPad focus nav sync guards settingsPanel', /settingsPanel==='softPad'&&global\.OneToneHomeWorkbench/.test(drawer));
check('wb-nav-item[hidden] forces display:none', /wb-nav-item\[hidden\][\s\S]*display:\s*none\s*!important/.test(css));
check(
  'focus-mode keeps homeV2 visible',
  /is-focus-mode[\s\S]*data-wb-nav="home"\)[\s\S]*:not\(\[data-wb-nav="homeV2"\]\)/.test(css) ||
    /:not\(\[data-wb-nav="home"\]\):not\(\[data-wb-nav="homeV2"\]\)/.test(css)
);
check(
  'agentV2 surface unlocks advanced (no sticky focus fold)',
  /onetone\.homeSurface/.test(runtime) && /agentV2/.test(runtime) &&
    /isHomeAdvancedUnlocked[\s\S]{0,500}agentV2/.test(runtime)
);
check(
  'gear expands focus nav instead of onboarding hijack',
  /btnSettings[\s\S]{0,500}expandHomeFocusNav/.test(
    readFileSync(join(root, 'src/js/features/settings/app-shell-bindings.js'), 'utf8')
  ) &&
    !/btnSettings[\s\S]{0,400}OneToneOnboarding\.open/.test(
      readFileSync(join(root, 'src/js/features/settings/app-shell-bindings.js'), 'utf8')
    )
);

const indexHtml = readFileSync(join(root, 'src/index.html'), 'utf8');
check('数据 left-nav directory removed', !/id="wbNavAgentData"|data-wb-nav="agentData"/.test(indexHtml));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
