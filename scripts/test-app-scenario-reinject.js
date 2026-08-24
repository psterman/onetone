'use strict';

var assert=require('assert');

global.OneToneState={state:{config:{mappings:[],trash:[]}}};
require('../src/js/core/config-persist.js');

var persist=global.OneToneConfigPersist;
assert.ok(persist&&persist.reinjectRememberedAppScenarios);

persist.rememberAppScenariosNow({
  mappings:[
    {id:'keep',appTargetId:'cursor-chat',group:'Cursor',enabled:true},
    {id:'dup',appTargetId:'cursor-chat',group:'Cursor',enabled:true}
  ]
});

var cfg={
  mappings:[{id:'keep',appTargetId:'cursor-chat',group:'Cursor',enabled:true}],
  trash:[]
};
var added=persist.reinjectRememberedAppScenarios(cfg);
assert.strictEqual(added,0,'skip backup when preset already present');
assert.strictEqual(cfg.mappings.length,1,'still one Cursor');
assert.strictEqual(cfg.mappings[0].id,'keep');

persist.rememberAppScenariosNow({
  mappings:[{id:'codex-only',appTargetId:'codex-chat',group:'Codex',enabled:true}]
});
var cfg2={
  mappings:[{id:'keep',appTargetId:'cursor-chat',group:'Cursor',enabled:true}],
  trash:[]
};
var added2=persist.reinjectRememberedAppScenarios(cfg2);
assert.strictEqual(added2,1,'missing preset still reinjected');
assert.strictEqual(cfg2.mappings.length,2);

console.log('test-app-scenario-reinject.js: ok');
