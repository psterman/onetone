(function(global){
  'use strict';
  var MAX=48;
  var lines=[];
  function $(id){ return global.OneToneDom&&global.OneToneDom.$(id); }
  function pad(n){ return n<10?'0'+n:String(n); }
  function esc(s){
    return String(s==null?'':s).replace(/[&<>"']/g,function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);
    });
  }
  function stamp(){
    var d=new Date();
    var ms=String(d.getMilliseconds());
    while(ms.length<3) ms='0'+ms;
    return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())+'.'+ms;
  }
  function render(){
    var ol=$('recordProbeLog');
    var status=$('recordProbeStatus');
    var panel=$('recordProbePanel');
    if(!ol) return;
    ol.innerHTML=lines.map(function(row){
      return '<li class="record-probe-line is-'+esc(row.kind)+'"><span class="t">'+esc(row.t)+'</span><span class="s">'+esc(row.src)+'</span><span class="k">'+esc(row.key)+'</span><span class="n">'+esc(row.note)+'</span></li>';
    }).join('');
    ol.scrollTop=ol.scrollHeight;
    if(panel) panel.hidden=false;
    if(status&&!status.dataset.live) status.textContent=lines.length?'已捕获 '+lines.length+' 条':'等待按键…';
  }
  function push(src, kind, key, note){
    lines.push({
      t:stamp(),
      src:String(src||'?'),
      kind:String(kind||'info'),
      key:String(key||''),
      note:String(note||'')
    });
    if(lines.length>MAX) lines=lines.slice(-MAX);
    render();
    try{
      var log=global.OneToneApp&&global.OneToneApp.pushLog;
      if(log) log('[record-probe] '+src+' '+kind+' '+key+' '+note);
    }catch(_){}
  }
  function clear(){
    lines=[];
    render();
  }
  function setRecording(on, mode){
    var panel=$('recordProbePanel');
    var status=$('recordProbeStatus');
    if(panel){
      panel.hidden=false;
      panel.classList.toggle('is-live',!!on);
    }
    if(status){
      status.dataset.live=on?'1':'';
      status.textContent=on?('正在录制 · '+(mode||'trigger')):'未录制（日志保留）';
    }
  }
  function text(){
    return lines.map(function(row){
      return row.t+'\t'+row.src+'\t'+row.kind+'\t'+row.key+'\t'+row.note;
    }).join('\n');
  }
  function copy(){
    var body=text()||'(empty)';
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(body).catch(function(){});
    }
  }
  function bind(){
    var btn=$('btnRecordProbeCopy');
    var clr=$('btnRecordProbeClear');
    if(btn) btn.addEventListener('click',function(e){ e.preventDefault(); copy(); });
    if(clr) clr.addEventListener('click',function(e){ e.preventDefault(); clear(); });
    render();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bind);
  else bind();
  global.OneToneRecordProbe={push:push,clear:clear,setRecording:setRecording,text:text};
})((typeof window!=='undefined')?window:globalThis);
