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

const panels = readFileSync(join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
const wb = readFileSync(join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/home-workbench.css'), 'utf8');
const hist = readFileSync(join(root, 'src/js/features/home/home-action-history-card.js'), 'utf8');

check('panels channelDetailInlineChipsHtml', panels.includes('function channelDetailInlineChipsHtml'));
check('panels keys v3 branch', panels.includes("mode==='keys'&&isHomeV3()"));
check('panels renderKeysChannelDetailInner', panels.includes('function renderKeysChannelDetailInner'));
check('panels status line class', panels.includes('wb-channel-detail-status-line'));
check('panels detail cta attrs', panels.includes('data-wb-channel-cta="primary"') && panels.includes('data-wb-channel-cta="listen"'));
check('panels hide keys pause cta', panels.includes('secondary={show:false'));
check('panels keys v3 no extra settings link', panels.includes('showLink:false') && panels.includes("mode==='keys'&&isHomeV3()"));
check('panels keys chip is 打到', panels.includes("t('homeWbKeysCoreTo'"));
check('panels keys release copy', panels.includes("t('homeWbKeysCoreRelease'"));
check('panels action history mount', panels.includes('id="wbActionHistoryCard"'));
check('panels habitNoviceTry cta', panels.includes("t('habitNoviceTry'"));
check('panels resetAdvanced respects false', panels.includes('opts.resetAdvanced!==false'));
check('workbench resetAdvanced false', wb.includes('resetAdvanced:false'));
check('workbench passes model to detail', wb.includes('model:opts.model||peekHomeModel'));
check('workbench channel cta click', wb.includes('data-wb-channel-cta'));
check('workbench keys status line hidden', wb.includes("hideStatus=isHomeV3()&&mode==='keys'"));
check('workbench keys mic dedupe v3', /mode==='keys'[\s\S]*!isHomeV3\(\)/.test(wb));
check('action history exports paint', hist.includes('paint:paint'));
check('action history beginnerLine', hist.includes('beginnerLine:beginnerLine'));
check('action history filter channel', hist.includes('channel:currentChannel()'));
check('action history rebind view all', hist.includes('bindViewAllLink'));
check('css status line', css.includes('.wb-channel-detail-status-line'));
check('css caption 12px', css.includes('.wb-channel-detail-caption') && css.includes('font-size: 12px'));
check('css inline chips', css.includes('.wb-channel-detail-chip'));
check('css cta row', css.includes('.wb-channel-detail-cta-row'));
check('css more muted not primary', (() => {
  const block = css.match(/\.home-workbench\.is-v3 \.wb-channel-detail-more\s*\{[\s\S]*?\}/);
  return block && block[0].includes('on-surface-muted') && !block[0].includes('var(--primary)');
})());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
