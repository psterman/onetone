(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var state=function(){ return global.OneToneState.state; };
  var ui=function(){ return global.OneToneState.ui; };
  function t(key){ return global.OneToneI18n.t(key); }
  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function selectedMapping(){
    var st=state();
    if(!st.config||!Array.isArray(st.config.mappings)) return null;
    return st.config.mappings.find(function(m){ return m.id===st.selectedMappingId; })||null;
  }

  function phrasesToText(arr){
    return Array.isArray(arr)?arr.join('\n'):'';
  }

  function textToPhrases(text){
    return String(text||'').split(/\r?\n/).map(function(s){ return s.trim(); }).filter(Boolean);
  }

  function fieldMode(ov,field){
    if(!ov) return 'global';
    if(field==='targetKey') return ov.targetKey&&String(ov.targetKey).trim()?'custom':'global';
    if(field==='wakePhrases') return ov.wakePhrases&&ov.wakePhrases.length?'custom':'global';
    if(field==='endPhrasesZh') return ov.endPhrases&&ov.endPhrases.zh&&ov.endPhrases.zh.length?'custom':'global';
    if(field==='endPhrasesEn') return ov.endPhrases&&ov.endPhrases.en&&ov.endPhrases.en.length?'custom':'global';
    return 'global';
  }

  function ensureOverride(mapping){
    if(!mapping.voiceOverride) mapping.voiceOverride=null;
  }

  function normalizeOverride(mapping){
    var ov=mapping.voiceOverride;
    if(!ov) return;
    var empty=!((ov.targetKey&&String(ov.targetKey).trim())
      ||(ov.wakePhrases&&ov.wakePhrases.length)
      ||(ov.endPhrases&&((ov.endPhrases.zh&&ov.endPhrases.zh.length)||(ov.endPhrases.en&&ov.endPhrases.en.length))));
    if(empty) mapping.voiceOverride=null;
  }

  function setFieldMode(mapping,field,mode){
    ensureOverride(mapping);
    var ov=mapping.voiceOverride;
    if(mode==='global'){
      if(!ov){ normalizeOverride(mapping); return; }
      if(field==='targetKey') delete ov.targetKey;
      else if(field==='wakePhrases') delete ov.wakePhrases;
      else if(field==='endPhrasesZh'&&ov.endPhrases) delete ov.endPhrases.zh;
      else if(field==='endPhrasesEn'&&ov.endPhrases) delete ov.endPhrases.en;
      if(ov.endPhrases&&!ov.endPhrases.zh&&!ov.endPhrases.en) delete ov.endPhrases;
      normalizeOverride(mapping);
      return;
    }
    if(!mapping.voiceOverride) mapping.voiceOverride={};
    ov=mapping.voiceOverride;
    var cfg=state().config;
    if(field==='targetKey'&&!ov.targetKey){
      ov.targetKey=global.OneToneSceneConfig.globalVoiceTargetKey(cfg);
    }
    if(field==='wakePhrases'&&!ov.wakePhrases){
      ov.wakePhrases=global.OneToneSceneConfig.globalWakePhrases(cfg).slice();
    }
    if(field==='endPhrasesZh'){
      if(!ov.endPhrases) ov.endPhrases={zh:[],en:[]};
      if(!ov.endPhrases.zh||!ov.endPhrases.zh.length){
        ov.endPhrases.zh=global.OneToneSceneConfig.globalEndPhrases(cfg).zh.slice();
      }
    }
    if(field==='endPhrasesEn'){
      if(!ov.endPhrases) ov.endPhrases={zh:[],en:[]};
      if(!ov.endPhrases.en||!ov.endPhrases.en.length){
        ov.endPhrases.en=global.OneToneSceneConfig.globalEndPhrases(cfg).en.slice();
      }
    }
  }

  function renderFieldRow(field,label,value,mode){
    var customHidden=mode!=='custom'?' hidden':'';
    var inputType=field==='targetKey'?'text':'textarea';
    var inputValue=field==='targetKey'?esc(value):esc(value);
    var html='<div class="scene-voice-field" data-voice-field="'+field+'">';
    html+='<div class="scene-voice-field-head"><span class="scene-voice-field-label">'+esc(label)+'</span>';
    html+='<div class="scene-voice-mode-toggle" role="group">';
    html+='<button type="button" class="scene-voice-mode-btn'+(mode==='global'?' is-active':'')+'" data-voice-mode="global" data-field="'+field+'">'+t('sceneVoiceUseGlobal')+'</button>';
    html+='<button type="button" class="scene-voice-mode-btn'+(mode==='custom'?' is-active':'')+'" data-voice-mode="custom" data-field="'+field+'">'+t('sceneVoiceUseCustom')+'</button>';
    html+='</div></div>';
    if(inputType==='textarea'){
      html+='<textarea class="scene-voice-input scene-voice-textarea'+customHidden+'" data-voice-input="'+field+'" rows="3"'+customHidden+'>'+inputValue+'</textarea>';
    }else{
      html+='<input type="text" class="scene-voice-input'+customHidden+'" data-voice-input="'+field+'" value="'+inputValue+'"'+customHidden+'>';
    }
    html+='</div>';
    return html;
  }

  function render(){
    var root=$('sceneVoicePanelBody');
    var panel=$('sceneVoicePanel');
    if(!root||!panel) return;
    var visible=ui().drawerOpen
      &&(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.isHabitsPanel
        ?global.OneToneSettingsDrawer.isHabitsPanel()
        :ui().settingsPanel==='habits')
      &&(ui().habitLayer||'global')==='advanced';
    panel.hidden=!visible;
    if(!visible) return;
    var mapping=selectedMapping();
    var cfg=state().config;
    if(!mapping||!cfg){
      root.innerHTML='<p class="scene-voice-empty">'+esc(t('sceneVoicePickMapping'))+'</p>';
      return;
    }
    if(!global.OneToneMappingCore.isSaved(mapping)){
      root.innerHTML='<p class="scene-voice-empty">'+esc(t('sceneVoiceNeedComplete'))+'</p>';
      return;
    }
    var ov=mapping.voiceOverride||null;
    var html='<p class="scene-voice-desc">'+esc(t('sceneVoiceOverrideDesc'))+'</p>';
    html+=renderFieldRow('targetKey',t('sceneVoiceTargetKey'),
      fieldMode(ov,'targetKey')==='custom'&&ov?String(ov.targetKey||''):'',
      fieldMode(ov,'targetKey'));
    html+=renderFieldRow('wakePhrases',t('sceneVoiceWakePhrases'),
      fieldMode(ov,'wakePhrases')==='custom'&&ov?phrasesToText(ov.wakePhrases):'',
      fieldMode(ov,'wakePhrases'));
    html+=renderFieldRow('endPhrasesZh',t('sceneVoiceEndPhrasesZh'),
      fieldMode(ov,'endPhrasesZh')==='custom'&&ov&&ov.endPhrases?phrasesToText(ov.endPhrases.zh):'',
      fieldMode(ov,'endPhrasesZh'));
    html+=renderFieldRow('endPhrasesEn',t('sceneVoiceEndPhrasesEn'),
      fieldMode(ov,'endPhrasesEn')==='custom'&&ov&&ov.endPhrases?phrasesToText(ov.endPhrases.en):'',
      fieldMode(ov,'endPhrasesEn'));
    html+='<p class="scene-voice-preview-hint">'+esc(t('sceneVoicePreviewHint'))+'</p>';
    root.innerHTML=html;
    var title=$('sceneVoicePanelTitle');
    if(title) title.textContent=t('sceneVoiceOverrideTitle');
  }

  function persistMappingVoice(){
    global.OneToneConfigPersist.save();
    render();
    if(global.OneToneSceneTabs) global.OneToneSceneTabs.render();
  }

  function applyInputValue(mapping,field,input){
    setFieldMode(mapping,field,'custom');
    var ov=mapping.voiceOverride;
    if(!ov) return;
    if(field==='targetKey'){
      ov.targetKey=String(input.value||'').trim();
    }else if(field==='wakePhrases'){
      ov.wakePhrases=textToPhrases(input.value);
    }else if(field==='endPhrasesZh'){
      if(!ov.endPhrases) ov.endPhrases={zh:[],en:[]};
      ov.endPhrases.zh=textToPhrases(input.value);
    }else if(field==='endPhrasesEn'){
      if(!ov.endPhrases) ov.endPhrases={zh:[],en:[]};
      ov.endPhrases.en=textToPhrases(input.value);
    }
    normalizeOverride(mapping);
    persistMappingVoice();
  }

  function bindEvents(){
    var panel=$('sceneVoicePanel');
    if(!panel) return;
    panel.addEventListener('click',function(e){
      var modeBtn=e.target.closest&&e.target.closest('[data-voice-mode]');
      if(!modeBtn) return;
      var mapping=selectedMapping();
      if(!mapping) return;
      setFieldMode(mapping,modeBtn.dataset.field,modeBtn.dataset.voiceMode);
      persistMappingVoice();
    });
    panel.addEventListener('change',function(e){
      var input=e.target.closest&&e.target.closest('[data-voice-input]');
      if(!input) return;
      var mapping=selectedMapping();
      if(!mapping) return;
      applyInputValue(mapping,input.dataset.voiceInput,input);
    });
    panel.addEventListener('blur',function(e){
      var input=e.target.closest&&e.target.closest('[data-voice-input]');
      if(!input||input.tagName!=='TEXTAREA') return;
      var mapping=selectedMapping();
      if(!mapping) return;
      applyInputValue(mapping,input.dataset.voiceInput,input);
    },true);
  }

  global.OneToneSceneVoiceTab={render:render,bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
