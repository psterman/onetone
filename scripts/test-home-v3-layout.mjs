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

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
const wb = readFileSync(join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
const panels = readFileSync(join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/home-workbench.css'), 'utf8');
const shell = readFileSync(join(root, 'src/js/features/home/home-shell.js'), 'utf8');

check('index is-v3 class', html.includes('class="home-workbench is-v3"'));
check('index wbChannelDetail', html.includes('id="wbChannelDetail"'));
check('index wbHeroRail', html.includes('id="wbHeroRail"'));
check('index wbHeroStatusLine', html.includes('id="wbHeroStatusLine"'));
check('index wbHeroPrimaryCta', html.includes('id="wbHeroPrimaryCta"'));
check('mic below orb left column', (() => {
  const stage = html.indexOf('class="wb-hero-stage"');
  const mic = html.indexOf('id="wbHeroMic"');
  const status = html.indexOf('id="wbHeroStatusLine"');
  const rail = html.indexOf('id="wbHeroRail"');
  const detail = html.indexOf('id="wbChannelDetail"');
  return stage >= 0 && mic > stage && status > mic && rail > status && detail > rail;
})());
check('mic not inside rail', (() => {
  const railOpen = html.indexOf('id="wbHeroRail"');
  const railClose = html.indexOf('</div>', html.indexOf('id="wbChannelDetail"'));
  const mic = html.indexOf('id="wbHeroMic"');
  return mic < railOpen || mic > railClose;
})());
check('howto inside hero before orb', (() => {
  const hero = html.indexOf('id="wbHero"');
  const howto = html.indexOf('id="wbHowTo"');
  const orb = html.indexOf('id="wbHeroOrb"');
  return hero >= 0 && howto > hero && orb > howto;
})());
check('showcase hidden for rollback', html.includes('id="wbHeroShowcase"') && html.includes('hidden aria-hidden="true"'));
check('workbench isHomeV3', wb.includes('function isHomeV3') && wb.includes('isHomeV3:isHomeV3'));
check('paintHeroSurfaces v3 skips showcase', /if\(!v3\)\{[\s\S]*paintHeroShowcase/.test(wb));
check('paintHeroStatusCta exists', wb.includes('function paintHeroStatusCta'));
check('v3 hides idle open-voice CTA', wb.includes('hideVoiceOpen') && /mode==='voice'[\s\S]*hideVoiceOpen/.test(wb));
check('hidden beats trigger-btn display', css.includes('.wb-trigger-btn[hidden]') && css.includes('.wb-hero-primary-cta[hidden]'));
check('dictating keeps cta host visible', /if\(dictating\)\{[\s\S]*ctaHost\.hidden=false/.test(wb));
check('panels renderChannelDetail export', panels.includes('renderChannelDetail:renderChannelDetail'));
check('howto tabs wrapper', panels.includes('wb-howto-wrap--tabs'));
check('css v3 hides showcase', css.includes('.home-workbench.is-v3 .wb-hero-showcase'));
check('css focus nav', css.includes('.app-left-nav.is-focus-mode'));
check('shell focus nav class', shell.includes('is-focus-mode'));
check('css v3 restores hero stage', css.includes('.home-workbench.is-v3 .wb-hero.is-mode-camera .wb-hero-stage'));
check('css v3 no status bar decoration', !css.includes('wb-v3-status-bar') && !css.includes('.wb-hero-status-line:not([hidden])::before'));
check('css v3 hide end cancel', css.includes('.wb-hero-primary-cta-row:not(.is-dictating) #wbBtnEnd'));
check('i18n channel detail edit zh', readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8').includes("homeWbChannelDetailEdit:'编辑'"));
check('paint order status before detail', /paintHeroStatusCta[\s\S]*renderChannelDetail/.test(wb));
check('index four-section interact wrap', html.includes('id="wbHeroInteract"'));
check('interact wraps orb before rail', (() => {
  const interact = html.indexOf('id="wbHeroInteract"');
  const stage = html.indexOf('class="wb-hero-stage"');
  const cta = html.indexOf('id="wbHeroPrimaryCta"');
  const rail = html.indexOf('id="wbHeroRail"');
  return interact >= 0 && stage > interact && cta > stage && rail > cta;
})());
check('css v3 stacked four-section', css.includes('.wb-hero-interact') && css.includes('flex-direction: column') && !css.includes('grid-template-columns: minmax(360px, 0.44fr) minmax(400px, 0.56fr)'));
check('css v3 hero rail', css.includes('.home-workbench.is-v3 .wb-hero-rail'));
check('css v3 detail more toggle', css.includes('.wb-channel-detail-more'));
check('panels channel detail more', panels.includes('data-wb-channel-detail-more'));
check('panels toggleChannelDetailAdvanced', panels.includes('toggleChannelDetailAdvanced'));
check('workbench detail more click', wb.includes('data-wb-channel-detail-more'));
check('workbench detail resetAdvanced false', wb.includes('resetAdvanced:false'));
check('hero model enrich detail', readFileSync(join(root, 'src/js/features/home/home-hero-mode-model.js'), 'utf8').includes('enrichHowtoCardDetail'));
check('v3 mic idle hidden', wb.includes('heroVoiceLiveActive') && wb.includes('is-voice-live'));
check('css v3 mic idle hidden', css.includes('.home-workbench.is-v3 .wb-hero-mic:not(.is-voice-live)'));
check('css mic hidden beats flex', css.includes('.wb-hero-mic[hidden]') && css.includes('.wb-hero-pills[hidden]'));
check('css v3 pills always hidden', css.includes('.home-workbench.is-v3 .wb-hero-pills') && /wb-hero-pills[\s\S]*?display: none !important/.test(css));
check('workbench v3 pills suppressed', wb.includes("host.style.setProperty('display','none','important')"));
check('workbench v3 mic inline hide', wb.includes("hub.style.setProperty('display','none','important')"));
check('index mic hidden first paint', html.includes('id="wbHeroMic" aria-live="polite" hidden'));
check('css v3 footer hidden', css.includes('.home-workbench.is-v3 .wb-hero-footer'));
check('css v3 detail auto height', css.includes('.home-workbench.is-v3 .wb-channel-detail-inner') && /wb-channel-detail-inner\s*\{[\s\S]*?height: auto/.test(css));
check('css v3 detail more muted', (() => {
  const block = css.match(/\.home-workbench\.is-v3 \.wb-channel-detail-more\s*\{[\s\S]*?\}/);
  return block && block[0].includes('on-surface-muted');
})());
check('css v3 rail not side column', css.includes('padding-left: 0') && !css.includes('grid-row: 2 / 6'));
check('css v3 flow summary hidden', css.includes('.home-workbench.is-v3 .wb-hero-flow') && css.includes('.wb-hero-flow[hidden]'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
