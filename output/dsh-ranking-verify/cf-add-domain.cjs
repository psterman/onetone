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
const NAME = process.argv[2] || 'rank.onetone.app';

const api = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, headers: H });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
};

(async () => {
  // DNS 403 的具体原因（只打印错误码，不打印任何密钥）
  const z = await api(`https://api.cloudflare.com/client/v4/zones?name=onetone.app`);
  const zid = z.j.result && z.j.result[0].id;
  if (zid) {
    const rec = await api(`https://api.cloudflare.com/client/v4/zones/${zid}/dns_records?name=${NAME}`);
    console.log('DNS 读权限探测 → http', rec.status, JSON.stringify(rec.j.errors || []));
  }

  // 绑定自定义域名
  console.log(`\n绑定自定义域名 ${NAME} → 项目 ${PROJECT}`);
  const add = await api(`https://api.cloudflare.com/client/v4/accounts/${ACC}/pages/projects/${PROJECT}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name: NAME }),
  });
  console.log('http', add.status);
  if (!add.j.success) {
    console.log('errors:', JSON.stringify(add.j.errors || [], null, 1));
  } else {
    const r = add.j.result;
    console.log(JSON.stringify({
      name: r.name,
      status: r.status,
      verification_data: r.verification_data,
      certificate_authority: r.certificate_authority,
    }, null, 1));
  }

  // 回读项目域名列表
  const list = await api(`https://api.cloudflare.com/client/v4/accounts/${ACC}/pages/projects/${PROJECT}/domains`);
  console.log('\n=== 当前自定义域名 ===');
  console.log((list.j.result || []).map((x) => ({ name: x.name, status: x.status })));
})();
