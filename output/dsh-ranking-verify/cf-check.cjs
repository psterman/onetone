const fs = require('fs');

const env = fs.readFileSync('E:/voice-pilot/daily-image-site/.env.local', 'utf8');
const get = (k) => {
  const m = env.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.+?)\\s*$', 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
};
const TOKEN = get('CLOUDFLARE_API_TOKEN');
const ACC = get('CLOUDFLARE_ACCOUNT_ID');
const H = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };

const api = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, headers: H });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
};

(async () => {
  console.log('account:', ACC, '| token:', TOKEN.slice(0, 12) + '…');

  // 1) zone onetone.app 在不在这个账号里
  const z = await api(`https://api.cloudflare.com/client/v4/zones?name=onetone.app`);
  console.log('\n=== zone onetone.app ===');
  console.log('http', z.status);
  console.log(
    (z.j.result || []).map((x) => ({
      id: x.id,
      name: x.name,
      status: x.status,
      account_id: x.account && x.account.id,
      same_account: x.account && x.account.id === ACC,
    }))
  );
  if (!z.j.success) console.log('errors:', JSON.stringify(z.j.errors));

  // 2) dsh-plugin-ranking 项目现有域名
  const d = await api(`https://api.cloudflare.com/client/v4/accounts/${ACC}/pages/projects/dsh-plugin-ranking/domains`);
  console.log('\n=== dsh-plugin-ranking 现有自定义域名 ===');
  console.log('http', d.status);
  console.log((d.j.result || []).map((x) => ({ name: x.name, status: x.status })));

  // 3) onetone 项目现有域名（对照）
  const o = await api(`https://api.cloudflare.com/client/v4/accounts/${ACC}/pages/projects/onetone/domains`);
  console.log('\n=== onetone 项目现有自定义域名（对照）===');
  console.log((o.j.result || []).map((x) => ({ name: x.name, status: x.status })));

  // 4) DNS 里 rank 子域是否已存在
  if (z.j.result && z.j.result[0]) {
    const zid = z.j.result[0].id;
    const rec = await api(`https://api.cloudflare.com/client/v4/zones/${zid}/dns_records?name=rank.onetone.app`);
    console.log('\n=== DNS rank.onetone.app 是否已存在 ===');
    console.log('http', rec.status, (rec.j.result || []).map((x) => ({ type: x.type, name: x.name, content: x.content })));
  }
})();
