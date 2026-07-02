# Cold Start Test Checklist — v1.0.0

Run on **two environments**: your dev machine **and** a clean VM / spare PC.

---

## A. Clean environment prep

- [ ] Uninstall any existing OneTone / Voice Pilot build
- [ ] Delete `%APPDATA%\onetone\` (if present)
- [ ] Delete `%APPDATA%\Voice Pilot\` (legacy, if present)
- [ ] Reboot (optional but recommended for VM)

---

## B. Install & first launch

- [ ] Download / use fresh `onetone_*_x64-setup.exe` from release build
- [ ] SmartScreen: **More info → Run anyway** works (or document if blocked)
- [ ] Installer completes without error
- [ ] App launches; **welcome overlay** appears on first run
- [ ] Complete welcome guide (or skip and replay later from Settings)

---

## C. Core workflow

- [ ] Open **Settings → Key mapping**; create or edit a scheme
- [ ] Record hardware trigger key
- [ ] Record voice-input target shortcut
- [ ] **Test send** works in Notepad or browser text field
- [ ] System **tray icon** visible; menu opens
- [ ] **Pause / resume** listening works

---

## D. Settings & new v1.0.0 UI

- [ ] **Settings → Recovery & Maintenance → About** shows version **1.0.0**
- [ ] **GitHub** button opens browser
- [ ] **Check for updates** runs (may say up to date — OK)
- [ ] **Autostart** toggle persists after restart (optional test)
- [ ] **Export logs** (Runtime Status → Developer) creates zip under `%APPDATA%\onetone\logs\`
- [ ] Language switch zh ↔ en works
- [ ] Theme light / dark persists after restart

---

## E. Restart persistence

- [ ] Quit app fully (tray → exit)
- [ ] Relaunch from Start menu
- [ ] Mappings, theme, language still correct
- [ ] Welcome does **not** show again (unless Replay from settings)

---

## F. Updater smoke (post-tag only)

- [ ] After `v1.0.0` tag + CI: installed app can fetch `latest.json`
- [ ] If no newer version: "already up to date" — OK

---

## Record results

| Environment | Tester | Date | Pass / Fail | Notes |
|-------------|--------|------|-------------|-------|
| Dev machine | | | | |
| Clean VM    | | | | |

---

## Release gate

**Do not tag `v1.0.0` until both environments pass sections B–E.**
