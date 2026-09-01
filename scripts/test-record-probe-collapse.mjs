import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function classList(){
  const set=new Set();
  return {
    toggle(c){ if(set.has(c)) set.delete(c); else set.add(c); },
    contains(c){ return set.has(c); },
    remove(c){ set.delete(c); },
    add(c){ set.add(c); },
    toggle_is_live(on){ if(on) set.add('is-live'); else set.delete('is-live'); }
  };
}

const panel={hidden:true,classList:classList()};
const expandBtn={textContent:'',setAttribute(){},addEventListener(){}};
const recLink={hidden:true,setAttribute(){},addEventListener(){}};
const ids={
  recordProbePanel:panel,
  btnRecordProbeExpand:expandBtn,
  btnKeysRecordingProbe:recLink,
  recordProbeLog:{innerHTML:'',scrollTop:0},
  recordProbeStatus:{textContent:'',dataset:{}},
  recordProbeAdvancedHid:null,
  recordProbeHidList:null,
  btnRecordProbeCopy:null,
  btnRecordProbeClear:null
};

const context={
  console,
  document:{
    readyState:'complete',
    addEventListener(){}
  },
  OneToneDom:{$:function(id){ return ids[id]||null; }},
  OneToneI18n:{t:(k,fb)=>fb||k},
  OneToneKeyLabels:{karabinerAlias:()=>''}
};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(
  readFileSync(new URL('../src/js/features/mapping/mapping-record-probe.js',import.meta.url),'utf8'),
  context,
  {filename:'mapping-record-probe.js'}
);

assert.equal(panel.classList.contains('is-expanded'),false,'probe panel starts collapsed');
assert.equal(panel.hidden,true,'probe panel hidden until problem or user asks');
assert.equal(recLink.hidden,true,'recording probe link hidden when panel revealed');
assert.match(expandBtn.textContent,/点开检测|Open diagnostics/,'collapse label shown');

panel.classList.add('is-expanded');
assert.equal(panel.classList.contains('is-expanded'),true,'expand class toggles');
panel.classList.remove('is-expanded');

const css=readFileSync(new URL('../src/css/keys-workflow.css',import.meta.url),'utf8');
assert.match(css,/#settingsPanelKeys #habitKeyMappingSection \.record-probe-panel:not\(\.is-expanded\)/,'keys page collapse CSS exists');
assert.match(css,/\.record-probe-panel:not\(\.is-revealed\)/,'probe hidden until revealed');
assert.match(readFileSync(new URL('../src/index.html',import.meta.url),'utf8'),/id="btnKeysRecordingProbe"/,'recording probe link in keys UI');

console.log('[record-probe-collapse] assertions passed');
