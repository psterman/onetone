(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  var GLOBAL_SCHEME_ID='__global__';

  function state(){
    return global.OneToneState.state;
  }

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function hp(){
    return global.OneToneHabitProfile;
  }

  function core(){
    return global.OneToneMappingCore;
  }

  function habitName(m){
    if(hp()&&hp().habitDisplayName) return hp().habitDisplayName(m);
    return (m&&m.group)||(m&&m.label)||(m&&m.id)||'—';
  }

  function voiceSchemes(cfg){
    cfg=cfg||{};
    if(!hp()||!Array.isArray(cfg.mappings)) return [];
    return cfg.mappings.filter(function(m){
      if(!m||!m.id) return false;
      if(!hp().hasVoiceParts(m,cfg)) return false;
      if(hp().hasKeyParts(m)) return false;
      return true;
    }).sort(function(a,b){
      return (a.order||0)-(b.order||0);
    });
  }

  function selectedSchemeId(cfg,schemes){
    cfg=cfg||{};
    schemes=schemes||[];
    var active=String(cfg.activeSceneId||'').trim();
    if(active&&schemes.some(function(m){ return m.id===active; })) return active;
    var sel=String(state().selectedMappingId||'').trim();
    if(sel&&schemes.some(function(m){ return m.id===sel; })) return sel;
    if(schemes.length) return schemes[0].id;
    return GLOBAL_SCHEME_ID;
  }

  function switchVoiceScheme(id){
    id=String(id||'').trim();
    if(!id||id===GLOBAL_SCHEME_ID) return;
    var st=state();
    if(!st) return;
    if(st.selectedMappingId===id&&st.config&&st.config.activeSceneId===id) return;
    st.selectedMappingId=id;
    if(global.OneToneSceneActivate&&global.OneToneSceneActivate.activateScene){
      global.OneToneSceneActivate.activateScene(id);
    }
    if(st.config) st.config.activeSceneId=id;
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save();
    }
    if(global.OneToneSchemeSwitchFeedback&&global.OneToneSchemeSwitchFeedback.refreshVoiceAfterSceneSwitch){
      global.OneToneSchemeSwitchFeedback.refreshVoiceAfterSceneSwitch();
    }
    if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
      global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
    }else{
      render();
    }
    var tab=$('voiceWorkflowTab-'+id);
    if(tab&&tab.scrollIntoView) tab.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
  }

  function renderTabs(vm){
    var tabs=$('voiceWorkflowTabs');
    var bar=$('voiceWorkflowTabsBar');
    var lbl=$('voiceWorkflowTabsLbl');
    var addBtn=$('btnVoiceSchemeAdd');
    if(lbl) lbl.textContent=t('voiceWorkflowTabsLbl');
    if(addBtn) addBtn.textContent=t('voiceSchemesAdd');
    if(!tabs) return;
    var cfg=state().config||{};
    var schemes=voiceSchemes(cfg);
    var selected=selectedSchemeId(cfg,schemes);
    if(bar) bar.hidden=false;
    if(!schemes.length){
      tabs.innerHTML='<button type="button" class="keys-workflow-tab voice-workflow-tab is-active" role="tab" aria-selected="true" id="voiceWorkflowTab-global" data-voice-scheme-id="'+GLOBAL_SCHEME_ID+'">'
        +'<span class="keys-workflow-tab-name">'+esc(t('voiceSchemeDefaultName').split('·')[0].trim())+'</span>'
        +'</button>';
      return;
    }
    tabs.innerHTML=schemes.map(function(m){
      var isSel=m.id===selected;
      var isDraft=core()&&core().isIncomplete&&core().isIncomplete(m);
      var draftBadge=core()&&core().isDraft&&core().isDraft(m)?t('homeLiveSchemeDraft'):t('keySchemeCompletenessIncomplete');
      return '<button type="button" class="keys-workflow-tab voice-workflow-tab'+(isSel?' is-active':'')+(isDraft?' is-draft':'')+'" role="tab" aria-selected="'+(isSel?'true':'false')+'" id="voiceWorkflowTab-'+esc(m.id)+'" data-voice-scheme-id="'+esc(m.id)+'">'
        +'<span class="keys-workflow-tab-name">'+esc(habitName(m))+'</span>'
        +(isDraft?'<span class="keys-workflow-tab-draft">'+esc(draftBadge)+'</span>':'')
        +'</button>';
    }).join('');
  }

  function bind(){
    var bar=$('voiceWorkflowTabsBar');
    if(!bar||bar.dataset.voiceSchemesBound==='1') return;
    bar.dataset.voiceSchemesBound='1';
    bar.addEventListener('click',function(e){
      var tab=e.target.closest&&e.target.closest('[data-voice-scheme-id]');
      if(tab){
        e.preventDefault();
        switchVoiceScheme(tab.getAttribute('data-voice-scheme-id'));
        return;
      }
      var add=e.target.closest&&e.target.closest('#btnVoiceSchemeAdd');
      if(add){
        e.preventDefault();
        if(global.OneToneHabitHub&&global.OneToneHabitHub.createFromVoice){
          var m=global.OneToneHabitHub.createFromVoice();
          if(m&&m.id) switchVoiceScheme(m.id);
        }
      }
    });
    var tabs=$('voiceWorkflowTabs');
    if(tabs){
      tabs.addEventListener('keydown',function(e){
        if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'&&e.key!=='Home'&&e.key!=='End') return;
        var tabBtns=Array.prototype.slice.call(tabs.querySelectorAll('[role="tab"]'));
        if(!tabBtns.length) return;
        var idx=tabBtns.findIndex(function(btn){ return btn.getAttribute('aria-selected')==='true'; });
        if(idx<0) idx=0;
        if(e.key==='Home') idx=0;
        else if(e.key==='End') idx=tabBtns.length-1;
        else if(e.key==='ArrowRight') idx=Math.min(tabBtns.length-1,idx+1);
        else if(e.key==='ArrowLeft') idx=Math.max(0,idx-1);
        e.preventDefault();
        var next=tabBtns[idx];
        if(next) switchVoiceScheme(next.getAttribute('data-voice-scheme-id')||'');
      });
    }
  }

  function render(vm){
    renderTabs(vm);
  }

  bind();

  global.OneToneVoiceSchemesUi={
    render:render,
    voiceSchemes:voiceSchemes,
    selectedSchemeId:selectedSchemeId,
    switchVoiceScheme:switchVoiceScheme,
    GLOBAL_SCHEME_ID:GLOBAL_SCHEME_ID
  };
})((typeof window!=='undefined')?window:globalThis);
