// Guard: action sequence supports open file/folder/url end-to-end (UI + persist + Rust).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const home = readFileSync(join(root, 'src/js/features/home/home-live.js'), 'utf8');
const persist = readFileSync(join(root, 'src/js/core/config-persist.js'), 'utf8');
const cfg = readFileSync(join(root, 'src-tauri/src/config.rs'), 'utf8');
const kb = readFileSync(join(root, 'src-tauri/src/keyboard.rs'), 'utf8');
const edit = readFileSync(
  join(root, 'src-tauri/src/ipc/commands/mapping/edit.rs'),
  'utf8'
);

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log('  PASS ' + name);
  } else {
    fail++;
    console.error('  FAIL ' + name);
  }
}

console.log('[keys-seq-open-action]');
check(
  'UI add strip has file/folder/url',
  /data-add="open-file"/.test(home) &&
    /data-add="open-folder"/.test(home) &&
    /data-add="open-url"/.test(home)
);
check(
  'inline open input + focusout persist',
  /data-inline-open/.test(home) && /type:'open'/.test(home)
);
check(
  'config-persist normalizes open',
  /typ==='open'/.test(persist) && /kind!=='folder'&&kind!=='url'/.test(persist)
);
check('Rust Action::Open', /Open \{ kind: String, value: String \}/.test(cfg));
check(
  'IPC ActionPayload::Open',
  /Open \{ kind: String, value: String \}/.test(edit) &&
    /ActionPayload::Open/.test(edit)
);
check(
  'run_action_sequence handles Open',
  /Action::Open \{ kind, value \}/.test(kb) && /shell_open_action/.test(kb)
);
check(
  'native pick dialog IPC',
  /cmd_pick_path/.test(
    readFileSync(join(root, 'src-tauri/src/ipc/commands/shell/prefs.rs'), 'utf8')
  ) && /pick_file_dialog/.test(readFileSync(join(root, 'src-tauri/src/data_root.rs'), 'utf8'))
);
check(
  'UI browse button + pickOpenValue IPC',
  /data-inline-open-browse/.test(home) && /cmd_pick_path/.test(home)
);
check(
  'URL paste button',
  /data-inline-open-paste/.test(home) && /keysCaptureSeqOpenPaste/.test(home)
);
check(
  'URL bookmarks picker',
  /data-inline-open-bookmarks/.test(home) &&
    /cmd_list_browser_bookmarks/.test(home) &&
    /data-bm-folder/.test(home) &&
    /function groupKey/.test(home) &&
    /inActiveGroup/.test(home) &&
    /cmd_list_browser_bookmarks/.test(
      readFileSync(join(root, 'src-tauri/src/ipc/commands/shell/prefs.rs'), 'utf8')
    ) &&
    /folder: String/.test(
      readFileSync(join(root, 'src-tauri/src/browser_bookmarks.rs'), 'utf8')
    ) &&
    /12_000/.test(readFileSync(join(root, 'src-tauri/src/browser_bookmarks.rs'), 'utf8'))
);

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
