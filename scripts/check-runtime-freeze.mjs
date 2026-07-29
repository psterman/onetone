import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('.');
const bundle = readFileSync(resolve(root, 'src/assets/islands/main.js'), 'utf8');
const html = readFileSync(resolve(root, 'src/index.html'), 'utf8');
console.log('bundle_bytes', bundle.length);
console.log('process_env_count', (bundle.match(/process\.env/g) || []).length);
const desk = html.indexOf('id="voiceDeskPanel"');
const island = html.indexOf('id="voiceConfigIsland"');
console.log('island_after_desk', island > desk && desk >= 0);

const logPaths = [
  'src-tauri/target-release-live/release/logs/runtime-live.log',
  'src-tauri/target-release-live/logs/runtime-live.log',
  'logs/runtime-live.log',
];
for (const p of logPaths) {
  const full = resolve(root, p);
  if (!existsSync(full)) {
    console.log(p, 'MISSING');
    continue;
  }
  const st = statSync(full);
  const lines = readFileSync(full, 'utf8').split(/\n/);
  const recent = lines.slice(-500);
  const proc = recent.filter((l) => l.includes('process is not defined'));
  const stopBegin = recent.filter((l) => l.includes('vosk stop_sync begin'));
  const stopEnd = recent.filter((l) => l.includes('vosk stop_sync end'));
  const boots = recent.filter(
    (l) =>
      l.includes('process run entered') ||
      l.includes('window.error') ||
      l.includes('boot-main window.error') ||
      l.includes('OneToneIslandsReady') ||
      l.includes('islands'),
  );
  console.log('---', p);
  console.log('mtime', st.mtime.toISOString(), 'size', st.size, 'lines', lines.length);
  console.log('recent process_is_not_defined', proc.length);
  console.log('recent vosk stop_sync begin/end', stopBegin.length, stopEnd.length);
  console.log('tail interesting:');
  for (const l of recent.filter((x) =>
    /process is not defined|process run entered|window\.error|stop_sync|openDrawer panel=voiceWake|switchListeningStrategy|IslandsReady/.test(
      x,
    ),
  ).slice(-20)) {
    console.log(l);
  }
}
