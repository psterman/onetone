(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function hooks(){ return global.__vp_home_guide_hooks__ || {}; }
  function closeHomeSchemeMenuSafe(){
    if(hooks().closeHomeSchemeMenu) hooks().closeHomeSchemeMenu();
    else if(global.OneToneHomeScheme&&global.OneToneHomeScheme.closeMenu) global.OneToneHomeScheme.closeMenu();
  }
  function homeGuideEl(sel){
    if(!sel) return null;
    if(typeof sel!=='string') return sel;
    if(sel.charAt(0)==='#') return document.getElementById(sel.slice(1));
    return $(sel);
  }

  function homeGuideText(sel){
    const el=typeof sel==='string'?homeGuideEl(sel):sel;
    if(!el) return '';
    return String(el.textContent||'').replace(/\s+/g,' ').trim();
  }

  function homeGuideItemLabel(item){
    if(item.labelKey) return t(item.labelKey);
    if(item.labelEl){
      const txt=homeGuideText(item.labelEl);
      if(txt) return txt;
    }
    if(item.target){
      const el=homeGuideEl(item.target);
      if(!el) return '';
      if(item.labelFromTargetBtn||el.tagName==='BUTTON'){
        return homeGuideText(el);
      }
      const row=el.closest&&el.closest('.home-live-row');
      if(row){
        const dt=row.querySelector('dt');
        if(dt) return homeGuideText(dt);
      }
      const lbl=el.querySelector&&el.querySelector('.home-key-map-step-label,.mini-title');
      if(lbl) return homeGuideText(lbl);
      return homeGuideText(el);
    }
    if(item.labelFallback) return t(item.labelFallback);
    return '';
  }

  function homeGuideTargetVisible(target){
    const el=homeGuideEl(target);
    if(!el) return false;
    if(el.hidden) return false;
    const r=el.getBoundingClientRect();
    return r.width>0&&r.height>0;
  }

  function homeKeyGuideDef(){
    return{
      panel:'homeLivePanelKey',
      layout:'voice-lane',
      flowKeys:['homeKeyGuideFlowSetTrigger','homeKeyGuideFlowSetTarget','homeKeyGuideFlowFinish','homeKeyGuideFlowEnable'],
      cautionKey:'homeKeyGuideCaution',
      pins:[
        {target:'#btnHomeSchemeSwitcher',detailKey:'homeKeyGuideScheme',labelEl:'#homeKeyMapSchemeLbl',callout:false},
        {target:'#homeKeyMapTriggerKey',detailKey:'homeKeyGuideTrigger',labelEl:'#homeKeyMapTriggerLbl',callout:false},
        {target:'#homeKeyMapTargetKey',detailKey:'homeKeyGuideTarget',labelEl:'#homeKeyMapTargetLbl',callout:false},
        {target:'#homeKeyMapTriggerKey',detailKey:'homeKeyGuideFlowSetTrigger',labelEl:'#homeKeyMapTriggerLbl',step:1},
        {target:'#homeKeyMapTargetKey',detailKey:'homeKeyGuideFlowSetTarget',labelEl:'#homeKeyMapTargetLbl',step:2},
        {target:'#homeKeyMapFinishKey',detailKey:'homeKeyGuideFlowFinish',labelEl:'#homeKeyMapFinishLbl',step:3},
        {target:'#btnHomeKeyToggle',detailKey:'homeKeyGuideFlowEnable',labelFromTargetBtn:true,step:4}
      ]
    };
  }

  function homeVoiceGuideDef(){
    return{
      panel:'homeLivePanelVoice',
      layout:'voice-lane',
      flowKeys:['homeVoiceGuideFlowWake','homeVoiceGuideFlowMic','homeVoiceGuideFlowMode','homeFinishGuideEnd','homeVoiceGuideFlowEnable'],
      cautionKey:'homeVoiceGuideCaution',
      pins:[
        {target:'#homeVoiceMapWakeKey',detailKey:'homeVoiceGuideWake',labelKey:'homeVoiceWakeFloatLbl',step:1},
        {target:'#homeVoiceMapFoot',detailKey:'homeVoiceGuideMic',labelEl:'#homeVoiceWakeMicLbl',step:2},
        {target:'#homeVoiceModeSwitch',detailKey:'homeVoiceGuideFlowMode',labelEl:'#homeVoiceEngineBarLbl',step:3},
        {target:'#btnHomeVoiceModeSapi',detailKey:'homeVoiceGuideModeSapi',labelFromTargetBtn:true,callout:false},
        {target:'#btnHomeVoiceModeVosk',detailKey:'homeVoiceGuideModeVosk',labelFromTargetBtn:true,callout:false},
        {target:'#homeVoiceMapEndPhraseKey',detailKey:'homeFinishGuideEnd',labelEl:'#homeVoiceMapEndPhraseLblText',step:4},
        {target:'#btnHomeVoiceToggle',detailKey:'homeVoiceGuideFlowEnable',labelFromTargetBtn:true,step:5}
      ]
    };
  }

  function homeGuideDefForCard(card){
    if(card==='key') return homeKeyGuideDef();
    if(card==='voice') return homeVoiceGuideDef();
    return homeKeyGuideDef();
  }

  let homeGuideState=null;
  let homeGuideSpotlights=[];
  let homeGuideDemoTimer=0;
  let homeGuideDemoTarget=null;
  let homeGuideDemoStep=0;
  let homeGuideDemoSig='';
  let homeGuideDemoSteps=[];
  let homeGuideDemoIndex=0;
  let homeGuideManualStep=null;
  let homeGuideOpenTick=0;
  let homeGuidePanelRect=null;
  const HOME_GUIDE_INLINE=false;
  const HOME_GUIDE_HOVER=true;
  const homeGuideDismissed={key:false,voice:false};

  function clearHomeGuideSpotlights(){
    homeGuideSpotlights.forEach(function(el){ el.classList.remove('home-guide-spotlight'); });
    homeGuideSpotlights=[];
  }

  function homeGuideStepPins(def){
    return (def&&def.pins||[]).filter(function(pin){ return pin&&pin.step&&pin.target; })
      .sort(function(a,b){ return a.step-b.step; });
  }

  function homeGuideStopStepDemo(){
    clearInterval(homeGuideDemoTimer);
    homeGuideDemoTimer=0;
    homeGuideDemoStep=0;
    homeGuideDemoSig='';
    homeGuideDemoSteps=[];
    homeGuideDemoIndex=0;
    homeGuideManualStep=null;
    if(homeGuideDemoTarget){
      homeGuideDemoTarget.classList.remove('home-guide-demo-focus');
      homeGuideDemoTarget=null;
    }
    document.querySelectorAll('.home-guide-flow-item.is-demo-active,.home-guide-hover-tip-flow-item.is-demo-active').forEach(function(el){
      el.classList.remove('is-demo-active');
    });
  }

  function homeGuideApplyStepDemo(def,step){
    document.querySelectorAll('.home-guide-flow-item.is-demo-active,.home-guide-hover-tip-flow-item.is-demo-active').forEach(function(el){
      el.classList.remove('is-demo-active');
    });
    document.querySelectorAll('[data-guide-step="'+String(step)+'"]').forEach(function(el){
      el.classList.add('is-demo-active');
    });
    if(homeGuideDemoTarget){
      homeGuideDemoTarget.classList.remove('home-guide-demo-focus');
      homeGuideDemoTarget=null;
    }
    const pin=homeGuideStepPins(def).find(function(p){ return p.step===step; });
    const target=pin&&homeGuideEl(pin.target);
    if(target&&homeGuideTargetVisible(pin.target)){
      target.classList.add('home-guide-demo-focus');
      homeGuideDemoTarget=target;
    }
  }

  function homeGuideStartStepDemo(def,startStep,manualHold){
    const steps=homeGuideStepPins(def).map(function(pin){ return pin.step; })
      .filter(function(s,i,a){ return a.indexOf(s)===i; });
    const sig=(homeGuideState?homeGuideState.card:'')+'|'+steps.join(',');
    const manualStep=manualHold?(Number(startStep)||null):homeGuideManualStep;
    if(homeGuideDemoTimer&&homeGuideDemoSig===sig&&startStep==null&&!manualHold&&manualStep==null) return;
    if(manualStep!=null&&startStep==null) startStep=manualStep;
    homeGuideStopStepDemo();
    homeGuideDemoSig=sig;
    homeGuideManualStep=manualStep;
    if(!steps.length) return;
    homeGuideDemoSteps=steps.slice();
    let idx=0;
    if(startStep!=null){
      const found=steps.indexOf(Number(startStep));
      if(found>=0) idx=found;
    }
    homeGuideDemoIndex=idx;
    homeGuideApplyStepDemo(def,steps[homeGuideDemoIndex]);
    homeGuideDemoStep=steps[homeGuideDemoIndex];
    if(homeGuideManualStep!=null) return;
    homeGuideDemoTimer=setInterval(function(){
      if(!homeGuideState||homeGuideState.def!==def){
        homeGuideStopStepDemo();
        return;
      }
      homeGuideDemoIndex=(homeGuideDemoIndex+1)%homeGuideDemoSteps.length;
      homeGuideDemoStep=homeGuideDemoSteps[homeGuideDemoIndex];
      homeGuideApplyStepDemo(def,homeGuideDemoStep);
    },1400);
  }

  function homeGuideJumpToStep(step){
    if(!homeGuideState) return;
    const s=Number(step);
    if(!Number.isFinite(s)) return;
    homeGuideStartStepDemo(homeGuideState.def,s,true);
  }

  function homeGuideUiZoom(){
    const z=parseFloat(getComputedStyle(document.documentElement).zoom);
    if(Number.isFinite(z)&&z>0) return z;
    const cssZ=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-font-scale'));
    return Number.isFinite(cssZ)&&cssZ>0?cssZ:1;
  }

  function homeGuideVpRect(rect){
    const z=homeGuideUiZoom();
    return{
      left:rect.left/z,top:rect.top/z,width:rect.width/z,height:rect.height/z,
      right:rect.right/z,bottom:rect.bottom/z
    };
  }

  function positionHomeGuideVeil(panelEl){
    const veil=$('homeGuideVeil');
    if(!veil||!panelEl) return;
    const r=homeGuideVpRect(panelEl.getBoundingClientRect());
    const head=panelEl.querySelector('.home-live-head,.home-finish-head');
    let top=r.top;
    let height=r.height;
    if(head){
      const hr=homeGuideVpRect(head.getBoundingClientRect());
      top=hr.bottom;
      height=Math.max(0,r.bottom-hr.bottom);
    }
    veil.style.left=r.left+'px';
    veil.style.top=top+'px';
    veil.style.width=r.width+'px';
    veil.style.height=height+'px';
  }

  function buildHomeGuideCalloutHtml(pin){
    const label=homeGuideItemLabel(pin);
    const stepHtml=pin.step?'<span class="home-guide-callout-step">'+String(pin.step)+'</span>':'';
    const detail=pin.calloutBrief?'':('<span class="home-guide-callout-detail">'+hooks().escHtml(t(pin.detailKey))+'</span>');
    return '<div class="home-guide-callout-head">'+stepHtml+
      '<span><span class="home-guide-callout-label">'+hooks().escHtml(label)+'</span>'+detail+'</span></div>';
  }

  function homeGuidePinKey(pin){
    return String(pin.target||'')+'|'+(pin.step||'')+'|'+(pin.detailKey||'');
  }

  function syncHomeGuidePanelRect(panelEl){
    if(!panelEl) return null;
    const r=homeGuideVpRect(panelEl.getBoundingClientRect());
    homeGuidePanelRect={left:r.left,top:r.top,width:r.width,height:r.height};
    return homeGuidePanelRect;
  }

  function homeGuideViewportBounds(){
    const z=homeGuideUiZoom();
    const pad=8/z;
    return{minX:pad,minY:pad,maxX:window.innerWidth-pad,maxY:window.innerHeight-pad};
  }

  function homeGuideClampViewport(box){
    const vp=homeGuideViewportBounds();
    let left=box.left;
    let top=box.top;
    if(left<vp.minX) left=vp.minX;
    if(top<vp.minY) top=vp.minY;
    if(left+box.width>vp.maxX) left=vp.maxX-box.width;
    if(top+box.height>vp.maxY) top=vp.maxY-box.height;
    return Object.assign({},box,{left:left,top:top});
  }

  function homeGuideAvoidRects(){
    const rects=[];
    const bannerRect=getHomeGuideBannerRect();
    if(bannerRect) rects.push(bannerRect);
    return rects;
  }

  function homeGuideSortPins(pins){
    return (pins||[]).slice().sort(function(a,b){
      const as=a.step!=null?a.step:100;
      const bs=b.step!=null?b.step:100;
      if(as!==bs) return as-bs;
      return 0;
    });
  }

  function homeGuideTargetAvoidRects(pins,skipTarget){
    const rects=[];
    (pins||[]).forEach(function(pin){
      if(pin.callout===false) return;
      if(pin.target===skipTarget) return;
      const el=homeGuideEl(pin.target);
      if(!el||!homeGuideTargetVisible(pin.target)) return;
      rects.push(homeGuideRectPad(homeGuideTargetRect(el),4));
    });
    return rects;
  }

  function homeGuideRectPad(rect,pad){
    return {left:rect.left-pad,top:rect.top-pad,width:rect.width+pad*2,height:rect.height+pad*2};
  }

  function homeGuideRectsOverlap(a,b){
    return !(a.left+a.width<b.left||b.left+b.width<a.left||a.top+a.height<b.top||b.top+b.height<a.top);
  }

  function homeGuideCalloutAnchor(targetRect,place){
    const gap=10;
    if(place==='top') return {x:targetRect.left+targetRect.width/2,y:targetRect.top-gap};
    if(place==='left') return {x:targetRect.left-gap,y:targetRect.top+targetRect.height/2};
    if(place==='right') return {x:targetRect.right+gap,y:targetRect.top+targetRect.height/2};
    return {x:targetRect.left+targetRect.width/2,y:targetRect.bottom+gap};
  }

  function homeGuideCalloutEdgePoint(box,place,targetRect){
    const tcx=targetRect.left+targetRect.width/2;
    const tcy=targetRect.top+targetRect.height/2;
    if(place==='top') return {x:Math.max(box.left+10,Math.min(box.left+box.width-10,tcx)),y:box.top+box.height};
    if(place==='bottom') return {x:Math.max(box.left+10,Math.min(box.left+box.width-10,tcx)),y:box.top};
    if(place==='left') return {x:box.left+box.width,y:Math.max(box.top+10,Math.min(box.top+box.height-10,tcy))};
    return {x:box.left,y:Math.max(box.top+10,Math.min(box.top+box.height-10,tcy))};
  }

  function homeGuideTargetRect(el){
    return homeGuideVpRect(el.getBoundingClientRect());
  }

  function homeGuideBoxForPlacement(targetRect,cw,ch,place,align){
    const gap=10;
    let left;
    let top;
    if(place==='top'){
      top=targetRect.top-ch-gap;
      if(align==='left') left=targetRect.left;
      else if(align==='right') left=targetRect.right-cw;
      else left=targetRect.left+(targetRect.width-cw)/2;
    }else if(place==='left'){
      left=targetRect.left-cw-gap;
      top=targetRect.top+(targetRect.height-ch)/2;
    }else if(place==='right'){
      left=targetRect.right+gap;
      top=targetRect.top+(targetRect.height-ch)/2;
    }else{
      top=targetRect.bottom+gap;
      if(align==='left') left=targetRect.left;
      else if(align==='right') left=targetRect.right-cw;
      else left=targetRect.left+(targetRect.width-cw)/2;
    }
    return{left:left,top:top,width:cw,height:ch,place:place};
  }

  function homeGuidePlaceCallout(callout,targetRect,pin,avoidRects,placed){
    const prefer=pin.placement||'bottom';
    const align=pin.align||'center';
    const order=[prefer,'left','right','bottom','top'].filter(function(p,i,a){ return a.indexOf(p)===i; });
    const cw=callout.offsetWidth;
    const ch=callout.offsetHeight;
    const gapPad=12;
    let best=null;
    order.forEach(function(place){
      const raw=homeGuideBoxForPlacement(targetRect,cw,ch,place,align);
      const box=homeGuideClampViewport(raw);
      const blocked=avoidRects.concat(placed).some(function(r){
        return homeGuideRectsOverlap(homeGuideRectPad(box,gapPad),homeGuideRectPad(r,gapPad));
      });
      if(blocked) return;
      const anchor=homeGuideCalloutAnchor(targetRect,place);
      const dist=Math.hypot(box.left+box.width/2-anchor.x,box.top+box.height/2-anchor.y);
      const score=dist+(place===prefer?0:20);
      if(!best||score<best.score) best={box:box,score:score};
    });
    if(best) return best.box;
    return homeGuideClampViewport(homeGuideBoxForPlacement(targetRect,cw,ch,prefer,align));
  }

  function homeGuideApplyCalloutPosition(callout,box,targetRect){
    callout.setAttribute('data-placement',box.place);
    callout.style.left=box.left+'px';
    callout.style.top=box.top+'px';
    const anchor=homeGuideCalloutAnchor(targetRect,box.place);
    if(box.place==='left'||box.place==='right'){
      const arrowY=anchor.y-box.top;
      callout.style.setProperty('--arrow-y',Math.max(12,Math.min(box.height-12,arrowY))+'px');
    }else{
      const arrowX=anchor.x-box.left;
      callout.style.setProperty('--arrow-x',Math.max(12,Math.min(box.width-12,arrowX))+'px');
    }
    return {
      left:box.left,top:box.top,width:box.width,height:box.height,
      place:box.place,targetRect:targetRect
    };
  }

  function homeGuidePickLaneSide(panelRect){
    const vpW=window.innerWidth;
    const leftSpace=panelRect.left;
    const rightSpace=vpW-panelRect.left-panelRect.width;
    return leftSpace>=rightSpace?'left':'right';
  }

  function homeGuideLayoutVoiceLane(items,panelRect){
    if(!items.length||!panelRect) return;
    const side=homeGuidePickLaneSide(panelRect);
    const gap=12;
    const stackGap=10;
    const sorted=items.slice().sort(function(a,b){
      const as=a.pin&&a.pin.step!=null?a.pin.step:100;
      const bs=b.pin&&b.pin.step!=null?b.pin.step:100;
      if(as!==bs) return as-bs;
      return a.targetRect.top-b.targetRect.top;
    });
    let laneEdge=side==='right'?panelRect.left+panelRect.width+gap:panelRect.left-gap;
    let stackBottom=-Infinity;
    sorted.forEach(function(item){
      const callout=item.callout;
      const cw=callout.offsetWidth;
      const ch=callout.offsetHeight;
      const tr=item.targetRect;
      let left=side==='right'?laneEdge:laneEdge-cw;
      let top=tr.top+(tr.height-ch)/2;
      if(top<stackBottom+stackGap) top=stackBottom+stackGap;
      const box=homeGuideClampViewport({left:left,top:top,width:cw,height:ch,place:side});
      homeGuideApplyCalloutPosition(callout,box,tr);
      item.box=box;
      stackBottom=box.top+box.height;
    });
  }

  function homeGuideSeparateCallouts(items){
    const gapPad=12;
    for(let iter=0;iter<24;iter++){
      let moved=false;
      for(let i=0;i<items.length;i++){
        for(let j=i+1;j<items.length;j++){
          const a=items[i].box;
          const b=items[j].box;
          if(!homeGuideRectsOverlap(homeGuideRectPad(a,gapPad),homeGuideRectPad(b,gapPad))) continue;
          const overlapY=Math.min(a.top+a.height,b.top+b.height)-Math.max(a.top,b.top);
          const overlapX=Math.min(a.left+a.width,b.left+b.width)-Math.max(a.left,b.left);
          const moverIdx=j;
          const mover=items[moverIdx];
          const box=mover.box;
          if(overlapX>0&&overlapY>0){
            if(overlapY>=overlapX){
              box.top+=(b.top>=a.top?1:-1)*(overlapY+gapPad);
            }else{
              box.left+=(b.left>=a.left?1:-1)*(overlapX+gapPad);
            }
          }else if(overlapY>0){
            box.top+=(b.top>=a.top?1:-1)*(overlapY+gapPad);
          }else if(overlapX>0){
            box.left+=(b.left>=a.left?1:-1)*(overlapX+gapPad);
          }
          const clamped=homeGuideClampViewport(box);
          box.left=clamped.left;
          box.top=clamped.top;
          homeGuideApplyCalloutPosition(mover.callout,box,mover.targetRect);
          mover.box=box;
          moved=true;
        }
      }
      if(!moved) break;
    }
  }

  function renderHomeGuideLines(items){
    const svg=$('homeGuideLines');
    if(!svg) return;
    while(svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function positionHomeGuideCallout(callout,el,pin,avoidRects,placed,pins){
    const targetRect=homeGuideTargetRect(el);
    const extraAvoid=homeGuideTargetAvoidRects(pins,pin.target);
    const box=homeGuidePlaceCallout(callout,targetRect,pin,avoidRects.concat(extraAvoid),placed);
    return homeGuideApplyCalloutPosition(callout,box,targetRect);
  }

  let homeGuideLayoutTimer=0;
  function homeGuideScheduleLayout(){
    clearTimeout(homeGuideLayoutTimer);
    homeGuideLayoutTimer=setTimeout(function(){
      if(!homeGuideState) return;
      if(HOME_GUIDE_HOVER){
        const hovered=document.querySelector('.is-guide-hovered[data-home-guide-bound="1"]');
        const tip=$('homeGuideHoverTip');
        if(hovered&&tip&&!tip.hidden) positionHomeGuideHoverTip(tip,hovered);
        else if(homeGuideState.anchorBtn&&tip&&!tip.hidden) positionHomeGuideHoverTip(tip,homeGuideState.anchorBtn);
        return;
      }
      layoutHomeGuide(homeGuideState.def,{repositionOnly:true});
    },32);
  }

  function homeGuideBindObservers(panelEl,pins){
    if(!window.ResizeObserver) return;
    if(!homeGuideBindObservers._obs){
      homeGuideBindObservers._obs=new ResizeObserver(function(){
        homeGuideScheduleLayout();
      });
    }
    homeGuideBindObservers._obs.disconnect();
    if(panelEl) homeGuideBindObservers._obs.observe(panelEl);
    (pins||[]).forEach(function(pin){
      if(pin.callout===false) return;
      const el=homeGuideEl(pin.target);
      if(el) homeGuideBindObservers._obs.observe(el);
    });
    const grid=$('homeMainGrid');
    if(grid) homeGuideBindObservers._obs.observe(grid);
  }

  function homeGuideUnbindObservers(){
    if(homeGuideBindObservers._obs) homeGuideBindObservers._obs.disconnect();
  }

  function renderHomeGuideCallouts(pins,opts){
    opts=opts||{};
    const container=$('homeGuideCallouts');
    const panelRect=homeGuidePanelRect;
    if(!container||!panelRect) return;
    if(!opts.repositionOnly){
      clearHomeGuideSpotlights();
      container.innerHTML='';
      const lines=$('homeGuideLines');
      if(lines) while(lines.firstChild) lines.removeChild(lines.firstChild);
    }
    const avoidRects=homeGuideAvoidRects();
    const sortedPins=homeGuideSortPins(pins);
    const placed=[];
    const items=[];
    let guideIndex=0;
    sortedPins.forEach(function(pin){
      if(pin.callout===false) return;
      if(pin.optional&&!homeGuideTargetVisible(pin.target)) return;
      if(!homeGuideTargetVisible(pin.target)) return;
      const el=homeGuideEl(pin.target);
      if(!el) return;
      const pinKey=homeGuidePinKey(pin);
      let callout=opts.repositionOnly?container.querySelector('[data-guide-pin="'+pinKey+'"]'):null;
      if(!callout){
        el.classList.add('home-guide-spotlight');
        homeGuideSpotlights.push(el);
        callout=document.createElement('div');
        callout.className='home-guide-callout';
        callout.setAttribute('data-guide-pin',pinKey);
        callout.setAttribute('data-guide-target',pin.target);
        callout.style.setProperty('--guide-i',String(guideIndex++));
        callout.innerHTML=buildHomeGuideCalloutHtml(pin);
        container.appendChild(callout);
      }else if(homeGuideSpotlights.indexOf(el)<0){
        el.classList.add('home-guide-spotlight');
        homeGuideSpotlights.push(el);
      }
      callout.style.visibility='hidden';
      let item;
      if(opts.layout==='voice-lane'){
        item={
          callout:callout,pin:pin,
          targetRect:homeGuideTargetRect(el),
          box:null
        };
      }else{
        item=positionHomeGuideCallout(callout,el,pin,avoidRects,placed,sortedPins);
        item.callout=callout;
        item.pin=pin;
        placed.push(item);
      }
      callout.style.visibility='';
      if(opts.layout!=='voice-lane'){
        item.callout=callout;
        item.pin=pin;
      }
      items.push(item);
    });
    if(opts.layout==='voice-lane'&&panelRect){
      homeGuideLayoutVoiceLane(items,panelRect);
    }else{
      homeGuideSeparateCallouts(items);
    }
    renderHomeGuideLines(items);
    if(!opts.repositionOnly){
      requestAnimationFrame(function(){
        container.querySelectorAll('.home-guide-callout').forEach(function(node){
          node.classList.add('is-settled');
        });
      });
      setTimeout(function(){
        const layer=$('homeGuideLayer');
        if(layer) layer.classList.remove('is-opening');
      },520);
    }
  }

  function repositionHomeGuideCallouts(pins,layout){
    renderHomeGuideCallouts(pins,{repositionOnly:true,layout:layout});
  }

  function renderHomeGuideBanner(def){
    const banner=$('homeGuideBanner');
    if(!banner) return;
    let flowTrack='';
    if(def.flowKeys&&def.flowKeys.length){
      flowTrack=def.flowKeys.map(function(key,i){
        const stepNum=i+1;
        const item='<span class="home-guide-flow-item" data-guide-step="'+String(stepNum)+'"><span class="home-guide-flow-num">'+String(stepNum)+'</span>'+
          '<span>'+hooks().escHtml(t(key))+'</span></span>';
        return i<def.flowKeys.length-1?item+'<span class="home-guide-flow-sep" aria-hidden="true">→</span>':item;
      }).join('');
    }else{
      const stepPins=(def.pins||[]).filter(function(pin){ return pin.step; })
        .sort(function(a,b){ return a.step-b.step; });
      flowTrack=stepPins.map(function(pin,i){
        const label=homeGuideItemLabel(pin);
        const item='<span class="home-guide-flow-item" data-guide-step="'+String(pin.step)+'"><span class="home-guide-flow-num">'+String(pin.step)+'</span>'+
          '<span>'+hooks().escHtml(label)+'</span></span>';
        return i<stepPins.length-1?item+'<span class="home-guide-flow-sep" aria-hidden="true">→</span>':item;
      }).join('');
    }
    const areas=(def.showAreas?(def.pins||[]):[]).filter(function(pin){
      return pin.target&&pin.detailKey&&homeGuideTargetVisible(pin.target);
    }).map(function(pin){
      return '<div class="home-guide-area-item" role="button" tabindex="0" data-guide-target="'+hooks().escHtml(pin.target)+'">'+
        '<span class="home-guide-area-label">'+hooks().escHtml(homeGuideItemLabel(pin))+'</span>'+
        '<span class="home-guide-area-detail">'+hooks().escHtml(t(pin.detailKey))+'</span>'+
      '</div>';
    }).join('');
    banner.innerHTML=
      '<div class="home-guide-banner-head">'+
        '<span class="home-guide-banner-kicker">'+hooks().escHtml(t('homeGuideKicker'))+'</span>'+
        '<button type="button" class="home-guide-close" id="btnHomeGuideClose" aria-label="'+hooks().escHtml(t('homeGuideClose'))+'">×</button>'+
      '</div>'+
      '<div class="home-guide-banner-body">'+
        (flowTrack?'<div class="home-guide-flow-track">'+flowTrack+'</div>':'')+
        (areas?'<div class="home-guide-area-list"><span class="home-guide-section-title">'+hooks().escHtml(t('homeGuideAreas'))+'</span>'+areas+'</div>':'')+
        '<div class="home-guide-caution-box">'+
          '<span class="home-guide-caution-title">'+hooks().escHtml(t('homeGuideCautionTitle'))+'</span>'+
          '<p class="home-guide-caution-text">'+hooks().escHtml(t(def.cautionKey))+'</p>'+
        '</div>'+
      '</div>';
    banner.hidden=false;
    const closeBtn=$('btnHomeGuideClose');
    if(closeBtn){
      closeBtn.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        closeHomeGuide(true);
      };
    }
    banner.querySelectorAll('.home-guide-area-item').forEach(function(item){
      const target=item.getAttribute('data-guide-target');
      const setOn=function(){
        clearHomeGuideSpotlights();
        const el=homeGuideEl(target);
        if(el){
          el.classList.add('home-guide-spotlight');
          homeGuideSpotlights.push(el);
        }
      };
      const setOff=function(){ clearHomeGuideSpotlights(); };
      item.addEventListener('mouseenter',setOn);
      item.addEventListener('focus',setOn);
      item.addEventListener('mouseleave',setOff);
      item.addEventListener('blur',setOff);
    });
  }

  function homeGuideBannerOverlapsPanel(left,top,width,height,panelRect,pad){
    if(!panelRect) return false;
    const box={left:left,top:top,width:width,height:height};
    return homeGuideRectsOverlap(box,homeGuideRectPad(panelRect,pad));
  }

  function positionHomeGuideBanner(panelEl){
    const banner=$('homeGuideBanner');
    if(!banner) return;
    const z=homeGuideUiZoom();
    const edge=10/z;
    const gap=10/z;
    const panelRect=panelEl?homeGuideVpRect(panelEl.getBoundingClientRect()):null;
    const vpW=window.innerWidth;
    const vpH=window.innerHeight;
    const maxW=Math.min(320/z,vpW-edge*2);
    banner.style.width='';
    const bw=Math.min(maxW,Math.max(220/z,banner.scrollWidth/z+4));
    banner.style.width=bw+'px';
    const bh=banner.offsetHeight;
    const candidates=[];
    candidates.push({left:vpW-bw-edge,top:edge,score:0,place:'corner-tr'});
    candidates.push({left:vpW-bw-edge,top:vpH-bh-edge,score:1,place:'corner-br'});
    if(panelRect){
      candidates.push({left:panelRect.right+gap,top:panelRect.top,score:10,place:'right'});
      candidates.push({left:panelRect.left-bw-gap,top:panelRect.top,score:11,place:'left'});
      candidates.push({left:panelRect.left,top:panelRect.bottom+gap,score:12,place:'below'});
      candidates.push({left:panelRect.left,top:panelRect.top-bh-gap,score:13,place:'above'});
      candidates.push({left:panelRect.right-bw,top:panelRect.bottom+gap,score:14,place:'below-right'});
    }
    let best=null;
    candidates.forEach(function(c){
      let left=c.left;
      let top=c.top;
      if(left<edge) left=edge;
      if(left+bw>vpW-edge) left=vpW-bw-edge;
      if(top<edge) top=edge;
      if(top+bh>vpH-edge) top=vpH-bh-edge;
      if(homeGuideBannerOverlapsPanel(left,top,bw,bh,panelRect,gap)) return;
      if(!best||c.score<best.score) best={left:left,top:top,score:c.score};
    });
    if(!best){
      let left=vpW-bw-edge;
      let top=edge;
      if(panelRect&&homeGuideBannerOverlapsPanel(left,top,bw,bh,panelRect,gap)){
        left=panelRect.right+gap;
        top=Math.max(edge,panelRect.top);
        if(left+bw>vpW-edge) left=edge;
        if(homeGuideBannerOverlapsPanel(left,top,bw,bh,panelRect,gap)){
          left=edge;
          top=panelRect.bottom+gap;
        }
      }
      best={left:left,top:top,score:99};
    }
    banner.style.left=best.left+'px';
    banner.style.top=best.top+'px';
  }

  function getHomeGuideBannerRect(){
    const banner=$('homeGuideBanner');
    if(!banner||banner.hidden) return null;
    const r=homeGuideVpRect(banner.getBoundingClientRect());
    if(r.width<1||r.height<1) return null;
    return {left:r.left,top:r.top,width:r.width,height:r.height};
  }

  function homeGuideClearFloatingLayer(){
    clearHomeGuideSpotlights();
    const callouts=$('homeGuideCallouts');
    if(callouts) callouts.innerHTML='';
    const lines=$('homeGuideLines');
    if(lines) while(lines.firstChild) lines.removeChild(lines.firstChild);
    const layer=$('homeGuideLayer');
    if(layer) layer.classList.remove('is-open','is-opening');
  }

  function attachHomeGuideBannerToLayer(){
    const banner=$('homeGuideBanner');
    const layer=$('homeGuideLayer');
    if(!banner||!layer) return;
    banner.classList.remove('is-inline');
    banner.style.left='';
    banner.style.top='';
    banner.style.width='';
    if(banner.parentNode!==layer) layer.appendChild(banner);
  }

  function clearHomeGuideTargetTips(){
    document.querySelectorAll('[data-home-guide-bound="1"]').forEach(function(el){
      el.classList.remove('home-guide-has-tip','is-guide-hovered');
      delete el.dataset.homeGuideBound;
      delete el.dataset.homeGuideLabel;
      delete el.dataset.homeGuideDetail;
      delete el.dataset.homeGuideStep;
      if(el.dataset.homeGuideAddedTabindex==='1'){
        el.removeAttribute('tabindex');
        delete el.dataset.homeGuideAddedTabindex;
      }
    });
  }

  function bindHomeGuideTargetTips(def){
    clearHomeGuideTargetTips();
    (def.pins||[]).forEach(function(pin){
      if(!pin.target||!pin.detailKey) return;
      const el=homeGuideEl(pin.target);
      if(!el||!homeGuideTargetVisible(el)) return;
      el.dataset.homeGuideBound='1';
      el.dataset.homeGuideLabel=homeGuideItemLabel(pin);
      el.dataset.homeGuideDetail=t(pin.detailKey);
      el.dataset.homeGuideStep=pin.step?String(pin.step):'';
      el.classList.add('home-guide-has-tip');
      const focusable=el.matches('button,a,input,select,textarea,[tabindex]');
      if(!focusable){
        el.setAttribute('tabindex','0');
        el.dataset.homeGuideAddedTabindex='1';
      }
    });
  }

  function ensureHomeGuideHoverTip(){
    let tip=$('homeGuideHoverTip');
    if(tip) return tip;
    tip=document.createElement('div');
    tip.id='homeGuideHoverTip';
    tip.className='home-guide-hover-tip';
    tip.hidden=true;
    document.body.appendChild(tip);
    return tip;
  }

  function positionHomeGuideHoverTip(tip,el){
    const target=homeGuideVpRect(el.getBoundingClientRect());
    const vw=window.innerWidth;
    const vh=window.innerHeight;
    const edge=9;
    const gap=10;
    const tw=tip.offsetWidth;
    const th=tip.offsetHeight;
    const candidates=[
      {left:target.left+(target.width-tw)/2,top:target.bottom+gap},
      {left:target.left+(target.width-tw)/2,top:target.top-th-gap},
      {left:target.right+gap,top:target.top+(target.height-th)/2},
      {left:target.left-tw-gap,top:target.top+(target.height-th)/2}
    ];
    let best=candidates.find(function(c){
      return c.left>=edge&&c.top>=edge&&c.left+tw<=vw-edge&&c.top+th<=vh-edge;
    })||candidates[0];
    best={
      left:Math.max(edge,Math.min(vw-tw-edge,best.left)),
      top:Math.max(edge,Math.min(vh-th-edge,best.top))
    };
    tip.style.left=best.left+'px';
    tip.style.top=best.top+'px';
  }

  function showHomeGuideHoverTip(el){
    if(!el||!el.dataset.homeGuideBound) return;
    const tip=ensureHomeGuideHoverTip();
    const label=el.dataset.homeGuideLabel||homeGuideText(el);
    const detail=el.dataset.homeGuideDetail||'';
    const step=el.dataset.homeGuideStep||'';
    tip.innerHTML=
      '<div class="home-guide-hover-tip-title">'+
        (step?'<span class="home-guide-hover-tip-step">'+hooks().escHtml(step)+'</span>':'')+
        '<span>'+hooks().escHtml(label)+'</span>'+
      '</div>'+
      '<div class="home-guide-hover-tip-detail">'+hooks().escHtml(detail)+'</div>';
    tip.hidden=false;
    tip.classList.remove('is-show');
    document.querySelectorAll('.is-guide-hovered').forEach(function(node){
      node.classList.remove('is-guide-hovered');
    });
    clearHomeGuideSpotlights();
    el.classList.add('is-guide-hovered','home-guide-spotlight');
    homeGuideSpotlights.push(el);
    positionHomeGuideHoverTip(tip,el);
    requestAnimationFrame(function(){ tip.classList.add('is-show'); });
  }

  function showHomeGuideIntroTip(def,anchorEl){
    if(!anchorEl) return;
    const tip=ensureHomeGuideHoverTip();
    const flow=(def.flowKeys||[]).map(function(key,i){
      const stepNum=i+1;
      return '<div class="home-guide-hover-tip-flow-item" data-guide-step="'+String(stepNum)+'" role="button" tabindex="0">'+
        '<span class="home-guide-hover-tip-step">'+String(stepNum)+'</span>'+
        '<span>'+hooks().escHtml(t(key))+'</span>'+
      '</div>';
    }).join('');
    tip.innerHTML=
      '<div class="home-guide-hover-tip-title"><span>'+hooks().escHtml(t('homeGuideKicker'))+'</span></div>'+
      (flow?'<div class="home-guide-hover-tip-flow">'+flow+'</div>':'')+
      '<div class="home-guide-hover-tip-detail" style="margin-top:6px">'+hooks().escHtml(t('homeGuideHoverHint'))+'</div>';
    tip.hidden=false;
    tip.classList.remove('is-show');
    document.querySelectorAll('.is-guide-hovered').forEach(function(node){
      node.classList.remove('is-guide-hovered');
    });
    clearHomeGuideSpotlights();
    positionHomeGuideHoverTip(tip,anchorEl);
    tip.querySelectorAll('.home-guide-hover-tip-flow-item').forEach(function(item){
      const step=item.getAttribute('data-guide-step');
      item.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        homeGuideJumpToStep(step);
      };
      item.onkeydown=function(e){
        if(e.key==='Enter'||e.key===' '){
          e.preventDefault();
          e.stopPropagation();
          homeGuideJumpToStep(step);
        }
      };
    });
    requestAnimationFrame(function(){ tip.classList.add('is-show'); });
  }

  function hideHomeGuideHoverTip(){
    const tip=$('homeGuideHoverTip');
    if(tip){
      tip.classList.remove('is-show');
      tip.hidden=true;
    }
    document.querySelectorAll('.is-guide-hovered').forEach(function(el){
      el.classList.remove('is-guide-hovered');
    });
    clearHomeGuideSpotlights();
  }

  function bindHomeGuideHoverEvents(){
    if(bindHomeGuideHoverEvents.bound) return;
    bindHomeGuideHoverEvents.bound=true;
    document.addEventListener('pointerover',function(e){
      const el=e.target&&e.target.closest&&e.target.closest('.home-guide-has-tip');
      if(!el) return;
      showHomeGuideHoverTip(el);
    });
    document.addEventListener('pointerout',function(e){
      const el=e.target&&e.target.closest&&e.target.closest('.home-guide-has-tip');
      if(!el) return;
      if(e.relatedTarget&&el.contains(e.relatedTarget)) return;
      hideHomeGuideHoverTip();
    });
    document.addEventListener('focusin',function(e){
      const el=e.target&&e.target.closest&&e.target.closest('.home-guide-has-tip');
      if(el) showHomeGuideHoverTip(el);
    });
    document.addEventListener('focusout',function(e){
      const el=e.target&&e.target.closest&&e.target.closest('.home-guide-has-tip');
      if(el) hideHomeGuideHoverTip();
    });
  }

  function renderHomeGuideInline(def,panelEl,opts){
    const banner=$('homeGuideBanner');
    if(!banner||!panelEl) return;
    if(opts&&opts.repositionOnly) return;
    renderHomeGuideBanner(def);
    const head=panelEl.querySelector('.home-live-head,.home-finish-head');
    banner.classList.add('is-inline');
    banner.style.left='';
    banner.style.top='';
    banner.style.width='';
    if(head&&head.parentNode){
      const host=head.parentNode;
      if(head.nextSibling!==banner) host.insertBefore(banner,head.nextSibling);
    }else if(panelEl.firstChild!==banner){
      panelEl.insertBefore(banner,panelEl.firstChild);
    }
    homeGuideClearFloatingLayer();
    const layer=$('homeGuideLayer');
    if(layer) layer.hidden=true;
  }

  function layoutHomeGuide(def,opts){
    opts=opts||{};
    const panelEl=$(def.panel);
    if(!panelEl) return;
    if(HOME_GUIDE_INLINE){
      renderHomeGuideInline(def,panelEl,opts);
      return;
    }
    positionHomeGuideVeil(panelEl);
    syncHomeGuidePanelRect(panelEl);
    if(opts.repositionOnly){
      positionHomeGuideBanner(panelEl);
      repositionHomeGuideCallouts(def.pins,def.layout);
      return;
    }
    renderHomeGuideBanner(def);
    positionHomeGuideBanner(panelEl);
    renderHomeGuideCallouts(def.pins,{layout:def.layout});
  }

  function homeGuidePointerBlocker(e){
    if(!homeGuideState) return;
    if(HOME_GUIDE_HOVER) return;
    const t=e.target;
    if(homeGuideState.anchorBtn&&homeGuideState.anchorBtn.contains(t)) return;
    const banner=$('homeGuideBanner');
    if(banner&&!banner.hidden&&banner.contains(t)) return;
    const panel=homeGuideState.panelEl;
    if(panel&&panel.contains(t)){
      e.preventDefault();
      e.stopPropagation();
      if(typeof e.stopImmediatePropagation==='function') e.stopImmediatePropagation();
    }
  }

  function homeGuideEnablePointerBlock(){
    if(homeGuideEnablePointerBlock.bound) return;
    homeGuideEnablePointerBlock.bound=true;
    ['pointerdown','mousedown','click','touchstart'].forEach(function(type){
      document.addEventListener(type,homeGuidePointerBlocker,true);
    });
  }

  function setHomeGuideBtnActive(card,on){
    const map={key:'btnHomeKeyHelp',voice:'btnHomeVoiceHelp'};
    const btn=$(map[card]);
    if(btn) btn.classList.toggle('is-active',!!on);
  }

  function openHomeGuide(card,anchorBtn){
    if(homeGuideDismissed[card]) return;
    const def=homeGuideDefForCard(card);
    const panelEl=$(def.panel);
    homeGuideState={card:card,anchorBtn:anchorBtn,def:def,panelEl:panelEl};
    if(HOME_GUIDE_HOVER){
      closeHomeSchemeMenuSafe();
      bindHomeGuideTargetTips(def);
      const layer=$('homeGuideLayer');
      if(layer){
        layer.hidden=true;
        layer.classList.remove('is-open','is-opening');
      }
      setHomeGuideBtnActive(card,true);
      requestAnimationFrame(function(){
        if(!homeGuideState||homeGuideState.card!==card) return;
        showHomeGuideIntroTip(def,anchorBtn);
        homeGuideStartStepDemo(def);
      });
      return;
    }
    const layer=$('homeGuideLayer');
    if(layer){
      layer.hidden=false;
      layer.classList.add('is-open','is-opening');
    }
    if(panelEl) panelEl.classList.add('is-guide-active');
    closeHomeSchemeMenuSafe();
    homeGuideBindObservers(panelEl,def.pins);
    layoutHomeGuide(def);
    homeGuideStartStepDemo(def);
    setHomeGuideBtnActive(card,true);
  }

  function closeHomeGuide(userInitiated){
    if(!homeGuideState) return;
    homeGuideStopStepDemo();
    if(userInitiated) homeGuideDismissed[homeGuideState.card]=true;
    const panelEl=homeGuideState.panelEl;
    setHomeGuideBtnActive(homeGuideState.card,false);
    if(panelEl) panelEl.classList.remove('is-guide-active');
    homeGuideUnbindObservers();
    homeGuideState=null;
    clearHomeGuideTargetTips();
    hideHomeGuideHoverTip();
    clearHomeGuideSpotlights();
    const layer=$('homeGuideLayer');
    if(layer){
      layer.hidden=true;
      layer.classList.remove('is-open','is-opening');
    }
    const callouts=$('homeGuideCallouts');
    if(callouts) callouts.innerHTML='';
    const lines=$('homeGuideLines');
    if(lines) while(lines.firstChild) lines.removeChild(lines.firstChild);
    homeGuidePanelRect=null;
    const banner=$('homeGuideBanner');
    if(banner){
      banner.innerHTML='';
      banner.hidden=true;
      attachHomeGuideBannerToLayer();
    }
  }

  function refreshHomeGuideIfOpen(rebuild){
    if(!homeGuideState) return;
    const def=homeGuideDefForCard(homeGuideState.card);
    homeGuideState.def=def;
    if(HOME_GUIDE_HOVER){
      bindHomeGuideTargetTips(def);
      homeGuideStartStepDemo(def);
      return;
    }
    layoutHomeGuide(def,{repositionOnly:!rebuild});
    homeGuideStartStepDemo(def);
  }

  function initHomeGuide(){
    const aria=t('homeHelpAria');
    document.querySelectorAll('[data-home-guide-card]').forEach(function(btn){
      btn.setAttribute('aria-label',aria);
      const card=btn.getAttribute('data-home-guide-card');
      btn.onclick=function(e){
        e.stopPropagation();
        homeGuideOpenTick=Date.now();
        if(homeGuideState&&homeGuideState.card===card){
          closeHomeGuide(true);
          return;
        }
        homeGuideDismissed[card]=false;
        if(homeGuideState) closeHomeGuide(false);
        openHomeGuide(card,btn);
      };
    });
    if(initHomeGuide.bound) return;
    initHomeGuide.bound=true;
    bindHomeGuideHoverEvents();
    homeGuideEnablePointerBlock();
    document.addEventListener('click',function(e){
      if(!homeGuideState) return;
      if(Date.now()-homeGuideOpenTick<100) return;
      const target=e.target;
      if(homeGuideState.anchorBtn&&homeGuideState.anchorBtn.contains(target)) return;
      const banner=$('homeGuideBanner');
      if(banner&&banner.contains(target)) return;
      const tip=$('homeGuideHoverTip');
      if(tip&&tip.contains(target)) return;
      if(homeGuideState.panelEl&&homeGuideState.panelEl.contains(target)) return;
      closeHomeGuide(true);
    });
    window.addEventListener('resize',homeGuideScheduleLayout);
    window.addEventListener('scroll',homeGuideScheduleLayout,true);
    const mainScroll=document.querySelector('.main-scroll');
    if(mainScroll) mainScroll.addEventListener('scroll',homeGuideScheduleLayout);
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape') closeHomeGuide(true);
    });
  }

  global.OneToneHomeGuide={
    init:initHomeGuide,
    open:openHomeGuide,
    close:closeHomeGuide,
    refresh:refreshHomeGuideIfOpen,
    scheduleLayout:homeGuideScheduleLayout,
    scheduleLayoutIfOpen:function(){ if(homeGuideState) homeGuideScheduleLayout(); },
    isOpen:function(){ return !!homeGuideState; },
    jumpToStep:homeGuideJumpToStep,
    defForCard:homeGuideDefForCard
  };
})((typeof window!=='undefined')?window:globalThis);
