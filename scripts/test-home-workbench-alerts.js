'use strict';

var alerts=require('../src/js/features/home/home-workbench-alerts.js');
var pick=alerts.pickPrimaryAlert;
var now=Date.parse('2026-07-10T12:00:00.000Z');

function assert(cond, msg){
  if(!cond) throw new Error(msg||'assertion failed');
}

function baseInput(){
  return {
    paused:false,
    summary:{ statusMode:'ready', engine:'vosk', engineOffline:false, micUnavailable:false },
    compatSnapshot:{ status:'ready', supportsHold:true },
    triggerMode:'hold',
    recentEvents:[],
    homeStatusMode:'idle',
    nowMs:now
  };
}

function test(name, fn){
  fn();
  console.log('ok  '+name);
}

test('all normal returns null', function(){
  assert(pick(baseInput())===null);
});

test('paused alone', function(){
  var r=pick(Object.assign(baseInput(),{ paused:true }));
  assert(r&&r.kind==='paused');
});

test('paused beats engine_off', function(){
  var input=baseInput();
  input.paused=true;
  input.summary.engine='off';
  assert(pick(input).kind==='paused');
  assert(pick(input).action.type==='resumeListening');
});

test('engine_off offers enableAutoListening', function(){
  var input=baseInput();
  input.summary.engine='off';
  var r=pick(input);
  assert(r&&r.kind==='engine_off');
  assert(r.action&&r.action.type==='enableAutoListening');
});

test('engine missing treated as off', function(){
  var input=baseInput();
  input.summary.engine='';
  assert(pick(input).kind==='engine_off');
});

test('paused beats send_failed', function(){
  var input=baseInput();
  input.paused=true;
  input.recentEvents=[{ kind:'voice_send_failed', tsMs:now-1000 }];
  assert(pick(input).kind==='paused');
});

test('paused beats recognition_error and mic', function(){
  var input=baseInput();
  input.paused=true;
  input.summary.statusMode='error';
  input.summary.micUnavailable=true;
  assert(pick(input).kind==='paused');
});

test('recognition_error beats hold and send_failed', function(){
  var input=baseInput();
  input.summary.statusMode='error';
  input.compatSnapshot.status='unsupported';
  input.recentEvents=[{ kind:'voice_send_failed', tsMs:now-1000 }];
  assert(pick(input).kind==='recognition_error');
});

test('homeStatusMode error triggers recognition_error', function(){
  var input=baseInput();
  input.homeStatusMode='error';
  assert(pick(input).kind==='recognition_error');
});

test('engineOffline triggers recognition_error', function(){
  var input=baseInput();
  input.summary.engineOffline=true;
  assert(pick(input).kind==='recognition_error');
});

test('mic_unavailable when voice needs mic', function(){
  var input=baseInput();
  input.summary.micUnavailable=true;
  assert(pick(input).kind==='mic_unavailable');
  assert(pick(input).action.panel==='voiceWake');
});

test('recognition_error beats mic_unavailable', function(){
  var input=baseInput();
  input.summary.statusMode='error';
  input.summary.micUnavailable=true;
  assert(pick(input).kind==='recognition_error');
});

test('hold_unsupported on partial compat', function(){
  var input=baseInput();
  input.compatSnapshot.status='partial';
  assert(pick(input).kind==='hold_unsupported');
});

test('hold_unsupported when hold mode but no hold support', function(){
  var input=baseInput();
  input.compatSnapshot.status='ready';
  input.compatSnapshot.supportsHold=false;
  input.triggerMode='hold';
  assert(pick(input).kind==='hold_unsupported');
});

test('send_failed within 5 minutes', function(){
  var input=baseInput();
  input.recentEvents=[{ kind:'voice_send_failed', tsMs:now-4*60*1000 }];
  assert(pick(input).kind==='send_failed');
});

test('send_failed older than 5 minutes ignored', function(){
  var input=baseInput();
  input.recentEvents=[{ kind:'voice_send_failed', tsMs:now-6*60*1000 }];
  assert(pick(input)===null);
});

console.log('\nAll home-workbench alert tests passed.');
