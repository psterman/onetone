(function(global){
  'use strict';

  /**
   * Multi-monitor topology helpers for Smart Pointer.
   * Coordinates are virtual-desktop physical pixels (may be negative).
   * Ids are MVP-stable as monitor-{i} after sorting by (x, y).
   */

  function asNum(v, fallback){
    var n=Number(v);
    return isFinite(n)?n:(fallback!=null?fallback:0);
  }

  function fingerprintFromMonitors(monitors){
    var list=Array.isArray(monitors)?monitors:[];
    return list.map(function(m){
      return [
        asNum(m.x)|0,
        asNum(m.y)|0,
        asNum(m.width)|0,
        asNum(m.height)|0,
        asNum(m.scaleFactor,1).toFixed(4)
      ].join('|');
    }).join(';');
  }

  function virtualBoundsFrom(monitors){
    var list=Array.isArray(monitors)?monitors:[];
    if(!list.length){
      return {x:0,y:0,width:0,height:0};
    }
    var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(var i=0;i<list.length;i++){
      var m=list[i];
      var x=asNum(m.x)|0;
      var y=asNum(m.y)|0;
      var w=Math.max(0,asNum(m.width)|0);
      var h=Math.max(0,asNum(m.height)|0);
      minX=Math.min(minX,x);
      minY=Math.min(minY,y);
      maxX=Math.max(maxX,x+w);
      maxY=Math.max(maxY,y+h);
    }
    return {
      x:minX,
      y:minY,
      width:Math.max(0,maxX-minX)|0,
      height:Math.max(0,maxY-minY)|0
    };
  }

  function sortMonitors(raw){
    var list=(Array.isArray(raw)?raw:[]).map(function(m,i){
      return {
        id:String(m&&m.id||''),
        label:String(m&&m.label||('Display '+(i+1))),
        x:asNum(m&&m.x)|0,
        y:asNum(m&&m.y)|0,
        width:Math.max(0,asNum(m&&m.width)|0),
        height:Math.max(0,asNum(m&&m.height)|0),
        scaleFactor:asNum(m&&m.scaleFactor,1),
        primary:!!(m&&m.primary)
      };
    });
    list.sort(function(a,b){
      if(a.x!==b.x) return a.x-b.x;
      return a.y-b.y;
    });
    for(var i=0;i<list.length;i++){
      list[i].id='monitor-'+i;
      if(!String(list[i].label||'').trim()) list[i].label='Display '+(i+1);
    }
    if(list.length&&!list.some(function(m){ return m.primary; })){
      list[0].primary=true;
    }
    return list;
  }

  /** Alias map for horizontal 1/2/3 screens (MVP). */
  function aliasMapForCount(count){
    count=Math.max(1,Math.min(3,count|0));
    if(count===1) return {0:'center'};
    if(count===2) return {0:'left',1:'right'};
    return {0:'left',1:'center',2:'right'};
  }

  function buildAliases(monitors, screenCount){
    var n=monitors.length|0;
    var want=screenCount!=null?Math.max(1,Math.min(3,screenCount|0)):Math.max(1,Math.min(3,n));
    var map=aliasMapForCount(Math.min(want,n||1));
    var out={};
    for(var i=0;i<monitors.length;i++){
      out[monitors[i].id]=map[i]||null;
    }
    return out;
  }

  function normalizeTopology(raw, opts){
    opts=opts&&typeof opts==='object'?opts:{};
    var monitors=sortMonitors(raw&&raw.monitors?raw.monitors:raw);
    var screenCount=opts.screenCount!=null?opts.screenCount:monitors.length;
    var aliases=buildAliases(monitors, screenCount);
    var fingerprint=raw&&raw.fingerprint
      ?String(raw.fingerprint)
      :fingerprintFromMonitors(monitors);
    var virtualBounds=raw&&raw.virtualBounds
      ?{
        x:asNum(raw.virtualBounds.x)|0,
        y:asNum(raw.virtualBounds.y)|0,
        width:Math.max(0,asNum(raw.virtualBounds.width)|0),
        height:Math.max(0,asNum(raw.virtualBounds.height)|0)
      }
      :virtualBoundsFrom(monitors);
    return {
      monitors:monitors,
      virtualBounds:virtualBounds,
      fingerprint:fingerprint,
      aliases:aliases,
      screenCount:Math.max(1,Math.min(3,screenCount|0))
    };
  }

  function getMonitorById(topology, id){
    var monitors=topology&&topology.monitors?topology.monitors:[];
    id=String(id||'');
    for(var i=0;i<monitors.length;i++){
      if(monitors[i].id===id) return monitors[i];
    }
    return null;
  }

  function getAliasForMonitor(topology, id){
    if(!topology||!topology.aliases) return null;
    var a=topology.aliases[String(id||'')];
    return a||null;
  }

  function pointInMonitor(x, y, m){
    if(!m) return false;
    var right=m.x+(m.width|0);
    var bottom=m.y+(m.height|0);
    return x>=m.x&&y>=m.y&&x<right&&y<bottom;
  }

  function getMonitorForPoint(topology, x, y){
    var monitors=topology&&topology.monitors?topology.monitors:[];
    x=asNum(x)|0;
    y=asNum(y)|0;
    for(var i=0;i<monitors.length;i++){
      if(pointInMonitor(x,y,monitors[i])) return monitors[i];
    }
    return null;
  }

  function listMonitors(opts){
    opts=opts&&typeof opts==='object'?opts:{};
    var inv=global.OneToneIpc&&global.OneToneIpc.invoke;
    if(!inv){
      return Promise.reject(new Error('no_monitors'));
    }
    return inv('cmd_gaze_list_monitors',{}).then(function(res){
      if(!res||typeof res!=='object') throw new Error('no_monitors');
      return normalizeTopology(res, opts);
    });
  }

  global.OneToneCameraGazeMonitorTopology={
    fingerprintFromMonitors:fingerprintFromMonitors,
    virtualBoundsFrom:virtualBoundsFrom,
    sortMonitors:sortMonitors,
    aliasMapForCount:aliasMapForCount,
    buildAliases:buildAliases,
    normalizeTopology:normalizeTopology,
    getMonitorById:getMonitorById,
    getAliasForMonitor:getAliasForMonitor,
    pointInMonitor:pointInMonitor,
    getMonitorForPoint:getMonitorForPoint,
    listMonitors:listMonitors
  };
})(typeof window!=='undefined'?window:typeof global!=='undefined'?global:this);
