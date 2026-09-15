import http from 'node:http';

function get(path) {
  return new Promise((resolve, reject) => {
    http
      .get('http://127.0.0.1:5173' + path, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => {
          resolve({
            path,
            status: r.statusCode,
            cache: r.headers['cache-control'] || '',
            isPromptInjectMapping: d.includes('isPromptInjectMapping'),
            promptRow: d.includes('function promptRow'),
            filterPrompt: d.includes("r.kind === 'prompt'"),
            savePromptToScene: d.includes('savePromptToScene'),
            ensurePromptSaveChrome: d.includes('ensurePromptSaveChrome')
          });
        });
      })
      .on('error', reject);
  });
}

const rows = await Promise.all([
  get('/js/features/mapping/keys-scene-actions-panel.js'),
  get('/js/features/voice/voice-intent-rail.js'),
  get('/js/features/mapping/keys-channel-command-picker.js'),
  get('/')
]);
for (const row of rows) console.log(row);
