(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function state(){ return global.OneToneState.state; }
  function hooks(){ return global.__vp_home_scheme_hooks__ || {}; }
  var homeSchemeMenuOpen=false;
  function homeSchemeLabel(){
    hooks().ensureConfig();
    const m=hooks().selectedMapping();
    if(!m) return t('homeLiveUnset');
    if(hooks().isDraftMapping(m)) return t('homeLiveSchemeDraft');
    if((m.label||'').trim()) return m.label.trim();
    if(m.triggerKey&&m.targetKey) return hooks().friendlyPair(m.triggerKey,m.targetKey,m);
    if(m.group) return m.group;
    return t('homeLiveUnset');
  }
  function mappingLabels(m){
    const trig=hooks().editorTriggerForMapping(m);
    const tgt=hooks().editorTargetForMapping(m);
    const lang=global.OneToneI18n.getLang();
    if(global.OneToneKeyLabels){
      return global.OneToneKeyLabels.labelsForMapping({
        triggerKey:trig||m.triggerKey||'',
        targetKey:tgt||m.targetKey||'',
        sourceKey:m.sourceKey||''
      },lang);
    }
    return {
      triggerLabel:hooks().friendlyKeyName(trig||''),
      targetLabel:hooks().friendlyKeyName(tgt||'')
    };
  }

  function homeMappingShortName(m){
    if(!m) return t('homeLiveUnset');
    if(hooks().isDraftMapping(m)) return t('homeLiveSchemeDraft');
    if((m.group||'').trim()) return m.group.trim();
    const labels=mappingLabels(m);
    if(labels.triggerLabel) return labels.triggerLabel;
    const lbl=(m.label||'').trim();
    if(lbl){
      const idx=lbl.indexOf(' → ');
      if(idx>0) return lbl.slice(0,idx).trim();
      return lbl;
    }
    return t('homeLiveUnset');
  }

  function homeMappingPairLine(m){
    const labels=mappingLabels(m);
    const trig=labels.triggerLabel||t('homeLiveUnset');
    const tgt=labels.targetLabel||t('homeKeyMapEmptyKey');
    return trig+' → '+tgt;
  }

  function resetHomeSchemeMenuPosition(){
    const menu=$('homeSchemeMenu');
    if(!menu) return;
    menu.classList.remove('is-floating');
    menu.style.left='';
    menu.style.top='';
    menu.style.width='';
    menu.style.maxWidth='';
  }

  function positionHomeSchemeMenu(){
    const btn=$('btnHomeSchemeSwitcher');
    const menu=$('homeSchemeMenu');
    if(!btn||!menu||menu.hidden) return;
    const r=btn.getBoundingClientRect();
    const pad=12;
    const width=Math.min(Math.max(r.width,168),window.innerWidth-pad*2);
    let left=Math.min(Math.max(pad,r.left),window.innerWidth-pad-width);
    let top=r.bottom+6;
    const maxH=Math.min(280,window.innerHeight*0.42);
    if(top+maxH>window.innerHeight-pad){
      top=Math.max(pad,r.top-6-maxH);
    }
    menu.classList.add('is-floating');
    menu.style.left=left+'px';
    menu.style.top=top+'px';
    menu.style.width=width+'px';
    menu.style.maxWidth=(window.innerWidth-pad*2)+'px';
  }

  function onHomeSchemeMenuLayout(){
    if(homeSchemeMenuOpen) positionHomeSchemeMenu();
  }

  function setHomeSchemeMenuOpen(open){
    homeSchemeMenuOpen=!!open;
    const menu=$('homeSchemeMenu');
    const backdrop=$('homeSchemeBackdrop');
    const btn=$('btnHomeSchemeSwitcher');
    if(menu) menu.hidden=!open;
    if(backdrop) backdrop.hidden=!open;
    if(btn) btn.setAttribute('aria-expanded',open?'true':'false');
    if(open){
      positionHomeSchemeMenu();
      window.addEventListener('resize',onHomeSchemeMenuLayout);
      window.addEventListener('scroll',onHomeSchemeMenuLayout,true);
    }else{
      window.removeEventListener('resize',onHomeSchemeMenuLayout);
      window.removeEventListener('scroll',onHomeSchemeMenuLayout,true);
      resetHomeSchemeMenuPosition();
    }
  }

  function closeHomeSchemeMenu(){
    setHomeSchemeMenuOpen(false);
  }

  function toggleHomeSchemeMenu(){
    if(hooks().getRecordingMode()!=='none') return;
    hooks().ensureConfig();
    if(!hooks().sortedMappings().length) return;
    setHomeSchemeMenuOpen(!homeSchemeMenuOpen);
  }

  function selectHomeMapping(id){
    if(hooks().getRecordingMode()!=='none') return;
    if(!id||state().selectedMappingId===id){
      closeHomeSchemeMenu();
      return;
    }
    hooks().flushAllEditorToMappings();
    state().selectedMappingId=id;
    hooks().syncEditorFromSelection();
    closeHomeSchemeMenu();
    hooks().render();
    if(global.OneToneImePresets){
      global.OneToneImePresets.refresh('mapping');
      global.OneToneImePresets.refresh('onboarding');
    }
  }

  function toggleHomeSchemeMappingEnabled(id){
    if(hooks().getRecordingMode()!=='none') return;
    const m=hooks().mappingById(id);
    if(!m||hooks().isDraftMapping(m)) return;
    const next=!m.enabled;
    try{
      window.chrome?.webview?.postMessage({type:'mvp_mapping_toggle',id,enabled:next});
    }catch(_){}
  }
  function renderHomeSchemeSwitcher(loading){
    hooks().ensureConfig();
    const schemes=hooks().sortedMappings();
    const multi=schemes.length>=2;
    const switcher=$('homeSchemeSwitcher');
    const chevron=$('homeSchemeSwitcherChevron');
    if(switcher) switcher.hidden=!!loading;
    const m=hooks().selectedMapping();
    const nameEl=$('homeSchemeSwitcherName');
    if(loading){
      if(nameEl) nameEl.textContent=t('homeLiveLoading');
      closeHomeSchemeMenu();
      return;
    }
    if(nameEl) nameEl.textContent=homeMappingShortName(m);
    const btn=$('btnHomeSchemeSwitcher');
    if(btn){
      btn.disabled=recordingBusySchemeSwitcher();
      btn.classList.remove('is-readonly');
      btn.setAttribute('aria-haspopup','listbox');
      btn.setAttribute('aria-label',multi?t('homeSchemeSwitchAria'):t('homeSchemeMenuAria'));
    }
    if(chevron) chevron.hidden=false;
    const manageBtn=$('btnHomeManageSchemes');
    if(manageBtn) manageBtn.textContent=t('homeSchemeManage');
    const listEl=$('homeSchemeMenuList');
    if(!listEl) return;
    let html='';
    schemes.forEach(function(item){
      const sel=item.id===state().selectedMappingId;
      const draft=hooks().isDraftMapping(item);
      const on=!!item.enabled;
      html+='<div class="home-scheme-item'+(sel?' is-selected':'')+(draft?' is-draft':'')+'" data-id="'+item.id+'" role="option" aria-selected="'+(sel?'true':'false')+'">';
      html+='<span class="home-scheme-item-dot" aria-hidden="true">'+(sel?'●':'○')+'</span>';
      html+='<div class="home-scheme-item-text">';
      html+='<span class="home-scheme-item-name">'+hooks().escHtml(homeMappingShortName(item))+'</span>';
      html+='<span class="home-scheme-item-pair">'+hooks().escHtml(homeMappingPairLine(item))+'</span>';
      html+='</div>';
      if(draft){
        html+='<span class="home-scheme-item-tag">'+hooks().escHtml(t('homeLiveSchemeDraft'))+'</span>';
      }else if(multi){
        html+='<button type="button" class="toggle-switch home-scheme-item-toggle'+(on?' is-on':'')+'" data-home-scheme-toggle="'+item.id+'" role="switch" aria-checked="'+(on?'true':'false')+'" aria-label="'+hooks().escHtml(t('homeSchemeToggleLbl'))+'"></button>';
      }
      html+='</div>';
    });
    listEl.innerHTML=html;
  }
  function recordingBusySchemeSwitcher(){
    return hooks().getRecordingMode()!=='none';
  }

  global.OneToneHomeScheme={
    label:homeSchemeLabel,
    shortName:homeMappingShortName,
    pairLine:homeMappingPairLine,
    closeMenu:closeHomeSchemeMenu,
    toggleMenu:toggleHomeSchemeMenu,
    selectMapping:selectHomeMapping,
    toggleMappingEnabled:toggleHomeSchemeMappingEnabled,
    renderSwitcher:renderHomeSchemeSwitcher,
    isSwitcherBusy:recordingBusySchemeSwitcher,
    isMenuOpen:function(){ return homeSchemeMenuOpen; }
  };
})((typeof window!=='undefined')?window:globalThis);
