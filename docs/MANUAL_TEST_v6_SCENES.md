# Manual test checklist — config v6 / usage scenes

Use this after upgrading from v5 or before a release that ships `activeSceneId` + `voiceOverride`.

**Backup first:** copy `settings.json` from `%APPDATA%\com.onetone\app\` (see Settings → General → Config backup).

---

## T1 — v5 → v6 migrate

- [ ] Start app with an existing v5 `settings.json` (no `activeSceneId`, no `voiceOverride`)
- [ ] File on disk shows `version: 6`, `activeSceneId` set to the enabled mapping (lowest `order` if several enabled)
- [ ] All mappings have `voiceOverride: null` or field omitted
- [ ] Behavior matches pre-upgrade (same wake/end phrases, same active mapping)

## T2 — activeSceneId vs browse selection (T11)

- [ ] Open Settings → Usage scenes; click scene **B** in list (do **not** press Set as current scene)
- [ ] Edit a non-voice field on B; save — `activeSceneId` on disk still **A**
- [ ] Idle wake / `cmd_debug_effective_scene` still reports scene **A**
- [ ] Press **Set as current scene** on B — `activeSceneId` becomes **B**; wake phrases follow B (or B overrides)

## T3 — Sparse voice override

- [ ] Scene B: Voice tab → custom wake phrase only; Target/End stay global
- [ ] Effective preview shows custom wake, global end + target
- [ ] Switch active to B — Vosk/SAPI grammar includes B wake phrase
- [ ] Restore wake to global — override key removed; preview matches global

## T4 — Fingerprint / no spurious reload (T8)

- [ ] Save same config twice (no effective change) — voice engine does not restart (check runtime log / debug)
- [ ] Change only mapping label or `order` — idle effective unchanged

## T5 — Dual scenes

- [ ] Two complete scenes A and B with different wake phrases (via override or different global before switch)
- [ ] Activate A → say A wake → dictation starts
- [ ] Activate B → say B wake → dictation starts; A wake ignored at idle

## T6 — Workflow app target (T5)

- [ ] Scene with `appTargetId: cursor-chat` and custom `voiceOverride.targetKey` — effective target remains IME key from override/global, not Ctrl+L

## T7 — Session snapshot (T9)

- [ ] Start dictation on scene A
- [ ] While dictating, activate scene B (UI + hotkey if available)
- [ ] End phrase / stop still follows **A** rules from session start
- [ ] After session ends, idle wake uses **B**

## T8 — Onboarding

- [ ] Fresh install (clear `vp_onboarding_v2_done`); complete wizard
- [ ] First mapping: `voiceOverride: null`, `activeSceneId` = that mapping id, `coachHudEnabled: true` on finish
- [ ] Dismiss wizard early — `coachHudEnabled` stays default false

## T9 — Coach HUD / tray (if enabled)

- [ ] Enable **Scene coach overlay** in Settings → Basic (or `coachHudEnabled: true` in settings.json)
- [ ] Bottom-center pill shows active scene **trigger → target**; with `voiceOverride.targetKey`, HUD uses the override
- [ ] Without target override, HUD uses the mapping physical `targetKey` (not global voice default)
- [ ] Successful key send flashes ✓ briefly; × dismisses until next scene switch or app restart
- [ ] Tray trigger mode reflects **active scene** mapping (not first enabled mapping)

## T10 — Rule C global ↔ scene sync

- [ ] Active scene has custom `voiceOverride.targetKey`
- [ ] Change global voice shortcut via IME preset on Global voice panel → 3-choice dialog appears
- [ ] **Global only** → global keys update; scene override unchanged; effective preview still shows override
- [ ] **Global + clear** → global updates; override removed; effective follows global
- [ ] **Cancel** → no changes

## T12 — General regression

- [ ] Home scheme switcher still works
- [ ] Mapping toggle / test send / recording unchanged
- [ ] Global voice panel still sole writer for `voiceSapi` / `voiceVosk` / `voiceEnd`
