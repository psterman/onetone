/**
 * OneToneHoverTip — shared main-window hover tip (replaces instructional native title=).
 *
 * Policy:
 * - Use HoverTip for multi-sentence how-to / state explanations.
 * - Keep native title for truncated labels/paths and rare chrome.
 * - Never both on the same control (bind strips title).
 */
(function(global){
  'use strict';

  var SHOW_DELAY_MS=280;
  var HIDE_DELAY_MS=80;
  var ATTR='data-ot-tip';
  var ROOT_ID='otHoverTip';

  var tipEl=null;
  var showTimer=0;
  var hideTimer=0;
  var activeAnchor=null;
  var installed=false;
  var reduceMotion=false;

  function doc(){
    return global.document||null;
  }

  function tipNode(){
    var d=doc();
    if(!d) return null;
    if(tipEl&&tipEl.isConnected) return tipEl;
    tipEl=d.getElementById(ROOT_ID);
    if(tipEl) return tipEl;
    tipEl=d.createElement('div');
    tipEl.id=ROOT_ID;
    tipEl.className='ot-hover-tip';
    tipEl.setAttribute('role','tooltip');
    tipEl.hidden=true;
    d.body.appendChild(tipEl);
    return tipEl;
  }

  function clearShow(){
    if(showTimer){ global.clearTimeout(showTimer); showTimer=0; }
  }

  function clearHide(){
    if(hideTimer){ global.clearTimeout(hideTimer); hideTimer=0; }
  }

  function esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  /** Flip top/bottom/left/right; clamp to viewport (same idea as home-guide tip). */
  function position(tip, anchor){
    if(!tip||!anchor||!anchor.getBoundingClientRect) return;
    var target=anchor.getBoundingClientRect();
    var vw=global.innerWidth||0;
    var vh=global.innerHeight||0;
    var edge=9;
    var gap=10;
    var tw=tip.offsetWidth;
    var th=tip.offsetHeight;
    var candidates=[
      {left:target.left+(target.width-tw)/2,top:target.bottom+gap},
      {left:target.left+(target.width-tw)/2,top:target.top-th-gap},
      {left:target.right+gap,top:target.top+(target.height-th)/2},
      {left:target.left-tw-gap,top:target.top+(target.height-th)/2}
    ];
    var best=candidates[0];
    for(var i=0;i<candidates.length;i++){
      var c=candidates[i];
      if(c.left>=edge&&c.top>=edge&&c.left+tw<=vw-edge&&c.top+th<=vh-edge){
        best=c;
        break;
      }
    }
    tip.style.left=Math.max(edge,Math.min(vw-tw-edge,best.left))+'px';
    tip.style.top=Math.max(edge,Math.min(vh-th-edge,best.top))+'px';
  }

  function paintContent(opts){
    var tip=tipNode();
    if(!tip) return null;
    opts=opts||{};
    if(opts.html!=null){
      tip.innerHTML=String(opts.html);
    }else{
      var text=opts.text!=null?String(opts.text):'';
      tip.innerHTML='<div class="ot-hover-tip__body">'+esc(text)+'</div>';
    }
    tip.classList.toggle('is-rich', !!opts.rich);
    tip.classList.toggle('is-interactive', !!opts.interactive);
    tip.style.pointerEvents=opts.interactive?'auto':'none';
    return tip;
  }

  function reveal(anchor, opts){
    var tip=paintContent(opts);
    if(!tip||!anchor) return;
    activeAnchor=anchor;
    tip.hidden=false;
    tip.classList.remove('is-show');
    position(tip, anchor);
    if(reduceMotion){
      tip.classList.add('is-show');
    }else{
      global.requestAnimationFrame(function(){ tip.classList.add('is-show'); });
    }
  }

  function hideNow(){
    clearShow();
    clearHide();
    activeAnchor=null;
    var tip=tipNode();
    if(!tip) return;
    tip.classList.remove('is-show');
    tip.hidden=true;
    tip.innerHTML='';
    tip.classList.remove('is-rich','is-interactive');
    tip.style.pointerEvents='none';
  }

  function hide(opts){
    opts=opts||{};
    clearShow();
    if(opts.immediate){
      hideNow();
      return;
    }
    clearHide();
    hideTimer=global.setTimeout(hideNow, HIDE_DELAY_MS);
  }

  function show(anchor, textOrOpts){
    if(!anchor) return;
    var opts=typeof textOrOpts==='string'
      ?{ text:textOrOpts }
      :(textOrOpts&&typeof textOrOpts==='object'?textOrOpts:{});
    var text=opts.text!=null?String(opts.text):(anchor.getAttribute&&anchor.getAttribute(ATTR))||'';
    if(!opts.html&&!String(text||'').trim()) return;
    clearHide();
    clearShow();
    var delay=opts.delay!=null?Number(opts.delay):SHOW_DELAY_MS;
    if(!isFinite(delay)||delay<0) delay=SHOW_DELAY_MS;
    if(opts.immediate||delay===0){
      reveal(anchor, opts.html!=null?opts:{ text:text, rich:opts.rich, interactive:opts.interactive });
      return;
    }
    showTimer=global.setTimeout(function(){
      showTimer=0;
      reveal(anchor, opts.html!=null?opts:{ text:text, rich:opts.rich, interactive:opts.interactive });
    }, delay);
  }

  function tipTextFrom(el){
    if(!el) return '';
    if(el.getAttribute&&el.getAttribute('data-ot-tip-layout')==='stack') return 'stack';
    return String(el.getAttribute(ATTR)||'').trim();
  }

  function stackTipOptsFrom(el){
    if(!el||el.getAttribute('data-ot-tip-layout')!=='stack') return null;
    var lead=el.getAttribute('data-ot-tip-lead')||'';
    var desc=el.getAttribute('data-ot-tip-desc')||'';
    var current=el.getAttribute('data-ot-tip-current')||'';
    var foot=el.getAttribute('data-ot-tip-foot')||'';
    if(!lead&&!desc&&!foot) return null;
    var html='<div class="ot-hover-tip__lead">'+esc(lead)+'</div>'
      +'<div class="ot-hover-tip__desc">'+esc(desc)+'</div>'
      +(current?'<div class="ot-hover-tip__desc">'+esc(current)+'</div>':'')
      +'<div class="ot-hover-tip__foot">'+esc(foot)+'</div>';
    return { html:html, rich:true };
  }

  function showFromEl(el){
    if(!el) return;
    var stack=stackTipOptsFrom(el);
    if(stack){ show(el, stack); return; }
    var text=tipTextFrom(el);
    if(text&&text!=='stack') show(el, { text:text });
  }

  function bind(el, textOrOpts){
    if(!el) return el;
    install();
    var opts=typeof textOrOpts==='string'
      ?{ text:textOrOpts }
      :(textOrOpts&&typeof textOrOpts==='object'?textOrOpts:null);
    var text=opts&&opts.text!=null?String(opts.text):tipTextFrom(el);
    if(text) el.setAttribute(ATTR, text);
    // Avoid native Windows title doubling the custom tip.
    if(el.hasAttribute&&el.hasAttribute('title')) el.removeAttribute('title');
    if(el.title) el.title='';
    return el;
  }

  function unbind(el){
    if(!el) return;
    if(activeAnchor===el) hideNow();
    if(el.removeAttribute) el.removeAttribute(ATTR);
  }

  function setText(el, text){
    if(!el) return;
    var s=text==null?'':String(text);
    if(s) el.setAttribute(ATTR, s);
    else el.removeAttribute(ATTR);
    if(el.hasAttribute&&el.hasAttribute('title')) el.removeAttribute('title');
    if(activeAnchor===el&&s){
      reveal(el, { text:s });
    }
  }

  function relatedInside(anchor, related){
    if(!anchor||!related) return false;
    try{ return anchor===related||anchor.contains(related); }catch(_){ return false; }
  }

  function onPointerOver(e){
    var el=e.target&&e.target.closest&&e.target.closest('[data-ot-tip-layout="stack"],['+ATTR+']');
    if(!el) return;
    if(el.getAttribute('data-ot-tip-layout')==='stack'){
      showFromEl(el);
      return;
    }
    var text=String(el.getAttribute(ATTR)||'').trim();
    if(!text) return;
    show(el, { text:text });
  }

  function onPointerOut(e){
    var el=e.target&&e.target.closest&&e.target.closest('[data-ot-tip-layout="stack"],['+ATTR+']');
    if(!el) return;
    if(relatedInside(el, e.relatedTarget)) return;
    // Allow pointer to move onto interactive tip plate.
    var tip=tipNode();
    if(tip&&!tip.hidden&&relatedInside(tip, e.relatedTarget)) return;
    hide();
  }

  function onFocusIn(e){
    var el=e.target&&e.target.closest&&e.target.closest('[data-ot-tip-layout="stack"],['+ATTR+']');
    if(!el) return;
    if(el.getAttribute('data-ot-tip-layout')==='stack'){
      show(el, Object.assign({}, stackTipOptsFrom(el), { delay:0 }));
      return;
    }
    var text=String(el.getAttribute(ATTR)||'').trim();
    if(!text) return;
    show(el, { text:text, delay:0 });
  }

  function onFocusOut(e){
    var el=e.target&&e.target.closest&&e.target.closest('[data-ot-tip-layout="stack"],['+ATTR+']');
    if(!el) return;
    if(relatedInside(el, e.relatedTarget)) return;
    hide();
  }

  function onScrollOrResize(){
    if(!activeAnchor||!tipEl||tipEl.hidden) return;
    position(tipEl, activeAnchor);
  }

  function install(){
    if(installed) return;
    var d=doc();
    if(!d) return;
    installed=true;
    try{
      reduceMotion=!!(global.matchMedia&&global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }catch(_){ reduceMotion=false; }
    d.addEventListener('pointerover', onPointerOver, true);
    d.addEventListener('pointerout', onPointerOut, true);
    d.addEventListener('focusin', onFocusIn, true);
    d.addEventListener('focusout', onFocusOut, true);
    global.addEventListener('scroll', onScrollOrResize, true);
    global.addEventListener('resize', onScrollOrResize);
    // Tip plate can be interactive for guide-like content; leaving it hides.
    tipNode();
    if(tipEl){
      tipEl.addEventListener('pointerenter', function(){ clearHide(); });
      tipEl.addEventListener('pointerleave', function(){ hide(); });
    }
  }

  if(doc()){
    if(doc().readyState==='loading') doc().addEventListener('DOMContentLoaded', install);
    else install();
  }

  global.OneToneHoverTip={
    ATTR:ATTR,
    install:install,
    bind:bind,
    unbind:unbind,
    setText:setText,
    show:show,
    hide:hide,
    position:position,
    tipNode:tipNode
  };
})((typeof window!=='undefined')?window:globalThis);
