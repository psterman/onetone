# 图片站点赞 + 按图评论 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给每日图片站的每张图片加上点赞（开放、去重、显示赞数），并让评论能绑定到具体某张图（复用现有留言板 + 投稿口令）。

**Architecture:** 后端新增一个 Pages Function `/likes/api`，把「一期」的点赞数据放在**一个** R2 对象里（`likes/<日期>.json`，含 `counts` + `voters`），这样页面加载只需 **1 次** 请求就拿到全部 243 张图的计数，不会 243 个请求把页面卡死；写入沿用留言板那套 etag 乐观锁，并发点赞不会互相覆盖。评论不新建存储 —— 复用现有 `board/messages.json`，每条留言加三个可选字段（`imgDate` / `imgId` / `imgThumb`），老留言零影响。前端在缩略图格子上渲染赞数角标，在全屏查看器底部加「点赞 + 评论这张图」两个入口；「我赞过哪些图」完全存在浏览器 localStorage，因此计数接口保持访客无关、可以被边缘缓存。

**Tech Stack:** Cloudflare Pages Functions（workerd，ES Module，原生 `Request`/`Response`/`crypto.subtle`）、R2（现有 `IMAGES` binding）、原生 JS（ES5 风格，无框架、无构建）、原生 CSS、Node 22 测试脚本、Playwright（本地 `node_modules` 已有）做前端测试。

**Spec:** `docs/superpowers/specs/2026-11-04-image-likes-comments-design.md`

**执行顺序**：Task 1 → 2 → 3 → 4 → 5。每个 Task 都能独立上线。

---

## Global Constraints

以下约束对**每个** Task 生效，不得偏离：

- **不新建任何 Cloudflare 资源。** 点赞数据写进现有 bucket `daily-images`（`IMAGES` binding），前缀 `likes/` 与 `board/` 隔开。不建 D1、不建 KV、不加新的 Pages secret。
- **不引第三方依赖。** 后端只用 Web 标准 API（`crypto.subtle`、`Request`/`Response`/`Headers`）；前端只用原生 JS + 原生 CSS；测试只用 Node 内置模块 + 已在本地 `node_modules` 里的 `playwright`。
- **不改构建链路。** `tools/build.mjs` 一个字都不动；manifest 的结构不变（`id` 仍然是 `jianwen_001` 这种栏目内序号）。
- **不改现有留言板的口令机制。** `functions/board/_middleware.js` 的 `SUBMIT_TOKEN` / `dboard` cookie / `?k=` 换 cookie 全部保持原样；本计划只扩展 `functions/board/api.js` 接受三个可选字段。
- **所有用户输入用 `textContent` 插入**，不拼 HTML；外链只放行 `http`/`https`。
- **单图键一律是 `<日期>/<栏目>_<序号>`。** manifest 里的 `id` 只是栏目内序号，每一期都有 `jianwen_001`，直接当键会跨期串味。
- **`imgThumb` 必须走白名单正则** `^/img/\d{4}-\d{2}-\d{2}/[a-z]+/[0-9a-f]{10}_\d{3}_t\.webp$` —— 它会被渲染成 `<img src>`，放开等于允许任意 URL 注入。
- **`GET /likes/api` 的响应里不得出现访客相关字段**（`mine` 之类）。它要被边缘缓存，混进访客数据会把一个人的点赞清单发给所有人。访客状态一律走 localStorage。
- **中文文案里的换行用 `String.fromCharCode(10)`**，不要写 `'\n'` —— `site/app.js` 里的代码不在模板字符串里，但 `site/board.html` / `functions/board/api.js` 里的模板片段要注意同样的坑（`functions/board/api.js` 的模板字符串里已经踩过一次）。
- **`.ps1` 必须是 UTF-8 with BOM。** 本计划不新增 `.ps1`，但改到现有 `.ps1` 时必须跑 `node tools/fix-ps1-encoding.mjs <file>` 验语法。
- **每步必须先写失败测试、跑到失败、再写实现、跑到通过。**
- **R2 条件写只有一个契约，必须照抄**（来源：https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ ，文档更新于 2026-07-31）：
  - 字段名是 **`etagMatches`**，**没有 `etagMatch`** —— 传错会被运行时忽略，条件写退化成无条件写，乐观锁等于不存在。
  - 前置条件不满足时 **`put()` 返回 `null`**（不是抛异常），对象不会被存。不看返回值就会把「没写成」当成「写成了」。
  - 「仅当对象不存在才创建」要用 `onlyIf: new Headers({ 'If-None-Match': '*' })`；
    `etagDoesNotMatch: '*'` 的语义是「etag 不等于 `*` 就执行」，**不等于**「对象必须不存在」。
- **共享代码放 `lib/`，不放 `functions/` 下** —— `functions/` 里的每个文件都会变成一条 Pages 路由。
- **站点代码不在 git 里**（见「附录 A」）。所以每个 Task 的最后一步是**验证**，不是 commit；只有 `docs/superpowers/plans/` 下的本计划文件在仓库里。

---

## 文件结构

| 文件 | 职责 | 状态 |
|---|---|---|
| `lib/r2-json.mjs` | **共享**读写层：`json` / `clip` / `sha256hex` / `sameOrigin` / `readJson` / `writeJson`（etag 条件写）/ `mutate`（乐观锁重试）。留言板和点赞接口共用一份 | 新建 |
| `lib/rate-limit.mjs` | **共享**限流器：`makeRateLimiter({key, salt, perMinute, perHour, historyMax})`，按 IP 加盐哈希计数。放在 `functions/` 外面，不会变成 Pages 路由 | 新建 |
| `functions/likes/api.js` | 点赞接口：`GET /likes/api`（读计数）、`POST /likes/api`（切换点赞）。R2 读写和限流走共享层 | 新建 |
| `tools/r2-mock.mjs` | 测试用的 R2 替身，**严格按 Cloudflare 官方契约**实现（只认 `etagMatches`、冲突返回 `null`、带延迟、暴露 `stats`）。从 `tools/test-board.mjs` 里抽出来共用 | 新建 |
| `tools/test-likes.mjs` | 点赞接口单测 + 留言板图字段单测 | 新建 |
| `functions/board/api.js` | Task 1：改用共享层并修正 etag 条件写（原 `etagMatch` 键名错，乐观锁从未生效）。Task 2：再扩展 —— 接受并校验 `imgDate` / `imgId` / `imgThumb`；GET 回传这三个字段 | 修改 |
| `tools/test-board.mjs` | 改用 `tools/r2-mock.mjs`（去掉内联的 mock R2），其余断言不动 | 修改 |
| `site/app.js` | 访客 ID、拉计数、渲染角标、查看器操作栏、点赞请求、本地「赞过」记录 | 修改 |
| `site/app.css` | 角标样式、查看器操作栏样式 | 修改 |
| `site/template.html` | 查看器操作栏的 DOM 骨架 | 修改 |
| `site/board.html` | 解析 `?img=&id=&thumb=`、显示目标图、留言列表带缩略图、按图过滤 | 修改 |
| `tools/test-likes-ui.mjs` | Playwright 前端测试：角标渲染、点赞切换、localStorage 持久化、评论入口链接 | 新建 |
| `tools/test-board-ui.mjs` | Playwright 前端测试：留言板页的图上下文、缩略图渲染、按图过滤 | 新建 |
| `README.md` | 新增「点赞 / 按图评论」章节 + 现状表 + 已知限制 | 修改 |

---

### Task 1: 点赞后端接口 + 共享 R2 读写层 + 单元测试

**Files:**
- Create: `E:\voice-pilot\daily-image-site\lib\r2-json.mjs`（共享读写层）
- Create: `E:\voice-pilot\daily-image-site\lib\rate-limit.mjs`（共享限流器）
- Create: `E:\voice-pilot\daily-image-site\tools\r2-mock.mjs`（严格按官方契约的 R2 替身）
- Create: `E:\voice-pilot\daily-image-site\tools\test-likes.mjs`
- Create: `E:\voice-pilot\daily-image-site\functions\likes\api.js`
- Modify: `E:\voice-pilot\daily-image-site\functions\board\api.js`（改用共享层；修条件写）
- Modify: `E:\voice-pilot\daily-image-site\tools\test-board.mjs`（改成 import 共享 mock）

**Interfaces:**
- Consumes: `env.IMAGES`（R2 bucket binding，key 形如 `likes/2026-11-03.json`、`likes/rate.json`、`board/messages.json`）
- Produces:
  - `lib/r2-json.mjs` 导出：`json(data, status, extraHeaders)`、`clip(s, max)`、`sha256hex(text)`、`sameOrigin(request)`、`readJson(bucket, key, fallback)`、`writeJson(bucket, key, data, currentEtag)`、`mutate(bucket, key, fallback, mutateFn)`
  - `lib/rate-limit.mjs` 导出：`makeRateLimiter(cfg)`，返回 `{ key, check(bucket, request), record(bucket, ipHash, now) }`
  - `GET /likes/api?date=YYYY-MM-DD` → `200 { ok: true, date, counts: {<id>: n}, comments: {<id>: n} }`，缓存头 `Cache-Control: public, max-age=30`
  - `POST /likes/api`，请求头 `x-daily-visitor: <16 位小写 hex>`，请求体 `{ date, id, on }` → `200 { ok: true, id, count, on }`
  - 错误：`400`（date/id/visitor 非法）、`403`（跨站 Origin）、`405`（非 GET/POST）、`409`（该图 voters 达上限）、`429`（限流）、`503`（R2 没绑定 / 写冲突重试耗尽）

#### 背景：这一版和初版计划不一样，初版是错的

初版计划让每个 Function 自带一份读写辅助函数。评审时发现两处都写了
`onlyIf: { etagMatch: ... }` —— **按 Cloudflare 官方契约这个键名不存在**。

> 官方契约（逐字出自 https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ ，文档更新于 2026-07-31）：
>
> - `R2Conditional` 的字段是 `etagMatches` / `etagDoesNotMatch` / `uploadedBefore` / `uploadedAfter`。
>   **没有 `etagMatch`**。传了会被运行时忽略 —— 条件写退化成无条件写，乐观锁等于不存在。
> - 「If the condition check for `put()` fails, `null` will be returned instead of the `R2Object`」
>   —— 冲突是**返回 `null`**，不是抛异常。
> - `etagDoesNotMatch` 的语义是「对象的 etag 不等于给定字符串就执行」。
>   `*` 永远不等于任何真实 etag → **它不等于「对象必须不存在」**。
>   「仅当不存在才创建」的正确写法是传 `Headers`：`onlyIf: new Headers({ 'If-None-Match': '*' })`。
>
> 连带影响：**线上留言板的 `functions/board/api.js` 用的也是这个错键名**，
> 也就是说留言板的乐观锁从来没生效过（代码里那句「并发提交不会互相覆盖」是假的）。
> 两份拷贝各修一次 = 以后还得再修一次，所以抽成共享模块。

#### 共享模块放在 `lib/`，不放在 `functions/` 下

`functions/` 下的每个文件都会变成一条 Pages 路由（`functions/board/index.js` → `/board/`）。
共享模块放 `functions/` 外面，用相对路径 import，Wrangler 打包时会被 esbuild 内联进函数包里。

> **这条在 Task 5 部署时才能最终确认**：本机跑不了 workerd，
> 如果 `wrangler pages deploy` 不接受 `functions/` 外的 import，构建会当场报错（不会静默出错）。
> 届时若失败，把 `lib/` 挪到 `functions/_lib/`（下划线开头的目录不会被路由）并同步改 import 路径。

#### 严格 mock 是这次修复的关键，不是可选项

初版 mock 认错了键名、冲突时抛异常、`'*'` 语义也不对 —— 结果把上面这些 bug 全挡住了。
评审做了变异测试：**把乐观锁整个删掉，「并发点赞不丢」那条断言照样通过**；
实测该场景 12 次写、**0 次** etag 冲突（mock 的 get/put 是同步体，并发请求被天然串行化了）。

所以这一版 mock 必须：
1. 只认 `etagMatches`；遇到不认识的 `onlyIf` 键**直接抛错**（拼错键名要当场炸，不能悄悄退化成无条件写）
2. 只认 `Headers` 形式的 `If-None-Match: *`
3. 前置条件不满足时**返回 `null`**（官方契约），不抛异常
4. `get`/`put` 之间有真实延迟 —— 不加延迟就永远撞不上冲突，那条并发断言就是白写的
5. 暴露 `stats`（`gets` / `puts` / `conflicts`），让测试能断言「冲突真的发生过」

- [ ] **Step 1: 写严格 mock R2**

新建 `tools/r2-mock.mjs`：

```js
/**
 * 测试用的 R2 替身 —— 严格按 Cloudflare 官方契约实现。
 *
 * 为什么必须严格：
 *   之前这版 mock 认错了 etag 键名（etagMatch 而非 etagMatches）、
 *   冲突时抛异常而不是返回 null，结果把生产代码里的条件写 bug 完全挡住了 ——
 *   「并发点赞不丢」那条断言在把乐观锁整个删掉后照样通过。
 *   mock 宽松 = 测试在测 fiction，不是在测产品。
 *
 * 严格的五个点：
 *   1. 只认 etagMatches。遇到不认识的 onlyIf 键直接抛错 ——
 *      拼错键名要当场炸，不能悄悄退化成无条件写。
 *   2. 只认 Headers 形式的 If-None-Match: *（官方唯一的「仅当不存在才创建」写法）。
 *   3. 前置条件不满足时返回 null（官方契约），不抛异常。
 *   4. get/put 之间有真实延迟 —— 不加延迟的话并发请求会被同步体天然串行化，
 *      永远撞不上 etag 冲突，那条并发断言就白写了。
 *   5. 暴露 stats，让测试能断言「冲突真的发生过」。
 *
 * 官方契约：https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
 */

/** FNV-1a。真实 R2 的 etag 是不带引号的十六进制（httpEtag 才带引号） */
function etagOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/**
 * @param {object} store 存对象的字典
 * @param {object} [opts]
 * @param {number} [opts.delayMs] get/put 的模拟延迟（默认 2ms；顺序跑的用例可以传 0 提速）
 */
export function makeR2(store, opts) {
  const delayMs = opts && typeof opts.delayMs === 'number' ? opts.delayMs : 2;
  const stats = { gets: 0, puts: 0, conflicts: 0 };
  /* delayMs 0 = 完全不等（顺序跑的用例用它提速）。
     setTimeout(r, 0) 在 Node 里也有 ~1ms 的粒度，500 多次请求累积起来很可观。 */
  const sleep = delayMs > 0 ? () => new Promise((r) => setTimeout(r, delayMs)) : () => Promise.resolve();

  return {
    stats,

    async get(key) {
      stats.gets++;
      await sleep();
      if (!(key in store)) return null;
      const val = store[key];
      const text = typeof val === 'string' ? val : new TextDecoder().decode(val);
      return {
        etag: etagOf(text),
        async text() {
          return text;
        },
      };
    },

    async put(key, value, putOpts) {
      stats.puts++;
      await sleep();
      const cur = key in store ? store[key] : undefined;
      const curEtag = cur === undefined ? null : etagOf(cur);
      const only = putOpts && putOpts.onlyIf;

      if (only !== undefined && only !== null) {
        if (typeof only.get === 'function') {
          /* Headers 形式：目前只用 If-None-Match: *（仅当对象不存在才写）。
             别的条件头（If-Match 等）本 mock 不实现 —— 静默忽略比报错更危险，
             会让人以为条件生效了。 */
          const inm = only.get('if-none-match');
          if (inm !== null && inm !== undefined) {
            if (inm === '*') {
              if (cur !== undefined) {
                stats.conflicts++;
                return null;
              }
            } else if (curEtag === inm) {
              stats.conflicts++;
              return null;
            }
          }
          for (const h of ['if-match', 'if-modified-since', 'if-unmodified-since']) {
            if (only.get(h) !== null && only.get(h) !== undefined) {
              throw new Error('mock R2: 不支持的条件头 "' + h + '"');
            }
          }
        } else if (typeof only === 'object') {
          for (const k of Object.keys(only)) {
            if (k === 'etagMatches') {
              if (only[k] !== curEtag) {
                stats.conflicts++;
                return null;
              }
            } else if (k === 'etagDoesNotMatch') {
              if (only[k] === curEtag) {
                stats.conflicts++;
                return null;
              }
            } else {
              /* 注意：这条错误消息里不能出现 "precondition" / "412" 这些词 ——
                 生产代码的 writeJson 靠这个正则识别「这是条件写冲突」，
                 消息里带上就会把「拼错键名」这个真错误当成冲突吞掉。
                 （"etag" 是安全的：catch 已经收窄成 /precondition|412/i。）
                 消息里只列**本 mock 真正实现了**的键 —— 列了不实现的键，
                 就是在骗读代码的人。 */
              throw new Error(
                'mock R2: onlyIf 出现了未实现的键 "' + k +
                '"（本 mock 只实现了 etagMatches / etagDoesNotMatch）',
              );
            }
          }
        } else {
          throw new Error('mock R2: onlyIf 既不是对象也不是 Headers');
        }
      }

      store[key] = value;
      const text = typeof value === 'string' ? value : new TextDecoder().decode(value);
      return { key, etag: etagOf(text) };
    },
  };
}
```

- [ ] **Step 2: 让 test-board.mjs 改用严格 mock，并先看它炸**

改 `tools/test-board.mjs`：
1. 顶部加 import：`import { makeR2 } from './r2-mock.mjs';`
2. 删掉文件里内联的 `etagOf` 和 `makeR2` 两个函数定义（原第 32–68 行那一段）

跑一次：

```powershell
cd E:\voice-pilot\daily-image-site
node tools/test-board.mjs
```

**Expected: FAIL** —— 报错是 `写入冲突，重试 5 次仍失败`。

> **这一步是故意的**：留言板现在还在用错键名，严格 mock 会当场把它炸出来。
> 这条红证明了「严格 mock 真的能抓到这个 bug」——
> 初版 mock 下这一步是**绿的**（bug 被完全挡住）。记下这条红输出，
> 它是这次修复最直接的证据。
>
> 注意报错的**形态**：冒出来的是「写入冲突，重试 5 次仍失败」而不是 mock 的
> 「onlyIf 出现了未知键 "etagMatch"」—— 因为旧留言板 `writeJson` 的 catch
> 用了 `/precondition|412|etag/i`，把 mock 抛的错当成「条件写冲突」吞掉了。
> Step 3 的共享层把 catch 收窄成 `/precondition|412/i`（不带 `etag`），
> 所以修完之后再拼错键名，mock 的原始错误会**直接冒出来**，不会被伪装成冲突。
>
> 另外：mock 是**第二次写**才炸 —— 第一次写对象还不存在，走的是 `etagDoesNotMatch`
> 分支（那个键名 mock 认得）。所以看红的时候别以为是第一次 POST 就炸了。

- [ ] **Step 3: 写共享读写层**

新建 `lib/r2-json.mjs`：

```js
/**
 * 共享的 R2 JSON 读写层 —— 留言板和点赞接口都用它。
 *
 * 为什么要抽出来：
 *   这层里有安全性和正确性要求最高的部分（条件写、CSRF 校验）。
 *   之前 board 和 likes 各存一份，结果两份都用了错的 etag 键名 ——
 *   留言板的乐观锁从来没生效过。改一处漏一处就是一次真实事故，所以只留一份。
 *
 * R2 条件写的官方契约（https://developers.cloudflare.com/r2/api/workers/workers-api-reference/）：
 *   - R2Conditional 的字段是 etagMatches / etagDoesNotMatch / uploadedBefore / uploadedAfter。
 *     没有 etagMatch —— 传了会被忽略，条件写退化成无条件写。
 *   - 条件不满足时 put() 返回 null（不是抛异常），对象不会被存。
 *   - etagDoesNotMatch 的语义是「对象的 etag 不等于给定字符串就执行」，
 *     所以 '*' 不等于「对象必须不存在」。
 *     「仅当不存在才创建」的正确写法是传 Headers：If-None-Match: *。
 */

export function clip(s, max) {
  return String(s == null ? '' : s).trim().slice(0, max);
}

export async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const view = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, '0');
  return out;
}

const noStore = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'CDN-Cache-Control': 'no-store, no-cache, must-revalidate',
  'Cloudflare-CDN-Cache-Control': 'no-store, no-cache, must-revalidate',
};

/** 统一 JSON 响应（默认 no-store —— Pages 会给没设 Cache-Control 的响应套 4 小时缓存） */
export function json(data, status = 200, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...noStore,
      ...(extraHeaders || {}),
    },
  });
}

/** 校验 Origin，防 CSRF（跨站表单提交） */
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // 同源 fetch / 部分客户端不带 Origin
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/** 读 R2 对象并解析 JSON；不存在或内容坏了返回 fallback */
export async function readJson(bucket, key, fallback) {
  const obj = await bucket.get(key);
  if (!obj) return fallback;
  try {
    return JSON.parse(await obj.text());
  } catch {
    return fallback;
  }
}

/**
 * 条件写。
 *   currentEtag 有值 -> 只在 etag 匹配时写（etagMatches）
 *   没有           -> 只在对象不存在时写（If-None-Match: *）
 *
 * 返回 true = 写成功；false = 前置条件不满足（有人同时在写），调用方该重读重试。
 */
export async function writeJson(bucket, key, data, currentEtag) {
  const opts = currentEtag
    ? { onlyIf: { etagMatches: currentEtag } }
    : { onlyIf: new Headers({ 'If-None-Match': '*' }) };
  try {
    const obj = await bucket.put(key, JSON.stringify(data), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      ...opts,
    });
    // 官方契约：前置条件不满足时 put() 返回 null，对象不会被存。
    // 不看返回值的话，冲突会被当成「写成功了」—— 返回一个从未落盘的计数。
    if (obj === null) return false;
    return true;
  } catch (err) {
    const msg = String(err?.message || err);
    // 真运行时是返回 null 不是抛异常；这里只是兜底。
    // 注意正则里不要带 "etag" —— mock 抛「拼错键名」时消息里含 etag，
    // 会被误当成冲突吞掉，把真错误变成「重试 8 次仍失败」。
    if (/precondition|412/i.test(msg)) return false;
    throw err;
  }
}

/**
 * 读-改-写，带 etag 乐观锁重试。
 *   mutateFn 返回 false -> 放弃这次写（mutate 也返回 false）
 *   写成功             -> 返回 mutateFn 的返回值；没返回值则返回 true
 *   重试用尽           -> 抛错（调用方负责兜成 503）
 */
export async function mutate(bucket, key, fallback, mutateFn) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const obj = await bucket.get(key);
    const etag = obj?.etag || null;
    let data;
    try {
      data = obj ? JSON.parse(await obj.text()) : structuredClone(fallback);
    } catch {
      data = structuredClone(fallback);
    }
    const result = mutateFn(data);
    if (result === false) return false; // mutateFn 主动放弃
    const ok = await writeJson(bucket, key, data, etag);
    if (ok) return result === undefined ? true : result;
    // etag 不匹配 -> 有人同时在写 -> 重新读再来。
    // 必须加随机退避：所有人点赞都写同一个对象，不错开的话
    // 所有写入者会「同步」地读同一份、撞同一份 etag、一起失败，
    // 退避把它们打散，几轮就能收敛。
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 40) + 5));
  }
  throw new Error('写入冲突，重试 8 次仍失败');
}
```

- [ ] **Step 4: 写共享限流器**

新建 `lib/rate-limit.mjs`：

```js
/**
 * 共享的按 IP 哈希限流器。
 *
 * 留言板和点赞接口的限流逻辑结构一样，只有几个常量不同，所以抽出来共用一份。
 * IP 只存加盐哈希，不存原始 IP。
 */
import { readJson, mutate, sha256hex } from './r2-json.mjs';

/**
 * @param {object} cfg
 * @param {string} cfg.key         计数文件在 R2 里的 key
 * @param {string} cfg.salt        哈希盐（不同用途要用不同的盐，避免哈希可互相反查）
 * @param {number} cfg.perMinute   每分钟上限
 * @param {number} cfg.perHour     每小时上限
 * @param {number} cfg.historyMax  计数文件里最多留多少条历史
 */
export function makeRateLimiter(cfg) {
  const { key, salt, perMinute, perHour, historyMax } = cfg;

  return {
    key,

    async check(bucket, request) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      // 加盐再哈希：不存原始 IP，也避免有人反查哈希表
      const ipHash = (await sha256hex(salt + '|' + ip)).slice(0, 16);
      const now = Date.now();
      const rate = await readJson(bucket, key, { hits: [] });
      const hits = Array.isArray(rate.hits) ? rate.hits : [];
      const hourAgo = now - 3600_000;

      const mine = hits.filter((h) => h && h.ip === ipHash && typeof h.ts === 'number' && h.ts > hourAgo);
      const inMinute = mine.filter((h) => h.ts > now - 60_000).length;

      if (inMinute >= perMinute || mine.length >= perHour) {
        return { ok: false, ipHash, retryAfter: inMinute >= perMinute ? 60 : 600 };
      }

      return { ok: true, ipHash, now };
    },

    async record(bucket, ipHash, now) {
      try {
        await mutate(bucket, key, { hits: [] }, (data) => {
          const hourAgo = now - 3600_000;
          const hits = (Array.isArray(data.hits) ? data.hits : []).filter(
            (h) => h && typeof h.ts === 'number' && h.ts > hourAgo,
          );
          hits.push({ ts: now, ip: ipHash });
          data.hits = hits.slice(-historyMax);
        });
      } catch {
        // 限流计数写失败不该拦住用户操作 —— 顶多少拦一次
      }
    },
  };
}
```

- [ ] **Step 5: 让 functions/board/api.js 改用共享层**

改 `functions/board/api.js`：

1. 顶部加 import：

```js
import { json, clip, sha256hex, sameOrigin, readJson, mutate } from '../../lib/r2-json.mjs';
import { makeRateLimiter } from '../../lib/rate-limit.mjs';
```

2. 删掉文件里的这几个函数定义（改成 import 进来的）：
   `json`（原 44–53 行）、`sha256hex`（原 55–61 行）、`clip`（原 84–86 行）、
   `readJson`（原 88–97 行）、`writeJson`（原 99–119 行）、`mutate`（原 121–139 行）、
   `checkRate`（原 141–160 行）、`recordHit`（原 162–175 行）、`sameOrigin`（原 177–186 行）、
   以及 `noStore` 常量（原 38–42 行）。

3. **保留不动**：`randomId`、`safeUrl`、`MSG_KEY`、`RATE_KEY`、`MAX_ITEMS`、`MAX_BODY`、
   `MAX_NAME`、`MAX_LINK`。

4. 加限流器实例（放在常量区）：

```js
const limiter = makeRateLimiter({
  key: RATE_KEY,
  salt: 'board-rate-v1',
  perMinute: 3,
  perHour: 20,
  historyMax: 500,
});
```

5. 把两处 `await checkRate(bucket, request)` 改成 `await limiter.check(bucket, request)`，
   两处 `await recordHit(bucket, rate.ipHash, rate.now)` 改成
   `await limiter.record(bucket, rate.ipHash, rate.now)`。

6. 两处 `await mutate(...)`（删除留言、提交留言）包一层 try/catch，
   写冲突重试耗尽时返回 503 而不是让异常逃出去变成通用 500：

```js
  // 写冲突重试 8 次仍失败 —— 返回 503，别让异常逃出去变成没有正文的 500
  let removed;
  try {
    removed = await mutate(bucket, MSG_KEY, { items: [] }, (data) => {
      const items = Array.isArray(data.items) ? data.items : [];
      const idx = items.findIndex((it) => it && it.id === id && it.author === authorHash);
      if (idx < 0) return false;
      items.splice(idx, 1);
      data.items = items;
      return true;
    });
  } catch {
    return json({ ok: false, error: '写入冲突，请稍后重试' }, 503);
  }
```

提交留言那一段同理。

7. 更新文件头注释里那句错的话（原第 16 行）：

```
 *   - 写的时候用 onlyIf.etagMatches 做条件写，并发提交不会互相覆盖；
 *     真撞上了（etag 不匹配）就重读重写，最多重试 8 次
```

- [ ] **Step 6: 跑留言板测试，确认还是全过**

```powershell
cd E:\voice-pilot\daily-image-site
node tools/test-board.mjs
```

Expected: **41/41 通过，fail 数为 0**，退出码 0。

> 这一步是重构的安全网：留言板的 41 条断言（口令鉴权、限流、CSRF、
> 「5 条并发提交一条都不能丢」等）必须一条不少地继续通过。
> 「5 条并发提交一条都不能丢」这条现在**第一次真正有效** ——
> 严格 mock + 延迟会让并发真的撞上 etag 冲突。

- [ ] **Step 7: 写失败测试**

新建 `tools/test-likes.mjs`：

```js
/**
 * 点赞接口 Pages Functions 单元测试
 *
 * workerd 在本机因 VC++ 运行库问题崩溃，跑不了 wrangler pages dev，
 * 所以直接用 Node 的 Web API（Request/Response/Headers/crypto.subtle）模拟 Cloudflare 运行时。
 * mock R2 与留言板测试共用 tools/r2-mock.mjs —— 那份 mock 严格按官方契约实现，
 * 冲突会真的发生，所以并发用例测得到乐观锁。
 */
import { onRequest as likesApi } from '../functions/likes/api.js';
import { makeR2 } from './r2-mock.mjs';

let pass = 0;
let fail = 0;

function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`);
  }
}

const DATE = '2026-11-03';
const ID = 'jianxiao_012';
const VISITOR = 'a1b2c3d4e5f60718';

function makeCtx(request, store, opts) {
  const bucket = makeR2(store, opts);
  return { request, env: { IMAGES: bucket }, bucket };
}

function getReq(date) {
  return new Request(`http://x/likes/api?date=${date}`);
}

function postReq(body, headers) {
  return new Request('http://x/likes/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-daily-visitor': VISITOR, ...(headers || {}) },
    body: JSON.stringify(body),
  });
}

async function main() {
  const store = {};

  console.log('\n── 基本点赞 ──');
  {
    const r = await likesApi(makeCtx(postReq({ date: DATE, id: ID, on: true }), store));
    const j = await r.json();
    check('首次点赞返回 200', r.status === 200, r.status);
    check('首次点赞 count = 1', j.count === 1, j);
    check('首次点赞 on = true', j.on === true, j);
  }
  {
    // 同一个访客重复赞 —— 幂等，不能变成 2
    const r = await likesApi(makeCtx(postReq({ date: DATE, id: ID, on: true }), store));
    const j = await r.json();
    check('同一访客重复点赞 count 仍为 1', j.count === 1, j);
  }
  {
    const r = await likesApi(makeCtx(postReq({ date: DATE, id: ID, on: false }), store));
    const j = await r.json();
    check('取消点赞 count = 0', j.count === 0, j);
  }
  {
    const r = await likesApi(makeCtx(postReq({ date: DATE, id: ID, on: false }), store));
    const j = await r.json();
    check('重复取消仍为 0（幂等）', j.count === 0, j);
  }
  {
    const r = await likesApi(makeCtx(postReq({ date: DATE, id: ID, on: true }), store));
    const j = await r.json();
    check('重新点赞 count = 1', j.count === 1, j);
  }

  console.log('\n── 换一个访客 ──');
  {
    const r = await likesApi(
      makeCtx(postReq({ date: DATE, id: ID, on: true }, { 'x-daily-visitor': 'ffffffffffffffff' }), store),
    );
    const j = await r.json();
    check('换访客点赞 count = 2', j.count === 2, j);
  }

  console.log('\n── 读取计数 ──');
  {
    const r = await likesApi(makeCtx(getReq(DATE), store));
    const j = await r.json();
    check('GET 返回 200', r.status === 200, r.status);
    check('GET counts 含该图', j.counts && j.counts[ID] === 2, j);
    check('GET 可缓存', (r.headers.get('Cache-Control') || '').includes('max-age=30'), r.headers.get('Cache-Control'));
    // 不要只查 mine / voters 两个具体键名 —— 换个名字就漏了。
    // 「不含任何访客相关字段」的判据是：整个响应里找不到访客 id 本体。
    check(
      'GET 不含访客字段',
      !JSON.stringify(j).includes(VISITOR) && !JSON.stringify(j).includes('voters'),
      j,
    );
  }
  {
    const r = await likesApi(makeCtx(getReq('2026-11-02'), store));
    const j = await r.json();
    check('GET 别的日期 counts 为空', j.counts && Object.keys(j.counts).length === 0, j);
  }
  {
    const r = await likesApi(makeCtx(getReq('不是日期'), store));
    check('GET 非法日期 → 400', r.status === 400, r.status);
  }

  console.log('\n── 参数校验 ──');
  {
    const r = await likesApi(makeCtx(postReq({ date: '2026/11/03', id: ID, on: true }), store));
    check('非法 date → 400', r.status === 400, r.status);
  }
  {
    const r = await likesApi(makeCtx(postReq({ date: DATE, id: '../../etc/passwd', on: true }), store));
    check('非法 id → 400', r.status === 400, r.status);
  }
  {
    // 注意：这里必须用纯 ASCII 的非法值。
    // HTTP 头值是 ByteString，塞中文会让 Node 的 undici 在构造 Request 时
    // 直接抛 TypeError，测试会崩在构造请求上，根本走不到断言。
    const r = await likesApi(makeCtx(postReq({ date: DATE, id: ID, on: true }, { 'x-daily-visitor': 'nothex' }), store));
    check('非法 visitor → 400', r.status === 400, r.status);
  }
  {
    const r = await likesApi(
      makeCtx(new Request('http://x/likes/api', { method: 'DELETE' }), store),
    );
    check('非 GET/POST → 405', r.status === 405, r.status);
  }

  console.log('\n── CSRF ──');
  {
    const r = await likesApi(
      makeCtx(postReq({ date: DATE, id: ID, on: true }, { Origin: 'http://evil.example.com' }), store),
    );
    check('跨站 Origin → 403', r.status === 403, r.status);
  }
  {
    const r = await likesApi(
      makeCtx(postReq({ date: DATE, id: ID, on: true }, { Origin: 'http://x' }), store),
    );
    check('同站 Origin → 放行', r.status === 200, r.status);
  }

  console.log('\n── 评论计数随 GET 一起返回 ──');
  {
    store['board/messages.json'] = JSON.stringify({
      items: [
        { id: 'm1', imgDate: DATE, imgId: ID },
        { id: 'm2', imgDate: DATE, imgId: ID },
        { id: 'm3', imgDate: '2026-11-02', imgId: ID },
        { id: 'm4' },
      ],
    });
    const r = await likesApi(makeCtx(getReq(DATE), store));
    const j = await r.json();
    check('该图评论数 = 2', j.comments && j.comments[ID] === 2, j);
  }

  console.log('\n── 存储形状 ──');
  {
    const raw = JSON.parse(store['likes/' + DATE + '.json']);
    check('voters 里只存哈希不存原始 vid', !JSON.stringify(raw).includes(VISITOR), raw);
    check('voters 列表非空', Array.isArray(raw.voters[ID]) && raw.voters[ID].length >= 2, raw);
  }

  console.log('\n── 并发点赞不丢 ──');
  {
    // 单独一个 store：前面的用例已经攒了一些限流命中，别互相干扰
    const cStore = {};
    const N = 6;
    const CONC = 'jianwen_001';
    const posts = [];
    // 6 个并发请求必须共用**同一个** mock 实例 —— 真实的 R2 就是一个 bucket。
    // 各用各的 mock 的话，stats 是分开计的，断言只能看到「最后一个请求」的计数，
    // 不是整场竞争 —— 实测最后那个请求有约 1/6 的概率一次冲突都没撞上 → 假红。
    const cBucket = makeR2(cStore);
    for (let i = 0; i < N; i++) {
      const vid = ('000000000000000' + i.toString(16)).slice(-16);
      posts.push(
        likesApi({
          request: postReq({ date: DATE, id: CONC, on: true }, { 'x-daily-visitor': vid }),
          env: { IMAGES: cBucket },
        }),
      );
    }
    const results = await Promise.all(posts);
    const statuses = results.map((r) => r.status);
    check('并发点赞全部返回 200', statuses.every((s) => s === 200), statuses);
    const raw = JSON.parse(cStore['likes/' + DATE + '.json']);
    check('并发后计数 = ' + N + '（没有互相覆盖）', raw.counts && raw.counts[CONC] === N, raw.counts);
    // 关键：必须真的撞上过冲突，否则这条断言是假护栏。
    // 初版 mock 没有延迟，6 个请求被天然串行化，实测 12 次写、0 次冲突 ——
    // 把乐观锁整个删掉，这条断言照样通过。
    check('并发时真的撞上了 etag 冲突（否则断言是假护栏）', cBucket.stats.conflicts > 0, cBucket.stats);
  }

  console.log('\n── 单图点赞人数上限 ──');
  {
    // MAX_VOTERS_PER_IMAGE = 500。用不同 IP 绕过限流（限流是按 IP 算的），
    // delayMs 0 是因为这里是顺序跑的、不需要制造并发窗口。
    const capStore = {};
    let last = null;
    let got409 = false;
    for (let i = 0; i < 501; i++) {
      // 必须是**正好 16 位**小写 hex —— VISITOR_RE 是 /^[0-9a-f]{16}$/。
      // 别用 '前缀' + i.toString(16) 再 slice(-16)：i < 16 时整个串只有 15 位，
      // 会全部被判成非法访客（400），计数永远到不了上限。
      const vid = i.toString(16).padStart(16, '0');
      const ip = { 'CF-Connecting-IP': '10.0.' + Math.floor(i / 256) + '.' + (i % 256) };
      const ctx = makeCtx(
        postReq({ date: DATE, id: 'jianxiao_099', on: true }, { 'x-daily-visitor': vid, ...ip }),
        capStore,
        { delayMs: 0 },
      );
      last = await likesApi(ctx);
      if (last.status === 409) {
        got409 = true;
        break;
      }
    }
    check('第 501 个访客点赞 → 409', got409, last && last.status);
    const raw = JSON.parse(capStore['likes/' + DATE + '.json']);
    check('撞上限时计数没有被误改', raw.counts['jianxiao_099'] === 500, raw.counts);
  }

  console.log('\n── 限流 ──');
  {
    // 又是独立的 store：限流是按 IP 哈希算的，mock 没有 CF-Connecting-IP，
    // 全部请求都算同一个 IP，所以这个 store 必须干净
    const rStore = {};
    let last = null;
    for (let i = 0; i < 31; i++) {
      last = await likesApi(makeCtx(postReq({ date: DATE, id: 'jianwen_002', on: true }), rStore));
    }
    check('一分钟内第 31 次 → 429', last.status === 429, last.status);
    check('429 带 Retry-After', !!last.headers.get('Retry-After'));
  }

  console.log('\n── R2 没绑定 ──');
  {
    const r = await likesApi({ request: getReq(DATE), env: {} });
    check('没绑定 R2 → 503', r.status === 503, r.status);
  }

  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 8: 跑测试，确认失败**

```powershell
cd E:\voice-pilot\daily-image-site
node tools/test-likes.mjs
```

Expected: FAIL —— 报 `Cannot find module '.../functions/likes/api.js'`（模块还不存在）。

- [ ] **Step 9: 实现点赞接口**

新建 `E:\voice-pilot\daily-image-site\functions\likes\api.js`：

```js
/**
 * 点赞接口 —— /likes/api
 *
 * 存储放在 R2（和图片同一个 bucket，用 likes/ 前缀隔开）：
 *   likes/<日期>.json   该期的计数 + 点过赞的访客哈希
 *   likes/rate.json     限流计数
 *
 * 为什么是「一期一个文件」而不是「一张图一个对象」：
 *   页面加载时要把 243 张图的赞数全画到格子上。
 *   一张图一个对象 = 243 次 R2 请求，页面直接卡死；
 *   一期一个文件 = 1 次请求拿全部计数。
 *
 * 为什么写入用 etag 乐观锁（具体契约见 lib/r2-json.mjs 的文件头）：
 *   所有人点赞都写同一个对象，不加条件写的话并发提交会互相覆盖
 *   （后写的把先写的计数抹掉）。
 *
 * 安全要点：
 *   - 写操作校验 Origin，防 CSRF
 *   - 限流按 IP 哈希（不存原始 IP）
 *   - 访客只存哈希，不存原始 id
 *   - GET 的响应**不能带访客相关字段** —— 它要被边缘缓存，
 *     混进访客数据会把一个人的点赞清单发给所有人
 */

import { json, clip, sha256hex, sameOrigin, readJson, mutate } from '../../lib/r2-json.mjs';
import { makeRateLimiter } from '../../lib/rate-limit.mjs';

const RATE_KEY = 'likes/rate.json';
const BOARD_KEY = 'board/messages.json';

const MAX_VOTERS_PER_IMAGE = 500;
const RATE_HISTORY_MAX = 2000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z]{3,10}_\d{3}$/;
const VISITOR_RE = /^[0-9a-f]{16}$/;

// 计数是可以被边缘缓存的（访客无关），30 秒后自然过期。
// 本项目 API Token 没有 Cache Purge 权限（实测 401），所以不做主动失效。
const publicCache = {
  'Cache-Control': 'public, max-age=30',
  'CDN-Cache-Control': 'public, max-age=30',
  'Cloudflare-CDN-Cache-Control': 'public, max-age=30',
};

const limiter = makeRateLimiter({
  key: RATE_KEY,
  salt: 'like-rate-v1',
  perMinute: 30,
  perHour: 300,
  historyMax: RATE_HISTORY_MAX,
});

function likesKey(date) {
  return 'likes/' + date + '.json';
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.IMAGES) {
    return json({ ok: false, error: '点赞存储未就绪（R2 没绑定）' }, 503);
  }
  const bucket = env.IMAGES;
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const date = clip(url.searchParams.get('date'), 10);
    if (!DATE_RE.test(date)) {
      return json({ ok: false, error: 'date 格式不对（要 YYYY-MM-DD）' }, 400);
    }

    const data = await readJson(bucket, likesKey(date), { counts: {}, voters: {} });
    const counts = data && data.counts && typeof data.counts === 'object' ? data.counts : {};

    // 评论数顺带从留言板文件统计 —— 省一次往返，留言板文件本来就小（≤500 条）
    const board = await readJson(bucket, BOARD_KEY, { items: [] });
    const comments = {};
    const items = Array.isArray(board.items) ? board.items : [];
    for (const it of items) {
      if (!it || it.imgDate !== date || !it.imgId) continue;
      comments[it.imgId] = (comments[it.imgId] || 0) + 1;
    }

    return json({ ok: true, date, counts, comments }, 200, publicCache);
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: '只支持 GET / POST' }, 405, { Allow: 'GET, POST' });
  }

  if (!sameOrigin(request)) {
    return json({ ok: false, error: '跨站请求被拒绝' }, 403);
  }

  const vid = clip(request.headers.get('x-daily-visitor'), 64);
  if (!VISITOR_RE.test(vid)) {
    return json({ ok: false, error: '缺少有效的访客标识' }, 400);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: '请求体不是合法 JSON' }, 400);
  }

  const date = clip(payload?.date, 10);
  const id = clip(payload?.id, 32);
  const on = payload?.on === true;

  if (!DATE_RE.test(date)) {
    return json({ ok: false, error: 'date 格式不对（要 YYYY-MM-DD）' }, 400);
  }
  if (!ID_RE.test(id)) {
    return json({ ok: false, error: 'id 格式不对（要 栏目_序号）' }, 400);
  }

  const rate = await limiter.check(bucket, request);
  if (!rate.ok) {
    return json(
      { ok: false, error: `点赞太频繁了，${rate.retryAfter} 秒后再试` },
      429,
      { 'Retry-After': String(rate.retryAfter) },
    );
  }

  const voterHash = await sha256hex('like-voter-v1|' + vid);
  const key = likesKey(date);

  let out = { ok: true, count: 0 };

  let written;
  try {
    written = await mutate(bucket, key, { counts: {}, voters: {} }, (data) => {
      const counts = data.counts && typeof data.counts === 'object' ? data.counts : {};
      const voters = data.voters && typeof data.voters === 'object' ? data.voters : {};
      const list = Array.isArray(voters[id]) ? voters[id].slice() : [];
      const has = list.indexOf(voterHash) >= 0;

      if (on) {
        if (has) {
          // 已经赞过 —— 幂等，不能重复计数
          out = { ok: true, count: counts[id] || 0 };
          return;
        }
        if (list.length >= MAX_VOTERS_PER_IMAGE) {
          out = { ok: false, error: '这张图点赞太多啦' };
          return false; // 放弃这次写
        }
        list.push(voterHash);
        voters[id] = list;
        counts[id] = (counts[id] || 0) + 1;
        out = { ok: true, count: counts[id] };
      } else {
        if (!has) {
          out = { ok: true, count: counts[id] || 0 };
          return;
        }
        const kept = list.filter((h) => h !== voterHash);
        if (kept.length) voters[id] = kept;
        else delete voters[id];
        const c = Math.max(0, (counts[id] || 0) - 1);
        if (c) counts[id] = c;
        else delete counts[id];
        out = { ok: true, count: c };
      }

      data.counts = counts;
      data.voters = voters;
    });
  } catch {
    // 重试 8 次仍撞上冲突 —— 返回 503，别让异常逃出去变成没有正文的 500
    return json({ ok: false, error: '写入冲突，请重试' }, 503);
  }

  /* mutate 只有两种返回：写成功（written === true），或 mutateFn 主动放弃（written === false）。
     放弃的那条分支已经把 out 设成了 { ok: false }，状态码由 out 决定：
     「这张图点赞太多啦」是 409；万一以后加了别的放弃原因而忘了设 out，
     这里会退化成 503，而不是误报成功。
     （写成两段 if 的话，第二段是走不到的死代码 —— 那正是上一轮评审挑出来的。） */
  if (written === false) {
    return json({ ok: false, error: out.error || '写入未完成，请重试' }, out.ok ? 503 : 409);
  }

  await limiter.record(bucket, rate.ipHash, rate.now);

  return json({ ok: true, id, count: out.count, on }, 200);
}
```

- [ ] **Step 10: 跑测试，确认全过**

```powershell
cd E:\voice-pilot\daily-image-site
node tools/test-likes.mjs
```

Expected: 全部 `✓`，末尾 `通过 N / 失败 0`，退出码 0。

- [ ] **Step 11: 回归 —— 留言板测试必须还是全过**

```powershell
cd E:\voice-pilot\daily-image-site
node tools/test-board.mjs
```

Expected: fail 数为 0（当前是 41 项）。

- [ ] **Step 12: 验证**

```powershell
cd E:\voice-pilot\daily-image-site
node --check lib/r2-json.mjs
node --check lib/rate-limit.mjs
node --check functions/board/api.js
node --check functions/likes/api.js
node tools/test-likes.mjs
node tools/test-board.mjs
node tools/test-functions.mjs
```

Expected: 七条命令退出码都是 0。记录三条测试各自的通过项数，写进本计划文件的执行记录里。

---
### Task 2: 留言板扩展「跟图评论」字段

**Files:**
- Modify: `E:\voice-pilot\daily-image-site\functions\board\api.js`（`onRequest` 里的 GET 映射与 POST 提交段）
- Modify: `E:\voice-pilot\daily-image-site\tools\test-likes.mjs`（追加图字段的用例）

**Interfaces:**
- Consumes: Task 1 产出的 `/likes/api`（本 Task 不依赖它，只是共用 `imgId` / `imgDate` 的命名约定）

> **注意**：`functions/board/api.js` 在 Task 1 里已经被改成从 `../../lib/r2-json.mjs` 和
> `../../lib/rate-limit.mjs` import 辅助函数了。留言板自己的 `json` / `clip` / `sha256hex` /
> `sameOrigin` / `readJson` / `writeJson` / `mutate` / `checkRate` / `recordHit` / `noStore`
> **本地定义已经删掉了** —— 本 Task 要用其中任何一个，先从 `lib/` import，别再在 board 文件里本地写一份。
> `randomId`、`safeUrl` 和几个常量仍在 board 文件里，本 Task 不用动它们。
- Produces:
  - `POST /board/api` 接受可选的 `imgDate` / `imgId` / `imgThumb`；三者要么都不给，要么都给且都合法，否则 `400`
  - `GET /board/api` 的每个 item 增加 `imgDate` / `imgId` / `imgThumb` 三个字段（没有就是空字符串）

- [ ] **Step 1: 写失败测试**

在 `tools/test-likes.mjs` 末尾 `main()` 之前插入这段（需要先在文件顶部加 `import { onRequest as boardApi } from '../functions/board/api.js';`）：

```js
  console.log('\n── 留言板：跟图评论字段 ──');
  {
    const boardStore = {};
    const boardCtx = (request) => ({ request, env: { IMAGES: makeR2(boardStore) } });

    // 合法三件套
    {
      const r = await boardApi(
        boardCtx(
          new Request('http://x/board/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              body: '这张图绝了',
              imgDate: DATE,
              imgId: ID,
              imgThumb: '/img/2026-11-03/jianxiao/ab12cd34ef_012_t.webp',
            }),
          }),
        ),
      );
      check('带图字段投稿 → 200', r.status === 200, r.status);
    }
    {
      const r = await boardApi(boardCtx(new Request('http://x/board/api')));
      const j = await r.json();
      const it = j.items && j.items[0];
      check('GET 回传 imgDate', it && it.imgDate === DATE, it);
      check('GET 回传 imgId', it && it.imgId === ID, it);
      check('GET 回传 imgThumb', it && it.imgThumb === '/img/2026-11-03/jianxiao/ab12cd34ef_012_t.webp', it);
    }
    // 老留言（没有图字段）不受影响
    {
      const r = await boardApi(
        boardCtx(
          new Request('http://x/board/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: '普通留言' }),
          }),
        ),
      );
      check('普通留言仍能提交 → 200', r.status === 200, r.status);
      const g = await boardApi(boardCtx(new Request('http://x/board/api')));
      const j = await g.json();
      const plain = j.items && j.items.find((x) => x.body === '普通留言');
      check('普通留言图字段为空', plain && plain.imgId === '' && plain.imgThumb === '', plain);
    }
    // 伪造的缩略图必须被挡
    const badThumbs = [
      'https://evil.example.com/x.png',
      '/img/2026-11-03/jianxiao/../../secret.png',
      'javascript:alert(1)',
      '/img/2026-11-03/jianxiao/ab12cd34ef_012.webp',
      '/img/2026-11-03/JIANXIAO/ab12cd34ef_012_t.webp',
    ];
    for (const bt of badThumbs) {
      const r = await boardApi(
        boardCtx(
          new Request('http://x/board/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: 'x', imgDate: DATE, imgId: ID, imgThumb: bt }),
          }),
        ),
      );
      check(`伪造缩略图被拒 → 400：${bt}`, r.status === 400, r.status);
    }
    // 只给一部分 → 400
    {
      const r = await boardApi(
        boardCtx(
          new Request('http://x/board/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: 'x', imgDate: DATE }),
          }),
        ),
      );
      check('只给 imgDate → 400', r.status === 400, r.status);
    }
    // 非法 id
    {
      const r = await boardApi(
        boardCtx(
          new Request('http://x/board/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              body: 'x',
              imgDate: DATE,
              imgId: '../../etc/passwd',
              imgThumb: '/img/2026-11-03/jianxiao/ab12cd34ef_012_t.webp',
            }),
          }),
        ),
      );
      check('非法 imgId → 400', r.status === 400, r.status);
    }
  }
```

- [ ] **Step 2: 跑测试，确认失败**

```powershell
cd E:\voice-pilot\daily-image-site
node tools/test-likes.mjs
```

Expected: 新增的图字段用例 FAIL（当前 `functions/board/api.js` 会忽略 `imgDate`/`imgId`/`imgThumb`，GET 也不回传）。

- [ ] **Step 3: 实现 —— 扩展 functions/board/api.js**

在 `functions/board/api.js` 顶部常量区加入：

```js
/* 跟图评论：三个字段要么都不给，要么都给且都合法 */
const IMG_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const IMG_ID_RE = /^[a-z]{3,10}_\d{3}$/;
const IMG_THUMB_RE = /^\/img\/\d{4}-\d{2}-\d{2}\/[a-z]+\/[0-9a-f]{10}_\d{3}_t\.webp$/;
```

在 `onRequest` 的 GET 分支里，把 `out` 的映射改成：

```js
    const out = items.map((it) => ({
      id: it.id,
      ts: it.ts,
      name: it.name,
      body: it.body,
      link: it.link,
      cat: it.cat,
      imgDate: it.imgDate || '',
      imgId: it.imgId || '',
      imgThumb: it.imgThumb || '',
      mine: !!(authorHash && it.author === authorHash),
    }));
```

在 POST 的「提交留言」分支里，在 `const cat = ...` 之后插入：

```js
  // ── 跟图评论（可选三件套） ────────────────────────────────
  const hasImgDate = payload?.imgDate !== undefined && payload?.imgDate !== null && payload?.imgDate !== '';
  const hasImgId = payload?.imgId !== undefined && payload?.imgId !== null && payload?.imgId !== '';
  const hasImgThumb = payload?.imgThumb !== undefined && payload?.imgThumb !== null && payload?.imgThumb !== '';
  const anyImg = hasImgDate || hasImgId || hasImgThumb;
  const allImg = hasImgDate && hasImgId && hasImgThumb;

  let imgDate = '';
  let imgId = '';
  let imgThumb = '';
  if (anyImg) {
    // 要么都给，要么都不给 —— 给一半是客户端 bug，直接报出来
    if (!allImg) {
      return json({ ok: false, error: '图片信息不完整（imgDate / imgId / imgThumb 要一起给）' }, 400);
    }
    imgDate = clip(payload.imgDate, 10);
    imgId = clip(payload.imgId, 32);
    imgThumb = clip(payload.imgThumb, 200);
    // 白名单：imgThumb 会被渲染成 <img src>，放开等于允许任意 URL 注入
    if (!IMG_DATE_RE.test(imgDate) || !IMG_ID_RE.test(imgId) || !IMG_THUMB_RE.test(imgThumb)) {
      return json({ ok: false, error: '图片信息格式不对' }, 400);
    }
  }
```

并在构造 `item` 的地方加上三个字段：

```js
  const item = {
    id: randomId() + randomId(),
    ts: Date.now(),
    name,
    body,
    link,
    cat,
    imgDate,
    imgId,
    imgThumb,
    author: authorHash,
  };
```

- [ ] **Step 4: 跑测试，确认全过**

```powershell
cd E:\voice-pilot\daily-image-site
node tools/test-likes.mjs
node tools/test-board.mjs
```

Expected: 两个文件都 fail 数为 0。

- [ ] **Step 5: 验证**

```powershell
cd E:\voice-pilot\daily-image-site
node --check functions/board/api.js
node tools/test-likes.mjs
node tools/test-board.mjs
```

Expected: 三条命令退出码都是 0。

---

### Task 3: 前端点赞（角标 + 查看器操作栏）

**Files:**
- Modify: `E:\voice-pilot\daily-image-site\site\template.html`（查看器操作栏 DOM）
- Modify: `E:\voice-pilot\daily-image-site\site\app.js`
- Modify: `E:\voice-pilot\daily-image-site\site\app.css`
- Create: `E:\voice-pilot\daily-image-site\tools\test-likes-ui.mjs`

**Interfaces:**
- Consumes: Task 1 的 `GET /likes/api?date=<日期>` → `{ ok, date, counts, comments }`；`POST /likes/api`（头 `x-daily-visitor`，体 `{ date, id, on }`）→ `{ ok, id, count, on }`
- Produces（给 Task 4 用）：`site/app.js` 里的 `viewerComment` 链接的 href 形如 `/board/?img=<日期>&id=<栏目_序号>&thumb=<缩略图路径>`；`social.comments[id]` 是该图的评论数

- [ ] **Step 1: 在 template.html 里加查看器操作栏**

把 `site/template.html` 里这一段：

```html
  <div class="viewer-hint" id="viewerHint">左右滑动切换 · 长按可保存</div>
</div>
```

改成：

```html
  <div class="viewer-hint" id="viewerHint">左右滑动切换 · 长按可保存</div>
  <!-- 点赞 + 评论这张图。放在 stage 下面，不挡图。
       缩略图格子上只显示赞数角标，真正能点的是这里。 -->
  <div class="viewer-actions" id="viewerActions">
    <button class="vbtn vbtn-like" id="viewerLike" type="button">
      <span class="vbtn-ico" id="viewerLikeIco">👍</span><span id="viewerLikeCount">0</span>
    </button>
    <a class="vbtn vbtn-cmt" id="viewerComment" href="/board/">
      <span class="vbtn-ico">💬</span><span id="viewerCommentCount">0</span> 评论这张图
    </a>
  </div>
</div>
```

- [ ] **Step 2: 在 app.css 里加样式**

在 `site/app.css` 里 `.viewer-hint` 那段之后追加：

```css
/* ── 点赞 / 评论操作栏（查看器底部） ── */
.viewer-actions {
  display: flex;
  gap: 10px;
  padding: 10px 14px calc(12px + var(--safe-bottom));
  background: linear-gradient(180deg, rgba(11,11,15,0), rgba(11,11,15,.92) 42%);
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
}
.vbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;           /* 微信里的可点区域不能太小 */
  padding: 0 16px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(28,28,36,.82);
  color: var(--text, #e8e8ee);
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: rgba(255,255,255,.08);
}
.vbtn:active { transform: scale(.97); }
.vbtn.is-on { border-color: #4a8cff; color: #8ab4f8; }
.vbtn-ico { font-size: 16px; line-height: 1; }
.vbtn-like.is-on .vbtn-ico { filter: saturate(1.4); }

/* ── 缩略图格子的赞数角标（只显示，不可点） ── */
.like-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(0,0,0,.55);
  color: #fff;
  font-size: 11px;
  line-height: 16px;
  pointer-events: none;      /* 点它等同点格子 → 打开查看器，不误赞 */
  -webkit-user-select: none;
  user-select: none;
}
.like-badge[hidden] { display: none; }
```

- [ ] **Step 3: 在 app.js 里写失败测试之前，先加实现**

在 `site/app.js` 顶部（`var DATA = window.__DAILY_MANIFEST__ || null;` 之后）加：

```js
/* ─────────────── 点赞 / 评论 ─────────────── */

var VISITOR_KEY = 'like-vid-v1';
var MINE_KEY = 'like-mine-v1';
var VISITOR_RE = /^[0-9a-f]{16}$/;

var social = { counts: {}, comments: {} };

function randomHex16() {
  var bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  var out = '';
  for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

/** 访客 id：第一次访问时生成，存 localStorage。拿不到存储也不影响点赞 */
function visitorId() {
  var v = null;
  try { v = localStorage.getItem(VISITOR_KEY); } catch (e) { v = null; }
  if (!v || !VISITOR_RE.test(v)) {
    v = randomHex16();
    try { localStorage.setItem(VISITOR_KEY, v); } catch (e) { /* 隐私模式：用内存里的就行 */ }
  }
  return v;
}

/** 「我赞过哪些图」记在本地 —— 服务端的 GET 是访客无关的（能缓存） */
function mineMap() {
  try { return JSON.parse(localStorage.getItem(MINE_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function setMine(date, id, on) {
  try {
    var m = mineMap();
    var list = m[date] || [];
    if (on) { if (list.indexOf(id) < 0) list.push(id); }
    else { list = list.filter(function (x) { return x !== id; }); }
    m[date] = list;
    localStorage.setItem(MINE_KEY, JSON.stringify(m));
  } catch (e) { /* 存不了就算了，计数照样对 */ }
}
function isMined(date, id) {
  return (mineMap()[date] || []).indexOf(id) >= 0;
}
```

- [ ] **Step 4: 继续在 app.js 里加：拉计数 + 角标渲染**

在上面的代码块之后追加：

```js
/** 拉当期计数 —— 一次请求拿全部图的赞数和评论数 */
function loadSocial(date) {
  if (!date) return;
  return fetch('/likes/api?date=' + encodeURIComponent(date))
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j || !j.ok) return;
      social.counts = j.counts || {};
      social.comments = j.comments || {};
      applyBadges();
      syncViewerActions();
    })
    .catch(function () { /* 点赞功能挂了也不该影响看图 */ });
}

/** 把赞数画到格子上。只在 > 0 时显示，0 赞不画 —— 免得 243 个角标糊满屏 */
function applyBadges() {
  for (var key in state) {
    var s = state[key];
    if (!s || !s.cells) continue;
    for (var i = 0; i < s.cells.length; i++) {
      var c = s.cells[i];
      if (!c || !c.item) continue;
      var n = social.counts[c.item.id] || 0;
      if (!c.badge) {
        c.badge = document.createElement('span');
        c.badge.className = 'like-badge';
        c.badge.hidden = true;
        c.el.appendChild(c.badge);
      }
      if (n > 0) {
        c.badge.textContent = '👍 ' + n;
        c.badge.hidden = false;
      } else {
        c.badge.textContent = '';
        c.badge.hidden = true;
      }
    }
  }
}
```

- [ ] **Step 5: 继续在 app.js 里加：查看器操作栏的同步与点赞**

在 `applyBadges` 之后追加：

```js
/** 查看器底部的赞数 / 评论数 / 评论链接 */
function syncViewerActions() {
  var likeBtn = document.getElementById('viewerLike');
  var cmtLink = document.getElementById('viewerComment');
  if (!likeBtn || !cmtLink) return;
  var s = state[vTab];
  var entry = s && s.cells ? s.cells[vIndex] : null;
  if (!entry || !entry.item) return;

  var id = entry.item.id;
  var n = social.counts[id] || 0;
  document.getElementById('viewerLikeCount').textContent = String(n);
  document.getElementById('viewerCommentCount').textContent = String(social.comments[id] || 0);

  var on = isMined(DATA.date, id);
  likeBtn.classList.toggle('is-on', on);
  document.getElementById('viewerLikeIco').textContent = on ? '👍' : '🤍';

  // 评论入口：把「哪一天、哪张图、缩略图」带给留言板页
  cmtLink.setAttribute(
    'href',
    '/board/?img=' + encodeURIComponent(DATA.date) +
      '&id=' + encodeURIComponent(id) +
      '&thumb=' + encodeURIComponent(entry.item.thumb),
  );
}

/** 点赞：幂等切换，on = 目标状态 */
function toggleLike() {
  var s = state[vTab];
  var entry = s && s.cells ? s.cells[vIndex] : null;
  if (!entry || !entry.item) return;
  var id = entry.item.id;
  var on = !isMined(DATA.date, id);
  var btn = document.getElementById('viewerLike');
  if (btn) btn.disabled = true;

  fetch('/likes/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-daily-visitor': visitorId() },
    body: JSON.stringify({ date: DATA.date, id: id, on: on }),
  })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j || !j.ok) return;
      social.counts[id] = j.count;
      setMine(DATA.date, id, on);
      applyBadges();
      syncViewerActions();
    })
    .catch(function () { /* 静默失败：角标还是上一个值 */ })
    .then(function () { if (btn) btn.disabled = false; });
}
```

- [ ] **Step 6: 把新代码挂进既有流程**

1. 在 `renderViewer()` 函数末尾（`preload(vIndex + 1);` 之后）加一行 `syncViewerActions();`
2. 在文件末尾（`showHint` 等初始化之后）加上：

```js
/* 点赞：计数 + 角标 */
document.getElementById('viewerLike').addEventListener('click', function () {
  toggleLike();
});
loadSocial(DATA.date);
```

3. `renderTab` 里创建 cell 之后、`state[tab.key].cells.push(entry);` 之前不需要改 —— 角标由 `applyBadges()` 统一补上。但要保证 `applyBadges()` 在 cell 都建好之后被调用：`loadSocial(DATA.date)` 是异步的，返回时 cell 已经建完 ✓。另外 `applyBadges()` 里的 `c.el.appendChild(c.badge)` 会把角标加在 cell 末尾 —— `.cell img` 是 `position:absolute`，角标也是 absolute，不影响布局 ✓。

- [ ] **Step 7: 写 Playwright 测试（先跑失败）**

新建 `tools/test-likes-ui.mjs`：

```js
/**
 * 点赞前端的 Playwright 测试
 *
 * 为什么要起一个假页面：
 *   本机的 workerd 跑不起来（VC++ 运行库问题），wrangler pages dev 用不了，
 *   所以这里用 Node 起一个静态服务器，把 site/template.html 渲染成测试页，
 *   再用 playwright 的 route 拦截把 /likes/api 换成假的响应。
 *   前端逻辑（访客 id、角标、点赞切换、localStorage）是真的在跑。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'site');

const DATE = '2026-11-03';
const ID = 'jianxiao_001';

function manifest() {
  const item = (id) => ({
    id, w: 800, h: 800, tw: 400, th: 400,
    thumb: '/img/' + DATE + '/jianxiao/ab12cd34ef_001_t.webp',
    full: '/img/' + DATE + '/jianxiao/ab12cd34ef_001.webp',
  });
  return {
    date: DATE,
    generatedAt: '2026-11-03T00:00:00.000Z',
    title: '测试',
    siteUrl: 'http://127.0.0.1:0',
    imageBase: '/img',
    defaultTab: 'jianxiao',
    tabs: [
      { key: 'jianwen', label: '见闻', accent: '#4a8cff', count: 1, type: 'images', items: [item('jianwen_001')] },
      { key: 'jianxiao', label: '见笑', accent: '#ffb02e', count: 1, type: 'images', items: [item(ID)] },
    ],
  };
}

function renderTemplate() {
  let html = fs.readFileSync(path.join(SITE, 'template.html'), 'utf8');
  const m = JSON.stringify(manifest()).replace(/</g, '\\u003c');
  html = html
    .replace(/\{\{PAGE_TITLE\}\}/g, '测试页')
    .replace(/\{\{PAGE_DESC\}\}/g, '测试')
    .replace(/\{\{SITE_URL\}\}/g, 'http://127.0.0.1')
    .replace(/\{\{OG_URL\}\}/g, 'http://127.0.0.1')
    .replace(/\{\{ASSET_BASE\}\}/g, '/assets')
    .replace(/\{\{CSS\}\}/g, '/app.css')
    .replace(/\{\{JS\}\}/g, '/app.js')
    .replace(/\{\{TITLE\}\}/g, '测试')
    .replace(/\{\{DATE\}\}/g, DATE)
    .replace(/\{\{HOME\}\}/g, '/archive/')
    .replace(
      /<script src="\{\{MANIFEST\}\}" defer><\/script>/,
      '<script>window.__DAILY_MANIFEST__ = ' + m + ';</script>',
    );
  return html;
}

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const html = renderTemplate();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  const file = path.join(SITE, path.basename(req.url.split('?')[0]));
  if (fs.existsSync(file)) {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    res.end(fs.readFileSync(file));
    return;
  }
  res.writeHead(404).end('404');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();

// 假的点赞接口
let posted = [];
let serverCounts = { [ID]: 3 };
await page.route('**/likes/api*', async (route) => {
  const req = route.request();
  if (req.method() === 'POST') {
    const body = JSON.parse(req.postData() || '{}');
    posted.push({ ...body, vid: req.headers()['x-daily-visitor'] });
    serverCounts[body.id] = body.on ? (serverCounts[body.id] || 0) + 1 : Math.max(0, (serverCounts[body.id] || 0) - 1);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: body.id, count: serverCounts[body.id], on: body.on }) });
    return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, date: DATE, counts: serverCounts, comments: { [ID]: 2 } }) });
});
await page.route('**/img/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }));

await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);

console.log('\n── 角标 ──');
{
  // 必须锁定「当前激活的那个 tab」的格子。
  // 所有 tab 的格子是一起建进 DOM 的，顺序跟 tab 顺序一致，
  // 而没激活的 .grid 是 display:none —— 所以 .cell.first() 点的是
  // 未激活 tab 里的隐藏格子，Playwright 会一直等到超时。
  const badge = page.locator('#grid-jianxiao .like-badge').first();
  check('角标元素存在', await badge.count() > 0);
  check('角标显示赞数', (await badge.textContent()) === '👍 3', await badge.textContent());
  check('角标不可点', (await badge.evaluate((el) => getComputedStyle(el).pointerEvents)) === 'none');
}

console.log('\n── 查看器操作栏 ──');
// 同上：点当前激活 tab 里的第一格
await page.locator('#grid-jianxiao .cell').first().click();
await page.waitForTimeout(300);
{
  check('点赞按钮可见', await page.locator('#viewerLike').isVisible());
  check('赞数同步到查看器', (await page.locator('#viewerLikeCount').textContent()) === '3');
  check('评论数同步到查看器', (await page.locator('#viewerCommentCount').textContent()) === '2');
  const href = await page.locator('#viewerComment').getAttribute('href');
  check('评论链接带图上下文', href && href.indexOf('img=' + DATE) >= 0 && href.indexOf('id=' + ID) >= 0, href);
  check('评论链接指到留言板', href && href.indexOf('/board/') === 0, href);
}

console.log('\n── 点赞 ──');
await page.locator('#viewerLike').click();
await page.waitForTimeout(400);
{
  check('POST 发出去了', posted.length === 1, posted);
  check('POST 带上了 on=true', posted[0] && posted[0].on === true, posted[0]);
  check('POST 带上了 16 位访客 id', posted[0] && /^[0-9a-f]{16}$/.test(posted[0].vid || ''), posted[0] && posted[0].vid);
  check('查看器赞数 +1', (await page.locator('#viewerLikeCount').textContent()) === '4');
  check('按钮进入已赞态', await page.locator('#viewerLike').evaluate((el) => el.classList.contains('is-on')));
  const stored = await page.evaluate(() => localStorage.getItem('like-mine-v1'));
  check('localStorage 记住了', stored && stored.indexOf(ID) >= 0, stored);
}

console.log('\n── 重复点 = 取消赞 ──');
await page.locator('#viewerLike').click();
await page.waitForTimeout(400);
{
  check('第二次 POST 是取消', posted[1] && posted[1].on === false, posted[1]);
  check('赞数回到 3', (await page.locator('#viewerLikeCount').textContent()) === '3');
}

await browser.close();
server.close();

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
if (fail) process.exit(1);
```

- [ ] **Step 8: 跑测试，确认失败**

```powershell
cd E:\voice-pilot\daily-image-site
node tools/test-likes-ui.mjs
```

Expected: FAIL —— 报「角标元素存在」失败（`.like-badge` 一个都找不到）。

- [ ] **Step 9: 跑测试，确认全过**

（如果 Step 3–6 的代码已经写好，这一步直接跑）

```powershell
cd E:\voice-pilot\daily-image-site
node tools/test-likes-ui.mjs
```

Expected: 全部 `✓`，末尾 `通过 N / 失败 0`。

- [ ] **Step 10: 验证**

```powershell
cd E:\voice-pilot\daily-image-site
node --check site/app.js
node tools/test-likes-ui.mjs
```

Expected: 两条命令退出码都是 0。

---

### Task 4: 留言板页的图上下文（缩略图 + 按图过滤）

**Files:**
- Modify: `E:\voice-pilot\daily-image-site\site\board.html`
- Create: `E:\voice-pilot\daily-image-site\tools\test-board-ui.mjs`

**Interfaces:**
- Consumes: Task 2 的 `GET /board/api` → item 增加 `imgDate` / `imgId` / `imgThumb`；Task 3 的评论链接 `?img=&id=&thumb=`
- Produces: 留言板页在带 `?img=` 参数时显示目标图并只列该图的评论；不带参数时行为与现在完全一样

- [ ] **Step 1: 确认 site/board.html 的现状结构**

`site/board.html` 是个自包含页面（样式和脚本都在文件里）。已确认的关键结构：

| 位置 | 是什么 |
|---|---|
| `#listCard` | 留言列表所在的卡片，**图上下文区插在它里面、`#msgList` 之前** |
| `#msgList` | 留言列表容器（`render()` 里 `innerHTML = ''` 后往里塞 `li`） |
| `li.msg-item` | 一条留言 |
| `p.msg-body` | 一条留言的正文（`render()` 里 `p.textContent = it.body`） |
| `#countTip` | 「共 N 条留言」（`render()` 末尾 `countTip.textContent = items.length ? …`） |
| `#emptyTip` | 空列表提示 |
| `render(items)` | 渲染函数，遍历 `items` 生成 `li.msg-item` |
| `submit()` | 提交函数，POST `/board/api`，请求体是 `{ name, cat, body, link }` |
| `load()` | 拉取函数，GET `/board/api` 后调 `render(data.items || [])` |
| `api` | 变量，值是 `'/board/api'` |
| `headers(extra)` | 给请求加 `x-author-token` 头 |

```powershell
Select-String -Path E:\voice-pilot\daily-image-site\site\board.html -Pattern 'id="[^"]+"|function \w+|function render|function submit|function load' -Encoding UTF8
```

- [ ] **Step 2: 写失败测试**

新建 `tools/test-board-ui.mjs`，结构与 `tools/test-likes-ui.mjs` 相同（本地静态服务器 + playwright + route 拦截），但这次：

- 直接把 `site/board.html` 读出来当首页（它本来就是自包含页面，`/board/` 也由它自己处理）。
  **注意：静态服务器必须同时在 `/` 和 `/board/`（以及 `/board/` 带查询串）上返回这份 HTML** ——
  下面的断言是 `page.goto(base + '/board/?img=...')` 去的，只在 `/` 提供服务的话会 404，
  报错会指向「页面元素不存在」这种误导性的地方。
  `site/board.html` 的样式和脚本都是内联的（只有 favicon 指向 `/assets/logo.jpg`，404 无所谓），
  所以不需要额外提供静态资源。
- 拦截 `**/board/api`，返回固定的留言数组，其中两条带图字段：

```js
const MESSAGES = [
  { id: 'm1', ts: 1750000000000, name: 'A', body: '这张图绝了', link: '', cat: '',
    imgDate: '2026-11-03', imgId: 'jianxiao_012', imgThumb: '/img/2026-11-03/jianxiao/ab12cd34ef_012_t.webp', mine: false },
  { id: 'm2', ts: 1750000001000, name: 'B', body: '跟图留言', link: '', cat: '',
    imgDate: '2026-11-03', imgId: 'jianxiao_012', imgThumb: '/img/2026-11-03/jianxiao/ab12cd34ef_012_t.webp', mine: false },
  { id: 'm3', ts: 1750000002000, name: 'C', body: '普通留言', link: '', cat: '', imgDate: '', imgId: '', imgThumb: '', mine: false },
];
```

断言（选择器全部用上表里的真实 id / class）：

```js
// 带图参数进入
await page.goto(base + '/board/?img=2026-11-03&id=jianxiao_012&thumb=' + encodeURIComponent(THUMB), { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);

check('显示目标图上下文', await page.locator('#imgCtx').isVisible());
check('目标图缩略图已渲染', await page.locator('#imgCtx img').count() > 0);
check('列表只剩这张图的评论', (await page.locator('p.msg-body').allTextContents()).filter((t) => t.includes('普通留言')).length === 0);
check('这张图的两条评论都在', (await page.locator('p.msg-body').allTextContents()).filter((t) => t.indexOf('图') >= 0).length >= 2);
check('有「看全部留言」入口', await page.locator('#showAll').isVisible());
check('留言带缩略图', await page.locator('img.msg-thumb').count() >= 1);

// 不带图参数 —— 行为跟现在完全一样
await page.goto(base + '/board/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);
check('不带参数时列出全部留言', (await page.locator('p.msg-body').allTextContents()).some((t) => t.includes('普通留言')));
check('不带参数时不显示图上下文', !(await page.locator('#imgCtx').isVisible()));

// 伪造的 thumb 不得被当成图片渲染
await page.goto(base + '/board/?img=2026-11-03&id=jianxiao_012&thumb=' + encodeURIComponent('https://evil.example.com/x.png'), { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(600);
check('伪造 thumb 时不显示图上下文', !(await page.locator('#imgCtx').isVisible()));
const srcs = await page.locator('#imgCtx img').evaluateAll((els) => els.map((e) => e.getAttribute('src')));
check('伪造 thumb 不出现在 img src 里', srcs.every((s) => !s || s.indexOf('evil.example.com') < 0), srcs);
```

- [ ] **Step 3: 跑测试，确认失败**

```powershell
cd E:\voice-pilot\daily-image-site
node tools/test-board-ui.mjs
```

Expected: FAIL —— 「显示目标图上下文」失败（页面上还没有这个元素）。

- [ ] **Step 4: 实现 site/board.html**

四处改动：

**① 顶部图上下文区**（插在 `#listCard` 里、`#msgList` 之前，默认隐藏）：

```html
<div id="imgCtx" class="img-ctx" hidden>
  <img id="imgCtxImg" alt="">
  <div class="img-ctx-txt">
    <strong id="imgCtxTitle"></strong>
    <span id="imgCtxSub"></span>
  </div>
  <a id="showAll" href="/board/">看全部留言</a>
</div>
```

**② CSS**（加在 `site/board.html` 现有的 `<style>` 里）：

```css
.img-ctx{display:flex;align-items:center;gap:12px;padding:12px 14px;margin:0 0 12px;
  border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.04)}
/* 必须有这一句：作者样式表里的 display:flex 优先级高于 UA 样式表的
   [hidden]{display:none}，不写的话 <div hidden> 照样显示得出来，
   「不带参数时不显示图上下文」那条断言就永远失败。
   （同款规则在 .like-badge[hidden]{display:none} 里已经有了。） */
.img-ctx[hidden]{display:none}
.img-ctx img{width:64px;height:64px;object-fit:cover;border-radius:8px;background:#000}
.img-ctx-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.img-ctx-txt strong{font-size:14px}
.img-ctx-txt span{font-size:12px;color:var(--dim)}
.img-ctx a{font-size:13px;color:#8ab4f8;white-space:nowrap}
.msg-thumb{width:48px;height:48px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-right:8px}
```

**③ JS**（加在 `site/board.html` 现有的 `<script>` 里，紧跟 `var api = '/board/api';` 之后）：

```js
  /* ── 跟图评论：?img=&id=&thumb= ─────────────────────────── */
  var IMG_THUMB_RE = /^\/img\/\d{4}-\d{2}-\d{2}\/[a-z]+\/[0-9a-f]{10}_\d{3}_t\.webp$/;
  var IMG_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var IMG_ID_RE = /^[a-z]{3,10}_\d{3}$/;

  /* thumb 要再过一次白名单 —— 后端已经校验过，
     但前端渲染前再挡一次，防止以后有人改后端时漏了 */
  function readImgContext() {
    var q = new URLSearchParams(location.search);
    var date = q.get('img') || '';
    var id = q.get('id') || '';
    var thumb = q.get('thumb') || '';
    if (!IMG_DATE_RE.test(date) || !IMG_ID_RE.test(id) || !IMG_THUMB_RE.test(thumb)) return null;
    return { date: date, id: id, thumb: thumb };
  }

  var imgCtx = readImgContext();

  function showImgContext() {
    if (!imgCtx) return;
    document.getElementById('imgCtxImg').setAttribute('src', imgCtx.thumb);
    document.getElementById('imgCtxTitle').textContent = imgCtx.date + ' 这张图的评论';
    document.getElementById('imgCtxSub').textContent = imgCtx.id;
    document.getElementById('imgCtx').hidden = false;
  }
```

**④ `render(items)` 加过滤和缩略图**

把 `render(items)` 的开头改成：

```js
  function render(items) {
    msgList.innerHTML = '';
    // 带了图上下文就只显示这张图的评论
    var list = imgCtx
      ? items.filter(function (it) {
          return it && it.imgDate === imgCtx.date && it.imgId === imgCtx.id;
        })
      : items;
    list.forEach(function (it) {
```

在 `p.textContent = it.body;` 之后、`li.appendChild(p);` 之前插入缩略图：

```js
      // 带图的留言：正文前放一张缩略图，点它跳回那张图
      if (it.imgThumb && IMG_THUMB_RE.test(it.imgThumb)) {
        var ti = document.createElement('img');
        ti.className = 'msg-thumb';
        ti.setAttribute('src', it.imgThumb);
        ti.alt = '';
        ti.addEventListener('click', function () {
          location.href = '/' + it.imgDate + '/';
        });
        li.appendChild(ti);
      }
```

把 `render()` 末尾的计数改成按过滤后的条数：

```js
    emptyTip.hidden = list.length > 0;
    countTip.textContent = list.length ? ('共 ' + list.length + ' 条留言') : '';
```

**⑤ `submit()` 的请求体带上图上下文**

把 `submit()` 里的 `fetch(api, { ... })` 改成先拼 payload：

```js
    var payload = {
      name: nameInput.value.trim(),
      cat: catSelect.value,
      body: body,
      link: linkInput.value.trim(),
    };
    // 只在有图上下文时才加这三个键 —— 后端约定「要么都不给，要么都给」
    if (imgCtx) {
      payload.imgDate = imgCtx.date;
      payload.imgId = imgCtx.id;
      payload.imgThumb = imgCtx.thumb;
    }

    fetch(api, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    })
```

**⑥ 初始化时调用 `showImgContext()`**

在页面初始化处（`load()` 的调用点附近）加一行 `showImgContext();`。

- [ ] **Step 5: 跑测试，确认全过**

```powershell
cd E:\voice-pilot\daily-image-site
node tools/test-board-ui.mjs
```

Expected: 全部 `✓`，末尾 `通过 N / 失败 0`。

- [ ] **Step 6: 验证**

```powershell
cd E:\voice-pilot\daily-image-site
node tools/test-board-ui.mjs
node tools/test-likes-ui.mjs
node tools/test-likes.mjs
node tools/test-board.mjs
```

Expected: 四条命令退出码都是 0。

---

### Task 5: 部署 + 线上冒烟 + 文档

**Files:**
- Modify: `E:\voice-pilot\daily-image-site\README.md`

**Interfaces:**
- Consumes: Task 1–4 的全部产出
- Produces: 线上可用的点赞与跟图评论

- [ ] **Step 1: 本地全量自检**

```powershell
cd E:\voice-pilot\daily-image-site
node tools/test-likes.mjs
node tools/test-board.mjs
node tools/test-likes-ui.mjs
node tools/test-board-ui.mjs
node tools/test-functions.mjs
```

Expected: 五条命令退出码都是 0。

- [ ] **Step 2: 部署（只重建页面，不重转码、不重传图片）**

```powershell
cd E:\voice-pilot\daily-image-site
powershell -NoProfile -ExecutionPolicy Bypass -File tools\publish.ps1 -Date 2026-11-03 -NoConvert -SkipUpload
```

> **为什么是 `-NoConvert -SkipUpload`**：
> - `-NoConvert` = 复用已转码的图片，只重建页面（28 秒而不是 150 秒）。源图没动，产物文件名对得上。
> - `-SkipUpload` = 图片已经在 R2 上了，不用重传；**它同时跳过审稿闸门**（`publish.ps1` 第 214 行的条件是 `-not $SkipUpload -and -not $SkipReview`）。
> - 前端 `app.js` / `app.css` / `template.html` 的改动会由构建重新打包成 `app.<新哈希>.js`，所以**不能跳过构建**。
>
> Expected: 日志末尾出现 `Deployment complete!` 和新的部署地址。

- [ ] **Step 3: 线上冒烟**

```powershell
# ① 点赞接口能返回计数
Invoke-WebRequest -Uri 'https://daily.onetone.app/likes/api?date=2026-11-03' -UseBasicParsing | Select-Object -ExpandProperty Content

# ② 页面能拿到新 app.js（看 published 里的哈希与线上是否一致）
```

浏览器里再人工确认：

1. 打开 `https://daily.onetone.app/2026-11-03/` → 有赞的图右上角出现 `👍 N` 角标
2. 点开一张图 → 底部出现「👍 N」和「💬 N 评论这张图」
3. 点点赞 → 数字 +1，按钮变高亮；刷新后仍然 +1（访客去重生效）
4. 清掉 localStorage 再赞 → 数字不变（服务端去重生效）
5. 点「评论这张图」→ 留言板页显示那张图 → 输口令提交 → 列表出现该留言 + 缩略图
6. 点留言旁的缩略图 → 跳回那张图
7. 留言板页刷新后过滤仍然生效

- [ ] **Step 4: 更新 README**

在 `E:\voice-pilot\daily-image-site\README.md` 里加一节《点赞与跟图评论》，写清楚：

- 存储：`likes/<日期>.json`（一期一个文件）、留言板加三个可选字段
- 接口：`GET /likes/api`（可边缘缓存，访客无关）、`POST /likes/api`（`x-daily-visitor` 头）
- 权限：点赞不要口令（限流 30/分钟、300/小时），评论要投稿口令
- **三条已知限制**（照抄设计文档 §7）：
  1. 单图键是位置编号 —— 发布后若再删图重发，序号前移会让旧点赞/评论挂到隔壁图
  2. 计数最多滞后 30 秒（API Token 没有 Cache Purge 权限）
  3. 留言板全局 500 条上限不变

同时更新「现状」表，加一行：

```
| 点赞 + 跟图评论 | 已上线。点赞开放（一人一次，浏览器 localStorage 记访客 ID），评论沿用投稿口令。数据在 R2 `likes/<日期>.json`，一期一个文件，页面加载 1 次请求拿全部计数 |
```

- [ ] **Step 5: 验证**

```powershell
cd E:\voice-pilot\daily-image-site
node tools/final-verify.mjs
```

Expected: 10 期 4516 张，**不一致 0 张**（确认这次部署没弄坏任何历史图片）。

---

## 附录 A: 站点代码的版本控制现状

`daily-image-site/` 被仓库根的 `.gitignore:115` 忽略，注释写明「每日图片站的本地项目，不进 onetone 仓库，也不跟着仓库走」。

**后果**：本计划的每个 Task 没法用 git commit 做检查点，只能用「跑测试 + 记录」代替。如果以后想把它纳入版本控制，需要：

1. 改根 `.gitignore` 的第 115 行（删掉或改成不忽略）
2. **在 `daily-image-site/.gitignore` 里补一条**：`.fetch-ledger.json`（抓取台账，434 KB，按约定算凭据，不能入库）；顺手补 `.review-*.out` / `.review-*.err`
3. `git add -f daily-image-site/`（`.env.local` / `.img-salt` / `.review-passed-*` 已被站点自己的 `.gitignore` 排除）

**注意**：站点代码进了仓库之后，提交会落在当前的 `feature/atr-phase1-review-undo` 分支上 —— 那是 OneTone 主项目的分支，跟这个站点无关。要么先切一条独立分支，要么把提交混在主仓的 `docs/` 提交里。

---

## 执行记录

（实施时在这里逐 Task 记录：测试通过项数、遇到的问题、实际用到的元素 id、最终验证结果。）
