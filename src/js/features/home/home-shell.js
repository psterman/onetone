(function(global){
  'use strict';
  var state=global.OneToneState.state;
  var ui=global.OneToneState.ui;
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function hooks(){ return global.__vp_home_shell_hooks__ || {}; }
  var shellState=null;
  function homeEntryVisibility(mode){
    mode=mode||hooks().getHomeEntryMode();
    return {
      mode:mode,
      showKey:mode!=='voice',
      showVoice:mode!=='keys'
    };
  }

  function applyHomeEntryModeLayout(showKeyEntry,showVoiceEntry){
    const mainGrid=$('homeMainGrid');
    const panelCount=(showKeyEntry?1:0)+(showVoiceEntry?1:0);
    if(mainGrid){
      mainGrid.classList.toggle('is-dual',panelCount===2);
      mainGrid.classList.toggle('is-single',panelCount===1);
      mainGrid.dataset.entryMode=hooks().getHomeEntryMode();
    }
    const homeHero=document.querySelector('.home-hero');
    if(homeHero){
      homeHero.classList.toggle('is-voice-only',!showKeyEntry&&showVoiceEntry);
      homeHero.classList.toggle('is-keys-only',showKeyEntry&&!showVoiceEntry);
      homeHero.classList.toggle('is-both-entries',showKeyEntry&&showVoiceEntry);
    }
    const homeAdvanced=$('homeAdvanced');
    if(homeAdvanced){
      homeAdvanced.classList.toggle('is-single-card',panelCount===1);
      homeAdvanced.dataset.entryMode=hooks().getHomeEntryMode();
    }
  }
  function openHomeSetupFlow(){
    var unlocked=false;
    try{
      unlocked=!!(hooks().isHomeAdvancedUnlocked&&hooks().isHomeAdvancedUnlocked());
    }catch(_){}
    // Button label is「我的习惯」when unlocked — open the hub, not onboarding.
    if(unlocked&&global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.open){
      global.OneToneSettingsDrawer.open({panel:'habits'});
      return;
    }
    if(window.OneToneOnboarding) window.OneToneOnboarding.open(true);
  }

  function placeHomeHabitsBtn(unlocked){
    const cta=$('btnHomeCta');
    const ctaMain=$('homeCtaMain');
    const ctaSub=$('homeCtaSub');
    const headerActions=document.querySelector('.header-actions');
    const btnSettings=$('btnSettings');
    if(!cta||!headerActions) return;
    if(cta.parentElement!==headerActions){
      headerActions.insertBefore(cta,btnSettings);
    }
    if(ctaMain) ctaMain.textContent=unlocked?t('homeMyHabits'):t('homeSetupStart');
    if(ctaSub) ctaSub.hidden=true;
    cta.hidden=false;
  }

  function renderHome(){
    state.firstSuccess=hooks().isFirstSuccessDone();
    const entryVis=homeEntryVisibility();
    const userEntryMode=entryVis.mode;
    const showKeyEntry=entryVis.showKey;
    const showVoiceEntry=entryVis.showVoice;

    const hs=global.OneToneHomeLive.computeState();
    shellState=hs;
    const unlocked=hooks().isHomeAdvancedUnlocked();
    const icon=$('homeStatusIcon');
    const title=$('homeStatusTitle');
    if(icon){
      icon.className='home-status-icon';
      if(hs.statusMode==='ready') icon.classList.add('is-ready');
      else if(hs.statusMode==='active') icon.classList.add('is-active');
      else if(hs.statusMode==='error') icon.classList.add('is-error');
      else if(hs.statusMode==='warn') icon.classList.add('is-warn');
    }
    if(title) title.textContent=hs.statusLine;
    const statusSummary=$('homeStatusSummary');
    if(statusSummary){
      const modeKey=userEntryMode==='keys'?'homeEntryModeKeys':userEntryMode==='voice'?'homeEntryModeVoice':'homeEntryModeBoth';
      statusSummary.textContent=t(modeKey);
      statusSummary.hidden=false;
      statusSummary.setAttribute('aria-hidden','false');
    }
    const focusMode=hooks().isHomeFirstRunFocusMode();
    const useWorkbench=!!($('homeWorkbench'));
    const appEl=document.querySelector('.app');
    if(appEl) appEl.classList.toggle('is-workbench',useWorkbench);
    if(!useWorkbench) placeHomeHabitsBtn(unlocked);
    else{
      const cta=$('btnHomeCta');
      if(cta) cta.hidden=true;
    }
    const btnSettingsGlobal=$('btnSettings');
    if(btnSettingsGlobal){
      btnSettingsGlobal.hidden=!!(focusMode&&!ui.drawerOpen);
    }

    const keyMapCard=$('homeKeyMapCard');
    if(keyMapCard) keyMapCard.hidden=!showKeyEntry;
    const voiceMapCard=$('homeVoiceMapCard');
    if(voiceMapCard) voiceMapCard.hidden=!showVoiceEntry;
    const keyPanel=$('homeLivePanelKey');
    const voicePanel=$('homeLivePanelVoice');
    if(keyPanel){
      keyPanel.hidden=!showKeyEntry;
      keyPanel.classList.toggle('is-entry-hidden',!showKeyEntry);
    }
    if(voicePanel){
      voicePanel.hidden=!showVoiceEntry;
      voicePanel.classList.toggle('is-entry-hidden',!showVoiceEntry);
    }
    applyHomeEntryModeLayout(showKeyEntry,showVoiceEntry);
    const homeAdvanced=$('homeAdvanced');
    const showAdvanced=unlocked&&(showKeyEntry||showVoiceEntry);
    if(homeAdvanced){
      homeAdvanced.hidden=!showAdvanced;
      if(showAdvanced){
        homeAdvanced.open=true;
        homeAdvanced.classList.add('is-unlocked');
      }else{
        homeAdvanced.open=false;
        homeAdvanced.classList.remove('is-unlocked');
      }
    }
    const advSummary=$('homeAdvancedSummary');
    if(advSummary) advSummary.textContent=t('homeAdvancedSummary');
    if(useWorkbench){
      if(global.OneToneHomeV9){
        global.OneToneHomeV9.bindOnce();
        global.OneToneHomeV9.applyLang();
      }
      if(global.OneToneHomeWorkbench){
        global.OneToneHomeWorkbench.bindOnce();
        global.OneToneHomeWorkbench.applyLang();
        global.OneToneHomeWorkbench.render();
      }
    }else{
      global.OneToneHomeLive.renderZone();
      if(global.OneToneHomeV9){
        global.OneToneHomeV9.bindOnce();
        global.OneToneHomeV9.applyLang();
        global.OneToneHomeV9.render();
      }
    }
    if(global.OneToneHabitTriggerSetup){
      global.OneToneHabitTriggerSetup.bindOnce();
      global.OneToneHabitTriggerSetup.applyLang();
    }
  }

  global.OneToneHomeShell={
    render:renderHome,entryVisibility:homeEntryVisibility,
    applyEntryLayout:applyHomeEntryModeLayout,placeHabitsBtn:placeHomeHabitsBtn,
    openSetupFlow:openHomeSetupFlow,uiState:function(){ return shellState; }
  };
})((typeof window!=='undefined')?window:globalThis);
