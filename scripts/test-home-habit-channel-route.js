'use strict';

var route=require('../src/js/features/home/home-habit-channel-route.js');
var fs=require('fs');
var path=require('path');

function assert(cond, msg){
  if(!cond) throw new Error(msg||'assertion failed');
}

var maps={
  cursor:{id:'cursor',app:true},
  baseline:{id:'baseline',app:false}
};
function byId(id){ return maps[id]||null; }

var picked=route.pickMapping('cursor',maps.baseline,byId);
assert(picked===maps.cursor,'mappingId wins over current');

picked=route.pickMapping('',maps.baseline,byId);
assert(picked===maps.baseline,'empty mappingId uses current');

picked=route.pickMapping('missing',maps.baseline,byId);
assert(picked===maps.baseline,'unknown mappingId falls back to current');

assert(route.editMode('keys',true)==='scenario','app keys → scenario');
assert(route.editMode('voice',false)==='global','baseline voice → global');
assert(route.editMode('camera',true)==='scenario','app camera → scenario');
assert(route.editMode('softPad',true)==='softPad','softPad stays softPad');

var wb=fs.readFileSync(path.join(__dirname,'../src/js/features/home/home-workbench.js'),'utf8');
assert(wb.includes('openHabitChannelChip(editCh,{mappingId:'), 'edit button opens channel with mappingId');
assert(!/data-wb-habit-edit[\s\S]{0,400}openHabitsHubForMapping/.test(wb), 'edit button does not open hub');
assert(wb.includes('openHabitChannelChip(kind,{mappingId:'), 'howto re-click passes mappingId');

console.log('ok  home-habit-channel-route');
