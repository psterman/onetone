const fs = require('fs');

const env = fs.readFileSync('E:/voice-pilot/daily-image-site/.env.local', 'utf8');
const get = (k) => {
  const m = env.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.+?)\\s*$', 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
};
const TOKEN = get('CLOUDFLARE_API_TOKEN');
const ACC = get('CLOUDFLARE_ACCOUNT_ID');
const H = { Authorization: 'Bearer ' + TOKEN };
const DOMAIN = process.argv[2] || 'rank.onetone.app';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const t0 = Date.now();
  let last = null;
  for (let i = 1; i <= 30; i++) {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACC}/pages/projects/dsh-plugin-ranking/domains`,
      { headers: H }
    );
    const j = await r.json();
    const d = (j.result || []).find((x) => x.name === DOMAIN);
    const st = d ? d.status : 'missing';
    const elapsed = Math.round((Date.now() - t0) / 1000);
    if (st !== last) {
      console.log(`[${elapsed}s] ${DOMAIN} → status=${st} verification=${d?.verification_data?.status}`);
      last = st;
    }
    if (st === 'active') {
      console.log(`\n✓ 证书已签发，域名生效（用时 ${elapsed}s）`);
      // 立即验证线上内容
      const res = await fetch(`https://${DOMAIN}/`);
      const buf = Buffer.from(await res.arrayBuffer());
      console.log('  HTTPS', res.status, buf.length, 'bytes  content-type:', res.headers.get('content-type'));
      const local = fs.readFileSync('C:/Users/pstem/Downloads/dsh-plugin-site/index.html');
      const crypto = require('crypto');
      const h1 = crypto.createHash('sha256').update(local).digest('hex');
      const h2 = crypto.createHash('sha256').update(buf).digest('hex');
      console.log('  与本地产物字节一致:', h1 === h2);
      for (const p of ['/ranking', '/data/plugins-top100.json', '/data/plugins-top100.csv', '/poster-top30.png', '/sitemap.xml', '/robots.txt']) {
        try {
          const rr = await fetch(`https://${DOMAIN}${p}`);
          console.log(`  ${p.padEnd(28)} ${rr.status}  ${(await rr.arrayBuffer()).byteLength} bytes`);
        } catch (e) {
          console.log(`  ${p.padEnd(28)} ERR ${e.message}`);
        }
      }
      process.exit(0);
    }
    if (st === 'failed' || st === 'deleted') {
      console.log('✗ 域名绑定失败：', JSON.stringify(d));
      process.exit(1);
    }
    await sleep(20000);
  }
  console.log('超时仍未 active，最后状态：', last);
  process.exit(2);
})();
