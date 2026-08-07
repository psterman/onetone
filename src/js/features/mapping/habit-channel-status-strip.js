(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom&&global.OneToneDom.$?global.OneToneDom.$(id):document.getElementById(id); };
  var t=function(key){
    if(global.OneToneI18n&&global.OneToneI18n.t) return global.OneToneI18n.t(key);
    return key;
  };

  var PANEL_HOSTS=[
    {panel:'keys',panelId:'settingsPanelKeys',stripId:'habitChannelStatusStripKeys',beforeId:'habitScenarioContextBannerKeys'},
    {panel:'voice',panelId:'settingsPanelVoiceWake',stripId:'habitChannelStatusStripVoice',beforeId:'habitScenarioContextBannerVoice'},
    {panel:'camera',panelId:'settingsPanelCamera',stripId:'habitChannelStatusStripCamera',beforeId:'habitScenarioContextBannerCamera'},
    {panel:'softPad',panelId:'settingsPanelSoftPad',stripId:'habitChannelStatusStripSoftPad',beforeId:'softPadStatusBar'}
  ];

  var bound=false;

  function state(){ return global.OneToneState&&global.OneToneState.state; }
  function ui(){ return global.OneToneState&&global.OneToneState.ui; }

  function habitName(m){
    if(!m) return '';
    if(global.OneToneHabitProfile&&global.OneToneHabitProfile.habitDisplayName){
      return global.OneToneHabitProfile.habitDisplayName(m);
    }
    if(global.OneToneHabitHub&&global.OneToneHabitHub.habitName){
      return global.OneToneHabitHub.habitName(m);
    }
    return String(m.group||m.label||m.id||'').trim()||'—';
  }

  function mappingById(id){
    id=String(id||'').trim();
    if(!id) return null;
    if(global.OneToneMappingCore&&global.OneToneMappingCore.byId) return global.OneToneMappingCore.byId(id);
    var cfg=state()&&state().config;
    var maps=cfg&&cfg.mappings||[];
    for(var i=0;i<maps.length;i++){
      if(maps[i]&&maps[i].id===id) return maps[i];
    }
    return null;
  }

  function universalLabel(){
    // 主标签短名「通用」（设置入口「通用设置」留给 Hub 分区标题）
    return t('homeWbChipUniversal')||t('habitChannelStripUniversal')||'通用';
  }

  function isAppScenarioMapping(m){
    if(!m) return false;
    var diff=global.OneToneHabitOverrideDiff;
    if(diff&&diff.isAppScenarioMapping) return !!diff.isAppScenarioMapping(m);
    return !!(String(m.appTargetId||'').trim()||(Array.isArray(m.appBehaviorRules)&&m.appBehaviorRules.some(function(r){ return r&&r.appId; })));
  }

  function resolveHint(editing,active,panel){
    if(panel==='softPad'){
      return t('softPadAutoVsActiveHint')
        ||'键位跟随前台 Agent（Auto），与「正在使用」习惯不是同一个开关。';
    }
    // 编辑通用 + 使用中为应用场景
    if(!editing.id&&active.id){
      var activeM=mappingById(active.id);
      if(isAppScenarioMapping(activeM)){
        var tpl=t('habitChannelStripHintEditUniversalActiveApp')
          ||'你在改通用，{name} 仍在使用；未单独覆盖的语音/摄像头会沿用这里。';
        return tpl.replace('{name}',active.name||'—');
      }
    }
    return t('habitChannelStripHint')||'';
  }

  function resolveEditing(channel){
    var st=state()||{};
    var u=ui()||{};
    if(channel==='voice'){
      if(String(u.voiceEditSchemeId||'')==='__global__'||!String(st.selectedMappingId||'').trim()){
        return {id:null,name:universalLabel(),canActivate:false};
      }
    }
    if(channel==='camera'){
      if(String(u.cameraEditMode||'global')!=='appScenario'){
        return {id:null,name:universalLabel(),canActivate:false};
      }
      var camId=String(u.habitScenarioReturnId||st.selectedMappingId||'').trim();
      var camM=mappingById(camId);
      if(camM) return {id:camM.id,name:habitName(camM),canActivate:true};
      return {id:null,name:universalLabel(),canActivate:false};
    }
    var sel=String(st.selectedMappingId||'').trim();
    if(!sel) return {id:null,name:universalLabel(),canActivate:false};
    var m=mappingById(sel);
    if(!m) return {id:null,name:universalLabel(),canActivate:false};
    return {id:m.id,name:habitName(m),canActivate:true};
  }

  function resolveActive(){
    var cfg=(state()&&state().config)||{};
    var id='';
    if(global.OneToneSceneActivate&&global.OneToneSceneActivate.activeSceneId){
      id=String(global.OneToneSceneActivate.activeSceneId()||'').trim();
    }else{
      id=String(cfg.activeSceneId||'').trim();
    }
    var m=mappingById(id);
    if(!m) return {id:null,name:t('homeLiveUnset')||'—'};
    return {id:m.id,name:habitName(m)};
  }

  function ensureStrip(spec){
    var panel=$(spec.panelId);
    if(!panel) return null;
    var el=$(spec.stripId);
    if(el) return el;
    el=document.createElement('div');
    el.id=spec.stripId;
    el.className='habit-channel-status-strip';
    el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');
    el.innerHTML=
      '<div class="habit-channel-status-strip-main">'
      +'<div class="habit-channel-status-strip-lines">'
      +'<p class="habit-channel-status-strip-editing" data-strip-editing></p>'
      +'<p class="habit-channel-status-strip-active" data-strip-active></p>'
      +'<p class="habit-channel-status-strip-hint" data-strip-hint></p>'
      +'</div>'
      +'<button type="button" class="habit-channel-status-strip-btn" data-strip-activate hidden></button>'
      +'</div>';
    var before=$(spec.beforeId);
    if(before&&before.parentNode===panel){
      panel.insertBefore(el,before);
    }else{
      panel.insertBefore(el,panel.firstChild);
    }
    return el;
  }

  function paintStrip(spec){
    var el=ensureStrip(spec);
    if(!el) return;
    var editing=resolveEditing(spec.panel);
    var active=resolveActive();
    var editingTpl=t('habitChannelStripEditing')||'正在编辑：{name}';
    var activeTpl=t('habitChannelStripActive')||'正在使用：{name}';
    var hint=resolveHint(editing,active,spec.panel);
    var btnLbl=t('habitChannelStripSetActive')||t('homeWbHabitBarUse')||'设为正在使用';
    var editingEl=el.querySelector('[data-strip-editing]');
    var activeEl=el.querySelector('[data-strip-active]');
    var hintEl=el.querySelector('[data-strip-hint]');
    var btn=el.querySelector('[data-strip-activate]');
    if(editingEl) editingEl.textContent=editingTpl.replace('{name}',editing.name||'—');
    if(activeEl) activeEl.textContent=activeTpl.replace('{name}',active.name||'—');
    if(hintEl) hintEl.textContent=hint;
    if(btn){
      btn.textContent=btnLbl;
      var show=!!(editing.canActivate&&editing.id&&editing.id!==active.id);
      btn.hidden=!show;
      btn.setAttribute('data-mapping-id',editing.id||'');
    }
  }

  function render(){
    PANEL_HOSTS.forEach(paintStrip);
  }

  function onActivateClick(e){
    var btn=e.target&&e.target.closest&&e.target.closest('[data-strip-activate]');
    if(!btn||btn.hidden) return;
    e.preventDefault();
    var id=String(btn.getAttribute('data-mapping-id')||'').trim();
    if(!id) return;
    if(global.OneToneSceneActivate&&global.OneToneSceneActivate.activateScene){
      global.OneToneSceneActivate.activateScene(id);
    }else{
      var st=state();
      if(st&&st.config) st.config.activeSceneId=id;
      if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
    }
    render();
  }

  function bindOnce(){
    if(bound) return;
    bound=true;
    document.addEventListener('click',onActivateClick,true);
  }

  global.OneToneHabitChannelStatusStrip={
    render:render,
    bindOnce:bindOnce,
    resolveEditing:resolveEditing,
    resolveActive:resolveActive
  };
})((typeof window!=='undefined')?window:globalThis);
