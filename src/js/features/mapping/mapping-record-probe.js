(function(global){
  'use strict';
  var MAX=48;
  var lines=[];
  var hidRows=[];
  var advancedHid=false;
  var sawRs=false;
  var liveRecording=false;
  var uiRevealed=false;
  var problemOpen=false;
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
  function syncRecordingProbeLink(){
    var link=$('btnKeysRecordingProbe');
    var panel=$('recordProbePanel');
    if(!link) return;
    var show=!!liveRecording&&!uiRevealed;
    link.hidden=!show;
    if(panel) link.setAttribute('aria-controls','recordProbePanel');
    link.setAttribute('aria-expanded',uiRevealed?'true':'false');
  }
  function setUiVisible(on,opts){
    opts=opts||{};
    uiRevealed=!!on;
    var panel=$('recordProbePanel');
    if(!panel) return;
    panel.hidden=!on;
    panel.classList.toggle('is-revealed',on);
    if(opts.expanded){
      panel.classList.add('is-expanded');
      syncProbeExpandLabel(panel);
    }
    syncRecordingProbeLink();
  }
  function reveal(opts){
    opts=opts||{};
    problemOpen=true;
    setUiVisible(true,{expanded:opts.expanded!==false});
    var status=$('recordProbeStatus');
    if(status&&opts.message) status.textContent=opts.message;
  }
  function dismiss(){
    problemOpen=false;
    var panel=$('recordProbePanel');
    if(panel){
      panel.classList.remove('is-expanded');
      syncProbeExpandLabel(panel);
    }
    lines=[];
    hidRows=[];
    sawRs=false;
    setUiVisible(false);
    renderHid();
    var ol=$('recordProbeLog');
    if(ol) ol.innerHTML='';
  }
  function maybeRevealForProblem(kind, src){
    if(kind==='drop'||kind==='unknown'){
      reveal({message:t('keysCaptureProbeProblemUnknown','检测到异常按键，请查看下方日志')});
      return;
    }
    if(liveRecording&&src==='wv'){
      var hasWv=false;
      for(var i=0;i<lines.length;i++){
        if(lines[i].src==='wv') hasWv=true;
        if(lines[i].src==='rs') sawRs=true;
      }
      if(hasWv&&!sawRs){
        reveal({
          message:t('keysCaptureProbeProblemHook','按键到了界面，但系统钩子没接到。可尝试重新编译并重启')
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
  function render(){
    var ol=$('recordProbeLog');
    var status=$('recordProbeStatus');
    var panel=$('recordProbePanel');
    if(!ol) return;
    ol.innerHTML=lines.map(function(row){
      return '<li class="record-probe-line is-'+esc(row.kind)+'"><span class="t">'+esc(row.t)+'</span><span class="s">'+esc(row.src)+'</span><span class="k">'+esc(row.key)+'</span><span class="a">'+esc(row.alias)+'</span><span class="n">'+esc(row.note)+'</span></li>';
    }).join('');
    ol.scrollTop=ol.scrollHeight;
    if(panel&&!uiRevealed) panel.hidden=true;
    if(status&&!liveRecording&&uiRevealed){
      status.textContent=lines.length
        ?t('keysCaptureProbeCaptured','已捕获 {n} 条').replace('{n}',String(lines.length))
        :t('keysCaptureProbeWaiting','等待按键…');
    }
    refreshRebuildHint();
    renderHid();
  }
  function refreshRebuildHint(){
    var status=$('recordProbeStatus');
    if(!status||!liveRecording) return;
    var hasWv=false;
    for(var i=0;i<lines.length;i++){
      if(lines[i].src==='wv') hasWv=true;
      if(lines[i].src==='rs') sawRs=true;
    }
    if(hasWv && !sawRs){
      reveal({
        message:t('keysCaptureProbeProblemHook','按键到了界面，但系统钩子没接到。可尝试重新编译并重启')
      });
    }
  }
  function push(src, kind, key, note){
    if(src==='rs') sawRs=true;
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
    render();
  }
  function setRecording(on, mode){
    var panel=$('recordProbePanel');
    var status=$('recordProbeStatus');
    liveRecording=!!on;
    if(on){
      hidRows=[];
      sawRs=false;
      if(panel) panel.classList.toggle('is-live',true);
      if(status){
        status.dataset.live='1';
        status.textContent=t('keysCaptureProbeLive','正在录制 · {mode}').replace('{mode}',mode||'trigger');
      }
      setUiVisible(false);
      renderHid();
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
    else syncRecordingProbeLink();
    renderHid();
  }
  function setAdvancedHid(on){
    advancedHid=!!on;
    var box=$('recordProbeHidBox');
    if(box) box.hidden=!advancedHid;
    renderHid();
  }
  function text(){
    return lines.map(function(row){
      return row.t+'\t'+row.src+'\t'+row.kind+'\t'+row.key+'\t'+row.alias+'\t'+row.note;
    }).join('\n');
  }
  function copy(){
    var body=text()||'(empty)';
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(body).catch(function(){});
    }
  }
  function syncProbeExpandLabel(panel){
    var btn=$('btnRecordProbeExpand');
    if(!btn||!panel) return;
    var expanded=panel.classList.contains('is-expanded');
    btn.textContent=expanded
      ?t('keysCaptureProbeCollapse','收起检测')
      :t('keysCaptureProbeExpand','按键没反应？点开检测');
    btn.setAttribute('aria-expanded',expanded?'true':'false');
  }
  function bind(){
    var btn=$('btnRecordProbeCopy');
    var clr=$('btnRecordProbeClear');
    var adv=$('recordProbeAdvancedHid');
    var host=$('recordProbeHidList');
    var expand=$('btnRecordProbeExpand');
    var recLink=$('btnKeysRecordingProbe');
    if(btn) btn.addEventListener('click',function(e){ e.preventDefault(); copy(); });
    if(clr) clr.addEventListener('click',function(e){ e.preventDefault(); clear(); });
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
        if(!uiRevealed){
          reveal({expanded:true});
          return;
        }
        if(panel.classList.contains('is-expanded')){
          dismiss();
        }else{
          panel.classList.add('is-expanded');
          syncProbeExpandLabel(panel);
        }
      });
    }
    if(recLink){
      recLink.addEventListener('click',function(e){
        e.preventDefault();
        reveal({expanded:true});
      });
    }
    var panel=$('recordProbePanel');
    if(panel){
      panel.classList.remove('is-expanded');
      panel.hidden=true;
    }
    syncProbeExpandLabel(panel);
    syncRecordingProbeLink();
    render();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind);
  else bind();
  global.OneToneRecordProbe={
    push:push,
    clear:clear,
    setRecording:setRecording,
    text:text,
    ingestUnknown:ingestUnknown,
    setAdvancedHid:setAdvancedHid,
    reveal:reveal,
    dismiss:dismiss,
    isVisible:function(){ return uiRevealed; },
    syncRecordingProbeLink:syncRecordingProbeLink
  };
})((typeof window!=='undefined')?window:globalThis);
