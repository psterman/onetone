(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };

  /** Beginner titles / copy — same slots as design-mock + keys-channel Cursor catalogue. */
  var KEY_META={
    stopOrSend:{title:'发出去',when:'输入框里写好了，要交给 AI。',effect:'在输入框里发送（一般是回车）。'},
    newThread:{title:'新开一局对话',when:'当前对话太乱，想重新开一局。',effect:'新开一条对话。'},
    quickSearch:{title:'搜文件',when:'想快速打开某个文件。',effect:'打开快速打开（Quick Open）。'},
    commandPalette:{title:'打开命令菜单',when:'想搜 Cursor / VS Code 里的任意命令。',effect:'打开命令面板，可搜索执行。'},
    quickChat:{title:'打开侧边聊天',when:'想拉开 Cursor 侧边 Chat / Agent。',effect:'打开侧边聊天。'},
    inlineEdit:{title:'行内编辑',when:'选中代码后想就地改。',effect:'打开行内编辑。'},
    acceptTab:{title:'接受补全',when:'Cursor 给出灰色补全，你想收下。',effect:'接受当前 Tab 建议。'},
    modeMenu:{title:'切模式',when:'想换 Agent / Ask / Edit 等工作方式。',effect:'打开 Mode Menu。'},
    plan:{title:'定计划',when:'想先想清楚再动手。',effect:'切到计划模式（若快捷键可用）。'},
    switchAgent:{title:'开工',when:'计划好了，要 Agent 动手改。',effect:'切到 Agent 模式。'},
    cancel:{title:'取消',when:'生成跑偏了，想停住。',effect:'停住当前生成。'},
    pushToTalk:{title:'开始语音打字',when:'要对着 Cursor 输入框说一大段需求时。',effect:'打开语音输入，字进当前输入框。'},
    continue:{title:'让 AI 继续',when:'AI 停住等你，或你要它接着干下一步。',effect:'往对话里送一句「继续」。'},
    summarizeDiff:{title:'总结改动',when:'改了一堆，想让 AI 用一句话概括。',effect:'塞入总结用的提示句。'},
    runChecks:{title:'跑测试',when:'想让 AI 帮你想检查 / 测试步骤。',effect:'塞入检查提示（不直接跑终端）。'},
    focusComposer:{title:'回到 Cursor 输入框',when:'人在别的软件里，要回到 Cursor 继续写。',effect:'切回 Cursor，并尽量点到输入框。'},
    paste:{title:'粘贴进来',when:'剪贴板或截图要贴进 Cursor。',effect:'聚焦后粘贴。'},
    pasteAndSend:{title:'粘贴发送',when:'剪贴板内容要贴进去并发走。',effect:'粘贴并发送。'},
    nextChange:{title:'下一处改动',when:'在看 diff，想跳到下一处。',effect:'跳到下一处。'},
    prevChange:{title:'上一处改动',when:'在看 diff，想跳回上一处。',effect:'跳到上一处。'},
    acceptChanges:{title:'接受改动',when:'确认当前这一处建议。',effect:'接受当前改动。'},
    acceptAllChanges:{title:'全部接受',when:'整批建议都想收下。',effect:'接受全部建议改动。'},
    toggleSidebar:{title:'切换边栏',when:'想腾出或收回侧边栏。',effect:'显示或隐藏边栏。'},
    openSettings:{title:'打开设置',when:'要改 Cursor / 编辑器设置。',effect:'打开设置页。'},
    navBack:{title:'返回',when:'想回到上一页或上一处导航。',effect:'后退。'},
    navForward:{title:'前进',when:'想回到刚才前进过的地方。',effect:'前进。'},
    openTerminal:{title:'打开终端',when:'要跑命令。',effect:'打开终端。'},
    undo:{title:'撤销',when:'刚做错一步。',effect:'撤销。'},
    openAgent:{title:'聚焦应用',when:'要从别的软件切回来。',effect:'打开或聚焦当前应用。'},
    'input.start':{title:'开始语音打字',when:'想用嘴打字。',effect:'打开语音输入。'},
    'input.cancel':{title:'取消',when:'说到一半说错了。',effect:'马上停掉。'},
    'input.commit':{title:'发出去',when:'输入框里写好了。',effect:'把内容发出去。'},
    'input.send':{title:'发出去',when:'输入框里写好了。',effect:'把内容发出去。'},
    'app.open':{title:'打开应用',when:'人在其他软件里，要回到正用的应用。',effect:'打开或切到该应用。'},
    'app.shortcut':{title:'快捷键',when:'想用说话触发这个快捷键。',effect:'等于按下该组合键。'}
  };

  var KEY_COMMON=[
    'pushToTalk','continue','stopOrSend','focusComposer','newThread','paste',
    'quickChat','commandPalette','summarizeDiff','runChecks'
  ];

  var KEY_GROUPS=[
    {id:'common',title:'常用',slots:KEY_COMMON},
    {id:'native',title:'快捷键能做',slots:['stopOrSend','newThread','quickSearch','commandPalette']},
    {id:'editor',title:'边写边用',slots:['quickChat','inlineEdit','acceptTab','modeMenu','toggleSidebar','openSettings','navBack','navForward','openTerminal','undo']},
    {id:'seeded',title:'切工作方式',slots:['plan','switchAgent','cancel']},
    {id:'inject',title:'说话与塞话',slots:['pushToTalk','continue','summarizeDiff','runChecks','pasteAndSend','input.start']},
    {id:'wrapup',title:'收尾',slots:['focusComposer','paste','nextChange','prevChange','acceptChanges','acceptAllChanges','stopOrSend','input.commit','input.send']},
    {id:'other',title:'其它',slots:[]}
  ];

  var APP_PILL={
    'cursor-chat':'Cursor',
    'codex-chat':'Codex',
    'claude-code':'Claude',
    'workbuddy-chat':'WorkBuddy',
    'trae-chat':'Trae',
    'trae-work':'Trae Work',
    'trae-code':'Trae Code',
    'qoder-chat':'Qoder',
    'minimax-chat':'MiniMax',
    'windsurf-chat':'Windsurf'
  };

  function currentMapping(){
    var hdr=global.OneToneVoicePageHeaderRender;
    if(hdr&&hdr.resolveScopeMapping) return hdr.resolveScopeMapping(null);
    var core=global.OneToneMappingCore;
    var st=global.OneToneState&&global.OneToneState.state?global.OneToneState.state:{};
    var id=String(st.selectedMappingId||(st.config&&st.config.activeSceneId)||'').trim();
    return id&&core&&core.byId?core.byId(id):null;
  }

  function mappingId(){
    var m=currentMapping();
    return m&&m.id?String(m.id):'';
  }

  function padSlotSet(m){
    var set={};
    var keys=m&&m.codexMicroPad&&m.codexMicroPad.keys;
    if(!keys) return set;
    keys.forEach(function(k){
      if(k&&k.slotId) set[String(k.slotId)]=true;
    });
    return set;
  }

  function isSoftPadVoice(b,padSlots){
    var sid=String(b.slotId||'');
    if(sid.indexOf('semantic:softPad:')===0) return true;
    return !!(padSlots[sid]||padSlots[String(b.actionId||'')]);
  }

  function isCameraVoice(b){
    return String(b.slotId||'').indexOf('semantic:camera:')===0;
  }

  function slotKey(b){
    return String(b.slotId||b.actionId||'').trim();
  }

  function agentLabel(m,sid,aid){
    var AA=global.OneToneAgentActions;
    if(!AA) return '';
    try{
      if(AA.labelForSlotForMapping&&sid){
        var L=String(AA.labelForSlotForMapping(m,sid)||'').trim();
        if(L) return L;
      }
      if(AA.actionById&&aid){
        var a=AA.actionById(aid);
        if(a){
          var en=false;
          try{
            if(global.OneToneI18n&&global.OneToneI18n.lang) en=/^en/i.test(String(global.OneToneI18n.lang()));
          }catch(_e){}
          return String(en?a.labelEn:a.labelZh||'').trim();
        }
      }
    }catch(_e2){}
    return '';
  }

  function looksLikeId(s){
    return /^[a-z][a-zA-Z0-9.]*$/.test(String(s||''))&&/[A-Z.]/.test(s);
  }

  function pickCopy(actionId,name){
    var id=String(actionId||'');
    var meta=KEY_META[id]||KEY_META[String(name||'')];
    if(meta) return {when:meta.when,effect:meta.effect};
    var nm=String(name||'');
    if(id==='app.open'||id.indexOf('app.open')===0){
      return {when:'人在其他软件里，要回到正用的应用继续干。',effect:'打开或切到该应用。'};
    }
    if(id==='app.shortcut'){
      return {when:'想用说话触发这个快捷键。',effect:'等于按下该组合键。'};
    }
    if(/continue/i.test(id)||/继续/.test(nm)){
      return {when:'AI 停住等你，或你要它接着干下一步。',effect:'告诉当前 AI：继续。'};
    }
    if(/newThread|new.?chat|新会话|新建/i.test(id+' '+nm)){
      return {when:'当前对话太乱，想重新开一局干净的。',effect:'新开一条对话。'};
    }
    if(/cancel|取消|Disarm/i.test(id+' '+nm)){
      return {when:'说到一半说错了，或这轮不想要了。',effect:'马上停掉，这轮内容不当真发出去。'};
    }
    if(/Arm|小助手/i.test(id+' '+nm)){
      return {when:'想打开小助手帮忙。',effect:'启动助手相关动作。'};
    }
    if(/pasteAndSend|粘贴发送/i.test(id+' '+nm)){
      return {when:'剪贴板内容要贴进去并发走。',effect:'粘贴并发送。'};
    }
    if(/send|发送|发出去|commit/i.test(id+' '+nm)){
      return {when:'输入框里写好了，要交给 AI。',effect:'在输入框里发送（一般是回车）。'};
    }
    return {when:'想用说话触发这件事。',effect:'执行「'+(nm||'该动作')+'」。'};
  }

  function bindingTitle(b,chord,m){
    var sid=slotKey(b);
    var aid=String(b.actionId||'').trim();
    var meta=KEY_META[sid]||KEY_META[aid];
    if(meta&&meta.title) return meta.title;
    var fromAgent=agentLabel(m||currentMapping(),sid,aid);
    if(fromAgent) return fromAgent;
    var custom=String(b.title||b.label||'').trim();
    if(custom&&!looksLikeId(custom)) return custom;
    if(aid==='app.shortcut'&&chord) return '快捷键 '+chord;
    if(custom) return custom;
    return sid||aid||'动作';
  }

  function scopePillText(m){
    if(!m) return '—';
    var name=String(m.name||'').trim();
    if(name&&!looksLikeId(name)&&name.indexOf('-')<0) return name;
    var app=String(m.appTargetId||'').trim();
    if(APP_PILL[app]) return APP_PILL[app];
    if(name) return name;
    return app||'—';
  }

  function rowIdentity(b){
    var inst=String(b.actionInstanceId||'').trim();
    var sid=String(b.slotId||'').trim();
    var aid=String(b.actionId||'').trim();
    if(inst) return aid+'#'+inst;
    if(sid) return sid;
    if(b.triggerType==='key') return aid+'|key|'+String(b.triggerBinding||'');
    return aid||'';
  }

  function catalogSlotOf(row){
    var sid=String(row.slotId||'').trim();
    var aid=String(row.actionId||'').trim();
    var bare=sid.replace(/^semantic:[^:]+:/,'');
    var aliases={
      'agent.continue':'continue',
      continue:'continue',
      'cursorBeginnerDisarm':'cancel',
      'cursorBeginnerArm':'openAgent',
      pasteAndSend:'pasteAndSend',
      'input.start':'pushToTalk',
      'input.cancel':'cancel',
      'input.commit':'stopOrSend',
      'input.send':'stopOrSend',
      'app.open':'openAgent'
    };
    if(KEY_META[sid]) return sid;
    if(KEY_META[bare]) return bare;
    if(aliases[aid]) return aliases[aid];
    if(aliases[sid]) return aliases[sid];
    if(aliases[bare]) return aliases[bare];
    if(KEY_META[aid]) return aid;
    return sid||aid;
  }

  /** Hero channel for Keys-catalogue claims — input.* / pushToTalk are voice, not cursor. */
  function claimChannelForRow(row){
    if(!row) return 'cursor';
    if(row.customKey) return 'key';
    var sid=String(row.slotId||row.actionId||'').trim();
    var act=String(row.actionId||row.slotId||'').trim();
    if(sid.indexOf('semantic:camera:')===0) return 'camera';
    if(sid.indexOf('semantic:softPad:')===0) return 'softPad';
    if(act.indexOf('input.')===0||sid.indexOf('input.')===0||act==='pushToTalk'||sid==='pushToTalk'){
      return 'voice';
    }
    return 'cursor';
  }

  function groupIdsCovered(){
    var set={};
    KEY_GROUPS.forEach(function(g){
      if(g.id==='other') return;
      (g.slots||[]).forEach(function(s){ set[s]=true; });
    });
    return set;
  }

  /* Seed design catalog (same slots as keys「软件自带」/常用), then overlay live bindings.
   * Camera bridge already always lists CAM_META; keys used to only list chorded agentBindings —
   * so the voice「按键」face looked empty even when keys page had a full action catalog. */
  function seedCatalogRows(byId,order){
    KEY_GROUPS.forEach(function(g){
      (g.slots||[]).forEach(function(slot){
        var sid=String(slot||'').trim();
        if(!sid||byId[sid]) return;
        var meta=KEY_META[sid]||{};
        var copy=pickCopy(sid,sid);
        byId[sid]={
          id:sid,
          actionId:sid,
          slotId:sid,
          actionInstanceId:'',
          phrase:'',
          chord:'',
          enabled:true,
          title:meta.title||sid,
          when:copy.when||meta.when||'',
          effect:copy.effect||meta.effect||'',
          fromCatalog:true
        };
        order.push(sid);
      });
    });
  }

  function seedCustomKeyRows(byId,order){
    var P=global.OneToneKeysChannelCommandPicker;
    if(!P) return;
    var m=currentMapping();
    var list=[];
    try{
      if(P.catalogCustomKeysForApp) list=P.catalogCustomKeysForApp(m,'')||[];
      else if(P.listCustomKeyMappingsForCurrentApp){
        list=(P.listCustomKeyMappingsForCurrentApp()||[]).map(function(ck){
          var n=Array.isArray(ck.targetActions)?ck.targetActions.length:0;
          return {
            mappingId:String(ck.id||''),
            name:(P.customKeyMatchDisplayName&&P.customKeyMatchDisplayName(ck))||ck.name||ck.label||'我录的键',
            chord:String(ck.triggerKey||'').trim(),
            stepCount:n,
            note:''
          };
        });
      }
    }catch(_e){ return; }
    list.forEach(function(ck){
      if(!ck||!ck.mappingId) return;
      var id='customKey:'+String(ck.mappingId);
      if(byId[id]) return;
      var chord=String(ck.chord||'').trim();
      var title=String(ck.name||'我录的键').trim();
      var steps=Number(ck.stepCount)||0;
      var stepLab=steps>0?(steps+' 步'):'尚无动作';
      var effect=chord
        ?('触发键 '+chord+' · '+stepLab)
        :('待录触发键 · '+stepLab);
      byId[id]={
        id:id,
        actionId:'runTargetSequence',
        slotId:'runTargetSequence',
        actionInstanceId:String(ck.mappingId),
        phrase:'',
        chord:chord,
        enabled:true,
        title:title,
        when:'点选后加载到当前习惯 · 步骤与触发键在按键页改。',
        effect:effect,
        stepCount:steps,
        fromCatalog:true,
        customKey:true,
        matchMappingId:String(ck.mappingId)
      };
      order.push(id);
    });
  }

  /** Habit currently using this 我录的键 as 02 recognition. */
  function appliedCustomKeyMatchId(){
    var m=currentMapping();
    if(!m) return '';
    var ref=m.captureHeroRef;
    if(ref&&String(ref.kind||'').toLowerCase()==='customkey'){
      return String(ref.bindingRef||'').trim();
    }
    return '';
  }

  /* One row per action; voice attaches by slotId / actionInstanceId. */
  function listRows(phraseOnly){
    var m=currentMapping();
    if(!m) return [];
    var padSlots=padSlotSet(m);
    var byId={};
    var order=[];
    var customOnly=listMode==='customKey';

    if(customOnly){
      seedCustomKeyRows(byId,order);
    }else{
      seedCatalogRows(byId,order);
      /* Fill default chords so full-width cards match Keys page density. */
      var A=global.OneToneAgentActions;
      var PadUi=global.OneToneCodexMicroPadUi;
      order.forEach(function(id){
        var row=byId[id];
        if(!row||String(row.chord||'').trim()) return;
        var ch='';
        try{
          if(PadUi&&PadUi.chordForSlot) ch=String(PadUi.chordForSlot(m,row.slotId||id)||'').trim();
        }catch(_c){}
        if(!ch&&A&&A.defaultKeyForMapping){
          try{ ch=String(A.defaultKeyForMapping(m,row.slotId||id)||'').trim(); }catch(_d){}
        }
        if(!ch&&A&&A.defaultKeyForSlot){
          try{ ch=String(A.defaultKeyForSlot(row.slotId||id)||'').trim(); }catch(_e){}
        }
        if(ch) row.chord=ch;
      });
    }

    function ensureFromKey(b){
      if(isSoftPadVoice(b,padSlots)) return null;
      var id=rowIdentity(b);
      if(!id) return null;
      var chord=String(b.triggerBinding||'').trim();
      var title=bindingTitle(b,chord,m);
      var copy=pickCopy(b.actionId||b.slotId,title);
      if(!byId[id]){
        if(customOnly) return null;
        byId[id]={
          id:id,
          actionId:b.actionId||b.slotId,
          slotId:b.slotId||b.actionId,
          actionInstanceId:b.actionInstanceId||'',
          phrase:'',
          chord:chord,
          enabled:true,
          title:title,
          when:copy.when,
          effect:copy.effect,
          fromCatalog:false
        };
        order.push(id);
      }else{
        var row=byId[id];
        if(chord) row.chord=chord;
        if(title) row.title=title;
        if(b.actionInstanceId) row.actionInstanceId=b.actionInstanceId;
        row.fromCatalog=false;
      }
      return byId[id];
    }

    if(!customOnly){
      ((m.agentBindings)||[]).forEach(function(b){
        if(!b||b.triggerType!=='key') return;
        if(!String(b.triggerBinding||'').trim()) return;
        ensureFromKey(b);
      });
    }

    ((m.agentBindings)||[]).forEach(function(b){
      if(!b||b.triggerType!=='voice') return;
      if(isCameraVoice(b)) return;
      if(isSoftPadVoice(b,padSlots)) return;
      var phrase=String(b.triggerBinding||b.phrase||'').trim();
      if(!phrase) return;
      var inst=String(b.actionInstanceId||'').trim();
      var sid=String(b.slotId||'').trim();
      var aid=String(b.actionId||'').trim();
      var hit=null;
      if(inst&&byId['customKey:'+inst]) hit=byId['customKey:'+inst];
      if(!hit&&inst&&byId[aid+'#'+inst]) hit=byId[aid+'#'+inst];
      if(!hit&&sid&&byId[sid]) hit=byId[sid];
      if(!hit&&aid&&byId[aid]) hit=byId[aid];
      if(!hit){
        hit=order.map(function(id){ return byId[id]; }).find(function(r){
          return String(r.actionId)===aid&&!r.phrase;
        })||null;
      }
      if(!hit){
        // 我录的键 mode: never invent catalog rows from stray voice bindings.
        if(customOnly) return;
        var id=rowIdentity(b)||('voice:'+aid+':'+phrase);
        var title=bindingTitle(b,'',m);
        var copy=pickCopy(aid,title);
        hit={
          id:id,
          actionId:aid||sid,
          slotId:sid||aid,
          actionInstanceId:inst,
          phrase:'',
          chord:'',
          enabled:true,
          title:title,
          when:copy.when,
          effect:copy.effect,
          fromCatalog:false
        };
        byId[id]=hit;
        order.push(id);
      }
      hit.phrase=phrase;
      hit.enabled=b.enabled!==false;
      hit.fromCatalog=false;
      if(b.title||b.label){
        var t2=bindingTitle(b,hit.chord,m);
        if(t2) hit.title=t2;
      }
      if(b.when) hit.when=b.when;
      if(b.effect) hit.effect=b.effect;
    });

    return order.map(function(id){ return byId[id]; }).filter(function(r){
      if(!r) return false;
      if(phraseOnly) return !!r.phrase;
      return true;
    });
  }

  var pickId='';
  var catId='common';
  /** customKey = 按键页「我录的键」序列；catalog = 「软件自带」动作目录 */
  var listMode='catalog';

  function persist(){
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.saveAsync){
      global.OneToneConfigPersist.saveAsync({source:'voice-bridge-keys'});
    }else if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save({source:'voice-bridge-keys'});
    }
    try{
      var scene=global.OneToneKeysSceneActionsPanel;
      if(scene&&typeof scene.refresh==='function') scene.refresh();
      else if(scene&&typeof scene.render==='function') scene.render(currentMapping());
    }catch(_){}
  }

  function phraseOnlyOn(){
    var el=$('voiceKeysPhraseOnly');
    return !!(el&&el.checked);
  }

  function rowsInCat(all){
    var g=KEY_GROUPS.find(function(x){ return x.id===catId; })||KEY_GROUPS[0];
    if(g.id==='other'){
      var covered=groupIdsCovered();
      return all.filter(function(r){ return !covered[catalogSlotOf(r)]; });
    }
    var set={};
    (g.slots||[]).forEach(function(s){ set[s]=true; });
    return all.filter(function(r){ return set[catalogSlotOf(r)]; });
  }

  function groupsWithRows(all){
    return KEY_GROUPS.filter(function(g){
      if(g.id==='other'){
        var covered=groupIdsCovered();
        return all.some(function(r){ return !covered[catalogSlotOf(r)]; });
      }
      var set={};
      (g.slots||[]).forEach(function(s){ set[s]=true; });
      return all.some(function(r){ return set[catalogSlotOf(r)]; });
    });
  }

  function esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function render(){
    var all=listRows(false);
    var filterOn=phraseOnlyOn();
    var pool=filterOn?listRows(true):all;
    var customOnly=listMode==='customKey';
    var appliedId=customOnly?appliedCustomKeyMatchId():'';
    var off=$('voiceKeysBridgeOff');
    var on=$('voiceKeysLinked');
    if(off){
      off.hidden=all.length>0;
      if(!all.length){
        var strong=off.querySelector('strong');
        var paras=off.querySelectorAll('p');
        var body=paras&&paras[1]?paras[1]:null;
        if(customOnly&&currentMapping()){
          if(strong) strong.textContent='还没有自定义键';
          if(body) body.textContent='先到按键页「我录的键」新建序列、加好步骤。这里只负责点选加载。';
        }else if(customOnly){
          if(strong) strong.textContent='还没有习惯';
          if(body) body.textContent='先选一个正在编辑的习惯，再加载按键页里录好的序列。';
        }else{
          if(strong) strong.textContent='还没有习惯可浏览';
          if(body) body.textContent='先选一个正在编辑的习惯。按键页的动作库会出现在这里；点选只认英雄，不在本页录口令。';
        }
      }
    }
    if(on) on.hidden=!all.length;
    var pill=$('voiceKeysScopePill');
    var m=currentMapping();
    if(pill) pill.textContent=scopePillText(m);
    var desk=document.querySelector('#voiceKeysFace .voice-keys-desk');
    if(desk){
      desk.classList.toggle('is-custom-key',customOnly);
      desk.classList.toggle('is-catalog',!customOnly);
    }
    var face=$('voiceKeysFace');
    if(face){
      // 我录的键：全宽清晰列表，不录专属口令；软件自带同样全宽卡片。
      face.classList.toggle('is-catalog-list',true);
      face.classList.toggle('is-custom-key-seq',!!customOnly);
    }
    var hint=$('voiceKeysNoviceHint');
    if(hint){
      hint.textContent=customOnly
        ?'点选一条序列加载到当前习惯 · 步骤与触发键在按键页改'
        :'点选动作写入当前习惯英雄 · 改键位去按键页，口令去语音页';
    }
    var pickLbl=$('voiceKeysPickLbl');
    if(pickLbl){
      pickLbl.hidden=false;
      pickLbl.textContent=customOnly?'我录的键（来自按键页）':'选一件事';
    }
    var phraseWrap=$('voiceKeysPhraseOnlyWrap');
    if(phraseWrap) phraseWrap.hidden=!!customOnly;
    var addMore=$('btnVoiceKeysAddMore');
    if(addMore){
      addMore.hidden=!customOnly;
      addMore.textContent='去按键页管理序列 →';
    }
    var explainPane=$('voiceKeysExplainPane');
    if(explainPane) explainPane.hidden=true;
    var phrasePane=$('voiceKeysPhrasePane');
    if(phrasePane) phrasePane.hidden=true; /* 本面不录口令：认英雄 / 加载序列 */
    var cats=$('voiceKeysCats');
    if(cats) cats.hidden=!!customOnly;
    if(!all.length) return;

    var filter=$('voiceKeysPhraseOnly');
    if(filter&&!filter._keysFilterBound){
      filter._keysFilterBound=true;
      filter.addEventListener('change',function(){ render(); });
    }

    if(cats&&!customOnly){
      cats.innerHTML='';
      KEY_GROUPS.forEach(function(g){
        if(g.id==='other'){
          var covered=groupIdsCovered();
          if(!pool.some(function(r){ return !covered[catalogSlotOf(r)]; })
            &&!all.some(function(r){ return !covered[catalogSlotOf(r)]; })){
            return;
          }
        }
        var b=document.createElement('button');
        b.type='button';
        b.className='voice-bridge-cat'+(g.id===catId?' is-on':'');
        b.textContent=g.title;
        b.setAttribute('role','tab');
        b.setAttribute('aria-selected',g.id===catId?'true':'false');
        b.addEventListener('click',function(){ catId=g.id; render(); });
        cats.appendChild(b);
      });
    }
    if(!customOnly&&!KEY_GROUPS.some(function(g){ return g.id===catId; })){
      catId='common';
    }

    var rows=customOnly?pool:rowsInCat(pool);
    if(customOnly&&appliedId){
      var appliedRowId='customKey:'+appliedId;
      if(rows.some(function(r){ return r.id===appliedRowId; })) pickId=appliedRowId;
    }
    if(!pickId||!rows.some(function(r){ return r.id===pickId; })){
      pickId=rows[0]?rows[0].id:(pool[0]&&pool[0].id)||(all[0]&&all[0].id)||'';
    }

    var host=$('voiceKeysCmdList');
    if(host){
      host.innerHTML='';
      if(!rows.length){
        host.innerHTML='<p class="voice-bridge-note" style="padding:8px">'+(
          filterOn
            ?'没有已有口令的动作 · 取消勾选看全部'
            :(customOnly?'还没有自定义键 · 去按键页「我录的键」新建':'这一类还没有动作 · 换个分类')
        )+'</p>';
      }
      rows.forEach(function(r){
        var btn=document.createElement('button');
        btn.type='button';
        var isApplied=customOnly&&r.matchMappingId&&String(r.matchMappingId)===appliedId;
        btn.className='voice-keys-pick-row'+(r.id===pickId||isApplied?' is-on':'')+(isApplied?' is-applied':'');
        btn.setAttribute('role','option');
        btn.setAttribute('aria-selected',(r.id===pickId||isApplied)?'true':'false');
        if(customOnly){
          var chord=String(r.chord||'').trim();
          var steps=Number(r.stepCount)||0;
          var desc=steps>0
            ?(steps+' 步'+(chord?(' · 触发 '+chord):' · 待录触发键'))
            :(chord?('触发 '+chord+' · 尚无动作'):'待录触发键 · 尚无动作');
          btn.innerHTML=
            '<span class="voice-keys-pick-row__body">'+
              '<span class="voice-keys-pick-row__name">'+esc(r.title||'我录的键')+
                (isApplied?'<span class="voice-keys-pick-row__badge">使用中</span>':'')+
              '</span>'+
              '<span class="voice-keys-pick-row__desc">'+esc(desc)+'</span>'+
            '</span>'+
            (chord
              ?('<span class="voice-keys-pick-row__key">'+esc(chord)+'</span>')
              :'<span class="voice-keys-pick-row__key is-empty">去按键页</span>');
        }else{
          var blurb=String(r.effect||r.when||'').trim();
          var chord2=String(r.chord||'').trim();
          btn.innerHTML=
            '<span class="voice-keys-pick-row__body">'+
              '<span class="voice-keys-pick-row__name">'+esc(r.title||r.actionId||'')+'</span>'+
              (blurb?('<span class="voice-keys-pick-row__desc">'+esc(blurb)+'</span>'):'')+
            '</span>'+
            (chord2
              ?('<span class="voice-keys-pick-row__key">'+esc(chord2)+'</span>')
              :'<span class="voice-keys-pick-row__key is-empty">去按键页</span>');
        }
        btn.addEventListener('click',function(){
          pickId=r.id;
          // Selecting「我录的键」applies the sequence onto the current Voice scope habit
          // so 本场景动作 / Soft Pad can pick it up.
          if(r.customKey&&r.matchMappingId){
            try{
              var mid=mappingId();
              // Avoid MappingCore.focus — it remounts editors; just pin selectedMappingId.
              var st=global.OneToneState&&global.OneToneState.state;
              if(st&&mid) st.selectedMappingId=String(mid);
              var P=global.OneToneKeysChannelCommandPicker;
              if(P&&typeof P.applyCustomKeyMatchAsRecognition==='function'){
                P.applyCustomKeyMatchAsRecognition(r.matchMappingId);
              }
            }catch(_e){}
          }else{
            // 软件自带：按动作语义写入对应通道英雄（input.* → voice，其余 Agent → cursor）
            try{
              var cur=currentMapping();
              var sceneClaim=global.OneToneKeysSceneActionsPanel;
              if(cur&&sceneClaim&&typeof sceneClaim.claimVoiceChannelMatch==='function'){
                sceneClaim.claimVoiceChannelMatch(
                  cur,
                  claimChannelForRow(r),
                  String(r.slotId||r.actionId||''),
                  String(r.actionId||r.slotId||'')
                );
              }
            }catch(_c){}
          }
          render();
          try{
            var scene=global.OneToneKeysSceneActionsPanel;
            if(scene&&typeof scene.refresh==='function') scene.refresh();
          }catch(_s){}
        });
        host.appendChild(btn);
      });
    }
    var row=rows.find(function(r){ return r.id===pickId; })
      ||pool.find(function(r){ return r.id===pickId; })
      ||all.find(function(r){ return r.id===pickId; })
      ||rows[0]
      ||pool[0]
      ||all[0];
    if(!row) return;
    pickId=row.id;
    // Phrase / explain panes stay hidden for both modes (catalog & 我录的键).
    var goCap=$('btnVoiceKeysGoFromCap');
    if(goCap&&!goCap._bound){
      goCap._bound=true;
      goCap.addEventListener('click',function(e){
        e.preventDefault();
        openKeysPanel();
      });
    }
    if(addMore&&!addMore._keysGoBound){
      addMore._keysGoBound=true;
      addMore.addEventListener('click',function(e){
        e.preventDefault();
        if(listMode==='customKey'){ openKeysPanel(); return; }
        addPhrase();
      });
    }
  }

  function openKeysPanel(){
    var hooks=global.OneToneHooks||{};
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.open){
      global.OneToneSettingsDrawer.open({panel:'keys'});
      return;
    }
    if(typeof hooks.setSettingsPanel==='function') hooks.setSettingsPanel('keys');
  }

  function addPhrase(){
    if(listMode==='customKey'){
      openKeysPanel();
      return true;
    }
    var go=$('btnVoiceKeysGoFromCap')||$('btnVoiceKeysGoPage');
    if(go) go.click();
    return true;
  }

  global.OneToneVoiceBridgeKeys={
    render:render,
    addPhrase:addPhrase,
    listRows:listRows,
    labelForSlot:function(slot){
      slot=String(slot||'').trim();
      if(!slot) return '';
      var meta=KEY_META[slot]||KEY_META[slot.replace(/^semantic:[^:]+:/,'')];
      return meta&&meta.title?String(meta.title):'';
    },
    explainForSlot:function(slot,name){
      return pickCopy(slot,name);
    },
    setMode:function(mode){
      listMode=mode==='customKey'?'customKey':'catalog';
      if(listMode==='catalog'&&(!catId||catId==='other')) catId='common';
      render();
    },
    setCat:function(id){
      if(listMode==='customKey'){
        render();
        return;
      }
      catId=String(id||'common');
      render();
    }
  };
})((typeof window!=='undefined')?window:globalThis);
