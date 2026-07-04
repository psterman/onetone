(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }

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
    $('btnWelcomeClose').onclick=function(){ hooks.closeWelcome(true); };
    $('btnWelcomeLater').onclick=function(){ hooks.closeWelcome(true); };
    $('btnWelcomeStart').onclick=function(){ hooks.closeWelcome(true); hooks.homeOneClickStart(); };
    var btnHomePhrasePractice=$('btnHomePhrasePractice');
    if(btnHomePhrasePractice){
      btnHomePhrasePractice.onclick=function(){
        if(window.OneToneApp) window.OneToneApp.openPhrasePractice({});
      };
    }
    $('welcomeOverlay').addEventListener('click',function(e){
      if(e.target===this) hooks.closeWelcome(true);
    });
    $('btnHomeCta').onclick=hooks.handleHomeCtaClick;
    hooks.initHomeGuide();
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
        hooks.openSettings({panel:'keyWake',focus:'mappings'});
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
        hooks.openSettings({panel:'keyWake',focus:'mappings'});
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
        if(e.target.closest('#homeKeyMapFinish')||e.target.closest('#homeKeyMapArrowFinish')){ hooks.openHomeKeyFinishSettings(); return; }
        if(e.target.closest('#homeKeyMapTrigger')||e.target.closest('#homeKeyMapTarget')){ hooks.openHomeKeySettings(); return; }
        if(e.target.closest('button')) return;
        hooks.openHomeKeySettings();
      });
    }
  }
  global.OneToneHomeUiBindings={bindEvents:bindEvents,openVoiceLink:openVoiceLink};
})((typeof window!=='undefined')?window:globalThis);
