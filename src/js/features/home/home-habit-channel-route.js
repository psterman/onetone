(function(root, factory){
  'use strict';
  var api=factory();
  if(typeof module!=='undefined'&&module.exports){
    module.exports=api;
  }else{
    root.OneToneHomeHabitChannelRoute=api;
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function pickMapping(mappingId, current, byId){
    var id=String(mappingId||'').trim();
    if(id&&typeof byId==='function'){
      var hit=byId(id);
      if(hit) return hit;
    }
    return current||null;
  }

  function editMode(channel, isApp){
    if(String(channel||'')==='softPad') return 'softPad';
    return isApp?'scenario':'global';
  }

  return { pickMapping:pickMapping, editMode:editMode };
});
