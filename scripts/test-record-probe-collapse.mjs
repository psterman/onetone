import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function classList(){
  const set=new Set();
  return {
    // DOM: toggle(token, force?) — force true/false sets; omit flips.
    toggle(c, force){
      if(force===true){ set.add(c); return true; }
      if(force===false){ set.delete(c); return false; }
      if(set.has(c)){ set.delete(c); return false; }
      set.add(c);
      return true;
    },
    contains(c){ return set.has(c); },
    remove(c){ set.delete(c); },
    add(c){ set.add(c); }
  };
}

function el(extra){
  return Object.assign({addEventListener(){},setAttribute(){},textContent:'',hidden:false},extra||{});
}
const panel=el({hidden:true,classList:classList()});
const expandBtn=el();
const chipCta=el();
const sheet=el({hidden:true});
const backdrop=el({hidden:true});
const diag=el({hidden:true,className:'record-probe-diag'});
const recLink=el({hidden:true});
const ids={
  recordProbePanel:panel,
  recordProbeSheet:sheet,
  recordProbeBackdrop:backdrop,
  recordProbeDiag:diag,
  btnRecordProbeExpand:expandBtn,
  recordProbeChipCta:chipCta,
  btnKeysRecordingProbe:recLink,
  recordProbeLog:el({innerHTML:'',scrollTop:0}),
  recordProbeStatus:el({dataset:{}}),
  recordProbeAdvancedHid:null,
  recordProbeHidList:el({innerHTML:''}),
  recordProbeHidBox:el({hidden:true}),
  btnRecordProbeCopy:el(),
  btnRecordProbeClear:el(),
  btnRecordProbeClose:el()
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
assert.equal(sheet.hidden,true,'sheet starts hidden');
assert.equal(recLink.hidden,true,'recording probe link hidden when panel revealed');
assert.equal(chipCta.textContent,'查看','chip CTA default open label');

panel.classList.add('is-expanded');
assert.equal(panel.classList.contains('is-expanded'),true,'expand class toggles');
panel.classList.remove('is-expanded');

const probe=context.OneToneRecordProbe;
assert.ok(probe&&typeof probe.pushDiagSnapshot==='function','pushDiagSnapshot exported');

// Simulate: page saw side-button, FE backup IPC ok, no Rust ack → Logitech verdict.
probe.setRecording(true,'trigger');
probe.push('wv','keydown','XButton1','page');
probe.push('fe','keydown','XButton1','fe-backup mode=trigger mid=m-habit-1');
probe.push('fe','ipc-ok','XButton1','cmd_frontend_keydown mode=trigger mid=m-habit-1 12ms committed=false stage=pending');
const snap=probe.text();
assert.match(snap,/罗技|G HUB|底层未提交/,'diag verdict names Logitech / no-commit path');
assert.doesNotMatch(snap,/底层已确认/,'false-positive 底层已确认 blocked');
assert.equal(panel.classList.contains('is-problem'),true,'problem state on ipc-ok without rs');
assert.equal(panel.classList.contains('is-expanded'),true,'problem auto-expands sheet');
assert.equal(diag.hidden,false,'diag strip visible during problem');
assert.match(diag.className,/is-bad/,'diag strip marked bad');

// Empty mappingId must not claim「底层已确认」.
probe.clear();
probe.setRecording(true,'trigger');
probe.push('wv','keydown','XButton2','page');
probe.push('fe','keydown','XButton2','fe-backup mode=trigger mid=(empty)');
probe.push('fe','ipc-ok','XButton2','cmd_frontend_keydown mode=trigger mid=(empty) 12ms committed=false');
assert.match(probe.text(),/mappingId 为空/,'empty mid verdict');
assert.doesNotMatch(probe.text(),/底层已确认/,'empty mid never reports ok');

// Commit + twin ipc-fail must keep「底层已确认」(no false red IPC fail).
probe.clear();
probe.setRecording(true,'trigger');
probe.push('wv','keydown','XButton1','page');
probe.push('fe','keydown','XButton1','fe-backup mode=trigger mid=m-habit-1');
probe.push('fe','ipc-ok','XButton1','cmd_frontend_keydown mode=trigger mid=m-habit-1 8ms committed=true');
probe.push('rs','commit','XButton1','ipc-return');
assert.match(probe.text(),/底层已确认/,'commit path reports ok');
panel.classList.remove('is-problem');
probe.push('fe','ipc-fail','XButton1','hook twin after commit');
assert.match(probe.text(),/底层已确认/,'post-commit ipc-fail does not override ok');
assert.doesNotMatch(probe.text(),/前端 IPC 调用失败/,'post-commit ipc-fail ignored in verdict');
assert.equal(panel.classList.contains('is-problem'),false,'post-commit ipc-fail does not open problem chip');

// Oral apply fail has its own verdict.
probe.clear();
probe.setRecording(true,'oralTrigger');
probe.push('fe','ipc-ok','XButton1','committed=true');
probe.push('rs','commit','XButton1','ipc-return');
probe.push('fe','oral-apply-fail','XButton1','setOralTriggerKey failed');
assert.match(probe.text(),/oralCommandScheme/,'oral-fail verdict names oralCommandScheme');
assert.match(diag.className,/is-bad/,'oral-fail marks diag bad');

// Oral leak during record.
probe.clear();
probe.setRecording(true,'trigger');
assert.equal(typeof probe.noteOralDuringRecord,'function','noteOralDuringRecord exported');
probe.noteOralDuringRecord('sticky Soft Pad oral chrome');
assert.match(probe.text(),/录制中误开口头/,'oral-leak verdict');

const css=readFileSync(new URL('../src/css/keys-workflow.css',import.meta.url),'utf8');
assert.match(css,/\.record-probe-panel:not\(\.is-revealed\)/,'probe hidden until revealed');
assert.match(css,/\.record-probe-sheet/,'sheet modal CSS exists');
assert.match(css,/\.record-probe-diag\.is-bad/,'diag bad CSS exists');
assert.match(readFileSync(new URL('../src/index.html',import.meta.url),'utf8'),/id="btnKeysRecordingProbe"/,'recording probe link in keys UI');
assert.match(readFileSync(new URL('../src/index.html',import.meta.url),'utf8'),/id="recordProbeDiag"/,'diag strip in HTML');

// Static: commit-after-throw must never rebrand as ipc-fail.
const inputJs=readFileSync(new URL('../src/js/features/mapping/mapping-recording-input.js',import.meta.url),'utf8');
assert.match(inputJs,/applyBackupIpcCommit[\s\S]*?catch\(err\)[\s\S]*?ipc-warn/,'committed UI finish errors become ipc-warn');
assert.match(inputJs,/BACKUP_DEDUPE_MS\s*=\s*300/,'backup dedupe window');
assert.match(inputJs,/BACKUP_IPC_TIMEOUT_MS\s*=\s*4500/,'backup IPC timeout covers persist');
assert.match(inputJs,/RECONCILE_GRACE_MS\s*=\s*3200/,'watchdog waits past first backup');
assert.match(inputJs,/backup in-flight/,'watchdog must not stack mid-flight IPC');
assert.match(inputJs,/duplicate after ipc-return/,'skip duplicate after ipc-return');
assert.match(inputJs,/e\.button!==0\) return false/,'side buttons never cancel via cancel-bar hit-test');
assert.match(inputJs,/function captureSideButton/,'direct XButton capture helper');
assert.match(inputJs,/isPending/,'side capture accepts startPending');
assert.match(inputJs,/function normalizeTriggerKeySafe/,'oral finish does not require hooks.normalizeTriggerKey');
assert.match(inputJs,/OneToneAppKeyUtils/,'normalizeTriggerKeySafe falls back to AppKeyUtils');
assert.match(
  readFileSync(new URL('../src/js/core/app-keyboard.js',import.meta.url),'utf8'),
  /left-click ignored/,
  'app-keyboard tips when button0 during record'
);
assert.match(
  readFileSync(new URL('../src/js/core/app-keyboard.js',import.meta.url),'utf8'),
  /captureSideButton/,
  'app-keyboard routes XButton via captureSideButton'
);
assert.match(
  readFileSync(new URL('../src/js/core/app-keyboard.js',import.meta.url),'utf8'),
  /killSideButtonBrowserNav/,
  'XButton2 Browser Forward must be cancelled on every mouse phase'
);
assert.match(
  readFileSync(new URL('../src/js/core/app-keyboard.js',import.meta.url),'utf8'),
  /popstate/,
  'recording blocks history popstate from X2 Forward'
);
assert.match(
  readFileSync(new URL('../src-tauri/src/ipc/commands/recording/session.rs',import.meta.url),'utf8'),
  /mute_overlay_for_recording/,
  'record start mutes Soft Pad overlay'
);
assert.match(
  readFileSync(new URL('../src-tauri/src/input_aim_calibrate.rs',import.meta.url),'utf8'),
  /abort_if_open/,
  'calibrate aborted on record start'
);
assert.match(
  readFileSync(new URL('../src/css/soft-pad-hub.css',import.meta.url),'utf8'),
  /html\.ot-recording-active/,
  'recording-active CSS mutes Soft Pad oral chrome'
);

console.log('[record-probe-collapse] assertions passed');
