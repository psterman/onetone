# Cold Start Test Checklist — v1.0.0+

Run on **two environments**: your dev machine **and** a clean VM / spare PC.

Covers **core v1.0.0** behavior plus **onboarding v2**, **optional phrase practice**, and **Coach HUD** (screen overlay).

---

## A. Clean environment prep

- [ ] Uninstall any existing OneTone / Voice Pilot build
- [ ] Delete `%APPDATA%\onetone\` (if present)
- [ ] Delete `%APPDATA%\Voice Pilot\` (legacy, if present)
- [ ] Clear browser `localStorage` for the app (dev only) **or** use a truly fresh install on VM
- [ ] Reboot (optional but recommended for VM)

**localStorage keys used by onboarding / HUD (dev debugging):**

| Key | Meaning |
|-----|---------|
| `vp_onboarding_v2_done` | New-user wizard completed |
| `vp_welcome_seen` | Legacy / dismissed welcome |
| `vp_coach_hud_migrate_seen` | Old-user Coach HUD migration dismissed |

---

## B. Install & first launch (new user)

- [ ] Download / use fresh `onetone_*_x64-setup.exe` from release build
- [ ] SmartScreen: **More info → Run anyway** works (or document if blocked)
- [ ] Installer completes without error
- [ ] App launches; **5-step onboarding overlay** appears (not the legacy welcome-only screen)
- [ ] **Step 1 — Welcome**: copy readable; **Later** dismisses without marking wizard done
- [ ] **Step 2 — Trigger**: default **volume keys** selected; can proceed without recording
- [ ] **Step 3 — Try**: press hardware trigger → step passes only after **successful key send** (not merely detecting the key)
- [ ] **Step 4 — Target**: shows `trigger → target` (default `音量键 → 右 Alt` / `Volume keys → Right Alt`)
- [ ] **Step 5 — Practice (optional)**:
  - [ ] If voice wake **off**: risk note visible; **Skip — keys only** finishes without enabling SAPI/Vosk
  - [ ] **Enable voice wake & practice** only runs after explicit tap (no auto-enable on entering step)
- [ ] **Start / Finish** enables key mapping; does **not** auto-enable voice engines when skipped
- [ ] After finish: **Coach HUD** enabled by default for new users; pill appears at bottom of screen
- [ ] Home **hero** shows active mapping (`[trigger] → [target]`)

---

## C. Core workflow

- [ ] Open **Settings → Key mapping**; create or edit a scheme
- [ ] Record hardware trigger key
- [ ] Record voice-input target shortcut
- [ ] **Test send** works in Notepad or browser text field
- [ ] Press physical trigger in another app → target shortcut fires; Coach HUD flashes **success** briefly (~1s)
- [ ] System **tray icon** visible; menu opens
- [ ] **Pause / resume** listening works; Coach HUD **hides** while paused

---

## D. Coach HUD

- [ ] With HUD enabled: bottom-center pill shows **key-only** hint when idle
- [ ] If voice wake enabled and listening: HUD mode switches to **listening** (wake phrase rotates)
- [ ] During dictation: HUD shows **dictating** (end phrase hint if configured)
- [ ] **Dismiss (×)** hides HUD for current session; reappears after app restart or re-enable
- [ ] **Settings → General → Enable Coach HUD** toggle persists after restart
- [ ] HUD works on primary monitor at bottom center (check one multi-monitor setup if available)
- [ ] HUD does not steal focus from foreground app (typing in Notepad still works)

---

## E. Old-user migration (simulate)

On a machine that already completed first-run (`vp_welcome_seen` or `vp_onboarding_v2_done` set):

- [ ] Clear only `vp_coach_hud_migrate_seen` (keep other keys)
- [ ] Relaunch → **Coach HUD migration** modal appears once
- [ ] **Not now** dismisses and does not show again
- [ ] **Enable Coach HUD** turns on overlay and sets migrate seen

---

## F. Settings & UI

- [ ] **Settings → General → About** shows version **1.0.0** (or current build)
- [ ] **Replay first-run guide** opens onboarding v2 again
- [ ] **GitHub** button opens browser
- [ ] **Check for updates** runs (may say up to date — OK)
- [ ] **Autostart** toggle persists after restart (optional test)
- [ ] **Export logs** (Runtime Status → Developer) creates zip under `%APPDATA%\onetone\logs\`
- [ ] Language switch zh ↔ en updates onboarding, hero, HUD, and settings labels
- [ ] Theme light / dark persists after restart
- [ ] If voice wake enabled: home **Practice** chip opens phrase practice overlay

---

## G. Restart persistence

- [ ] Quit app fully (tray → exit)
- [ ] Relaunch from Start menu
- [ ] Mappings, theme, language, `coachHudEnabled` still correct
- [ ] Onboarding does **not** auto-open again (unless **Replay** from settings)
- [ ] Coach HUD migration does **not** reappear if already dismissed

---

## H. Updater smoke (post-tag only)

- [ ] After release tag + CI: installed app can fetch `latest.json`
- [ ] If no newer version: "already up to date" — OK

---

## Record results

| Environment | Tester | Date | Pass / Fail | Notes |
|-------------|--------|------|-------------|-------|
| Dev machine | | | | |
| Clean VM    | | | | |

---

## Release gate

**Do not tag a release until both environments pass sections B–G** (or document known failures).
