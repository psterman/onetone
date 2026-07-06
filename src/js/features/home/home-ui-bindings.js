(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  function on(id,type,handler){
    var el=$(id);
    if(!el) return null;
    if(type==='click') el.onclick=handler;
    else el.addEventListener(type,handler);
    return el;
  }

  function openVoiceLink(linkId){
    var map=global.HOME_VOICE_LINK_MAP||{};
    var action=map[linkId];
    if(!action) return;
    var hooks=h();
    if(action.panel==='debug'){
      hooks.openSettings({ panel:'debug', debugMode:action.debugMode||'diagnostics' });
      return;
    }
    hooks.openSettings({ panel:action.panel, focus:action.focus });
  }

  function bindEvents(){
    var hooks=h();
    on('btnWelcomeClose','click',function(){ hooks.closeWelcome(true); });
    on('btnWelcomeLater','click',function(){ hooks.closeWelcome(true); });
    on('btnWelcomeStart','click',function(){ hooks.closeWelcome(true); hooks.homeOneClickStart(); });
    var btnHomePhrasePractice=$('btnHomePhrasePractice');
    if(btnHomePhrasePractice){
      btnHomePhrasePractice.onclick=function(){
        if(window.OneToneApp) window.OneToneApp.openPhrasePractice({});
      };
    }
    on('welcomeOverlay','click',function(e){
      if(e.target===this) hooks.closeWelcome(true);
    });
    on('btnHomeCta','click',hooks.handleHomeCtaClick);
    if(typeof hooks.initHomeGuide==='function') hooks.initHomeGuide();
    var btnHomeKeyToggle=$('btnHomeKeyToggle');
    if(btnHomeKeyToggle) btnHomeKeyToggle.onclick=hooks.toggleHomeKeyEnable;
    var btnHomeSchemeSwitcher=$('btnHomeSchemeSwitcher');
    if(btnHomeSchemeSwitcher){
      btnHomeSchemeSwitcher.onclick=function(e){
        e.stopPropagation();
        hooks.toggleHomeSchemeMenu();
      };
    }
    var btnHomeManageSchemes=$('btnHomeManageSchemes');
    if(btnHomeManageSchemes){
      btnHomeManageSchemes.onclick=function(e){
        e.stopPropagation();
        hooks.closeHomeSchemeMenu();
        hooks.openSettings({panel:'habits',focus:'mappings'});
      };
    }
    var homeSchemeMenuList=$('homeSchemeMenuList');
    if(homeSchemeMenuList){
      homeSchemeMenuList.onclick=function(e){
        var toggle=e.target.closest&&e.target.closest('[data-home-scheme-toggle]');
        if(toggle){
          e.stopPropagation();
          hooks.toggleHomeSchemeMappingEnabled(toggle.getAttribute('data-home-scheme-toggle')||'');
          return;
        }
        var item=e.target.closest&&e.target.closest('.home-scheme-item');
        if(item&&item.dataset.id) hooks.selectHomeMapping(item.dataset.id);
      };
    }
    var homeSchemeBackdrop=$('homeSchemeBackdrop');
    if(homeSchemeBackdrop) homeSchemeBackdrop.onclick=hooks.closeHomeSchemeMenu;
    var homeLiveKeyConflict=$('homeLiveKeyConflict');
    if(homeLiveKeyConflict){
      homeLiveKeyConflict.onclick=function(){
        if(homeLiveKeyConflict.hidden) return;
        hooks.openSettings({panel:'habits',focus:'mappings'});
      };
    }
    document.addEventListener('click',function(e){
      if(!global.OneToneHomeScheme.isMenuOpen()) return;
      var sw=$('homeSchemeSwitcher');
      if(sw&&sw.contains(e.target)) return;
      hooks.closeHomeSchemeMenu();
    });
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape'&&global.OneToneHomeScheme.isMenuOpen()) hooks.closeHomeSchemeMenu();
    });
    var btnHomeVoiceToggle=$('btnHomeVoiceToggle');
    if(btnHomeVoiceToggle) btnHomeVoiceToggle.onclick=hooks.homeToggleVoiceWake;
    var homeVoiceSimpleLinks=$('homeVoiceSimpleLinks');
    if(homeVoiceSimpleLinks){
      homeVoiceSimpleLinks.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-link-id]');
        if(!btn) return;
        e.preventDefault();
        openVoiceLink(btn.getAttribute('data-link-id')||'');
      });
    }
    var homeKeyMapCardEl=$('homeKeyMapCard');
    if(homeKeyMapCardEl){
      homeKeyMapCardEl.addEventListener('click',function(e){
        if(e.target.closest('#homeSchemeSwitcher')||e.target.closest('.home-scheme-menu')) return;
        if(e.target.closest('button')) return;
        if(e.target.closest('#homeKeyMapFinish')||e.target.closest('#homeKeyMapArrowFinish')){
          hooks.openHomeKeyStep('keyFinishFlow');
          return;
        }
        if(e.target.closest('#homeKeyMapTrigger')){
          hooks.openHomeKeyStep('trigger');
          return;
        }
        if(e.target.closest('#homeKeyMapTarget')){
          hooks.openHomeKeyStep('target');
          return;
        }
      });
    }
  }
  global.OneToneHomeUiBindings={bindEvents:bindEvents,openVoiceLink:openVoiceLink};
})((typeof window!=='undefined')?window:globalThis);
