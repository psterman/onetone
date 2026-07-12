(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var activeTab='modifiers';
  var searchQuery='';
  var hoverKey='';
  var bound=false;
  var docKeyHandler=null;

  function hooks(){
    return global.__vp_bootstrap_hooks__ || {};
  }

  function core(){
    return global.OneToneMappingCore;
  }

  function catalogApi(){
    return global.OneToneTargetKeyCatalog;
  }

  function friendlyKey(key){
    var h=hooks();
    if(h.friendlyKeyName) return h.friendlyKeyName(key);
    if(global.OneToneKeyLabels&&global.OneToneKeyLabels.friendlyKeyName){
      var lang=global.OneToneApp&&global.OneToneApp.getLang?global.OneToneApp.getLang():'zh';
      return global.OneToneKeyLabels.friendlyKeyName(key,lang);
    }
    return key;
  }

  function esc(s){
    return String(s||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/"/g,'&quot;');
  }

  function currentTargetKey(){
    var c=core();
    var m=c&&c.selected?c.selected():null;
    if(!m) return '';
    return c.editorTarget?String(c.editorTarget(m)||'').trim():String(m.targetKey||'').trim();
  }

  function previewConflict(key){
    var kpu=global.OneToneKeysPanelUi;
    if(kpu&&kpu.previewKeyConflict) return kpu.previewKeyConflict('target',key);
    return '';
  }

  function keysPanelActive(){
    var kpu=global.OneToneKeysPanelUi;
    if(kpu&&kpu.keysPanelActive) return kpu.keysPanelActive();
    return false;
  }

  function canOpen(){
    var rec=global.OneToneMappingRecording;
    if(!rec) return true;
    if(rec.isPending&&rec.isPending()){
      var h=hooks();
      if(h.toast) h.toast(t('targetKeyPickerPending'));
      return false;
    }
    if(rec.mode&&rec.mode()!=='none'&&rec.cancel) rec.cancel();
    return true;
  }

  function close(){
    var overlay=$('targetKeyPickerOverlay');
    if(!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden','true');
    hoverKey='';
    searchQuery='';
    var search=$('targetKeyPickerSearch');
    if(search) search.value='';
    if(docKeyHandler){
      document.removeEventListener('keydown',docKeyHandler);
      docKeyHandler=null;
    }
  }

  function applyKey(key){
    key=String(key||'').trim();
    if(!key) return;
    if(global.OneToneTargetKeyApply&&global.OneToneTargetKeyApply.applyCustomMappingTarget){
      global.OneToneTargetKeyApply.applyCustomMappingTarget(key,{source:'picker'});
    }
    close();
  }

  function handleManualRecord(){
    close();
    var rec=global.OneToneMappingRecording;
    if(rec&&rec.isPending&&rec.isPending()){
      var h=hooks();
      if(h.toast) h.toast(t('targetKeyPickerPending'));
      return;
    }
    if(rec&&rec.mode&&rec.mode()!=='none'&&rec.cancel) rec.cancel();
    var h=hooks();
    if(h.startTargetRecord) h.startTargetRecord();
  }

  function matchesSearch(key){
    var q=String(searchQuery||'').trim().toLowerCase();
    if(!q) return true;
    var name=friendlyKey(key).toLowerCase();
    return key.toLowerCase().indexOf(q)>=0||name.indexOf(q)>=0;
  }

  function renderKeyBtn(key,opts){
    opts=opts||{};
    var current=currentTargetKey();
    var isSel=current&&current===key;
    var conflict=previewConflict(key);
    var label=friendlyKey(key);
    var icon='';
    if(global.OneToneKeyIcons&&global.OneToneKeyIcons.iconHtmlForKey&&!opts.textOnly){
      icon=global.OneToneKeyIcons.iconHtmlForKey(key);
    }
    var display=opts.textOnly?esc(key.length<=2?key:label):esc(label.length>8?key:label);
    return '<button type="button" class="target-key-picker-key'+(isSel?' is-selected':'')+(conflict?' is-conflict':'')+'" data-target-key="'+esc(key)+'" title="'+esc(label)+(conflict?' · '+esc(conflict):'')+'">'
      +(icon&&!opts.textOnly?'<span class="target-key-picker-key-icon">'+icon+'</span>':'')
      +'<span class="target-key-picker-key-label">'+display+'</span>'
      +(conflict?'<span class="target-key-picker-key-warn" aria-hidden="true">!</span>':'')
      +'</button>';
  }

  function renderCombos(cat){
    var html='';
    (cat.combos||[]).forEach(function(entry){
      if(!matchesSearch(entry.key)) return;
      html+=renderKeyBtn(entry.key,{textOnly:false});
    });
    return html;
  }

  function renderGrid(catId){
    var cat=catalogApi();
    if(!cat) return '';
    var items=(cat.catalog&&cat.catalog[catId])||[];
    var html='';
    items.forEach(function(entry){
      if(!matchesSearch(entry.key)) return;
      html+=renderKeyBtn(entry.key,{textOnly:catId==='letters'||catId==='digits'});
    });
    return html;
  }

  function renderTabs(){
    var cat=catalogApi();
    if(!cat) return '';
    var html='';
    cat.tabOrder.forEach(function(id){
      var on=activeTab===id;
      html+='<button type="button" class="target-key-picker-tab'+(on?' is-active':'')+'" data-target-key-tab="'+esc(id)+'" role="tab" aria-selected="'+(on?'true':'false')+'">'+esc(t(cat.tabLabelKey(id)))+'</button>';
    });
    return html;
  }

  function syncPreview(){
    var preview=$('targetKeyPickerPreview');
    if(!preview) return;
    var key=hoverKey||currentTargetKey();
    if(!key){
      preview.textContent='';
      return;
    }
    var conflict=previewConflict(key);
    preview.textContent=conflict?friendlyKey(key)+' — '+conflict:friendlyKey(key);
    preview.classList.toggle('is-conflict',!!conflict);
  }

  function render(){
    var cat=catalogApi();
    if(!cat) return;
    var combosEl=$('targetKeyPickerCombos');
    var tabsEl=$('targetKeyPickerTabs');
    var gridEl=$('targetKeyPickerGrid');
    var emptyEl=$('targetKeyPickerEmpty');
    if(tabsEl) tabsEl.innerHTML=renderTabs();
    if(combosEl){
      var combosHtml=renderCombos(cat.catalog);
      combosEl.innerHTML=combosHtml;
      var combosWrap=$('targetKeyPickerCombosWrap');
      if(combosWrap) combosWrap.hidden=!combosHtml;
    }
    if(gridEl) gridEl.innerHTML=renderGrid(activeTab);
    var hasVisible=false;
    if(combosEl&&combosEl.children.length) hasVisible=true;
    if(gridEl&&gridEl.children.length) hasVisible=true;
    if(emptyEl){
      emptyEl.textContent=t('targetKeyPickerEmpty');
      emptyEl.hidden=hasVisible||!String(searchQuery||'').trim();
    }
    syncPreview();
  }

  function applyStaticLabels(){
    var title=$('targetKeyPickerTitle');
    var desc=$('targetKeyPickerDesc');
    var search=$('targetKeyPickerSearch');
    var combosLbl=$('targetKeyPickerCombosLbl');
    var manual=$('btnTargetKeyPickerManualRecord');
    var cancel=$('btnTargetKeyPickerCancel');
    if(title) title.textContent=t('targetKeyPickerTitle');
    if(desc) desc.textContent=t('targetKeyPickerDesc');
    if(search) search.placeholder=t('targetKeyPickerSearch');
    if(combosLbl) combosLbl.textContent=t('targetKeyPickerCombosSection');
    if(manual) manual.textContent=t('targetKeyPickerManualRecord');
    if(cancel) cancel.textContent=t('targetKeyPickerCancel');
  }

  function isOpen(){
    var overlay=$('targetKeyPickerOverlay');
    return !!(overlay&&overlay.classList.contains('open'));
  }

  function applyLang(){
    applyStaticLabels();
    if(isOpen()) render();
  }

  function open(){
    if(!canOpen()) return;
    var c=core();
    if(!c||!c.selected||!c.selected()) return;
    activeTab='modifiers';
    searchQuery='';
    hoverKey='';
    applyStaticLabels();
    render();
    var overlay=$('targetKeyPickerOverlay');
    if(!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
    var search=$('targetKeyPickerSearch');
    if(search) setTimeout(function(){ search.focus(); },0);
    if(!docKeyHandler){
      docKeyHandler=function(e){
        if(e.key==='Escape'&&isOpen()){
          e.preventDefault();
          close();
        }
      };
      document.addEventListener('keydown',docKeyHandler);
    }
  }

  function onOverlayClick(e){
    if(e.target.id==='targetKeyPickerOverlay') close();
    var tab=e.target.closest&&e.target.closest('[data-target-key-tab]');
    if(tab){
      activeTab=tab.getAttribute('data-target-key-tab')||'modifiers';
      render();
      return;
    }
    var keyBtn=e.target.closest&&e.target.closest('[data-target-key]');
    if(keyBtn){
      applyKey(keyBtn.getAttribute('data-target-key'));
      return;
    }
    if(e.target.id==='btnTargetKeyPickerCancel'||e.target.closest&&e.target.closest('#btnTargetKeyPickerCancel')) close();
    if(e.target.id==='btnTargetKeyPickerClose'||e.target.closest&&e.target.closest('#btnTargetKeyPickerClose')) close();
    if(e.target.id==='btnTargetKeyPickerManualRecord'||e.target.closest&&e.target.closest('#btnTargetKeyPickerManualRecord')) handleManualRecord();
  }

  function onOverlayKeydown(e){
    if(e.key==='Escape'){
      e.preventDefault();
      close();
    }
  }

  function onSearchInput(e){
    searchQuery=e.target.value||'';
    render();
  }

  function onGridHover(e){
    var keyBtn=e.target.closest&&e.target.closest('[data-target-key]');
    if(!keyBtn) return;
    hoverKey=keyBtn.getAttribute('data-target-key')||'';
    syncPreview();
  }

  function bindEvents(){
    if(bound) return;
    bound=true;
    var overlay=$('targetKeyPickerOverlay');
    if(overlay){
      overlay.addEventListener('click',onOverlayClick);
      overlay.addEventListener('keydown',onOverlayKeydown);
      overlay.addEventListener('mouseover',onGridHover);
    }
    var search=$('targetKeyPickerSearch');
    if(search) search.addEventListener('input',onSearchInput);
  }

  function openFromKeysPanel(){
    if(!keysPanelActive()) return;
    open();
  }

  global.OneToneTargetKeyPicker={
    open:open,
    openFromKeysPanel:openFromKeysPanel,
    close:close,
    render:render,
    applyKey:applyKey,
    handleManualRecord:handleManualRecord,
    canOpen:canOpen,
    isOpen:isOpen,
    applyLang:applyLang,
    bindEvents:bindEvents
  };
})((typeof window!=='undefined')?window:globalThis);
