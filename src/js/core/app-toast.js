(function(global){
  'use strict';

  var MAX_VISIBLE=4;
  var DEDUPE_MS=1200;
  var EXIT_MS=280;
  var NS='http://www.w3.org/2000/svg';

  var $=function(id){
    return global.OneToneDom&&global.OneToneDom.$
      ?global.OneToneDom.$(id)
      :(global.document?global.document.getElementById(id):null);
  };

  var seq=0;
  /** @type {Array<{id:string,key:string,type:string,sticky:boolean,el:HTMLElement,timer:number,shownAt:number,duration:number}>} */
  var items=[];

  function now(){
    return (global.performance&&performance.now)?performance.now():Date.now();
  }

  function normalizeType(raw){
    var t=String(raw||'').trim().toLowerCase();
    if(t==='scheme'||t==='lite'||t==='warn'||t==='error'||t==='success'||t==='info'||t==='default') return t;
    return 'default';
  }

  function defaultDuration(type){
    if(type==='scheme') return 1800;
    if(type==='lite') return 1400;
    if(type==='warn') return 2800;
    if(type==='error') return 3200;
    return 2200;
  }

  function defaultTitle(type){
    if(type==='success'||type==='scheme') return '已完成';
    if(type==='warn') return '需要注意';
    if(type==='error') return '操作失败';
    if(type==='lite') return '';
    return '提示';
  }

  function parseArgs(message, optionsOrKind){
    var msg=message==null?'':String(message);
    var opts={};
    if(optionsOrKind&&typeof optionsOrKind==='object'){
      opts=optionsOrKind;
    }else if(typeof optionsOrKind==='string'){
      var kind=String(optionsOrKind||'').trim().toLowerCase();
      if(kind==='scheme'||kind==='lite'||kind==='warn') opts.type=kind;
      else if(kind==='success'||kind==='info'||kind==='error'||kind==='default') opts.type=kind;
    }
    var type=normalizeType(opts.type);
    var detail=opts.detail==null?'':String(opts.detail);
    var title=opts.title!=null?String(opts.title):defaultTitle(type);
    var duration=Number(opts.duration);
    if(!isFinite(duration)||duration<=0) duration=defaultDuration(type);
    var sticky=!!opts.sticky;
    var dedupeKey=opts.dedupeKey!=null&&String(opts.dedupeKey)
      ?String(opts.dedupeKey)
      :(type+'::'+msg+'::'+detail);
    var action=null;
    if(opts.action&&typeof opts.action==='object'){
      var onClick=opts.action.onClick;
      if(typeof onClick==='function'){
        action={
          label:opts.action.label==null?'':String(opts.action.label),
          onClick:onClick,
          keepOpen:!!opts.action.keepOpen
        };
      }
    }
    return {
      message:msg,
      detail:detail,
      title:title,
      type:type,
      duration:duration,
      sticky:sticky,
      dedupeKey:dedupeKey,
      action:action
    };
  }

  function ensureRoot(){
    var root=$('toast');
    if(!root) return null;
    root.classList.add('toast-stack');
    root.setAttribute('aria-live','polite');
    if(!root.getAttribute('role')) root.setAttribute('role','status');
    if(!root.getAttribute('aria-relevant')) root.setAttribute('aria-relevant','additions');
    // Migrate legacy single-text-node toast: drop bare text, keep element children.
    if(!root._toastStackReady){
      root._toastStackReady=true;
      var n=root.firstChild;
      while(n){
        var next=n.nextSibling;
        if(n.nodeType===3) root.removeChild(n);
        n=next;
      }
    }
    return root;
  }

  function svgIcon(type){
    var svg=document.createElementNS(NS,'svg');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.setAttribute('width','16');
    svg.setAttribute('height','16');
    svg.setAttribute('aria-hidden','true');
    svg.setAttribute('focusable','false');
    var path=document.createElementNS(NS,'path');
    path.setAttribute('fill','currentColor');
    var d='M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z';
    if(type==='success'||type==='scheme'){
      d='M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.5-4.5 1.4 1.4-5.9 5.9z';
    }else if(type==='warn'){
      d='M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z';
    }else if(type==='error'){
      d='M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.5 13.1-1.4 1.4L12 13.4l-2.1 2.1-1.4-1.4 2.1-2.1-2.1-2.1 1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1z';
    }else if(type==='info'||type==='default'){
      d='M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z';
    }else if(type==='lite'){
      d='M12 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm-1 5h2v7h-2v-7z';
    }
    path.setAttribute('d',d);
    svg.appendChild(path);
    return svg;
  }

  function findByKey(key){
    for(var i=items.length-1;i>=0;i--){
      if(items[i].key===key) return items[i];
    }
    return null;
  }

  function removeRecord(rec,immediate){
    if(!rec) return;
    if(rec.timer){
      clearTimeout(rec.timer);
      rec.timer=0;
    }
    var idx=items.indexOf(rec);
    if(idx>=0) items.splice(idx,1);
    var el=rec.el;
    if(!el||!el.parentNode) return;
    if(immediate){
      el.parentNode.removeChild(el);
      return;
    }
    el.classList.add('is-leaving');
    setTimeout(function(){
      if(el.parentNode) el.parentNode.removeChild(el);
    },EXIT_MS);
  }

  function enforceCap(){
    while(items.length>MAX_VISIBLE){
      var victim=null;
      for(var i=0;i<items.length;i++){
        if(!items[i].sticky){ victim=items[i]; break; }
      }
      if(!victim) victim=items[0];
      removeRecord(victim,false);
    }
  }

  function scheduleDismiss(rec){
    if(rec.sticky) return;
    if(rec.timer) clearTimeout(rec.timer);
    var wait=Math.max(200,rec.duration||defaultDuration(rec.type));
    rec.timer=setTimeout(function(){
      rec.timer=0;
      removeRecord(rec,false);
    },wait);
  }

  function bindProgress(el,duration,sticky){
    var bar=el.querySelector('.toast-item-progress');
    if(!bar) return;
    bar.setAttribute('aria-hidden','true');
    if(sticky){
      bar.hidden=true;
      return;
    }
    bar.hidden=false;
    bar.style.animation='none';
    // Force reflow so restart works on refresh.
    void bar.offsetWidth;
    bar.style.animationDuration=Math.max(200,duration)+'ms';
    bar.style.animationName='toast-progress-shrink';
    bar.style.animationTimingFunction='linear';
    bar.style.animationFillMode='forwards';
  }

  function buildItem(spec,id){
    var el=document.createElement('div');
    el.className='toast-item toast-type-'+spec.type;
    el.dataset.toastId=id;
    if(spec.type==='warn'||spec.type==='error') el.setAttribute('role','alert');
    else el.setAttribute('role','status');

    var iconWrap=document.createElement('div');
    iconWrap.className='toast-item-icon';
    iconWrap.setAttribute('aria-hidden','true');
    iconWrap.appendChild(svgIcon(spec.type));
    el.appendChild(iconWrap);

    var body=document.createElement('div');
    body.className='toast-item-body';
    if(spec.type!=='lite'&&spec.title){
      var titleEl=document.createElement('div');
      titleEl.className='toast-item-title';
      titleEl.textContent=spec.title;
      body.appendChild(titleEl);
    }
    var msgEl=document.createElement('div');
    msgEl.className='toast-item-message';
    msgEl.textContent=spec.message||'';
    body.appendChild(msgEl);
    if(spec.detail){
      var detailEl=document.createElement('div');
      detailEl.className='toast-item-detail';
      detailEl.textContent=spec.detail;
      body.appendChild(detailEl);
    }
    el.appendChild(body);

    if(spec.action){
      var btn=document.createElement('button');
      btn.type='button';
      btn.className='toast-item-action';
      btn.textContent=spec.action.label||'确定';
      btn.addEventListener('click',function(e){
        e.preventDefault();
        e.stopPropagation();
        try{ spec.action.onClick(); }catch(_){}
        if(!spec.action.keepOpen) dismiss(id);
      });
      el.appendChild(btn);
    }

    var progress=document.createElement('div');
    progress.className='toast-item-progress';
    progress.setAttribute('aria-hidden','true');
    el.appendChild(progress);

    return el;
  }

  function refreshItem(rec,spec){
    rec.type=spec.type;
    rec.sticky=spec.sticky;
    rec.duration=spec.duration;
    rec.key=spec.dedupeKey;
    rec.shownAt=now();
    var el=rec.el;
    el.className='toast-item toast-type-'+spec.type+' is-show';
    if(spec.type==='warn'||spec.type==='error') el.setAttribute('role','alert');
    else el.setAttribute('role','status');

    var titleEl=el.querySelector('.toast-item-title');
    var msgEl=el.querySelector('.toast-item-message');
    var detailEl=el.querySelector('.toast-item-detail');
    var body=el.querySelector('.toast-item-body');
    if(spec.type!=='lite'&&spec.title){
      if(!titleEl&&body){
        titleEl=document.createElement('div');
        titleEl.className='toast-item-title';
        body.insertBefore(titleEl,body.firstChild);
      }
      if(titleEl) titleEl.textContent=spec.title;
    }else if(titleEl&&titleEl.parentNode){
      titleEl.parentNode.removeChild(titleEl);
    }
    if(msgEl) msgEl.textContent=spec.message||'';
    if(spec.detail){
      if(!detailEl&&body){
        detailEl=document.createElement('div');
        detailEl.className='toast-item-detail';
        body.appendChild(detailEl);
      }
      if(detailEl) detailEl.textContent=spec.detail;
    }else if(detailEl&&detailEl.parentNode){
      detailEl.parentNode.removeChild(detailEl);
    }

    var iconWrap=el.querySelector('.toast-item-icon');
    if(iconWrap){
      while(iconWrap.firstChild) iconWrap.removeChild(iconWrap.firstChild);
      iconWrap.appendChild(svgIcon(spec.type));
    }

    bindProgress(el,spec.duration,spec.sticky);
    scheduleDismiss(rec);
    return rec.id;
  }

  function show(message, optionsOrKind){
    var root=ensureRoot();
    if(!root||!global.document) return '';
    var spec=parseArgs(message,optionsOrKind);
    var existing=findByKey(spec.dedupeKey);
    if(existing&&(now()-existing.shownAt)<=DEDUPE_MS){
      return refreshItem(existing,spec);
    }

    seq+=1;
    var id='toast-'+seq+'-'+Date.now();
    var el=buildItem(spec,id);
    root.appendChild(el);
    // Enter animation
    void el.offsetWidth;
    el.classList.add('is-show');

    var rec={
      id:id,
      key:spec.dedupeKey,
      type:spec.type,
      sticky:spec.sticky,
      el:el,
      timer:0,
      shownAt:now(),
      duration:spec.duration
    };
    items.push(rec);
    bindProgress(el,spec.duration,spec.sticky);
    scheduleDismiss(rec);
    enforceCap();
    return id;
  }

  function dismiss(id){
    var target=String(id||'');
    if(!target) return false;
    for(var i=0;i<items.length;i++){
      if(items[i].id===target){
        removeRecord(items[i],false);
        return true;
      }
    }
    return false;
  }

  function clear(){
    var copy=items.slice();
    for(var i=0;i<copy.length;i++) removeRecord(copy[i],true);
    items=[];
    var root=ensureRoot();
    if(root){
      while(root.firstChild) root.removeChild(root.firstChild);
    }
  }

  global.__vp_toast__=function(msg){ return show(msg); };
  global.OneToneAppToast={
    show:show,
    dismiss:dismiss,
    clear:clear
  };
})((typeof window!=='undefined')?window:globalThis);
