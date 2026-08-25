(function(global){
  'use strict';

  var CARD_LIMIT=5;
  var entries=[];
  var fetchGen=0;
  var bound=false;

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

  function mergeEntry(entry){
    if(!entry||typeof entry.id!=='number') return;
    var next=entries.filter(function(e){ return e.id!==entry.id; });
    next.unshift(entry);
    next.sort(function(a,b){ return (b.tsMs||0)-(a.tsMs||0)||b.id-a.id; });
    entries=next.slice(0,CARD_LIMIT);
  }

  function invokeList(){
    if(!global.OneToneIpc||!global.OneToneIpc.invoke) return Promise.resolve(null);
    return global.OneToneIpc.invoke('cmd_action_history_list',{limit:CARD_LIMIT}).catch(function(){
      return null;
    });
  }

  function paint(){
    var card=$('wbActionHistoryCard');
    var list=$('wbActionHistoryList');
    if(!card||!list) return;
    if(!entries.length){
      card.hidden=true;
      list.innerHTML='';
      return;
    }
    card.hidden=false;
    list.innerHTML=entries.map(function(row){
      return '<div class="wb-action-history-row" role="listitem">'
        +'<span class="wb-action-history-time">'+esc(formatTime(row.tsMs))+'</span>'
        +'<span class="wb-action-history-summary" title="'+esc(row.detail||'')+'">'+esc(row.summary||'—')+'</span>'
        +'<span class="wb-action-history-status'+(statusOk(row.status)?' is-ok':' is-fail')+'">'
        +(statusOk(row.status)?'✓':'×')+'</span>'
        +'</div>';
    }).join('');
  }

  function openAll(){
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.open){
      global.OneToneSettingsDrawer.open({panel:'habits'});
      return;
    }
    var btn=$('wbNavSchemes')||$('wbNavHabits');
    if(btn) btn.click();
  }

  function bindOnce(){
    if(bound) return;
    bound=true;
    var link=$('wbActionHistoryViewAll');
    if(link){
      link.addEventListener('click',function(e){
        e.preventDefault();
        openAll();
      });
    }
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
    openAll:openAll,
    mergeEntry:mergeEntry
  };
})((typeof window!=='undefined')?window:globalThis);
