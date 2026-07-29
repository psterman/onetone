(function(global){
  'use strict';

  // P9a: React 岛接管 #wbCommandSearch 后，本模块仅作 API 回退/委托层。
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var bound=false;
  var activeIndex=-1;
  var visibleItems=[];

  function islandMounted(){
    return !!(global.__otCommandPaletteMounted);
  }

  function paletteApi(){
    return global.__otCommandPalette;
  }

  function commands(){
    return [
      {id:'home', labelKey:'homeWbCmdkHome', hintKey:'homeWbCmdkHintNav', action:'home'},
      {id:'test', labelKey:'homeWbQuickTest', hintKey:'homeWbCmdkHintAction', action:'test'},
      {id:'habit', labelKey:'homeWbQuickNewHabit', hintKey:'homeWbCmdkHintSettings', panel:'habits', habitWizard:true},
      {id:'model', labelKey:'homeWbQuickSwitchModel', hintKey:'homeWbCmdkHintSettings', panel:'voiceWake'},
      {id:'triggers', labelKey:'homeWbNavTriggers', hintKey:'homeWbCmdkHintSettings', panel:'keys'},
      {id:'softPad', labelKey:'homeWbNavSoftPad', hintKey:'homeWbCmdkHintSettings', panel:'softPad'},
      {id:'schemes', labelKey:'homeWbNavSchemes', hintKey:'homeWbCmdkHintSettings', panel:'habits'},
      {id:'sounds', labelKey:'homeWbNavSounds', hintKey:'homeWbCmdkHintSettings', panel:'sounds'},
      {id:'general', labelKey:'homeWbNavGeneral', hintKey:'homeWbCmdkHintSettings', panel:'basic'},
      {id:'runtime', labelKey:'homeWbNavRuntime', hintKey:'homeWbCmdkHintSettings', panel:'debug', debugMode:'overview'}
    ];
  }

  function filterItems(query){
    var q=String(query||'').trim().toLowerCase();
    return commands().filter(function(item){
      if(!q) return true;
      var label=t(item.labelKey).toLowerCase();
      var hint=item.hintKey?t(item.hintKey).toLowerCase():'';
      return label.indexOf(q)>=0||hint.indexOf(q)>=0||item.id.indexOf(q)>=0;
    });
  }

  function panelEl(){
    return $('wbCmdkPanel');
  }

  function inputEl(){
    return $('wbCommandSearchInput');
  }

  function setOpen(open){
    var panel=panelEl();
    var input=inputEl();
    if(!panel||!input) return;
    panel.hidden=!open;
    input.setAttribute('aria-expanded',open?'true':'false');
    if(!open) activeIndex=-1;
  }

  function isOpen(){
    var panel=panelEl();
    return !!(panel&&!panel.hidden);
  }

  function renderList(query){
    var panel=panelEl();
    if(!panel) return;
    visibleItems=filterItems(query);
    activeIndex=visibleItems.length?0:-1;
    if(!visibleItems.length){
      panel.innerHTML='<div class="wb-cmdk-empty">'+esc(t('homeWbCmdkEmpty'))+'</div>';
      return;
    }
    panel.innerHTML=visibleItems.map(function(item,idx){
      var cls='wb-cmdk-item'+(idx===activeIndex?' is-active':'');
      return '<button type="button" class="'+cls+'" role="option" data-cmdk-id="'+esc(item.id)+'" aria-selected="'+(idx===activeIndex?'true':'false')+'">'
        +'<span>'+esc(t(item.labelKey))+'</span>'
        +(item.hintKey?'<span class="wb-cmdk-item-hint">'+esc(t(item.hintKey))+'</span>':'')
        +'</button>';
    }).join('');
  }

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function highlight(){
    var panel=panelEl();
    if(!panel) return;
    panel.querySelectorAll('.wb-cmdk-item').forEach(function(el,idx){
      el.classList.toggle('is-active',idx===activeIndex);
      el.setAttribute('aria-selected',idx===activeIndex?'true':'false');
    });
  }

  function runItem(item){
    if(!item) return;
    setOpen(false);
    var input=inputEl();
    if(input) input.blur();
    if(item.action==='home'){
      if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.close) global.OneToneSettingsDrawer.close();
      return;
    }
    if(item.action==='test'){
      var testBtn=$('wbBtnTestSend');
      if(testBtn) testBtn.click();
      return;
    }
    if(item.panel&&global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.open){
      var opts={panel:item.panel};
      if(item.debugMode) opts.debugMode=item.debugMode;
      if(item.habitWizard) opts.habitWizard=true;
      global.OneToneSettingsDrawer.open(opts);
    }
  }

  function runById(id){
    var item=null;
    for(var i=0;i<visibleItems.length;i++){
      if(visibleItems[i].id===id){ item=visibleItems[i]; break; }
    }
    runItem(item);
  }

  function openPalette(){
    var api=paletteApi();
    if(api&&typeof api.openPalette==='function') return api.openPalette();
    var input=inputEl();
    if(!input) return;
    input.focus();
    input.select();
    renderList(input.value);
    setOpen(true);
  }

  function bindOnce(){
    if(bound) return;
    if(islandMounted()) return;
    bound=true;
    var input=inputEl();
    var panel=panelEl();
    if(!input||!panel) return;

    input.addEventListener('focus',function(){
      renderList(input.value);
      setOpen(true);
    });

    input.addEventListener('input',function(){
      renderList(input.value);
      setOpen(true);
    });

    input.addEventListener('keydown',function(e){
      if(e.key==='Escape'){
        setOpen(false);
        input.blur();
        e.preventDefault();
        return;
      }
      if(!isOpen()) return;
      if(e.key==='ArrowDown'){
        if(!visibleItems.length) return;
        activeIndex=(activeIndex+1)%visibleItems.length;
        highlight();
        e.preventDefault();
        return;
      }
      if(e.key==='ArrowUp'){
        if(!visibleItems.length) return;
        activeIndex=(activeIndex-1+visibleItems.length)%visibleItems.length;
        highlight();
        e.preventDefault();
        return;
      }
      if(e.key==='Enter'){
        if(activeIndex>=0&&visibleItems[activeIndex]){
          runItem(visibleItems[activeIndex]);
          e.preventDefault();
        }
      }
    });

    panel.addEventListener('mousedown',function(e){
      e.preventDefault();
    });

    panel.addEventListener('click',function(e){
      var btn=e.target.closest&&e.target.closest('[data-cmdk-id]');
      if(!btn) return;
      runById(btn.getAttribute('data-cmdk-id'));
    });

    document.addEventListener('click',function(e){
      if(!isOpen()) return;
      var wrap=$('wbCommandSearch');
      if(wrap&&wrap.contains(e.target)) return;
      setOpen(false);
    });
  }

  global.OneToneHomeWorkbenchCmdk={
    bindOnce:bindOnce,
    openPalette:openPalette,
    isOpen:function(){
      var api=paletteApi();
      if(api&&typeof api.isOpen==='function') return api.isOpen();
      return isOpen();
    },
    close:function(){
      var api=paletteApi();
      if(api&&typeof api.close==='function') return api.close();
      setOpen(false);
    }
  };
})((typeof window!=='undefined')?window:globalThis);
