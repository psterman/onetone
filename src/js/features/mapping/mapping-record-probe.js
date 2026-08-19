(function(global){
  'use strict';
  var MAX=48;
  var lines=[];
  var hidRows=[];
  var advancedHid=false;
  var sawRs=false;
  var liveRecording=false;
  function $(id){ return global.OneToneDom&&global.OneToneDom.$(id); }
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
      host.innerHTML='<li class="record-probe-hid-empty">按下厂家自定义键后会出现在这里</li>';
      return;
    }
    host.innerHTML=hidRows.map(function(row,i){
      return '<li class="record-probe-hid-item"><span class="k">'+esc(row.key)+'</span><span class="n">'+esc(row.note)+'</span><button type="button" class="record-probe-btn" data-hid-idx="'+i+'">用这个</button></li>';
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
    if(panel) panel.hidden=false;
    if(status&&!liveRecording) status.textContent=lines.length?'已捕获 '+lines.length+' 条':'等待按键…';
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
      status.textContent='前端看见了按键，后端钩子没接到。请重新编译并重启（只刷新页面不够）';
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
    }
    if(panel){
      panel.hidden=false;
      panel.classList.toggle('is-live',!!on);
    }
    if(status){
      status.dataset.live=on?'1':'';
      status.textContent=on?('正在录制 · '+(mode||'trigger')):'未录制（日志保留）';
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
  function bind(){
    var btn=$('btnRecordProbeCopy');
    var clr=$('btnRecordProbeClear');
    var adv=$('recordProbeAdvancedHid');
    var host=$('recordProbeHidList');
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
    render();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind);
  else bind();
  global.OneToneRecordProbe={
    push:push,clear:clear,setRecording:setRecording,text:text,
    ingestUnknown:ingestUnknown,setAdvancedHid:setAdvancedHid
  };
})((typeof window!=='undefined')?window:globalThis);
