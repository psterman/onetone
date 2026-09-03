(function(global){
  'use strict';

  var CARD_LIMIT=5;
  var entries=[];
  var fetchGen=0;
  var bound=false;
  var MODE_CHANNEL={keys:'key',voice:'voice',softPad:'softPad',camera:'camera'};

  function t(key,fallback){
    if(global.OneToneI18n&&global.OneToneI18n.t){
      var v=global.OneToneI18n.t(key);
      if(v&&v!==key) return v;
    }
    return fallback!=null?fallback:key;
  }

  function $(id){ return document.getElementById(id); }

  function esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function formatTime(tsMs){
    if(!(tsMs>0)) return '—';
    var d=new Date(tsMs);
    return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  }

  function statusOk(status){
    var s=String(status||'').toLowerCase();
    return s==='executed'||s==='ok'||s==='success';
  }

  function currentChannel(){
    var wb=global.OneToneHomeWorkbench;
    var mode=wb&&typeof wb.getHeroMode==='function'?wb.getHeroMode():'keys';
    return MODE_CHANNEL[mode]||'voice';
  }

  function looksTechnical(s){
    return /AutoTrigger|vosk\b|newThread|switchAgent|microKey=|Lane |RAlt|LAlt|VK_/i.test(String(s||''));
  }

  function quotedPhrase(s){
    var raw=String(s||'');
    var m=raw.match(/「([^」]+)」/)||raw.match(/phrase:\s*([^)\s]+)/i);
    return m?String(m[1]||'').trim():'';
  }

  function failHint(detail){
    var d=String(detail||'');
    if(/pause|paused|暂停/i.test(d)) return t('homeWbHistPaused','已暂停');
    if(/focus|foreground|焦点|前台/i.test(d)) return t('homeWbHistNoFocus','没对着窗口');
    if(d&&!looksTechnical(d)&&d.length<24) return d;
    return t('homeWbHistFail','没发出去');
  }

  function beginnerLine(row){
    row=row||{};
    var ok=statusOk(row.status);
    var ch=String(row.channel||'');
    var kind=String(row.kind||'');
    var sum=String(row.summary||'');
    var phrase=quotedPhrase(sum);
    var fail=failHint(row.detail);
    if(ch==='voice'||kind==='voice_phrase'||kind==='session'){
      if(/听写开始/.test(sum)) return t('homeWbHistVoiceStart','开始听写');
      if(/听写结束/.test(sum)) return t('homeWbHistVoiceEnd','听写结束');
      if(/结束短语/.test(sum)&&phrase) return t('homeWbHistVoiceStop','说「{p}」，停下').replace('{p}',phrase);
      if(/发送短语/.test(sum)&&phrase) return t('homeWbHistVoiceSend','说「{p}」，发出去').replace('{p}',phrase);
      if(/取消短语/.test(sum)&&phrase) return t('homeWbHistVoiceCancel','说「{p}」，取消了').replace('{p}',phrase);
      if(phrase){
        return ok
          ? t('homeWbHistVoiceWake','说「{p}」，开始听写').replace('{p}',phrase)
          : t('homeWbHistVoiceWakeFail','说「{p}」，{fail}').replace('{p}',phrase).replace('{fail}',fail);
      }
      return ok?t('homeWbHistVoiceOk','语音已送达'):fail;
    }
    if(ch==='key'||kind==='send_key'){
      return ok?t('homeWbHistKeyOk','按键已送达'):fail;
    }
    if(ch==='softPad'){
      return ok?t('homeWbHistPadOk','屏幕按钮已送达'):fail;
    }
    if(ch==='camera'){
      return ok?t('homeWbHistCamOk','手势已送达'):fail;
    }
    return ok?t('homeWbHistOk','已送达'):fail;
  }

  function mergeEntry(entry){
    if(!entry||typeof entry.id!=='number') return;
    if(entry.channel==='system'||entry.kind==='scheme_switch') return;
    if(entry.channel&&entry.channel!==currentChannel()) return;
    var next=entries.filter(function(e){ return e.id!==entry.id; });
    next.unshift(entry);
    next.sort(function(a,b){ return (b.tsMs||0)-(a.tsMs||0)||b.id-a.id; });
    entries=next.slice(0,CARD_LIMIT);
  }

  function invokeList(){
    if(!global.OneToneIpc||!global.OneToneIpc.invoke) return Promise.resolve(null);
    return global.OneToneIpc.invoke('cmd_action_history_list',{
      limit:CARD_LIMIT,
      channel:currentChannel()
    }).catch(function(){
      return null;
    });
  }

  function paint(){
    var card=$('wbActionHistoryCard');
    var list=$('wbActionHistoryList');
    if(!card||!list) return;
    var rows=entries.filter(function(e){
      return e&&e.channel!=='system'&&e.kind!=='scheme_switch'&&(!e.channel||e.channel===currentChannel());
    });
    if(!rows.length){
      card.hidden=true;
      list.innerHTML='';
      return;
    }
    card.hidden=false;
    list.innerHTML=rows.map(function(row){
      var ok=statusOk(row.status);
      return '<div class="wb-action-history-row" role="listitem">'
        +'<span class="wb-action-history-time">'+esc(formatTime(row.tsMs))+'</span>'
        +'<span class="wb-action-history-summary">'+esc(beginnerLine(row))+'</span>'
        +'<span class="wb-action-history-status'+(ok?' is-ok':' is-fail')+'">'
        +esc(ok?t('homeWbHistOk','已送达'):t('homeWbHistFail','没发出去'))+'</span>'
        +'</div>';
    }).join('');
    bindViewAllLink();
  }

  function openAll(){
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.open){
      global.OneToneSettingsDrawer.open({panel:'habits'});
      return;
    }
    var btn=$('wbNavSchemes')||$('wbNavHabits');
    if(btn) btn.click();
  }

  function bindViewAllLink(){
    var link=$('wbActionHistoryViewAll');
    if(!link||link._wbHistBound) return;
    link._wbHistBound=true;
    link.addEventListener('click',function(e){
      e.preventDefault();
      openAll();
    });
  }

  function bindOnce(){
    if(bound) return;
    bound=true;
    bindViewAllLink();
    if(global.chrome&&global.chrome.webview&&global.chrome.webview.addEventListener){
      global.chrome.webview.addEventListener('message',function(e){
        var msg=e&&e.data;
        if(!msg||msg.type!=='mvp_action_history_event') return;
        mergeEntry(msg.entry);
        paint();
      });
    }
  }

  function refresh(opts){
    opts=opts||{};
    bindOnce();
    if(opts.entry) mergeEntry(opts.entry);
    if(opts.entry){
      paint();
      return Promise.resolve();
    }
    var gen=++fetchGen;
    return invokeList().then(function(res){
      if(gen!==fetchGen) return;
      var rows=res&&Array.isArray(res.entries)?res.entries:[];
      entries=rows.slice(0,CARD_LIMIT);
      paint();
    });
  }

  global.OneToneHomeActionHistoryCard={
    refresh:refresh,
    paint:paint,
    openAll:openAll,
    mergeEntry:mergeEntry,
    beginnerLine:beginnerLine,
    currentChannel:currentChannel
  };
})((typeof window!=='undefined')?window:globalThis);
