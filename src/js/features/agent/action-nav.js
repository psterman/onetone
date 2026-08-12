/** Single navigation handoff for all habit channel editors. */
(function (global) {
  'use strict';

  var _pending = null;

  function openChannelEditor(opts) {
    opts = opts || {};
    var mappingId = String(opts.mappingId || '').trim();
    var channel = String(opts.channel || '').trim();
    if (!mappingId || !channel) return;
    _pending = {
      mappingId: mappingId,
      channel: channel,
      actionId: opts.actionId || null,
      bindingRef: opts.bindingRef || null,
      focusId: opts.focusId || null,
      returnContext: opts.returnContext || null
    };
    var state = global.OneToneState && global.OneToneState.state;
    var ui = global.OneToneState && global.OneToneState.ui;
    if (state) state.selectedMappingId = mappingId;
    if (ui) {
      ui.habitWorkspaceReturnContext = opts.returnContext || {
        mappingId: mappingId,
        channel: channel,
        itemId: '',
        mode: ui.habitExperienceMode || 'quick'
      };
      ui.habitScenarioReturnId = mappingId;
      ui.habitScenarioReturnPanel = channel;
      ui.habitScenarioReturnHub = true;
    }
    var drawer = global.OneToneSettingsDrawer;
    var panel =
      channel === 'key'
        ? 'keys'
        : channel === 'voice'
          ? 'voiceWake'
          : channel === 'camera'
            ? 'camera'
            : channel === 'softPad'
              ? 'softPad'
              : null;
    var context = global.OneToneHabitScenarioContextBanner;
    var handled = false;
    if (context) {
      try {
        if (channel === 'key' && context.openScenarioKeysEdit) { context.openScenarioKeysEdit(mappingId,{returnToHub:true}); handled=true; }
        else if (channel === 'voice' && context.openScenarioVoiceEdit) { context.openScenarioVoiceEdit(mappingId,{returnToHub:true}); handled=true; }
        else if (channel === 'camera' && context.openScenarioCameraEdit) { context.openScenarioCameraEdit(mappingId,{returnToHub:true}); handled=true; }
      } catch (_) {}
    }
    if (!handled && drawer && panel) {
      if (!ui || !ui.drawerOpen) {
        if (drawer.open) drawer.open({ panel: panel });
        else if (drawer.setPanel) drawer.setPanel(panel);
      } else if (drawer.setPanel) drawer.setPanel(panel);
    }
    if (channel === 'softPad') ensureSoftPadContextBanner(mappingId);
    if (opts.focusId && drawer && drawer.focusField) {
      setTimeout(function(){ try { drawer.focusField(opts.focusId); } catch (_) {} }, 80);
    }
  }

  function mappingName(mappingId){
    var state=global.OneToneState&&global.OneToneState.state;
    var maps=state&&state.config&&Array.isArray(state.config.mappings)?state.config.mappings:[];
    var m=maps.find(function(x){ return x&&String(x.id)===String(mappingId); });
    var hp=global.OneToneHabitProfile;
    return m&&(hp&&hp.habitDisplayName?hp.habitDisplayName(m):(m.group||m.label||m.id))||mappingId;
  }

  function ensureSoftPadContextBanner(mappingId){
    setTimeout(function(){
      var panel=document.getElementById('settingsPanelSoftPad')||document.querySelector('[data-settings-panel="softPad"]');
      if(!panel) return;
      var backLabel=(global.OneToneApp&&global.OneToneApp.t)?global.OneToneApp.t('habitHubContextBack'):'返回我的习惯';
      var banner=document.getElementById('habitSoftPadEditContext');
      if(!banner){
        banner=document.createElement('div');
        banner.id='habitSoftPadEditContext';
        banner.className='habit-edit-context-inline';
        banner.innerHTML='<span></span><button type="button"></button>';
        panel.insertBefore(banner,panel.firstChild);
        banner.querySelector('button').addEventListener('click',function(){
          if(global.OneToneHabitScenarioContextBanner&&global.OneToneHabitScenarioContextBanner.returnToHabitHub){
            global.OneToneHabitScenarioContextBanner.returnToHabitHub();
          }else if(global.OneToneHabitHub){ global.OneToneHabitHub.showHub(); }
        });
      }
      banner.hidden=false;
      banner.querySelector('span').textContent='正在编辑：'+mappingName(mappingId)+' · Soft Pad';
      banner.querySelector('button').textContent=backLabel;
    },0);
  }

  function consumePendingNav() {
    var p = _pending;
    _pending = null;
    return p;
  }

  function peekPendingNav() {
    return _pending;
  }

  global.OneToneActionNav = {
    openChannelEditor: openChannelEditor,
    consumePendingNav: consumePendingNav,
    peekPendingNav: peekPendingNav
  };
})(typeof window !== 'undefined' ? window : globalThis);
