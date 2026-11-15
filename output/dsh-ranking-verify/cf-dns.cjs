const fs = require('fs');

const env = fs.readFileSync('E:/voice-pilot/daily-image-site/.env.local', 'utf8');
const get = (k) => {
  const m = env.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.+?)\\s*$', 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
};
const TOKEN = get('CLOUDFLARE_API_TOKEN');
const ACC = get('CLOUDFLARE_ACCOUNT_ID');
const H = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
const ZONE = 'a9b4193bdb4af81ccc31c045338352ad';

const api = async (url, opt = {}) => {
  const r = await fetch(url, { ...opt, headers: H });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
};

(async () => {
  // token 能干什么
  const v = await api('https://api.cloudflare.com/client/v4/user/tokens/verify');
  console.log('=== token verify ===', v.status, JSON.stringify(v.j.result || v.j.errors));

  // 尝试建 CNAME：rank.onetone.app → dsh-plugin-ranking.pages.dev
  const body = {
    type: 'CNAME',
    name: 'rank.onetone.app',
    content: 'dsh-plugin-ranking.pages.dev',
    proxied: true,
    ttl: 1,
  };
  const c = await api(`https://api.cloudflare.com/client/v4/zones/${ZONE}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  console.log('\n=== 创建 CNAME ===', c.status);
  if (c.j.success) {
    console.log(JSON.stringify({ id: c.j.result.id, name: c.j.result.name, type: c.j.result.type, content: c.j.result.content, proxied: c.j.result.proxied }, null, 1));
  } else {
    console.log('errors:', JSON.stringify(c.j.errors || [], null, 1));
  }
})();
