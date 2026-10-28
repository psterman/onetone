import fs from 'node:fs';

const j = JSON.parse(
  fs.readFileSync('C:/Users/pstem/AppData/Roaming/onetone/app/config/settings.json', 'utf8')
);
for (const id of ['m-1790674398849-fi6wo', 'm-1793033279672-boin8']) {
  const m = (j.mappings || []).find((x) => x.id === id);
  if (!m) continue;
  console.log(
    JSON.stringify(
      {
        id: m.id,
        enabled: m.enabled,
        triggerKey: m.triggerKey,
        targetKey: m.targetKey,
        appTargetId: m.appTargetId,
        imePresetId: m.imePresetId,
        targetActions: m.targetActions,
        agentBindings: (m.agentBindings || [])
          .filter((b) => b && b.enabled !== false)
          .map((b) => ({
            slot: b.slotId,
            action: b.actionId,
            type: b.triggerType,
            bind: b.triggerBinding
          })),
        nativeKeyRestore: m.nativeKeyRestore,
        keyModeEnabled: m.keyModeEnabled
      },
      null,
      2
    )
  );
}
