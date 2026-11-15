const fs = require('fs');

const env = fs.readFileSync('E:/voice-pilot/daily-image-site/.env.local', 'utf8');
const get = (k) => {
  const m = env.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.+?)\\s*$', 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
};
const TOKEN = get('CLOUDFLARE_API_TOKEN');
const ACC = get('CLOUDFLARE_ACCOUNT_ID');
const H = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
const PROJECT = 'dsh-plugin-ranking';
const OLD = 'rank.onetone.app';
const NEW = process.argv[2] || 'plugins.onetone.app';

const api = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, headers: H });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
};

(async () => {
  // 1) 删掉没生效的旧域名
  const list = await api(`https://api.cloudflare.com/client/v4/accounts/${ACC}/pages/projects/${PROJECT}/domains`);
  const olds = (list.j.result || []).filter((x) => x.name === OLD);
  for (const o of olds) {
    const d = await api(
      `https://api.cloudflare.com/client/v4/accounts/${ACC}/pages/projects/${PROJECT}/domains/${o.id}`,
      { method: 'DELETE' }
    );
    console.log(`删除 ${OLD} → http ${d.status}`, d.j.success === false ? JSON.stringify(d.j.errors) : 'ok');
  }
  if (!olds.length) console.log(`没有旧域名 ${OLD} 需要删`);

  // 2) 绑定新域名
  const add = await api(`https://api.cloudflare.com/client/v4/accounts/${ACC}/pages/projects/${PROJECT}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name: NEW }),
  });
  console.log(`\n绑定 ${NEW} → http ${add.status}`);
  if (add.j.success) {
    const r = add.j.result;
    console.log(JSON.stringify({ name: r.name, status: r.status, verification: r.verification_data }, null, 1));
  } else {
    console.log('errors:', JSON.stringify(add.j.errors || [], null, 1));
  }

  // 3) 回读
  const after = await api(`https://api.cloudflare.com/client/v4/accounts/${ACC}/pages/projects/${PROJECT}/domains`);
  console.log('\n=== 当前自定义域名 ===');
  console.log((after.j.result || []).map((x) => ({ name: x.name, status: x.status })));
})();
