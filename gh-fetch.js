// Fetch GitHub repo metadata + README + tree + package.json
const https = require('https');

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'dsh-research-bot',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...headers,
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function b64Decode(b64) {
  try { return Buffer.from(b64, 'base64').toString('utf8'); }
  catch (e) { return '<decode error: ' + e.message + '>'; }
}

(async () => {
  const repo = 'dsh-market/dsh-market';
  const out = {};

  // 1. Repo metadata
  const meta = await get(`https://api.github.com/repos/${repo}`);
  out.meta = { status: meta.status, body: JSON.parse(meta.body) };
  const full = out.meta.body;
  out.meta_short = {
    full_name: full.full_name,
    description: full.description,
    visibility: full.visibility || (full.private ? 'private' : 'public'),
    private: full.private,
    default_branch: full.default_branch,
    archived: full.archived,
    disabled: full.disabled,
    stargazers_count: full.stargazers_count,
    watchers_count: full.watchers_count,
    forks_count: full.forks_count,
    open_issues_count: full.open_issues_count,
    created_at: full.created_at,
    updated_at: full.updated_at,
    pushed_at: full.pushed_at,
    size: full.size,
    language: full.language,
    license: full.license ? { key: full.license.key, name: full.license.name, spdx_id: full.license.spdx_id } : null,
    topics: full.topics,
    homepage: full.homepage,
    html_url: full.html_url,
    clone_url: full.clone_url,
    ssh_url: full.ssh_url,
    has_pages: full.has_pages,
    has_issues: full.has_issues,
    has_projects: full.has_projects,
    has_wiki: full.has_wiki,
    has_downloads: full.has_downloads,
    message_if_error: full.message,
  };

  // 2. Default branch's README
  const branch = full.default_branch || 'main';
  const readme = await get(`https://api.github.com/repos/${repo}/readme?ref=${branch}`);
  out.readme_status = readme.status;
  if (readme.status === 200) {
    const r = JSON.parse(readme.body);
    out.readme_name = r.name;
    out.readme_path = r.path;
    out.readme_size = r.size;
    out.readme_text = b64Decode(r.content);
  } else {
    out.readme_error = readme.body;
  }

  // 3. Tree at root
  const tree = await get(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=0`);
  out.tree_status = tree.status;
  if (tree.status === 200) {
    const t = JSON.parse(tree.body);
    out.tree_truncated = t.truncated;
    out.tree = t.tree.map((n) => ({ path: n.path, type: n.type, size: n.size, sha: n.sha.slice(0, 8) }));
  } else {
    out.tree_error = tree.body;
  }

  // 4. package.json
  const pkg = await get(`https://api.github.com/repos/${repo}/contents/package.json?ref=${branch}`);
  out.pkg_status = pkg.status;
  if (pkg.status === 200) {
    const p = JSON.parse(pkg.body);
    out.pkg = {
      name: p.name,
      path: p.path,
      size: p.size,
      sha: p.sha,
      text: b64Decode(p.content),
    };
  } else {
    out.pkg_error = pkg.body;
  }

  // 5. Releases
  const rel = await get(`https://api.github.com/repos/${repo}/releases?per_page=20`);
  out.releases_status = rel.status;
  if (rel.status === 200) {
    out.releases = JSON.parse(rel.body).map((r) => ({
      tag_name: r.tag_name,
      name: r.name,
      draft: r.draft,
      prerelease: r.prerelease,
      published_at: r.published_at,
      html_url: r.html_url,
      author: r.author ? r.author.login : null,
    }));
  } else {
    out.releases_error = rel.body;
  }

  // 6. Tags
  const tags = await get(`https://api.github.com/repos/${repo}/tags?per_page=30`);
  out.tags_status = tags.status;
  if (tags.status === 200) {
    out.tags = JSON.parse(tags.body).map((t) => ({ name: t.name, sha: t.commit.sha.slice(0, 8) }));
  } else {
    out.tags_error = tags.body;
  }

  // 7. Branches
  const brs = await get(`https://api.github.com/repos/${repo}/branches?per_page=30`);
  out.branches_status = brs.status;
  if (brs.status === 200) {
    out.branches = JSON.parse(brs.body).map((b) => b.name);
  } else {
    out.branches_error = brs.body;
  }

  // 8. Topics & license
  out.topics = full.topics;
  out.license = full.license;

  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error('FATAL:', e.stack || e.message);
  process.exit(1);
});
