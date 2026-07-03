const fs = require('fs');
const p = require('path').join(__dirname, '../src/js/main-legacy.js');
let lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);

// Remove openMenuId / menuAnchorBtn state
const menuStateIdx = lines.findIndex((l) => l.includes('let openMenuId=null'));
if (menuStateIdx >= 0) lines.splice(menuStateIdx, 2);

// Remove scheme switch block: switchFlashTimer through showSchemeSwitchFeedback
const schemeStart = lines.findIndex((l) => l.includes('let switchFlashTimer=null'));
const schemeEnd = lines.findIndex((l, i) => i > schemeStart && l.includes('function newMappingId()'));
if (schemeStart >= 0 && schemeEnd > schemeStart) {
  lines.splice(schemeStart, schemeEnd - schemeStart);
}

// Remove trash/menu block: closeFloatMenu through renderTrashList
const trashStart = lines.findIndex((l) => l.includes('function closeFloatMenu()'));
const trashEnd = lines.findIndex((l, i) => i > trashStart && l.includes('function hasCompleteMappings()'));
if (trashStart >= 0 && trashEnd > trashStart) {
  lines.splice(trashStart, trashEnd - trashStart);
}

const insertAt = lines.findIndex((l) => l.includes('function registerMappingTestSendHooks()'));
const block = [
  '  function closeFloatMenu(){ return OneToneMappingTrashMenu.close(); }',
  '  function openFloatMenu(id, btn){ return OneToneMappingTrashMenu.open(id, btn); }',
  '  function deleteMappingFromMenu(id){ return OneToneMappingTrashMenu.deleteFromMenu(id); }',
  '  function duplicateMapping(id){ return OneToneMappingTrashMenu.duplicate(id); }',
  '  function reorderMapping(id, dir){ return OneToneMappingTrashMenu.reorder(id, dir); }',
  '  function restoreFromTrash(id){ return OneToneMappingTrashMenu.restoreFromTrash(id); }',
  '  function renderTrashList(){ return OneToneMappingTrashMenu.renderTrashList(); }',
  '  function showSchemeSwitchFeedback(toId, label){ return OneToneSchemeSwitchFeedback.show(toId, label); }',
  '  function ensureNotificationPermission(){ return OneToneSchemeSwitchFeedback.ensureNotificationPermission(); }',
  '',
  '  function registerMappingTrashMenuHooks(){',
  '    window.__vp_mapping_trash_menu_hooks__={',
  '      t:t,',
  '      ensureConfig:ensureConfig,',
  '      sortedMappings:sortedMappings,',
  '      isDraftMapping:isDraftMapping,',
  '      editorTargetForMapping:editorTargetForMapping,',
  '      removeDraftMapping:removeDraftMapping,',
  '      newMappingId:newMappingId,',
  '      syncEditorFromSelection:syncEditorFromSelection,',
  '      save:save,',
  '      saveAsync:saveAsync,',
  '      render:render,',
  '      toast:toast,',
  '      friendlyPair:friendlyPair',
  '    };',
  '  }',
  '  registerMappingTrashMenuHooks();',
  '',
  '  function registerSchemeSwitchFeedbackHooks(){',
  '    window.__vp_scheme_switch_feedback_hooks__={',
  '      t:t,',
  '      syncEditorFromSelection:syncEditorFromSelection,',
  '      renderMappingList:function(){ return OneToneMappingList.renderList(); },',
  '      renderEditor:renderEditor,',
  '      render:render,',
  '      toast:toast',
  '    };',
  '  }',
  '  registerSchemeSwitchFeedbackHooks();',
  '',
];
lines.splice(insertAt, 0, ...block);

let content = lines.join('\n');
content = content.replace(
  /openMenuId:function\(\)\{ return openMenuId; \}/g,
  'openMenuId:function(){ return OneToneMappingTrashMenu.openMenuId(); }'
);
content = content.replace(
  /menuAnchorBtn:function\(\)\{ return menuAnchorBtn; \}/g,
  'menuAnchorBtn:function(){ return OneToneMappingTrashMenu.menuAnchorBtn(); }'
);

fs.writeFileSync(p, content);
console.log('done, lines:', content.split(/\n/).length);
