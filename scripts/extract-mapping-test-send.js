const fs = require('fs');
const p = require('path').join(__dirname, '../src/js/main-legacy.js');
let lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);

lines.splice(338, 6);

const start = lines.findIndex((l) => l.includes('function resolveTestTarget'));
const end = lines.findIndex((l, i) => i > start && l.includes('function renderSchemeSwitch'));
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}
lines.splice(start, end - start);

const insertAt = lines.findIndex((l) => l.includes('function registerMappingListHooks'));
const block = [
  '  function fireTestSend(forMappingId){ return OneToneMappingTestSend.fire(forMappingId); }',
  '  function closeTestModal(){ return OneToneMappingTestSend.closeModal(); }',
  '  function handleTestSendResult(msg){ return OneToneMappingTestSend.handleResult(msg); }',
  '  function renderTestSendButton(){ return OneToneMappingTestSend.renderSendButton(); }',
  '',
  '  function registerMappingTestSendHooks(){',
  '    global.__vp_mapping_test_send_hooks__={',
  '      t:t,',
  '      ensureConfig:ensureConfig,',
  '      flushAllEditorToMappings:flushAllEditorToMappings,',
  '      mappingById:mappingById,',
  '      selectedMapping:selectedMapping,',
  '      sortedMappings:sortedMappings,',
  '      editorTargetForMapping:editorTargetForMapping,',
  '      editorTriggerForMapping:editorTriggerForMapping,',
  '      friendlyPair:friendlyPair,',
  '      friendlyKeyName:friendlyKeyName,',
  '      conflictsForMapping:conflictsForMapping,',
  '      otherIdInConflict:otherIdInConflict,',
  '      mappingTargetKey:mappingTargetKey,',
  '      playSoundCue:playSoundCue,',
  '      renderMappingList:function(){ return OneToneMappingList.renderList(); },',
  '      renderHomeLiveKeyPanel:renderHomeLiveKeyPanel',
  '    };',
  '  }',
  '  registerMappingTestSendHooks();',
  '',
];
lines.splice(insertAt, 0, ...block);

let content = lines.join('\n');
content = content.replace(
  /testSendState:function\(\)\{ return testSendState; \}/,
  'testSendState:function(){ return OneToneMappingTestSend.sendState(); }'
);
content = content.replace(
  /testSendMappingId:function\(\)\{ return testSendMappingId; \}/,
  'testSendMappingId:function(){ return OneToneMappingTestSend.sendMappingId(); }'
);

fs.writeFileSync(p, content);
console.log('done, lines:', content.split(/\n/).length);
