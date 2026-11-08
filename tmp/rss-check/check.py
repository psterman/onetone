"""Check every feed in all.opml: reachable? valid RSS? updated in the last 30 days?

Streams only the beginning of each feed (stops after two pubDate tags) because the
service has no Last-Modified / Range support and full articles are large.
"""
import os
import re
import sys
import csv
import json
import time
import zlib
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

BASE = os.path.dirname(os.path.abspath(__file__))
OPML = os.path.join(BASE, 'all.opml')
NOW = datetime.now(timezone.utc)
CUTOFF = NOW - timedelta(days=30)
TZ8 = timezone(timedelta(hours=8))
UA = 'Mozilla/5.0 (compatible; OneTone-rss-health-check/1.0)'
MAX_BYTES = 131072
TIMEOUT = int(os.environ.get('RSS_TIMEOUT', '12'))
ATTEMPTS = int(os.environ.get('RSS_ATTEMPTS', '3'))
PUBDATE_RE = re.compile(rb'<pubDate>\s*([^<]+?)\s*</pubDate>')
TITLE_RE = re.compile(rb'<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>', re.S)
FALLBACK_DATE_RE = re.compile(rb'(20\d\d-\d\d-\d\d \d\d:\d\d)')


def load_feeds():
    root = ET.parse(OPML).getroot()
    out = []
    for o in root.findall('.//outline'):
        url = o.get('xmlUrl')
        if not url:
            continue
        out.append({'name': (o.get('text') or o.get('title') or '').strip(), 'url': url})
    return out


def check(feed):
    rec = {
        'name': feed['name'], 'url': feed['url'], 'http': None, 'ok': False,
        'status': '', 'title': '', 'latest': '', 'items_in_sample': 0,
        'bytes': 0, 'age_days': None, 'recent': False,
    }
    last = ''
    for attempt in range(ATTEMPTS):
        try:
            req = urllib.request.Request(feed['url'], headers={
                'User-Agent': UA,
                'Accept-Encoding': 'gzip',
                'Connection': 'close',
            })
            t_start = time.time()
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                rec['http'] = r.status
                gz = 'gzip' in r.headers.get('Content-Encoding', '').lower()
                dec = zlib.decompressobj(16 + zlib.MAX_WBITS) if gz else None
                raw_len = 0
                buf = b''
                while raw_len < 262144 and time.time() - t_start < 20:
                    chunk = r.read(8192)
                    if not chunk:
                        break
                    raw_len += len(chunk)
                    try:
                        buf += dec.decompress(chunk) if dec else chunk
                    except Exception:
                        break
                    if buf.count(b'</pubDate>') >= 3 or len(buf) >= 1048576:
                        break
                if dec:
                    try:
                        buf += dec.flush()
                    except Exception:
                        pass
            rec['bytes'] = raw_len
            if b'<rss' not in buf and b'<feed' not in buf:
                rec['status'] = 'not_rss'
                rec['attempts'] = attempt + 1
                return rec
            m = TITLE_RE.search(buf)
            if m:
                rec['title'] = m.group(1).decode('utf-8', 'replace').strip()[:80]
            rec['items_in_sample'] = buf.count(b'<item') + buf.count(b'<entry')
            dates = PUBDATE_RE.findall(buf)
            from_content = False
            if not dates:
                m2 = FALLBACK_DATE_RE.search(buf)
                if m2:
                    dates = [m2.group(1)]
                    from_content = True
            if not dates:
                rec['ok'] = True
                rec['status'] = 'no_pubdate' if rec['items_in_sample'] else 'empty_feed'
                rec['attempts'] = attempt + 1
                return rec
            parsed = []
            for d in dates[:8]:
                try:
                    s = d.decode('ascii', 'ignore').strip()
                    if from_content:
                        dt = datetime.strptime(s, '%Y-%m-%d %H:%M').replace(tzinfo=TZ8)
                    else:
                        dt = parsedate_to_datetime(s)
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=timezone.utc)
                    parsed.append(dt.astimezone(timezone.utc))
                except Exception:
                    pass
            if not parsed:
                rec['ok'] = True
                rec['status'] = 'bad_pubdate'
                rec['attempts'] = attempt + 1
                return rec
            latest = max(parsed)
            rec['latest'] = latest.astimezone(TZ8).strftime('%Y-%m-%d %H:%M')
            rec['age_days'] = round((NOW - latest).total_seconds() / 86400, 1)
            rec['ok'] = True
            rec['date_source'] = 'content' if from_content else 'pubDate'
            rec['recent'] = CUTOFF <= latest <= NOW + timedelta(days=2)
            rec['status'] = 'recent' if rec['recent'] else 'stale'
            rec['attempts'] = attempt + 1
            return rec
        except urllib.error.HTTPError as e:
            rec['http'] = e.code
            last = 'http_%d' % e.code
            if e.code < 500:
                break
        except Exception as e:
            last = 'error_%s' % type(e).__name__
        time.sleep(0.6 * (attempt + 1))
    rec['status'] = last or 'error_unknown'
    rec['attempts'] = ATTEMPTS
    return rec


def write_opml(path, rows, title):
    esc = lambda s: (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<opml version="1.0">\n\t<head>\n\t\t<title>%s</title>\n\t</head>\n\t<body>\n' % esc(title))
        for r in rows:
            f.write('\t\t<outline text="%s" type="rss" xmlUrl="%s" htmlUrl="%s" title="%s"></outline>\n' %
                    (esc(r['name']), esc(r['url']), esc(r['url']), esc(r['name'])))
        f.write('\t</body>\n</opml>\n')


def main():
    feeds = load_feeds()
    limit = 0
    workers = 16
    prior = []
    only_failed = '--only-failed' in sys.argv
    for a in sys.argv[1:]:
        if a.startswith('--limit='):
            limit = int(a.split('=', 1)[1])
        if a.startswith('--workers='):
            workers = int(a.split('=', 1)[1])
    if only_failed:
        with open(os.path.join(BASE, 'results.json'), encoding='utf-8') as f:
            prior = json.load(f)['results']
        feeds = [{'name': r['name'], 'url': r['url']} for r in prior if not r['ok']]
    if limit:
        feeds = feeds[:limit]
    print('checking %d feeds, workers=%d, cutoff=%s' %
          (len(feeds), workers, CUTOFF.astimezone(TZ8).strftime('%Y-%m-%d %H:%M')), flush=True)
    t0 = time.time()
    results = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {pool.submit(check, f): i for i, f in enumerate(feeds)}
        for n, fut in enumerate(as_completed(futs), 1):
            results.append(fut.result())
            if n % 25 == 0 or n == len(feeds):
                print('  %d/%d  %.0fs' % (n, len(feeds), time.time() - t0), flush=True)
    if only_failed:
        by_url = {r['url']: r for r in results}
        results = [by_url.get(r['url'], r) for r in prior]
        print('  rechecked %d failed feeds; merged back into %d' % (len(by_url), len(results)), flush=True)
    results.sort(key=lambda r: (not r['recent'], r['name']))

    with open(os.path.join(BASE, 'results.json'), 'w', encoding='utf-8') as f:
        json.dump({'checked_at': NOW.astimezone(TZ8).isoformat(), 'cutoff': CUTOFF.astimezone(TZ8).isoformat(),
                   'total': len(results), 'results': results}, f, ensure_ascii=False, indent=1)
    with open(os.path.join(BASE, 'feeds-checked.csv'), 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['公众号', '状态', '近30天更新', '最新文章(北京时间)', '距今(天)', 'HTTP', '抓取字节', '样本条目数', 'RSS标题', 'RSS地址'])
        for r in results:
            w.writerow([r['name'], r['status'], '是' if r['recent'] else '否', r['latest'],
                        r['age_days'] if r['age_days'] is not None else '', r['http'] or '',
                        r['bytes'], r['items_in_sample'], r['title'], r['url']])

    valid = [r for r in results if r['ok']]
    recent = [r for r in results if r['recent']]
    stale = [r for r in results if r['ok'] and r['status'] == 'stale']
    broken = [r for r in results if not r['ok']]
    nodate = [r for r in results if r['ok'] and r['status'] in ('no_pubdate', 'bad_pubdate', 'empty_feed')]
    content_date = [r for r in results if r.get('date_source') == 'content']
    write_opml(os.path.join(BASE, 'active-30d.opml'), recent, 'BestBlogs Wechat2RSS - 近30天有更新')
    write_opml(os.path.join(BASE, 'valid.opml'), valid, 'BestBlogs Wechat2RSS - 可访问')

    lines = []
    lines.append('# Wechat2RSS 375 源体检报告\n')
    lines.append('- 检测时间：%s（北京时间）' % NOW.astimezone(TZ8).strftime('%Y-%m-%d %H:%M'))
    lines.append('- 近一月判定线：%s 之后（30 天窗口）' % CUTOFF.astimezone(TZ8).strftime('%Y-%m-%d %H:%M'))
    lines.append('- 并发 %d，单请求超时 %ds，最多 %d 次重试；gzip 流式读取，读到 3 个 pubDate 或 256KB 压缩数据即断开\n' % (workers, TIMEOUT, ATTEMPTS))
    lines.append('## 汇总\n')
    lines.append('| 指标 | 数量 |')
    lines.append('|---|---:|')
    lines.append('| OPML 总源数 | %d |' % len(results))
    lines.append('| 可访问且为合法 RSS | %d |' % len(valid))
    lines.append('| **近 30 天有更新** | **%d** |' % len(recent))
    lines.append('| 有效但陈旧（超 30 天） | %d |' % len(stale))
    lines.append('| 有效但无可用日期 | %d |' % len(nodate))
    lines.append('| 其中日期由正文推断（feed 缺 pubDate） | %d |' % len(content_date))
    lines.append('| 不可访问 / 非法响应 | %d |' % len(broken))
    from collections import Counter
    lines.append('\n失效原因分布：' + '、'.join('%s=%d' % kv for kv in Counter(r['status'] for r in broken).most_common()) + '\n')

    lines.append('## 不可访问的源（%d）\n' % len(broken))
    if broken:
        lines.append('| 名称 | 状态 | HTTP |')
        lines.append('|---|---|---:|')
        for r in broken:
            lines.append('| %s | %s | %s |' % (r['name'], r['status'], r['http'] or ''))
    else:
        lines.append('无。')
    lines.append('\n## 有效但陈旧的源（%d，按停更时间从久到近）\n' % len(stale))
    if stale:
        lines.append('| 名称 | 最新文章 | 距今(天) |')
        lines.append('|---|---|---:|')
        for r in sorted(stale, key=lambda x: -(x['age_days'] or 0)):
            lines.append('| %s | %s | %s |' % (r['name'], r['latest'], r['age_days']))
    else:
        lines.append('无。')
    lines.append('\n## 有效但无可用日期（%d）\n' % len(nodate))
    if nodate:
        for r in nodate:
            lines.append('- %s（%s）' % (r['name'], r['status']))
    else:
        lines.append('无。')
    lines.append('\n## 近 30 天有更新（%d）\n' % len(recent))
    lines.append('完整清单见 `feeds-checked.csv`，可直接导入的订阅文件见 `active-30d.opml`。\n')
    lines.append('| 名称 | 最新文章 | 距今(天) |')
    lines.append('|---|---|---:|')
    for r in sorted(recent, key=lambda x: (x['age_days'] or 999)):
        lines.append('| %s | %s | %s |' % (r['name'], r['latest'], r['age_days']))
    with open(os.path.join(BASE, 'report.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    print('DONE total=%d valid=%d recent=%d stale=%d nodate=%d broken=%d elapsed=%.0fs' %
          (len(results), len(valid), len(recent), len(stale), len(nodate), len(broken), time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
