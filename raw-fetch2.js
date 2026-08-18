// Second pass: get default branch, file listing, build artifacts.
const https = require('https');
const http = require('http');

function getRaw(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 dsh-research' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(getRaw(new URL(res.headers.location, url).toString()));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data, finalUrl: url }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const repo = 'dsh-market/dsh-market';
  const out = {};

  // Detect default branch from the repo HTML (GitHub embeds it).
  const html = await getRaw(`https://github.com/${repo}`);
  const m1 = html.body.match(/data-default-branch-name="([^"]+)"/);
  const m2 = html.body.match(/"defaultBranch":"([^"]+)"/);
  const m3 = html.body.match(/Default branch[^<]*<[^>]+>([^<]+)</);
  out.default_branch_candidates = {
    data_attr: m1?.[1],
    json_blob: m2?.[1],
    label_match: m3?.[1]?.trim(),
  };

  // Try the file listing page (ref=HEAD via /tree/HEAD)
  const tree = await getRaw(`https://github.com/${repo}/tree/HEAD`);
  out.tree_head_status = tree.status;
  out.tree_head_url = tree.finalUrl;

  // File names from this listing page
  const fileRe = /<a[^>]+class="[^"]*js-navigation-open[^"]*"[^>]+href="\/dsh-market\/dsh-market\/blob\/HEAD\/([^"?]+)"/g;
  const files = [];
  let m;
  while ((m = fileRe.exec(tree.body)) !== null) {
    if (!files.includes(m[1])) files.push(m[1]);
  }
  out.blob_files = files;

  const dirRe = /<a[^>]+class="[^"]*js-navigation-open[^"]*"[^>]+href="\/dsh-market\/dsh-market\/tree\/HEAD\/([^"?]+)"/g;
  const dirs = [];
  while ((m = dirRe.exec(tree.body)) !== null) {
    if (!dirs.includes(m[1])) dirs.push(m[1]);
  }
  out.tree_dirs = dirs;

  // Check if prebuilt artifacts exist (lib/, dist/, build/) in the repo
  for (const p of ['lib/index.js', 'dist/index.js', 'build/index.js', 'client/client.js', 'cordis.patch.yml']) {
    for (const branch of ['main', 'master']) {
      const r = await getRaw(`https://raw.githubusercontent.com/${repo}/${branch}/${p}`);
      out[`artifact_${branch}_${p.replace(/\//g, '_')}`] = {
        status: r.status,
        bytes: r.body.length,
        head: r.body.slice(0, 200),
      };
    }
  }

  // Chinese README
  const zh = await getRaw(`https://raw.githubusercontent.com/${repo}/main/README.zh.md`);
  out.readme_zh_status = zh.status;
  if (zh.status === 200) out.readme_zh = zh.body;

  // LICENSE
  const lic = await getRaw(`https://raw.githubusercontent.com/${repo}/main/LICENSE`);
  out.license_status = lic.status;
  if (lic.status === 200) out.license = lic.body;

  // cordis.patch.yml (key for understanding host wiring)
  const patch = await getRaw(`https://raw.githubusercontent.com/${repo}/main/cordis.patch.yml`);
  out.patch_status = patch.status;
  if (patch.status === 200) out.patch = patch.body;

  // .github folder -> maybe workflows
  const wf = await getRaw(`https://github.com/${repo}/tree/HEAD/.github`);
  out.wf_dir_status = wf.status;
  if (wf.status === 200) {
    const wfRe = /href="\/dsh-market\/dsh-market\/(?:blob|tree)\/HEAD\/.github\/([^"?]+)"/g;
    const wfFiles = [];
    while ((m = wfRe.exec(wf.body)) !== null) if (!wfFiles.includes(m[1])) wfFiles.push(m[1]);
    out.wf_files = wfFiles;
  }

  // data/ (registry snapshot) folder
  const dataDir = await getRaw(`https://github.com/${repo}/tree/HEAD/data`);
  out.data_dir_status = dataDir.status;
  if (dataDir.status === 200) {
    const dataRe = /href="\/dsh-market\/dsh-market\/(?:blob|tree)\/HEAD\/data\/([^"?]+)"/g;
    const dataFiles = [];
    while ((m = dataRe.exec(dataDir.body)) !== null) if (!dataFiles.includes(m[1])) dataFiles.push(m[1]);
    out.data_files = dataFiles;
  }

  // Check npm registry for dshmarket package
  const npmMeta = await getRaw(`https://registry.npmjs.org/dshmarket`);
  out.npm_status = npmMeta.status;
  if (npmMeta.status === 200) {
    try {
      const j = JSON.parse(npmMeta.body);
      out.npm = {
        name: j.name,
        description: j.description,
        'dist-tags': j['dist-tags'],
        versions: Object.keys(j.versions || {}).slice(-15),
        latest_version: j['dist-tags']?.latest,
        homepage: j.homepage,
        repository: j.repository,
        license: j.license,
        keywords: j.keywords,
        peerDependencies: j['dist-tags'] && j.versions?.[j['dist-tags'].latest]?.peerDependencies,
        dependencies: j['dist-tags'] && j.versions?.[j['dist-tags'].latest]?.dependencies,
      };
    } catch (e) {
      out.npm_raw = npmMeta.body.slice(0, 500);
    }
  } else {
    out.npm_error = npmMeta.body;
  }

  // Check scoped package alternative
  const npmScoped = await getRaw(`https://registry.npmjs.org/@deepseek-ai%2Fdsh-market`);
  out.npm_scoped_status = npmScoped.status;
  if (npmScoped.status === 200) {
    out.npm_scoped = JSON.parse(npmScoped.body.slice(0, 200));
  } else {
    out.npm_scoped_error = npmScoped.body.slice(0, 200);
  }

  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error('FATAL:', e.stack || e.message);
  process.exit(1);
});
