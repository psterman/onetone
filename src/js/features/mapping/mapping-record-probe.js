(function(global){
  'use strict';
  var MAX=64;
  var lines=[];
  var hidRows=[];
  var advancedHid=false;
  var sawRs=false;
  var liveRecording=false;
  var uiRevealed=false;
  var problemOpen=false;
  var lastDiag='';
  function $(id){ return global.OneToneDom&&global.OneToneDom.$(id); }
  function t(key,fb){
    try{
      var v=global.OneToneI18n&&global.OneToneI18n.t?global.OneToneI18n.t(key):key;
      if(v&&v!==key) return v;
    }catch(_){}
    return fb!=null?fb:key;
  }
  function pad(n){ return n<10?'0'+n:String(n); }
  function esc(s){
    return String(s==null?'':s).replace(/[&<>"']/g,function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);
    });
  }
  function aliasOf(key){
    var kl=global.OneToneKeyLabels;
    return kl&&kl.karabinerAlias?kl.karabinerAlias(key):'';
  }
  function stamp(){
    var d=new Date();
    var ms=String(d.getMilliseconds());
    while(ms.length<3) ms='0'+ms;
    return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())+'.'+ms;
  }
  function syncSheetOpen(open){
    var panel=$('recordProbePanel');
    var sheet=$('recordProbeSheet');
    var backdrop=$('recordProbeBackdrop');
    var chip=$('btnRecordProbeExpand');
    if(panel) panel.classList.toggle('is-expanded',!!open);
    if(sheet) sheet.hidden=!open;
    if(backdrop) backdrop.hidden=!open;
    if(chip) chip.setAttribute('aria-expanded',open?'true':'false');
    syncChipCta();
  }
  function syncChipCta(){
    var cta=$('recordProbeChipCta');
    var panel=$('recordProbePanel');
    if(!cta||!panel) return;
    if(panel.classList.contains('is-problem')){
      cta.textContent=t('keysCaptureProbeChipProblem','看问题');
      return;
    }
    cta.textContent=panel.classList.contains('is-expanded')
      ?t('keysCaptureProbeCollapse','收起')
      :t('keysCaptureProbeChipOpen','查看');
  }
  function syncRecordingProbeLink(){
    var link=$('btnKeysRecordingProbe');
    if(link) link.hidden=true;
  }
  function setUiVisible(on,opts){
    opts=opts||{};
    uiRevealed=!!on;
    var panel=$('recordProbePanel');
    if(!panel) return;
    panel.hidden=!on;
    panel.classList.toggle('is-revealed',on);
    if(opts.expanded) syncSheetOpen(true);
    else if(opts.expanded===false) syncSheetOpen(false);
    syncRecordingProbeLink();
    syncChipCta();
  }
  function reveal(opts){
    opts=opts||{};
    problemOpen=true;
    var panel=$('recordProbePanel');
    if(panel) panel.classList.add('is-problem');
    // Auto-open sheet on problem so diagnosis is visible without an extra tap.
    setUiVisible(true,{expanded:opts.expanded!==false});
    var status=$('recordProbeStatus');
    if(status&&opts.message) status.textContent=opts.message;
    syncChipCta();
    updateDiag();
  }
  function closeSheet(){
    syncSheetOpen(false);
    if(!liveRecording&&!problemOpen){
      setUiVisible(false);
    }
  }
  function dismiss(){
    problemOpen=false;
    var panel=$('recordProbePanel');
    if(panel){
      panel.classList.remove('is-problem');
      syncSheetOpen(false);
    }
    lines=[];
    hidRows=[];
    sawRs=false;
    lastDiag='';
    setUiVisible(false);
    renderHid();
    updateDiag();
    var ol=$('recordProbeLog');
    if(ol) ol.innerHTML='';
  }
  function countSrc(src){
    var n=0;
    for(var i=0;i<lines.length;i++) if(lines[i].src===src) n++;
    return n;
  }
  function hasNote(re){
    for(var i=0;i<lines.length;i++){
      if(re.test(String(lines[i].note||'')+' '+String(lines[i].kind||''))) return true;
    }
    return false;
  }
  function lastKeyOf(src){
    for(var i=lines.length-1;i>=0;i--){
      if(lines[i].src===src&&lines[i].key) return lines[i].key;
    }
    return '';
  }
  function hasRsCommit(){
    for(var i=0;i<lines.length;i++){
      var row=lines[i];
      if(row.src!=='rs') continue;
      if(/^(commit|captured|finish|recv|hello)$/.test(row.kind)) return true;
      if(/pulse_peripheral|fe_recover|hook_ok|ipc-return/.test(String(row.note||''))) return true;
    }
    return false;
  }
  function backendConfirmed(){
    return hasRsCommit()||hasNote(/committed=true/);
  }
  function buildDiag(){
    var wv=countSrc('wv');
    var fe=countSrc('fe');
    var rs=countSrc('rs');
    var ipcOk=hasNote(/ipc-ok/);
    // Post-commit twin-backup / UI-finish noise must not count as a real fail.
    var ipcFail=!backendConfirmed()&&hasNote(/ipc-fail|ipc-timeout/);
    var feBackup=hasNote(/fe-backup|page-side/);
    var emptyMid=hasNote(/mid=\(empty\)/);
    var ipcCommitted=hasNote(/committed=true/);
    var ipcPending=hasNote(/committed=false|stage=pending|stage=not_recording/);
    var dropped=hasNote(/\bdrop\b|not_recording|already_idle/);
    var oralFail=hasNote(/oral-apply-fail/);
    var oralLeak=hasNote(/oral-during-record/)||(function(){
      for(var i=0;i<lines.length;i++){
        var row=lines[i];
        if(row.kind==='leak'&&/oral-during-record/.test(String(row.key||'')+' '+String(row.note||''))) return true;
      }
      return false;
    })();
    var rsOk=hasRsCommit()&&!dropped;
    var key=lastKeyOf('wv')||lastKeyOf('fe')||lastKeyOf('rs')||'—';
    var linesOut=[];
    linesOut.push(
      t('keysCaptureProbeDiagCounts','计数：页面 {wv} · 前端 {fe} · 系统钩子 {rs}')
        .replace('{wv}',String(wv))
        .replace('{fe}',String(fe))
        .replace('{rs}',String(rs))
    );
    linesOut.push(t('keysCaptureProbeDiagKey','最近侧键/按键：{key}').replace('{key}',key));
    var level='ok';
    var verdict='';
    if(oralFail){
      level='bad';
      verdict=t(
        'keysCaptureProbeDiagOralFail',
        '结论：口头触发键未写入 oralCommandScheme。请再点「录制口头触发键」并按下侧键。'
      );
    }else if(oralLeak){
      level='warn';
      verdict=t(
        'keysCaptureProbeDiagOralLeak',
        '结论：录制中误开口头 / Soft Pad 收听条（已强制静音）。若仍闪一下可忽略。'
      );
    }else if(rsOk||ipcCommitted){
      level='ok';
      verdict=t('keysCaptureProbeDiagOk','结论：底层已确认，录制链路正常。');
    }else if(ipcFail){
      level='bad';
      verdict=t('keysCaptureProbeDiagIpcFail','结论：前端 IPC 调用失败。检查 OneTone 是否以前端桥接运行，或查看 ipc-fail 行。');
    }else if(feBackup&&ipcOk&&emptyMid){
      level='bad';
      verdict=t(
        'keysCaptureProbeDiagEmptyMid',
        '结论：IPC 已调用但 mappingId 为空，后端无法写入习惯。请重新点录制（不要只刷新页面）。'
      );
    }else if(feBackup&&ipcOk&&(ipcPending||rs===0)){
      level='bad';
      verdict=t(
        'keysCaptureProbeDiagLogitech',
        '结论：页面收到侧键且 IPC 已调用，但底层未提交。常见于罗技 G HUB 占用侧键（拦截 WH_MOUSE_LL）。请关闭 G HUB 对侧键的全局绑定后重试，并完整重启 OneTone（npm run tauri dev）。'
      );
    }else if(wv>0&&!feBackup&&rs===0){
      level='warn';
      if(/button0|LButton/i.test(key)||hasNote(/left-click ignored/)){
        verdict=t(
          'keysCaptureProbeDiagLeftClick',
          '结论：收到的是鼠标左键，不是侧键。请把光标移到 OneTone 窗口内再按 XButton1/2（罗技侧键常靠页面备份，光标在 Cursor 上时 OneTone 收不到）。'
        );
      }else{
        verdict=t(
          'keysCaptureProbeDiagWvOnly',
          '结论：只有页面收到、前端未发备份。侧键事件可能未进入录制态，或不是硬件捕获键。若录制口头触发键：先确认 Soft Pad 未挡在 Cursor 上，再在 OneTone 窗口内按侧键。'
        );
      }
    }else if(feBackup&&!ipcOk&&rs===0){
      level='warn';
      verdict=t(
        'keysCaptureProbeDiagBackupPending',
        '结论：已发起页面备份，等待 IPC / 系统钩子确认…'
      );
    }else if(dropped){
      level='warn';
      verdict=t('keysCaptureProbeDiagDropped','结论：后端丢弃了按键（见 drop / not_recording）。可再按一次侧键。');
    }else if(liveRecording){
      level='ok';
      verdict=t('keysCaptureProbeDiagWaiting','结论：正在录制，请按鼠标侧键 / 音量键 / F13。');
    }else{
      level='ok';
      verdict=t('keysCaptureProbeDiagIdle','结论：空闲。开始录制后这里会显示链路诊断。');
    }
    linesOut.push(verdict);
    return {text:linesOut.join('\n'),level:level,verdict:verdict};
  }
  function updateDiag(){
    var el=$('recordProbeDiag');
    if(!el) return;
    if(!liveRecording&&!problemOpen&&!lines.length){
      el.hidden=true;
      el.textContent='';
      el.className='record-probe-diag';
      lastDiag='';
      return;
    }
    var d=buildDiag();
    lastDiag=d.text;
    el.hidden=false;
    el.textContent=d.text;
    el.className='record-probe-diag is-'+d.level;
  }
  function maybeRevealForProblem(kind, src){
    if(kind==='oral-apply-fail'){
      reveal({
        message:t('keysCaptureProbeProblemOral','口头触发键未写入，请展开日志')
      });
      return;
    }
    if(kind==='leak'){
      var leakHit=false;
      for(var li=0;li<lines.length;li++){
        var lr=lines[li];
        if(lr.kind==='leak'&&/oral-during-record/.test(String(lr.key||'')+' '+String(lr.note||''))){
          leakHit=true;
          break;
        }
      }
      if(leakHit){
        reveal({
          message:t('keysCaptureProbeProblemOralLeak','录制中误开口头面板，请展开日志')
        });
      }
      return;
    }
    if(kind==='drop'||kind==='unknown'||kind==='ipc-fail'||kind==='ipc-timeout'){
      // Twin backup after ipc-return must not flip the chip to「IPC 失败」.
      if((kind==='ipc-fail'||kind==='ipc-timeout')&&backendConfirmed()) return;
      reveal({
        message:kind==='ipc-fail'||kind==='ipc-timeout'
          ?t('keysCaptureProbeProblemIpc','侧键备份 IPC 失败，请展开日志')
          :t('keysCaptureProbeProblemUnknown','检测到异常按键，请查看日志')
      });
      return;
    }
    if(liveRecording&&(src==='wv'||src==='fe')){
      if(backendConfirmed()) return;
      var hasWv=countSrc('wv')>0;
      var hasFeBackup=hasNote(/fe-backup|page-side/);
      var ipcOk=hasNote(/ipc-ok/);
      if(hasWv&&!sawRs&&!hasFeBackup){
        reveal({
          message:t('keysCaptureProbeProblemHook','按键到了界面，但系统钩子没接到。可尝试重新编译并重启')
        });
      }else if(hasWv&&hasFeBackup&&ipcOk&&!sawRs){
        reveal({
          message:t('keysCaptureProbeFeBackupNoRs','IPC 已调用，仍无系统钩子确认 — 请展开诊断')
        });
      }else if(hasWv&&hasFeBackup&&!sawRs){
        reveal({
          message:t('keysCaptureProbeFeBackup','侧键已由页面备份提交，等待写入…'),
          expanded:false
        });
      }
    }
  }
  function renderHid(){
    var host=$('recordProbeHidList');
    var box=$('recordProbeHidBox');
    if(box) box.hidden=!advancedHid;
    if(!host) return;
    if(!advancedHid){
      host.innerHTML='';
      return;
    }
    if(!hidRows.length){
      host.innerHTML='<li class="record-probe-hid-empty">'+esc(t('keysCaptureProbeHidEmpty','按下厂家自定义键后会出现在这里'))+'</li>';
      return;
    }
    host.innerHTML=hidRows.map(function(row,i){
      return '<li class="record-probe-hid-item"><span class="k">'+esc(row.key)+'</span><span class="n">'+esc(row.note)+'</span><button type="button" class="record-probe-btn" data-hid-idx="'+i+'">'+esc(t('keysCaptureProbeUseKey','用这个'))+'</button></li>';
    }).join('');
  }
  function srcLabel(src){
    var map={
      ui:t('keysCaptureProbeSrcUi','界面'),
      wv:t('keysCaptureProbeSrcWv','页面收到'),
      fe:t('keysCaptureProbeSrcFe','前端处理'),
      rs:t('keysCaptureProbeSrcRs','系统钩子'),
      diag:t('keysCaptureProbeSrcDiag','诊断')
    };
    return map[src]||src||'?';
  }
  function kindLabel(kind){
    var map={
      trigger:t('keysCaptureProbeKindTrigger','开始录触发'),
      target:t('keysCaptureProbeKindTarget','开始录识别'),
      seen:t('keysCaptureProbeKindSeen','检测到按键'),
      keyup:t('keysCaptureProbeKindKeyup','松开'),
      keydown:t('keysCaptureProbeKindKeydown','按下'),
      finish:t('keysCaptureProbeKindFinish','已确认写入'),
      commit:t('keysCaptureProbeKindCommit','提交'),
      captured:t('keysCaptureProbeKindCaptured','捕获成功'),
      skip:t('keysCaptureProbeKindSkip','已忽略'),
      echo:t('keysCaptureProbeKindEcho','回声拒绝'),
      reject:t('keysCaptureProbeKindReject','已拒绝'),
      drop:t('keysCaptureProbeKindDrop','丢弃'),
      unknown:t('keysCaptureProbeKindUnknown','未知键'),
      retry:t('keysCaptureProbeKindRetry','重试'),
      watchdog:t('keysCaptureProbeKindWatchdog','超时等待'),
      probe:t('keysCaptureProbeKindProbe','探测'),
      'ipc-ok':t('keysCaptureProbeKindIpcOk','IPC 成功'),
      'ipc-warn':t('keysCaptureProbeKindIpcWarn','IPC 未提交'),
      'ipc-fail':t('keysCaptureProbeKindIpcFail','IPC 失败'),
      'ipc-timeout':t('keysCaptureProbeKindIpcTimeout','IPC 超时'),
      'oral-apply-fail':t('keysCaptureProbeKindOralFail','口头写入失败'),
      'oral-applied':t('keysCaptureProbeKindOralOk','口头已写入'),
      'oral-guard':t('keysCaptureProbeKindOralGuard','口头槽位守卫'),
      leak:t('keysCaptureProbeKindLeak','误开口头'),
      diag:t('keysCaptureProbeKindDiag','链路摘要'),
      hello:t('keysCaptureProbeKindHello','钩子就绪'),
      recv:t('keysCaptureProbeKindRecv','底层收到')
    };
    return map[kind]||kind||'';
  }
  function noteLabel(note){
    var n=String(note||'').trim();
    if(!n) return '';
    if(/^m-\d+/.test(n)){
      var id=n.length>22?n.slice(0,22)+'…':n;
      return t('keysCaptureProbeNoteMapping','习惯 {id}').replace('{id}',id);
    }
    if(n==='keyup'||n==='keydown') return kindLabel(n);
    if(n==='after-volume') return t('keysCaptureProbeNoteAfterVol','音量键之后的多余信号');
    if(n==='recognition-echo'||n==='recognition_key_echo') return t('keysCaptureProbeNoteEcho','与听写键相同，已忽略');
    if(n==='ui-leak') return t('keysCaptureProbeNoteUiLeak','界面按键，已忽略');
    if(n==='padBind') return t('keysCaptureProbeNotePad','SoftPad 绑键');
    if(n==='watchdog') return t('keysCaptureProbeNoteWatchdog','等待系统确认超时');
    if(n==='fe_recover') return t('keysCaptureProbeNoteFeRecover','恢复录制会话后接收');
    if(n==='not_recording') return t('keysCaptureProbeNoteNotRec','后端不在录制态');
    if(n==='already_idle') return t('keysCaptureProbeNoteIdle','会话已结束');
    if(n==='pulse_peripheral') return t('keysCaptureProbeNotePulse','外设按下即提交');
    if(n==='oralTrigger') return t('keysCaptureProbeNoteOral','口头触发键');
    if(n==='hook_ok') return t('keysCaptureProbeNoteHookOk','底层录制钩子已打开');
    if(n.indexOf('fe-backup')===0) return t('keysCaptureProbeNoteFeBackup','页面备份 ')+n.slice(9).trim();
    if(n.indexOf('cmd_frontend_keydown')===0) return t('keysCaptureProbeNoteIpcCmd','已调用 ')+n;
    if(n.indexOf('postMessage')===0) return t('keysCaptureProbeNotePostMsg','桥接发送 ')+n;
    if(n.indexOf('trigger')===0&&n.length>8) return t('keysCaptureProbeKindTrigger','开始录触发');
    return n;
  }
  function render(){
    var ol=$('recordProbeLog');
    var status=$('recordProbeStatus');
    var panel=$('recordProbePanel');
    if(!ol) return;
    ol.innerHTML=lines.map(function(row){
      var what=kindLabel(row.kind);
      var note=noteLabel(row.note);
      var detail=what+(note&&note!==what?' · '+note:'');
      return '<li class="record-probe-line is-'+esc(row.kind)+'" title="'+esc(row.src+' / '+row.kind+(row.note?' / '+row.note:''))+'">'
        +'<span class="t">'+esc(row.t)+'</span>'
        +'<span class="s" data-src="'+esc(row.src)+'">'+esc(srcLabel(row.src))+'</span>'
        +'<span class="k">'+esc(row.key||'—')+'</span>'
        +(row.alias?'<span class="a">'+esc(row.alias)+'</span>':'')
        +'<span class="n">'+esc(detail)+'</span>'
        +'</li>';
    }).join('');
    ol.scrollTop=ol.scrollHeight;
    if(panel&&!uiRevealed) panel.hidden=true;
    if(status&&!liveRecording&&uiRevealed){
      status.textContent=lines.length
        ?t('keysCaptureProbeCaptured','已捕获 {n} 条').replace('{n}',String(lines.length))
        :t('keysCaptureProbeWaiting','等待按键…');
    }
    refreshRebuildHint();
    updateDiag();
    renderHid();
  }
  function refreshRebuildHint(){
    var status=$('recordProbeStatus');
    if(!status||!liveRecording) return;
    if(backendConfirmed()) return;
    var hasWv=countSrc('wv')>0;
    var hasFeBackup=hasNote(/fe-backup|page-side/);
    var ipcOk=hasNote(/ipc-ok/);
    if(hasWv&&!sawRs&&!hasFeBackup){
      reveal({
        message:t('keysCaptureProbeProblemHook','按键到了界面，但系统钩子没接到。可尝试重新编译并重启')
      });
    }else if(hasWv&&hasFeBackup&&ipcOk&&!sawRs){
      reveal({
        message:t('keysCaptureProbeFeBackupNoRs','IPC 已调用，仍无系统钩子确认 — 请展开诊断')
      });
    }else if(hasWv&&hasFeBackup&&!sawRs){
      reveal({
        message:t('keysCaptureProbeFeBackup','侧键已由页面备份提交，等待写入…'),
        expanded:false
      });
    }
  }
  function push(src, kind, key, note){
    if(src==='rs') sawRs=true;
    if(src==='rs'&&(kind==='captured'||kind==='commit'||kind==='finish'||kind==='recv'||kind==='hello')){
      sawRs=true;
    }
    lines.push({
      t:stamp(),
      src:String(src||'?'),
      kind:String(kind||'info'),
      key:String(key||''),
      alias:aliasOf(key),
      note:String(note||'')
    });
    if(lines.length>MAX) lines=lines.slice(-MAX);
    render();
    maybeRevealForProblem(kind, src);
    try{
      var log=global.OneToneApp&&global.OneToneApp.pushLog;
      if(log) log('[record-probe] '+src+' '+kind+' '+key+' '+note);
    }catch(_){}
  }
  function pushDiagSnapshot(reason){
    var d=buildDiag();
    push('diag','diag','', (reason?reason+' · ':'')+d.verdict);
  }
  function ingestUnknown(key, note){
    var k=String(key||'').trim();
    if(!k) return;
    var n=String(note||'');
    var dup=hidRows.some(function(row){ return row.key===k && row.note===n; });
    if(!dup) hidRows.push({key:k,note:n});
    if(hidRows.length>12) hidRows=hidRows.slice(-12);
    push('rs','unknown',k,n);
    renderHid();
  }
  function deviceFromNote(note){
    var tok=String(note||'').split(/\s+/)[0]||'';
    if(tok.indexOf('dev:')===0||tok.indexOf('HID#')>=0||tok.indexOf('#')>=0) return tok;
    return '';
  }
  function bindHidKey(key, note){
    if(!advancedHid) return;
    var rec=global.OneToneMappingRecording;
    if(!rec||typeof rec.finishDetectedHardwareTrigger!=='function') return;
    rec.finishDetectedHardwareTrigger(key, deviceFromNote(note));
  }
  function clear(){
    lines=[];
    hidRows=[];
    lastDiag='';
    render();
  }
  function setRecording(on, mode){
    var panel=$('recordProbePanel');
    var status=$('recordProbeStatus');
    liveRecording=!!on;
    if(on){
      hidRows=[];
      sawRs=false;
      problemOpen=false;
      if(panel){
        panel.classList.add('is-live');
        panel.classList.remove('is-problem');
      }
      if(status){
        status.dataset.live='1';
        status.textContent=t('keysCaptureProbeLive','正在录制 · {mode}').replace('{mode}',mode||'trigger');
      }
      setUiVisible(true,{expanded:false});
      renderHid();
      updateDiag();
      return;
    }
    if(panel) panel.classList.remove('is-live');
    if(status){
      status.dataset.live='';
      if(uiRevealed){
        status.textContent=lines.length
          ?t('keysCaptureProbeCaptured','已捕获 {n} 条').replace('{n}',String(lines.length))
          :t('keysCaptureProbeWaiting','等待按键…');
      }
    }
    if(!problemOpen) dismiss();
    else{
      syncRecordingProbeLink();
      syncChipCta();
      updateDiag();
    }
    renderHid();
  }
  function setAdvancedHid(on){
    advancedHid=!!on;
    var box=$('recordProbeHidBox');
    if(box) box.hidden=!advancedHid;
    renderHid();
  }
  function text(){
    var head=lastDiag||buildDiag().text;
    var body=lines.map(function(row){
      return row.t+'\t'+srcLabel(row.src)+'\t'+kindLabel(row.kind)+'\t'+(row.key||'')+'\t'+(row.alias||'')+'\t'+noteLabel(row.note)+'\t'+(row.note||'');
    }).join('\n');
    return '=== 录制检测诊断 ===\n'+head+'\n=== 明细（含原始 note） ===\n'+(body||'(empty)');
  }
  function copy(){
    var body=text();
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(body).catch(function(){});
    }
  }
  function openSheet(){
    setUiVisible(true,{expanded:true});
    updateDiag();
  }
  function bind(){
    var btn=$('btnRecordProbeCopy');
    var clr=$('btnRecordProbeClear');
    var closeBtn=$('btnRecordProbeClose');
    var backdrop=$('recordProbeBackdrop');
    var adv=$('recordProbeAdvancedHid');
    var host=$('recordProbeHidList');
    var expand=$('btnRecordProbeExpand');
    var recLink=$('btnKeysRecordingProbe');
    if(btn) btn.addEventListener('click',function(e){ e.preventDefault(); copy(); });
    if(clr) clr.addEventListener('click',function(e){ e.preventDefault(); clear(); });
    if(closeBtn) closeBtn.addEventListener('click',function(e){ e.preventDefault(); closeSheet(); });
    if(backdrop) backdrop.addEventListener('click',function(e){ e.preventDefault(); closeSheet(); });
    if(adv){
      advancedHid=!!adv.checked;
      adv.addEventListener('change',function(){ setAdvancedHid(!!adv.checked); });
    }
    if(host) host.addEventListener('click',function(e){
      var b=e.target&&e.target.closest?e.target.closest('[data-hid-idx]'):null;
      if(!b) return;
      e.preventDefault();
      var idx=Number(b.getAttribute('data-hid-idx'));
      var row=hidRows[idx];
      if(row) bindHidKey(row.key, row.note);
    });
    if(expand){
      expand.addEventListener('click',function(e){
        e.preventDefault();
        var panel=$('recordProbePanel');
        if(!panel) return;
        if(panel.classList.contains('is-expanded')) closeSheet();
        else openSheet();
      });
    }
    if(recLink){
      recLink.addEventListener('click',function(e){
        e.preventDefault();
        openSheet();
      });
    }
    document.addEventListener('keydown',function(e){
      if(e.key!=='Escape') return;
      var panel=$('recordProbePanel');
      if(panel&&panel.classList.contains('is-expanded')){
        e.preventDefault();
        closeSheet();
      }
    });
    var panel=$('recordProbePanel');
    if(panel){
      syncSheetOpen(false);
      panel.hidden=true;
      panel.classList.remove('is-revealed','is-problem','is-live');
    }
    syncRecordingProbeLink();
    syncChipCta();
    render();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind);
  else bind();
  function noteOralDuringRecord(note){
    if(!liveRecording) return false;
    push('fe','leak','oral-during-record',String(note||'Soft Pad oral arm while recording'));
    return true;
  }
  global.OneToneRecordProbe={
    push:push,
    clear:clear,
    setRecording:setRecording,
    text:text,
    ingestUnknown:ingestUnknown,
    setAdvancedHid:setAdvancedHid,
    reveal:reveal,
    dismiss:dismiss,
    pushDiagSnapshot:pushDiagSnapshot,
    noteOralDuringRecord:noteOralDuringRecord,
    isLiveRecording:function(){ return liveRecording; },
    isVisible:function(){ return uiRevealed; },
    syncRecordingProbeLink:syncRecordingProbeLink
  };
})((typeof window!=='undefined')?window:globalThis);
