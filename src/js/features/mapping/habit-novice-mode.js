(function(global){
  'use strict';

  var DIMS=[
    {id:'key',zh:'按键',en:'Keys',em:'⌨'},
    {id:'voice',zh:'语音',en:'Voice',em:'🎙'},
    {id:'cam',zh:'摄像头',en:'Camera',em:'📷'},
    {id:'softpad',zh:'Soft Pad',en:'Soft Pad',em:'⌘'}
  ];
  var SCENES=[
    {id:'begin',zh:'启动输入',en:'Start input'},
    {id:'end',zh:'结束与取消',en:'Finish and cancel'},
    {id:'general',zh:'通用',en:'General'}
  ];

  function shared(){ return global.OneToneHabitShared; }
  function cards(){ return global.OneToneHabitCardUtils; }
  function ui(){ return global.OneToneState&&global.OneToneState.ui||{}; }
  function state(){ return global.OneToneState&&global.OneToneState.state||{}; }
  function lang(){
    var value=global.OneToneI18n&&global.OneToneI18n.getLang?global.OneToneI18n.getLang():'zh';
    return String(value||'zh').toLowerCase().indexOf('en')===0?'en':'zh';
  }
  function t(key,fb){
    try{
      var v=global.OneToneI18n&&global.OneToneI18n.t?global.OneToneI18n.t(key):key;
      if(v&&v!==key) return v;
    }catch(_){}
    return fb!=null?fb:key;
  }
  function esc(v){ return String(v==null?'':v).replace(/[&<>'"]/g,function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]; }); }
  function label(item){ return item?(lang()==='en'?item.en:item.zh):''; }

  function allCards(model){
    var s=shared();
    if(!s||!s.buildNoviceCards) return [];
    return s.buildNoviceCards(model&&model.mappings||[]);
  }

  function filteredCards(model){
    var mappingId=model&&model.mapping?model.mapping.id:null;
    var dim=ui().habitNoviceDim||'key';
    var scene=ui().habitNoviceScene||'begin';
    return allCards(model).filter(function(card){
      return card.mappingId===mappingId&&card.dim===dim&&card.scene===scene;
    });
  }

  function countBy(model,field,value){
    var mappingId=model&&model.mapping?model.mapping.id:null;
    return allCards(model).filter(function(card){
      return card.mappingId===mappingId&&card[field]===value;
    }).length;
  }

  function dimTabsHtml(model){
    var dim=ui().habitNoviceDim||'key';
    return '<div class="habit-novice-dim-tabs" role="tablist">'+DIMS.map(function(d){
      var cnt=countBy(model,'dim',d.id);
      return '<button type="button" role="tab" aria-selected="'+(dim===d.id?'true':'false')+'" class="habit-novice-dim-tab'+(dim===d.id?' is-active':'')+'" data-habit-novice-dim="'+esc(d.id)+'">'+esc(d.em)+' '+esc(label(d))+' <span class="cnt">'+cnt+'</span></button>';
    }).join('')+'</div>';
  }

  function sceneChipsHtml(model){
    var scene=ui().habitNoviceScene||'begin';
    return '<div class="habit-novice-scene-chips"><span class="lbl">'+esc(t('habitNoviceSceneLabel','使用场景'))+'</span>'+SCENES.map(function(s){
      var cnt=countBy(model,'scene',s.id);
      return '<button type="button" class="habit-novice-scene-chip'+(scene===s.id?' is-active':'')+'" data-habit-novice-scene="'+esc(s.id)+'">'+esc(label(s))+' <span class="cnt">'+cnt+'</span></button>';
    }).join('')+'</div>';
  }

  function cardHtml(card,i){
    var s=shared();
    var story=s&&s.storyHtml?s.storyHtml(card,card.detail):'';
    var statusText=card.paused?t('habitNovicePaused','已暂停'):t('habitNoviceRunning','运行中');
    var lastMod=card.lastMod||t('habitNoviceUnknownTime','未知');
    return '<div class="habit-novice-card'+(card.paused?' is-paused':'')+'" data-habit-novice-card="'+esc(card.id)+'" style="animation-delay:'+(i*60)+'ms"><div class="habit-novice-illus dim-'+esc(card.dim)+'">'+esc(card.emoji)+'</div><div class="habit-novice-info"><div class="title-row"><div class="title">'+esc(card.title)+'</div><button type="button" class="status-dot" data-habit-novice-toggle="'+esc(card.id)+'" title="'+esc(t('habitNoviceToggleStatus','点一下切换'))+'" aria-label="'+esc(t('habitNoviceToggleStatus','点一下切换'))+'"></button><span class="when">'+esc(statusText)+' · '+esc(t('habitNoviceLastMod','上次改'))+' '+esc(lastMod)+'</span><button type="button" class="edit-all" data-habit-novice-edit="'+esc(card.mappingId)+'" title="'+esc(t('habitNoviceEditAll','完整改'))+'">⋯</button></div><div class="story">'+story+'</div></div><div class="habit-novice-right"><button type="button" class="habit-novice-btn primary" data-habit-novice-demo="'+esc(card.id)+'">▶ '+esc(t('habitNoviceTry','试一下'))+'</button><button type="button" class="habit-novice-btn ghost" data-habit-novice-del="'+esc(card.mappingId)+'">🗑 '+esc(t('habitNoviceDelete','删掉'))+'</button></div></div>';
  }

  function cardsListHtml(model){
    var list=filteredCards(model);
    if(!list.length){
      return '<div class="habit-novice-empty">'+esc(t('habitNoviceEmptyCategory','这一类还没有习惯，点下面加一个'))+'</div>';
    }
    return '<div class="habit-novice-cards">'+list.map(function(card,i){ return cardHtml(card,i); }).join('')+'<button type="button" class="habit-novice-add-inline" data-habit-add>＋ '+esc(t('habitNoviceAddInline','在这里加一个'))+'</button></div>';
  }

  function mainHtml(model){
    var s=shared();
    var name=s&&s.appName?s.appName(model.mapping):'—';
    var sub=s&&s.sceneName?s.sceneName(model.mapping):'';
    return '<main class="habit-novice-main"><div class="habit-novice-head"><div><div class="app-title">'+esc(name)+'</div><div class="app-sub">'+esc(sub)+'</div></div></div>'+dimTabsHtml(model)+sceneChipsHtml(model)+cardsListHtml(model)+'</main>';
  }

  function layoutHtml(model){
    var s=shared();
    return '<div class="habit-ws-layout habit-novice">'+(s&&s.appListHtml?s.appListHtml(model,{variant:'novice'}):'')+mainHtml(model)+'</div>';
  }

  function findCard(id){
    id=String(id||'');
    var parts=id.split('::');
    if(parts.length<3) return null;
    var s=shared();
    if(!s||!s.buildNoviceCards) return null;
    return s.buildNoviceCards((state().config&&state().config.mappings)||[]).find(function(c){ return c.id===id; })||null;
  }

  function toggleCardStatus(card){
    if(!card||!card.mapping) return;
    var m=card.mapping;
    if(card.channel==='key') m.keyModeEnabled=m.keyModeEnabled===false;
    else if(card.channel==='voice') m.voiceModeEnabled=m.voiceModeEnabled===false;
    else m.enabled=m.enabled===false;
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
  }

  function bindEvents(host,rerender){
    if(host.__habitNoviceBound) return;
    host.__habitNoviceBound=true;
    host.addEventListener('click',function(event){
      var target=event.target.closest&&event.target.closest('[data-habit-novice-dim],[data-habit-novice-scene],[data-habit-novice-demo],[data-habit-novice-del],[data-habit-novice-toggle],[data-habit-novice-edit],.chip');
      if(!target) return;
      if(target.hasAttribute('data-habit-novice-dim')){
        ui().habitNoviceDim=target.getAttribute('data-habit-novice-dim')||'key';
        rerender();
        return;
      }
      if(target.hasAttribute('data-habit-novice-scene')){
        ui().habitNoviceScene=target.getAttribute('data-habit-novice-scene')||'begin';
        rerender();
        return;
      }
      if(target.hasAttribute('data-habit-novice-demo')){
        var demoCard=findCard(target.getAttribute('data-habit-novice-demo'));
        if(demoCard&&cards()&&cards().openDemoOverlay) cards().openDemoOverlay(demoCard);
        return;
      }
      if(target.hasAttribute('data-habit-novice-del')){
        var delId=target.getAttribute('data-habit-novice-del');
        var cardEl=target.closest('.habit-novice-card');
        if(cardEl) cardEl.classList.add('is-deleting');
        setTimeout(function(){
          if(shared()&&shared().deleteMapping) shared().deleteMapping(delId);
        },280);
        return;
      }
      if(target.hasAttribute('data-habit-novice-toggle')){
        var toggleCard=findCard(target.getAttribute('data-habit-novice-toggle'));
        toggleCardStatus(toggleCard);
        rerender();
        return;
      }
      if(target.hasAttribute('data-habit-novice-edit')){
        var editId=target.getAttribute('data-habit-novice-edit');
        if(global.OneToneHabitScenarioWizard&&global.OneToneHabitScenarioWizard.openEdit){
          global.OneToneHabitScenarioWizard.openEdit(editId);
        }
        return;
      }
      if(target.classList&&target.classList.contains('chip')){
        var cardNode=target.closest('[data-habit-novice-card]');
        if(!cardNode) return;
        var chipType=target.getAttribute('data-chip')||'';
        var card=findCard(cardNode.getAttribute('data-habit-novice-card'));
        if(!card) return;
        if(chipType==='app'||chipType==='key'||chipType==='action'||chipType==='trigger'){
          if(global.OneToneActionNav&&global.OneToneActionNav.openChannelEditor){
            global.OneToneActionNav.openChannelEditor({mappingId:card.mappingId,channel:card.channel,focusId:card.detail&&card.detail.focus});
          }
        }
      }
    });
  }

  global.OneToneHabitNoviceMode={
    layoutHtml:layoutHtml,
    mainHtml:mainHtml,
    bindEvents:bindEvents,
    filteredCards:filteredCards,
    allCards:allCards
  };
})((typeof window!=='undefined')?window:globalThis);
