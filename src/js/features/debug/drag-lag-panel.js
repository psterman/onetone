/**
 * Floating Drag Lag inspector — timeline of drag_trace + local FE/camera cost.
 * Toggle: Ctrl+Alt+Shift+D  or  localStorage.onetoneDragLagPanel=1
 */
(function(global){
  'use strict';
  var MAX=120;
  var events=[];
  var root=null;
  var listEl=null;
  var metaEl=null;
  var open=false;
  var lastT=0;
  var gestureStart=0;
  var rafId=0;
  var lastRaf=0;
  var maxJank=0;
  var dragHot=false;
  // Per-frame stats while a gesture is live. The old code only logged gaps
  // >=50ms, which made "15ms eaten every single frame" completely invisible —
  // and that kind of steady medium load is exactly enough to make a system
  // modal move loop feel sluggish.
  var frameSum=0;
  var frameCount=0;
  var frameMax=0;
  var FRAME_JANK_MS=24;

  function now(){
    return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
  }
  function wallMs(){
    return Date.now();
  }
  function esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function storageOn(){
    try{ return global.localStorage&&global.localStorage.getItem('onetoneDragLagPanel')==='1'; }
    catch(_){ return false; }
  }
  function setStorage(on){
    try{
      if(!global.localStorage) return;
      if(on) global.localStorage.setItem('onetoneDragLagPanel','1');
      else global.localStorage.removeItem('onetoneDragLagPanel');
    }catch(_){}
  }

  function push(ev){
    var t=typeof ev.t==='number'?ev.t:wallMs();
    var delta=lastT?Math.max(0,t-lastT):0;
    lastT=t;
    if(!gestureStart&&isDragBegin(ev.phase)) gestureStart=t;
    if(isDragEnd(ev.phase)) dragHot=false;
    if(isDragBegin(ev.phase)){ dragHot=true; maxJank=0; gestureStart=t; resetFrameStats(); }
    var row={
      t:t,
      delta:delta,
      phase:String(ev.phase||''),
      source:String(ev.source||''),
      detail:ev.detail||{},
      flags:ev.flags||{},
      local:!!ev.local
    };
    events.push(row);
    if(events.length>MAX) events.shift();
    if(open) render();
  }

  function isDragBegin(phase){
    return /^(ncl_down|enter_sizemove|overlay_drag_prepare|overlay_drag_begin|fe_pointerdown|camera_pause)$/.test(phase);
  }
  function isDragEnd(phase){
    // fe_invoke_err: Rust never ran the command — the gesture is over as far as FE knows.
    // paint_restore: delayed clear of ot-drag-active after EXIT (not the gesture end itself).
    return /^(exit_sizemove|overlay_drag_end|camera_resume|ncl_up_click|fe_invoke_err|paint_restore)$/.test(phase);
  }

  function activityTag(){
    try{
      if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.getTag) return global.OneToneUiHeartbeat.getTag()||'';
    }catch(_){}
    return global.__otActivityTag||'';
  }
  function camDepth(){
    var p=global.OneToneCameraFramePump;
    return p&&typeof p.getDepth==='function'?p.getDepth():'?';
  }

  function ensureDom(){
    if(root||!global.document||!global.document.body) return;
    root=global.document.createElement('div');
    root.id='otDragLagPanel';
    root.setAttribute('data-ot-drag-lag','1');
    root.innerHTML=
      '<div class="ot-dl-head">'+
        '<strong>Drag Lag</strong>'+
        '<span class="ot-dl-hint">Ctrl+Alt+D · Shift+右键</span>'+
        '<button type="button" data-ot-dl="clear">Clear</button>'+
        '<button type="button" data-ot-dl="copy">Copy</button>'+
        '<button type="button" data-ot-dl="close">×</button>'+
      '</div>'+
      '<div class="ot-dl-meta" data-ot-dl-meta></div>'+
      '<div class="ot-dl-list" data-ot-dl-list></div>';
    var style=global.document.createElement('style');
    style.textContent=
      '#otDragLagPanel{position:fixed;right:12px;bottom:12px;z-index:2147483000;width:min(420px,92vw);max-height:46vh;'+
      'display:flex;flex-direction:column;gap:6px;padding:10px;border-radius:10px;'+
      'background:rgba(12,18,28,.92);color:#e8eef7;font:12px/1.35 ui-monospace,Consolas,monospace;'+
      'box-shadow:0 12px 40px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.12);pointer-events:auto}'+
      '#otDragLagPanel .ot-dl-head{display:flex;align-items:center;gap:8px}'+
      '#otDragLagPanel .ot-dl-head strong{font-size:13px}'+
      '#otDragLagPanel .ot-dl-hint{opacity:.55;flex:1}'+
      '#otDragLagPanel button{appearance:none;border:0;border-radius:6px;padding:3px 8px;'+
      'background:rgba(255,255,255,.1);color:inherit;cursor:pointer;font:inherit}'+
      '#otDragLagPanel button:hover{background:rgba(255,255,255,.18)}'+
      '#otDragLagPanel .ot-dl-meta{opacity:.9;white-space:pre-wrap}'+
      '#otDragLagPanel .ot-dl-list{overflow:auto;flex:1;min-height:120px;border-top:1px solid rgba(255,255,255,.08);padding-top:6px}'+
      '#otDragLagPanel .ot-dl-row{display:grid;grid-template-columns:64px 52px 1fr;gap:6px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04)}'+
      '#otDragLagPanel .ot-dl-row.is-slow{color:#ffb4a2}'+
      '#otDragLagPanel .ot-dl-row.is-begin{color:#9ad7ff}'+
      '#otDragLagPanel .ot-dl-row.is-end{color:#b8f0c0}'+
      '#otDragLagPanel .ot-dl-d{opacity:.75}';
    global.document.head.appendChild(style);
    global.document.body.appendChild(root);
    listEl=root.querySelector('[data-ot-dl-list]');
    metaEl=root.querySelector('[data-ot-dl-meta]');
    root.addEventListener('click',function(e){
      var btn=e.target&&e.target.getAttribute&&e.target.getAttribute('data-ot-dl');
      if(btn==='close'){ setOpen(false); }
      else if(btn==='clear'){ events=[]; lastT=0; gestureStart=0; maxJank=0; render(); }
      else if(btn==='copy'){ copyOut(); }
    });
  }

  function fmtDelta(d){
    if(d<=0) return '—';
    return '+'+Math.round(d)+'ms';
  }
  function fmtDetail(row){
    var bits=[row.source,row.phase];
    var d=row.detail||{};
    Object.keys(d).forEach(function(k){
      var v=d[k];
      if(v==null||v==='') return;
      if(typeof v==='object') v=JSON.stringify(v);
      bits.push(k+'='+v);
    });
    var f=row.flags||{};
    if(f.mainSizeMove!=null) bits.push('mainSM='+(f.mainSizeMove?'1':'0'));
    if(f.overlayDragging!=null) bits.push('ovDrag='+(f.overlayDragging?'1':'0'));
    if(f.cameraPauseSent!=null) bits.push('camSent='+(f.cameraPauseSent?'1':'0'));
    return bits.join(' · ');
  }

  function render(){
    if(!root||!listEl||!metaEl) return;
    var total=gestureStart?Math.round(lastT-gestureStart):0;
    metaEl.textContent=
      'gesture '+total+'ms · maxRafJank '+Math.round(maxJank)+'ms · '+
      'frame avg '+(frameCount?Math.round(frameSum/frameCount):0)+'ms / max '+Math.round(frameMax)+'ms ('+frameCount+'f) · '+
      'camDepth '+camDepth()+' · tag '+(activityTag()||'—')+' · hot '+(dragHot?'Y':'N')+
      ' · n='+events.length;
    var html='';
    for(var i=events.length-1;i>=0;i--){
      var row=events[i];
      var cls='ot-dl-row';
      if(row.delta>=50) cls+=' is-slow';
      if(isDragBegin(row.phase)) cls+=' is-begin';
      if(isDragEnd(row.phase)) cls+=' is-end';
      html+='<div class="'+cls+'">'+
        '<span>'+esc(fmtDelta(row.delta))+'</span>'+
        '<span class="ot-dl-d">'+esc(String(Math.round(row.t%100000)))+'</span>'+
        '<span>'+esc(fmtDetail(row))+'</span></div>';
    }
    listEl.innerHTML=html||'<div class="ot-dl-d">Drag main title bar or Soft Pad…</div>';
  }

  function copyOut(){
    var lines=events.map(function(row){
      return [Math.round(row.delta),row.phase,row.source,JSON.stringify(row.detail),JSON.stringify(row.flags)].join('\t');
    });
    var text=lines.join('\n');
    try{
      if(global.navigator&&global.navigator.clipboard&&global.navigator.clipboard.writeText){
        global.navigator.clipboard.writeText(text);
        return;
      }
    }catch(_){}
    try{
      var ta=global.document.createElement('textarea');
      ta.value=text; global.document.body.appendChild(ta); ta.select();
      global.document.execCommand('copy'); ta.remove();
    }catch(_){}
  }

  function resetFrameStats(){
    frameSum=0;
    frameCount=0;
    frameMax=0;
  }

  function onRaf(ts){
    rafId=0;
    if(!open) return;
    if(lastRaf){
      var gap=ts-lastRaf;
      if(gap>maxJank) maxJank=gap;
      if(dragHot){
        frameSum+=gap;
        frameCount++;
        if(gap>frameMax) frameMax=gap;
        if(gap>=FRAME_JANK_MS){
          push({
            t:wallMs(),
            phase:'raf_jank',
            source:'fe',
            local:true,
            detail:{gapMs:Math.round(gap),tag:activityTag(),camDepth:camDepth()}
          });
        }
      }
    }
    lastRaf=ts;
    rafId=global.requestAnimationFrame(onRaf);
  }

  function setOpen(on){
    open=!!on;
    setStorage(open);
    if(open){
      ensureDom();
      if(root) root.style.display='flex';
      lastRaf=0; maxJank=0;
      if(!rafId&&global.requestAnimationFrame) rafId=global.requestAnimationFrame(onRaf);
      render();
    }else{
      if(root) root.style.display='none';
      if(rafId&&global.cancelAnimationFrame){ try{ global.cancelAnimationFrame(rafId); }catch(_){} }
      rafId=0;
    }
  }

  function onToJs(e){
    var d=e&&e.data;
    if(!d||d.type!=='drag_trace') return;
    push(d);
  }

  function bindDragTraceListen(){
    var handler=function(ev){
      var p=ev&&ev.payload;
      if(p) push(p);
    };
    try{
      if(global.OneToneIpc&&typeof global.OneToneIpc.listen==='function'){
        return global.OneToneIpc.listen('drag_trace',handler);
      }
    }catch(_){}
    try{
      var listen=global.__TAURI_INTERNALS__&&global.__TAURI_INTERNALS__.listen;
      if(typeof listen==='function') return listen('drag_trace',handler);
    }catch(_){}
    return null;
  }

  function bindToJs(){
    if(global.chrome&&global.chrome.webview&&global.chrome.webview.addEventListener){
      global.chrome.webview.addEventListener('message',onToJs);
    }
    var ok=bindDragTraceListen();
    if(ok&&typeof ok.then==='function'){
      ok.catch(function(){});
      return;
    }
    // Main may load this before OneToneIpc is ready — retry briefly.
    var n=0;
    var poll=setInterval(function(){
      n++;
      var p=bindDragTraceListen();
      if(p&&typeof p.then==='function'){
        clearInterval(poll);
        p.catch(function(){});
      }else if(n>=40) clearInterval(poll);
    },100);
  }

  function noteLocal(phase, detail){
    push({
      t:wallMs(),
      phase:phase,
      source:'fe',
      local:true,
      detail:detail||{},
      flags:{}
    });
  }

  // Chord detection must use `e.code`, not `e.key`: under a Chinese IME the
  // Ctrl+Shift part of Ctrl+Alt+Shift+D is swallowed by the input-method switch
  // and `e.key` comes back garbled, so the panel never opened.
  function isPanelChord(e){
    if(!e.ctrlKey||!e.altKey) return false;
    var code=String(e.code||'');
    var key=String(e.key||'').toLowerCase();
    var isD=(code==='KeyD'||key==='d');
    var isL=(code==='KeyL'||key==='l');
    // Ctrl+Alt+D (no Shift — avoids IME switch), plus the legacy/latin variants.
    return isD || (e.shiftKey&&(isD||isL));
  }

  function onKey(e){
    if(!isPanelChord(e)) return;
    e.preventDefault();
    if(e.stopPropagation) e.stopPropagation();
    setOpen(!open);
  }
  global.addEventListener('keydown',onKey,true);
  if(global.document){
    global.document.addEventListener('keydown',onKey,true);
  }

  // Keyboard-free escape hatch: Shift + right-click anywhere toggles the panel.
  // Chords can be eaten by the IME or by a global hotkey; this always works.
  global.addEventListener('contextmenu',function(e){
    if(!e.shiftKey) return;
    e.preventDefault();
    if(e.stopPropagation) e.stopPropagation();
    setOpen(!open);
  },true);

  // Chromium longtask API: rAF sampling tells us a frame took 50ms, but not
  // WHY. longtask reports the attribution bucket (script / layout / style),
  // which is the difference between "kill a timer" and "kill a CSS rule".
  function initLongTask(){
    try{
      if(!global.PerformanceObserver) return;
      var po=new global.PerformanceObserver(function(list){
        var entries=list.getEntries&&list.getEntries();
        if(!entries) return;
        for(var i=0;i<entries.length;i++){
          var en=entries[i];
          if(!dragHot) continue;
          var a=en.attribution&&en.attribution[0];
          push({
            t:wallMs(),
            phase:'longtask',
            source:'fe',
            local:true,
            detail:{
              ms:Math.round(en.duration),
              name:String(en.name||''),
              attr:a?String(a.containerType||a.name||''):''
            }
          });
        }
      });
      po.observe({entryTypes:['longtask']});
    }catch(_){}
  }
  initLongTask();

  bindToJs();
  if(storageOn()){
    if(global.document&&global.document.body) setOpen(true);
    else global.addEventListener('DOMContentLoaded',function(){ setOpen(true); });
  }

  global.OneToneDragLagPanel={
    open:function(){ setOpen(true); },
    close:function(){ setOpen(false); },
    toggle:function(){ setOpen(!open); },
    note:noteLocal,
    // Rust eval bridge (window_layout.rs) feeds full drag_trace payloads here —
    // the tauri event system has no FE listener (internals has no `listen`).
    noteRaw:function(ev){ push(ev); },
    isOpen:function(){ return open; }
  };
})((typeof window!=='undefined')?window:globalThis);
