(function(global){
  'use strict';

  var t=function(key){ return global.OneToneI18n.t(key); };

  var ACTION_KINDS={
    session_started:1,
    voice_wake_triggered:1,
    end_phrase_matched:1,
    send_phrase_matched:1,
    cancel_phrase_matched:1,
    acoustic_voice_matched:1,
    scheme_switched:1
  };

  function formatUptime(ms){
    if(!(ms>0)) return '';
    var s=Math.floor(ms/1000);
    var h=Math.floor(s/3600);
    var m=Math.floor((s%3600)/60);
    var sec=s%60;
    if(h>0) return h+'h '+m+'m';
    if(m>0) return m+'m '+sec+'s';
    return sec+'s';
  }

  function mappingById(id){
    if(!id) return null;
    var cfg=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
    var list=cfg&&Array.isArray(cfg.mappings)?cfg.mappings:[];
    for(var i=0;i<list.length;i++){
      if(String(list[i].id||'')===String(id)) return list[i];
    }
    return null;
  }

  function mappingTargetLabel(m){
    if(!m) return '';
    if(global.OneToneHomeScheme&&global.OneToneHomeScheme.pairLine){
      var pair=global.OneToneHomeScheme.pairLine(m);
      if(pair&&pair!=='—') return pair;
    }
    if(global.OneToneHomeScheme&&global.OneToneHomeScheme.shortName){
      return global.OneToneHomeScheme.shortName(m)||'';
    }
    return String(m.name||m.group||'').trim();
  }

  function aggregateOps(events){
    var count=0;
    var mapCounts={};
    (events||[]).forEach(function(evt){
      if(!evt) return;
      var kind=String(evt.kind||'');
      if(!ACTION_KINDS[kind]) return;
      count++;
      var payload=evt.payload&&typeof evt.payload==='object'?evt.payload:null;
      var id=payload&&(payload.mappingId||payload.mapping_id);
      if(id){
        var key=String(id);
        mapCounts[key]=(mapCounts[key]||0)+1;
      }
    });
    var topId='';
    var topN=0;
    Object.keys(mapCounts).forEach(function(id){
      if(mapCounts[id]>topN){
        topN=mapCounts[id];
        topId=id;
      }
    });
    return {count:count,topMappingId:topId,topCount:topN};
  }

  function buildHeroStats(vm){
    var runtime=vm&&vm.runtime||(global.OneToneState&&global.OneToneState.runtime)||{};
    var startedAt=Number(runtime.appStartedAt)||0;
    var uptimeMs=startedAt?Math.max(0,Date.now()-startedAt):0;
    var uptime=formatUptime(uptimeMs);
    var agg=aggregateOps(runtime.events||[]);
    var currentMap=vm&&vm.m?vm.m:null;
    var topMap=mappingById(agg.topMappingId)||currentMap;
    var topTarget=mappingTargetLabel(topMap);
    var topShortcut=topMap&&String(topMap.triggerKey||'').trim()?String(topMap.triggerKey).trim():'';
    var latency='';
    if(vm&&vm.perf){
      if(vm.perf.keyLatency&&vm.perf.keyLatency!=='—') latency=vm.perf.keyLatency;
      else if(vm.perf.sendLatency&&vm.perf.sendLatency!=='—') latency=vm.perf.sendLatency;
    }

    return {
      uptime:uptime||'—',
      opCount:String(Math.max(0,agg.count||0)),
      topTarget:topTarget||'—',
      topShortcut:topShortcut||'—',
      latency:latency||'—',
      hasOps:agg.count>0
    };
  }

  global.OneToneHomeWorkbenchStats={
    buildHeroStats:buildHeroStats,
    formatUptime:formatUptime
  };
})((typeof window!=='undefined')?window:globalThis);
