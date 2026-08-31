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

  function dimChannelIcon(dimId){
    var Icons=global.OneToneIcons;
    var map={key:'keys',voice:'voice',cam:'camera',softpad:'softPad'};
    var ch=map[dimId]||dimId;
    if(Icons&&Icons.channelHtml) return Icons.channelHtml(ch,{size:12,className:'ot-ic'});
    var d=DIMS.filter(function(x){return x.id===dimId;})[0];
    return esc(d&&d.em?d.em:'');
  }

  function dimTabsHtml(model){
    var dim=ui().habitNoviceDim||'key';
    return '<div class="habit-novice-dim-tabs" role="tablist">'+DIMS.map(function(d){
      var cnt=countBy(model,'dim',d.id);
      return '<button type="button" role="tab" aria-selected="'+(dim===d.id?'true':'false')+'" class="habit-novice-dim-tab'+(dim===d.id?' is-active':'')+'" data-habit-novice-dim="'+esc(d.id)+'">'+dimChannelIcon(d.id)+' '+esc(label(d))+' <span class="cnt">'+cnt+'</span></button>';
    }).join('')+'</div>';
  }

  function sceneChipsHtml(model){
    var scene=ui().habitNoviceScene||'begin';
    return '<div class="habit-novice-scene-chips"><span class="lbl">'+esc(t('habitNoviceSceneLabel','使用场景'))+'</span>'+SCENES.map(function(s){
      var cnt=countBy(model,'scene',s.id);
      return '<button type="button" class="habit-novice-scene-chip'+(scene===s.id?' is-active':'')+'" data-habit-novice-scene="'+esc(s.id)+'">'+esc(label(s))+' <span class="cnt">'+cnt+'</span></button>';
    }).join('')+'</div>';
  }

  function detailFieldRow(label,field,value,cardId){
    return '<div class="habit-novice-detail-row"><span class="habit-novice-detail-lbl">'+esc(label)+'</span><button type="button" class="habit-novice-detail-val" data-habit-novice-field="'+esc(field)+'" data-habit-novice-card="'+esc(cardId)+'">'+esc(value)+'</button></div>';
  }

  function cardDetailHtml(card){
    var s=shared();
    var fields=s&&s.noviceDetailFields?s.noviceDetailFields(card):{};
    var rows=[
      detailFieldRow(t('habitNoviceFieldTrigger','怎么触发'),'trigger',fields.trigger||'—',card.id),
      detailFieldRow(t('habitNoviceFieldAction','做什么'),'action',fields.action||'—',card.id),
      detailFieldRow(t('habitNoviceFieldFinish','完成方式'),'finish',fields.finish||'—',card.id),
      detailFieldRow(t('habitNoviceFieldEnabled','开了吗'),'enabled',fields.enabled||'—',card.id)
    ].join('');
    var lastMod=fields.lastMod?('<div class="habit-novice-detail-last">'+esc(t('habitNoviceFieldLastMod','上次修改'))+' '+esc(fields.lastMod)+'</div>'):'';
    var pro=fields.proMeta?('<div class="habit-novice-pro-meta">'+esc(fields.proMeta)+'</div>'):'';
    return '<div class="habit-novice-card-detail hidden" data-habit-novice-detail="'+esc(card.id)+'"><div class="habit-novice-detail-grid">'+rows+'</div>'+lastMod+pro+'</div>';
  }

  function cardHtml(card,i){
    var s=shared();
    var story=s&&s.storyLineHtml?s.storyLineHtml(card,card.detail):'';
    var statusText=card.paused?t('habitNovicePaused','已暂停'):t('habitNoviceRunning','运行中');
    return '<div class="habit-novice-card'+(card.paused?' is-paused':'')+'" data-habit-novice-card="'+esc(card.id)+'" style="animation-delay:'+(i*60)+'ms"><div class="habit-novice-illus dim-'+esc(card.dim)+'">'+(card.emoji||'')+'</div><div class="habit-novice-info"><div class="title-row"><div class="title">'+esc(card.title)+'</div><button type="button" class="status-dot" data-habit-novice-toggle="'+esc(card.id)+'" title="'+esc(t('habitNoviceToggleStatus','点一下切换'))+'" aria-label="'+esc(t('habitNoviceToggleStatus','点一下切换'))+'"></button><span class="when">'+esc(statusText)+'</span><details class="habit-novice-card-menu"><summary class="habit-novice-menu-btn" aria-label="'+esc(t('habitNoviceMenuMore','更多'))+'">⋯</summary><div class="habit-novice-menu-panel"><button type="button" data-habit-novice-edit="'+esc(card.mappingId)+'">'+esc(t('habitNoviceMenuEdit','完整改'))+'</button><button type="button" class="is-danger" data-habit-novice-del="'+esc(card.mappingId)+'">'+esc(t('habitNoviceMenuDelete','删掉'))+'</button></div></details></div><div class="story">'+esc(story)+'</div><button type="button" class="habit-novice-expand" data-habit-novice-expand="'+esc(card.id)+'">'+esc(t('habitNoviceExpandDetails','详情'))+'</button>'+cardDetailHtml(card)+'</div><div class="habit-novice-right"><button type="button" class="habit-novice-btn primary" data-habit-novice-demo="'+esc(card.id)+'">▶ '+esc(t('habitNoviceTry','试一下'))+'</button></div></div>';
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
    var mid=model&&model.mapping?model.mapping.id:'';
    var dim=ui().habitNoviceDim||'key';
    var usage='';
    var stats=global.OneToneHabitActionStats;
    if(stats&&stats.headKpiHtml&&mid) usage=stats.headKpiHtml(mid);
    var inherit=s&&s.inheritHintHtml?s.inheritHintHtml(model.mapping):'';
    var glance=s&&s.noviceDimGlanceHtml?s.noviceDimGlanceHtml(dim,model.mapping):'';
    return '<main class="habit-novice-main"><div class="habit-novice-head"><div><div class="app-title">'+esc(name)+'</div><div class="app-sub">'+esc(sub)+'</div></div>'+usage+'</div>'+inherit+dimTabsHtml(model)+glance+sceneChipsHtml(model)+cardsListHtml(model)+'</main>';
  }

  function layoutHtml(model){
    var s=shared();
    return '<div class="habit-ws-layout habit-novice">'+(s&&s.appListHtml?s.appListHtml(model,{variant:'novice'}):'')+mainHtml(model)+'</div>';
  }

  function findCard(id){
    id=String(id||'');
    var mappings=(state().config&&state().config.mappings)||[];
    var s=shared();
    if(!s||!s.buildNoviceCards) return null;
    return s.buildNoviceCards(mappings).find(function(c){ return c.id===id; })||null;
  }

  function fieldFocusId(card,field){
    var detail=card&&card.detail||{};
    if(field==='finish'&&card.channel==='key'&&card.itemId==='key-main') return 'keyFinishFlow';
    return detail.focus||'';
  }

  function openNoviceFieldEditor(card,field,anchor){
    if(!card) return;
    var utils=cards();
    if(utils&&utils.openFieldEditPopover){
      if(hostRef){
        hostRef.__habitPopoverCard=card;
        hostRef.__habitPopoverField=field;
      }
      utils.openFieldEditPopover(card,field,anchor);
      return;
    }
    if(global.OneToneActionNav&&global.OneToneActionNav.openChannelEditor){
      global.OneToneActionNav.openChannelEditor({mappingId:card.mappingId,channel:card.channel,focusId:fieldFocusId(card,field)});
    }
  }

  function toggleCardStatus(card){
    if(!card||!card.mapping) return;
    var m=card.mapping;
    if(card.channel==='key') m.keyModeEnabled=m.keyModeEnabled===false;
    else if(card.channel==='voice') m.voiceModeEnabled=m.voiceModeEnabled===false;
    else m.enabled=m.enabled===false;
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
  }
  function closePopover(){
    var utils=cards();
    if(utils&&utils.closePopover) utils.closePopover();
    if(hostRef) hostRef.__habitPopoverCard=null;
  }
  var hostRef=null;

  function bindEvents(host,rerender){
    if(host.__habitNoviceBound) return;
    host.__habitNoviceBound=true;
    host.addEventListener('click',function(event){
      if(event.target.closest&&event.target.closest('[data-habit-popover-go]')){
        var popCard=host.__habitPopoverCard;
        var popField=host.__habitPopoverField;
        closePopover();
        if(popCard&&global.OneToneActionNav&&global.OneToneActionNav.openChannelEditor){
          global.OneToneActionNav.openChannelEditor({mappingId:popCard.mappingId,channel:popCard.channel,focusId:fieldFocusId(popCard,popField)});
        }
        return;
      }
      var target=event.target.closest&&event.target.closest('[data-habit-novice-dim],[data-habit-novice-scene],[data-habit-novice-demo],[data-habit-novice-del],[data-habit-novice-toggle],[data-habit-novice-edit],[data-habit-novice-expand],[data-habit-novice-field],[data-habit-usage-peek],[data-habit-usage-export],[data-habit-inherit-peek]');
      if(!target) return;
      if(target.hasAttribute('data-habit-inherit-peek')){
        var s=shared();
        var m=state().config&&state().config.mappings?state().config.mappings.find(function(x){ return x&&x.id===state().selectedMappingId; }):null;
        var lines=s&&s.buildRuleRows?s.buildRuleRows(m,{channel:'all'}).filter(function(r){ return r.priority==='overridden'; }).map(function(r){ return r.txt; }):[];
        var msg=lines.length?lines.join(' · '):t('habitNoviceInheritAll','完全沿用通用设置');
        if(global.OneToneAppToast) global.OneToneAppToast.show(msg,'scheme');
        return;
      }
      if(target.hasAttribute('data-habit-usage-export')){
        var exportId=target.getAttribute('data-habit-usage-export');
        var api=global.OneToneHabitActionStats;
        if(api&&api.exportHabitDoc) api.exportHabitDoc(exportId,{}).catch(function(){});
        return;
      }
      if(target.hasAttribute('data-habit-usage-peek')){
        var peekId=target.getAttribute('data-habit-usage-peek');
        if(global.OneToneHabitUsageSheet&&global.OneToneHabitUsageSheet.open){
          global.OneToneHabitUsageSheet.open(peekId);
        }
        return;
      }
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
      if(target.hasAttribute('data-habit-novice-expand')){
        var expandId=target.getAttribute('data-habit-novice-expand');
        var expandCard=target.closest('.habit-novice-card');
        var detailEl=expandCard&&expandCard.querySelector('[data-habit-novice-detail="'+expandId+'"]');
        if(!expandCard||!detailEl) return;
        var open=!expandCard.classList.contains('is-open');
        expandCard.classList.toggle('is-open',open);
        detailEl.classList.toggle('hidden',!open);
        target.textContent=open?t('habitNoviceCollapseDetails','收起'):t('habitNoviceExpandDetails','详情');
        return;
      }
      if(target.hasAttribute('data-habit-novice-field')){
        var fieldCard=findCard(target.getAttribute('data-habit-novice-card'));
        openNoviceFieldEditor(fieldCard,target.getAttribute('data-habit-novice-field'),target);
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
