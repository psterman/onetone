// Fetch via raw.githubusercontent.com and html scraping (no GitHub API).
const https = require('https');
const http = require('http');

function getRaw(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 dsh-research' },
    };
    const req = lib.request(opts, (res) => {
      // follow up to 5 redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        resolve(getRaw(next));
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

  // 1. Try HTML repo page
  const html = await getRaw(`https://github.com/${repo}`);
  out.html_status = html.status;
  out.html_final_url = html.finalUrl;
  out.html_len = html.body.length;
  out.html_snippet_title = html.body.match(/<title>[^<]*<\/title>/i)?.[0];

  // Extract description & visibility hints
  const descMatch = html.body.match(/<p[^>]*class="[^"]*f4[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  out.html_description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 500) : null;

  // 404 detection
  out.html_is_404 = /404|Not Found/i.test(html.body) && /This is not the web page you are looking for/i.test(html.body);

  // 2. Try main branch README (raw)
  const readmeMain = await getRaw(`https://raw.githubusercontent.com/${repo}/main/README.md`);
  out.readme_main_status = readmeMain.status;
  if (readmeMain.status === 200) {
    out.readme_main = readmeMain.body;
  } else {
    const readmeMaster = await getRaw(`https://raw.githubusercontent.com/${repo}/master/README.md`);
    out.readme_master_status = readmeMaster.status;
    if (readmeMaster.status === 200) {
      out.readme_master = readmeMaster.body;
    }
  }

  // 3. Try package.json (main, master, src)
  for (const branch of ['main', 'master']) {
    for (const path of ['package.json', 'src/package.json']) {
      const u = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
      const r = await getRaw(u);
      out[`pkg_${branch}_${path.replace(/\//g, '_')}_status`] = r.status;
      if (r.status === 200) {
        out[`pkg_${branch}_${path.replace(/\//g, '_')}`] = r.body;
      }
    }
  }

  // 4. Try listing root via the github HTML tree fragment
  // GitHub serves the file tree via a JSON endpoint (not API); but we can use the html page
  // to extract the file-tree entries.
  const treeMatch = html.body.match(/js-file-line[\s\S]*?<\/tr>/g);
  out.html_tree_rows = treeMatch ? treeMatch.length : 0;

  // Use the directory listing in /tree/ format
  const tree = await getRaw(`https://github.com/${repo}`);
  // The HTML repo page includes a "react-partial" or file rows
  // Try to capture the file names inside a tbody with class "react-directory-truncate-text" or similar
  const fileNames = [];
  const re = /<a[^>]+href="\/dsh-market\/dsh-market\/tree\/[^"]+\/([^"?]+)"/g;
  let m;
  while ((m = re.exec(tree.body)) !== null) {
    if (!fileNames.includes(m[1])) fileNames.push(m[1]);
  }
  out.html_root_files = fileNames.slice(0, 100);

  // 5. Releases page
  const rels = await getRaw(`https://github.com/${repo}/releases`);
  out.releases_status = rels.status;
  // Extract tag names
  const tagRe = /\/dsh-market\/dsh-market\/releases\/tag\/([^"]+)"/g;
  const tags = [];
  while ((m = tagRe.exec(rels.body)) !== null) {
    if (!tags.includes(m[1])) tags.push(m[1]);
  }
  out.releases_tags = tags;

  // 6. Tags page
  const tagsHtml = await getRaw(`https://github.com/${repo}/tags`);
  out.tags_status = tagsHtml.status;
  const tagRe2 = /\/dsh-market\/dsh-market\/releases\/tag\/([^"]+)"/g;
  const tags2 = [];
  while ((m = tagRe2.exec(tagsHtml.body)) !== null) {
    if (!tags2.includes(m[1])) tags2.push(m[1]);
  }
  out.tags_list = tags2;

  // 7. Branches
  const brs = await getRaw(`https://github.com/${repo}/branches`);
  out.branches_status = brs.status;
  const branchRe = /\/dsh-market\/dsh-market\/tree\/([^"]+)"/g;
  const brs2 = [];
  while ((m = branchRe.exec(brs.body)) !== null) {
    if (!brs2.includes(m[1])) brs2.push(m[1]);
  }
  out.branches_list = brs2;

  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error('FATAL:', e.stack || e.message);
  process.exit(1);
});
