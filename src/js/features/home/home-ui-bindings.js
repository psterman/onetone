(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
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
    $('btnHomeVoiceModeSapi').onclick=function(){ hooks.switchVoiceMode('sapi'); };
    $('btnHomeVoiceModeVosk').onclick=function(){ hooks.switchVoiceMode('vosk'); };
    $('btnHomeVoiceToggle').onclick=hooks.homeToggleVoiceWake;
    var btnHomeMicSettings=$('btnHomeMicSettings');
    if(btnHomeMicSettings){
      btnHomeMicSettings.onclick=function(){
        hooks.openSettings({panel:'voiceWake',focus:'mic'});
      };
    }
    $('homeVoiceSapiConfidence').oninput=function(){ hooks.updateHomeVoiceSapiConfidence(false); };
    $('homeVoiceSapiConfidence').onchange=function(){ hooks.updateHomeVoiceSapiConfidence(true); };
    $('btnHomeEndToggle').onclick=function(e){ e.stopPropagation(); hooks.toggleVoiceEnd(); };
    $('btnHomeEndAutoSend').onclick=function(e){ e.stopPropagation(); hooks.toggleHomeVoiceEndAutoSend(); };
    var btnHomeEndSettings=$('btnHomeEndSettings');
    if(btnHomeEndSettings){
      btnHomeEndSettings.onclick=function(e){
        e.stopPropagation();
        hooks.openSettings({panel:'voiceWake',focus:'endPhrases'});
      };
    }
    var btnHomeAutoSettings=$('btnHomeAutoSettings');
    if(btnHomeAutoSettings){
      btnHomeAutoSettings.onclick=function(e){
        e.stopPropagation();
        hooks.openSettings({panel:'voiceWake',focus:'autoSend'});
      };
    }
    var homeVoiceMapCardEl=$('homeVoiceMapCard');
    if(homeVoiceMapCardEl){
      homeVoiceMapCardEl.addEventListener('click',function(e){
        if(e.target.closest('#homeVoiceMapFoot')||e.target.closest('#homeVoiceWakeMicList')) return;
        if(e.target.closest('button')||e.target.closest('input')) return;
        if(e.target.closest('#homeVoiceMapWake')){ hooks.openSettings({panel:'voiceWake',focus:'wakePhrases'}); return; }
        if(e.target.closest('#homeVoiceMapEndPhraseKey')) return;
        if(e.target.closest('#homeVoiceEndMeta')) return;
        if(e.target.closest('#homeVoiceMapEndPhrase')){ hooks.openSettings({panel:'voiceWake',focus:'endPhrases'}); return; }
      });
    }
    var homeVoiceEngineBarLbl=$('homeVoiceEngineBarLbl');
    if(homeVoiceEngineBarLbl){
      homeVoiceEngineBarLbl.style.cursor='pointer';
      homeVoiceEngineBarLbl.addEventListener('click',function(){
        hooks.openSettings({panel:'voiceWake',focus:'engine'});
      });
    }
    var wakeKeyEl=$('homeVoiceMapWakeKey');
    if(wakeKeyEl){
      wakeKeyEl.onclick=function(e){
        e.stopPropagation();
        hooks.openSettings({panel:'voiceWake',focus:'wakePhrases'});
      };
    }
    var endPhraseKeyEl=$('homeVoiceMapEndPhraseKey');
    if(endPhraseKeyEl){
      endPhraseKeyEl.onclick=function(e){
        e.stopPropagation();
        hooks.openSettings({panel:'voiceWake',focus:'endPhrases'});
      };
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
  global.OneToneHomeUiBindings={bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
