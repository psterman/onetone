(function(global){
  'use strict';

  var STORAGE_KEY='onetone.cursorBeginnerOnboardDone';

  function done(){
    try{ return localStorage.getItem(STORAGE_KEY)==='1'; }catch(_){ return false; }
  }

  function markDone(){
    try{ localStorage.setItem(STORAGE_KEY,'1'); }catch(_){}
    hide();
  }

  var overlay=null;

  function hide(){
    if(overlay&&overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay=null;
  }

  function ensureStyle(){
    if(document.getElementById('cursor-beginner-onboard-style')) return;
    var st=document.createElement('style');
    st.id='cursor-beginner-onboard-style';
    st.textContent=
      '.wrap.is-cursor-beginner{overflow:visible}'+
      '.wrap.is-cursor-beginner .overlay-mini{overflow:visible}'+
      '.wrap.is-cursor-beginner .overlay-mini-stack{overflow:visible}'+
      '.cursor-beginner-onboard{position:relative;left:auto;top:auto;transform:none;z-index:2;pointer-events:auto;width:100%;max-width:none;box-sizing:border-box;flex:0 0 auto}'+
      '.cursor-beginner-onboard__card{padding:10px 12px;border-radius:12px;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.16);border:1px solid rgba(90,157,184,.4);font-size:12px;line-height:1.45;color:#334155;display:flex;align-items:flex-start;gap:10px;flex-wrap:nowrap;box-sizing:border-box;min-height:44px}'+
      '.cursor-beginner-onboard__text{margin:0;flex:1 1 auto;min-width:0;overflow-wrap:anywhere;word-break:break-word;white-space:normal}'+
      '.cursor-beginner-onboard__done{flex:0 0 auto;margin:0;padding:6px 12px;border:0;border-radius:8px;background:#0ea5e9;color:#fff;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;align-self:center}';
    document.head.appendChild(st);
  }

  function ensureOverlay(wrap){
    if(overlay) return overlay;
    ensureStyle();
    overlay=document.createElement('div');
    overlay.className='cursor-beginner-onboard';
    overlay.setAttribute('role','note');
    overlay.setAttribute('aria-label','Cursor 新手引导');
    overlay.innerHTML=
      '<div class="cursor-beginner-onboard__card">'+
        '<p class="cursor-beginner-onboard__text">进入 Cursor 自动聆听；可说 <strong>发送</strong>、<strong>继续</strong>、<strong>新建</strong>、<strong>麦克风</strong>、<strong>取消</strong>。</p>'+
        '<button type="button" class="cursor-beginner-onboard__done">懂了</button>'+
      '</div>';
    overlay.querySelector('.cursor-beginner-onboard__done').addEventListener('click',function(e){
      e.preventDefault(); e.stopPropagation();
      markDone();
    });
    overlay.addEventListener('pointerdown',function(e){ e.stopPropagation(); });
    var stack=document.getElementById('overlayMiniStack');
    (stack||wrap).appendChild(overlay);
    return overlay;
  }

  function maybeShow(snap){
    if(done()) return;
    if(!snap) return;
    var mode=!!(snap.cursorBeginnerMode||snap.cursor_beginner_mode);
    var probeOk=!!(snap.cursorProbeOk||snap.cursor_probe_ok);
    var armed=!!(snap.cursorBeginnerArmed||snap.cursor_beginner_armed);
    // Armed → listen banner owns the band; tip would double-stack and clip.
    if(armed){ hide(); return; }
    if(!mode||!probeOk) return;
    var actions=document.getElementById('miniBeginnerActions');
    var wrap=document.getElementById('wrap');
    if(!wrap||!actions||actions.hidden) return;
    if(!wrap.classList.contains('is-minimized')) return;
    ensureOverlay(wrap);
  }

  global.OneToneCursorBeginnerOnboard={
    maybeShow:maybeShow,
    markDone:markDone,
    hide:hide
  };
})(typeof window!=='undefined'?window:this);
