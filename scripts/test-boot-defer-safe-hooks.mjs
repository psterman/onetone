/**
 * Contract: bootstrap/lang hook register must not touch deferred debug scripts.
 * Root cause of「左侧目录进不去」: OneToneDebugAbout is data-ot-defer="debug",
 * so `D.exportDiagnosticLogs` / `D.renderAboutPanel` at register time threw,
 * left __vp_bootstrap_hooks__ empty, and boot never wired openDrawer.
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

const bootHooks = readFileSync(join(root, 'src/js/core/app-bootstrap-hooks.js'), 'utf8');
const langHooks = readFileSync(join(root, 'src/js/core/app-lang-hooks.js'), 'utf8');
const boot = readFileSync(join(root, 'src/js/core/app-boot.js'), 'utf8');
const bootstrap = readFileSync(join(root, 'src/js/core/app-bootstrap.js'), 'utf8');
const index = readFileSync(join(root, 'src/index.html'), 'utf8');

check('debug-about is deferred', /data-ot-defer="debug"[^>]*debug-about\.js/.test(index) || /debug-about\.js[\s\S]{0,80}data-ot-defer="debug"/.test(index) || index.includes('data-ot-defer="debug" src="js/features/debug/debug-about.js"'));
check('bootstrap-hooks uses debugAboutFn', bootHooks.includes('function debugAboutFn'));
check('bootstrap-hooks no eager D.exportDiagnosticLogs', !/OneToneDebugAbout\s*;[\s\S]{0,400}exportDiagnosticLogs:D\.exportDiagnosticLogs/.test(bootHooks) && !bootHooks.includes('exportDiagnosticLogs:D.exportDiagnosticLogs'));
check('bootstrap-hooks lazy exportDiagnosticLogs', bootHooks.includes("debugAboutFn('exportDiagnosticLogs')"));
check('lang-hooks no eager D.renderAboutPanel', !langHooks.includes('renderAboutPanel:D.renderAboutPanel'));
check('lang-hooks lazy renderAboutPanel', /renderAboutPanel:function\(\)\{[\s\S]*OneToneDebugAbout/.test(langHooks));
check('app-boot markBoot fallback', boot.includes('OneToneDom.markBoot') && boot.includes('function markBoot'));
check('app-bootstrap aborts if hooks incomplete', bootstrap.includes('boot aborted: bootstrap hooks incomplete') || bootstrap.includes('hooks incomplete'));
check('cache bust boot scripts', index.includes('app-bootstrap-hooks.js?v=20261015-boot1') && index.includes('app-boot.js?v=20261015-boot1'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
