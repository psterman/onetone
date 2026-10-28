# 每日图片站

把 `见闻 / 见她 / 见笑` 三个文件夹的每日图片，转成可在微信里直接浏览的公开网页。

- **页面**：Cloudflare Pages（静态 + Pages Function 图片代理）
- **图片**：Cloudflare R2 私有 bucket，经 Function 代理读取 —— 不进 git 历史，可随时整目录撤回
- **更新**：每天一个独立日期页（`/2026-10-25/`），历史全部保留

---

## 现状

已用 2026-10-25 的真实数据（245 张 / 28.91 MB）完整跑通并验证：

| 指标 | 实测值 |
|---|---|
| 首屏可交互 | 94 ms |
| 移动端首屏图片请求 | 171 次，0 失败 |
| 控制台错误 | 0 |
| 全尺寸 WebP | 15.33 MB（压缩比 1:1.89） |
| 缩略图 | 4.76 MB（平均 19.2 KB/张） |
| 页面体积 | 55 KB/天（HTML 37 + CSS 8.6 + JS 9.2） |
| 转码耗时 | 245 张约 4 分钟 |
| Functions 单元测试 | 18/18 通过 |

站点名称：**大脑请批阅**，页头 logo 为 `site/assets/logo.webp`，
分享卡片封面为 `site/assets/logo.jpg`（640×640）。

---

## 微信群分享：怎么保证群友在手机上能看

### 一、技术上必须满足的条件（已全部实现）

| 条件 | 做法 |
|---|---|
| HTTPS + 公网域名 | Cloudflare Pages 自带证书；建议绑自有域名，别用 `*.pages.dev` |
| 分享卡片有标题 | `<title>` = `大脑请批阅 · 2026-10-25`，微信聊天卡片直接取它 |
| 分享卡片有封面 | `og:image` → 640×640 logo。微信爬虫**不执行 JS**，所以 og 标签必须是静态 HTML（已经是） |
| 打开要快 | 首屏只拉缩略图（19 KB/张），实测首屏 94 ms |
| 微信 X5 兼容 | 懒加载 / viewport / srcset 全部按 X5 规则处理，见下表 |
| 不触发风控 | 无诱导分享、无强制跳外部浏览器、无下载行为 |
| 大图可保存 | 查看器用原生 `<img>`，微信内长按可存相册 |

### 二、运营上怎么发链接

**1. 发固定入口，不要发每天的日期链接**

```
https://daily.onetone.app/          ← 归档页，列出所有日期，群友收藏这一个就够
https://daily.onetone.app/2026-10-25/  ← 当天页
```

理由：微信会缓存链接卡片。发固定入口，标题和封面只抓一次，
而且群友收藏一次就能天天看。日期页留给「回看昨天」。

**2. 卡片长什么样**

- 标题：`大脑请批阅 · 2026-10-25`
- 封面：粉红火烈鸟 logo（640×640）
- 描述：`见闻 · 见她 · 见笑，每日一阅。`

**3. 新域名首次打开可能有提示**

微信对**任何**新域名首次打开都会弹「非微信官方网页」的反钓鱼提示，
点「继续访问」即可。这是微信的通用策略，不是站点问题。
域名有正常访问量、用户习惯之后出现频率会下降。

**4. 底部有「使用其他浏览器打开」**

这是微信的默认行为，无法去掉，也不影响在微信里正常浏览。

### 三、如果开了访问口令，分享链接必须带 `?k=`

```
https://daily.onetone.app/2026-10-25/?k=XXXX
```

群友点开 → 服务端校验 → 下发 cookie → 302 跳到干净 URL → 图片正常加载。
卡片仍然有标题和封面，因为页面 HTML 保持公开（见下一节）。

没带口令直接打开：页面框架和标题正常，图片加载失败，
前端会弹一条「图片未能加载，请向发送者索取带口令的完整链接」——不会白屏。

### 四、如果要在公众号里推

- 把入口链接配到公众号**自定义菜单**，用户点菜单直达
- 需要「每天推送一条提醒」就得接公众号 API（当前未做，属于额外工作量）

---

## 目录结构

```
daily-image-site/
├── site/                      # 前端模板（要改样式改这里）
│   ├── template.html
│   ├── app.css
│   ├── app.js
│   └── assets/                # logo（logo.jpg 640 / logo.webp 96）
├── tools/
│   ├── setup-cloudflare.ps1  # 一次性配置：凭据 / bucket / 口令
│   ├── build.mjs              # 扫描 → 转码 → 生成 manifest → 出页面
│   ├── upload-r2.mjs          # 上传图片到 R2（纯 REST，不依赖 wrangler）
│   ├── publish.ps1            # 一键：build → upload → deploy
│   ├── make-logo.mjs          # 由源图生成两套 logo 尺寸
│   ├── dev-server.mjs         # 本地预览
│   ├── verify.mjs             # 移动端 + 微信 UA 自动验证
│   └── test-functions.mjs     # Function 单元测试
├── functions/
│   ├── _middleware.js         # 可选访问口令（默认关闭）
│   └── api/img/[[path]].js    # 图片代理（R2 → 浏览器）
├── r2/<date>/<tab>/*.webp      # 转码产物，待上传
├── published/                 # 页面产物，待部署
├── .env.local                 # Cloudflare 凭据（已 gitignore）
└── wrangler.toml
```

---

## 一次性配置

```powershell
powershell -ExecutionPolicy Bypass -File E:\voice-pilot\daily-image-site\tools\setup-cloudflare.ps1
```

### ⚠️ 第一步：去 Dashboard 启用 R2（必须手动做一次）

Cloudflare 的 R2 默认是关闭的，没启用的话所有 R2 接口都会返回 **错误码 10042**
（`Please enable R2 through the Cloudflare Dashboard`）。

1. Cloudflare Dashboard → 左侧 **R2**
2. 点 **Enable R2 / 启用 R2**，同意条款
3. 免费额度 10GB/月，可能要求绑一张卡（不扣费）

不启用 R2 的话：**Pages 部署正常，但图片上传会失败**，页面能打开却看不到图。

### 然后跑配置脚本

```powershell
powershell -ExecutionPolicy Bypass -File E:\voice-pilot\daily-image-site\tools\setup-cloudflare.ps1
```

脚本会按顺序做四件事：

| 步骤 | 内容 |
|---|---|
| 1/4 认证 | 优先 `npx wrangler login`（**浏览器点一次「允许」就行，不用手填 Token**）；Account ID 会用 Token 自动查出来，不用手填 |
| 2/4 R2 bucket | 自动创建 `daily-images`，并**实测一次上传**确认有写权限 |
| 3/4 Pages 项目 | 首次部署时 wrangler 自动创建，不用管 |
| 4/4 访问口令 | 可选，见下文 |

### 如果手动填 Token，需要勾这三项权限

My Profile → API Tokens → Create Token：

| 权限 | 用途 |
|---|---|
| Account → Workers R2 Storage → Edit | 上传图片 |
| Account → Cloudflare Pages → Edit | 部署页面 |
| Account → Workers Scripts → Edit | 部署 Function |

填错时脚本会明确告诉你原因：404 = Account ID 拼错、401 = Token 过期、403 = 权限不够。

### 如果脚本提示「当前凭据没有 R2 写权限」

有些账号的 OAuth 权限不覆盖 R2 对象写入。脚本会引导你去
**R2 → Manage R2 API Tokens → Create API Token**，权限选 Object Read & Write、
范围只选 `daily-images` 这个 bucket，把生成的 Token 粘贴回去即可。
（这个 Token 只能上传图片，Pages 部署仍走 wrangler 登录态，不冲突。）

### 绑域名（可选）

Pages 项目 → Custom domains → 加 `daily.onetone.app`。
图片走同一域名的 `/img/*`，由 Function 代理，**不需要第二个域名**。

**域名要和构建时的一致** —— `og:image` 用的是绝对地址，域名写错会导致微信分享卡片没有封面：

```powershell
node tools/build.mjs --site-url https://你的域名
# 或设环境变量 SITE_URL，publish.ps1 会自动带上
```

---

## 改站点名称 / logo

- **标题**：改 `tools/build.mjs` 里的 `SITE_TITLE`（当前「大脑请批阅」）
- **logo**：把新图放到 `site/assets/logo-source.jpg`，然后
  ```powershell
  node tools/make-logo.mjs
  ```
  会生成 `logo.jpg`（640×640，给分享卡片）和 `logo.webp`（96×96，给页头图标）。
  每次构建会自动把这两个文件复制到 `published/assets/`。

---

## 日常使用

图片人工放进 `C:\Users\pstem\Downloads\<日期>\`：

```
C:\Users\pstem\Downloads\2026-10-25\
├── 见闻\    20 张
├── 见她\    71 张
└── 见笑\   154 张
```

然后一条命令：

```powershell
powershell -ExecutionPolicy Bypass -File E:\voice-pilot\daily-image-site\tools\setup-cloudflare.ps1
```

它会依次：转码 → 上传 R2 → 部署 Pages。全量 245 张约 4–5 分钟。

它会依次：转码 → 上传 R2 → 部署 Pages。全量 245 张约 4–5 分钟。

访问口令是**一次性设置**在 Pages 项目上的（`wrangler pages secret put GATE_TOKEN`），
之后每次发布都会自动生效，publish.ps1 不需要额外传参。

单独跑某一步：

```powershell
node tools/build.mjs                       # 只构建
node tools/build.mjs --date 2026-10-25     # 指定日期
node tools/build.mjs --no-convert          # 复用已转码图片，只重建页面
node tools/upload-r2.mjs 2026-10-25        # 只上传某天
node tools/upload-r2.mjs --dry             # 只看计划不真传
node tools/dev-server.mjs 8788             # 本地预览
node tools/verify.mjs                      # 移动端 + 微信 UA 自动验证
```

---

## 图片处理规格

| | 原始 | 全尺寸 | 缩略图 |
|---|---|---|---|
| 宽度上限 | — | 1080px | 400px |
| 格式 | jpg/gif/png | WebP q80–86 | WebP q72 |
| 缩放 | — | 等比，永不放大 | 等比，永不放大 |

- 源文件里的 GIF **全部是单帧**，转 WebP 无动画损失
- 见闻（新闻截图，文字密）q86、见笑（梗图，带字幕）q84、见她（照片）q80
- 只设宽度上限、不设高度上限 —— 竖长截图（见闻最高 3136px）保持原比例，不做无意义的二次缩小
- 缩略图按真实宽高比预占位（padding-top 百分比），**零布局抖动**

---

## 微信端兼容要点

已在 `site/app.css` / `site/app.js` 里处理：

| 问题 | 处理 |
|---|---|
| X5 内核忽略 `loading="lazy"` | 全部改用 IntersectionObserver 手写懒加载 |
| X5 对 `gap` / `aspect-ratio` 支持差 | 间距用 margin / column-gap，比例用 padding-top 百分比占位 |
| 微信劫持 `<meta viewport>` | 硬编码 `maximum-scale=1, user-scalable=no` |
| 微信忽略 `srcset` / `sizes` | 图片一律走 `<img src>` |
| 微信缓存顽固 | 资源路径含日期，前端文件名带内容 hash |
| 首屏白闪 | 关键背景色内联在 `<head>` |
| 长按保存 | 大图查看器用原生 `<img>`，微信可长按保存到相册 |

---

## 访问口令（可选，默认关闭）

「见她」是写真类内容。**公开域名 = 公开传播**，一旦被爬虫或搜索引擎收录，
即使之后删掉 R2 对象，已被抓走的副本也收不回来。

如果需要「可随时撤回」，启用口令层：

```powershell
npx wrangler pages secret put GATE_TOKEN --project-name daily-image-site
```

**保护范围是「图片」，不是「整个站点」** —— 这是为了微信分享卡片考虑：

| 路径 | 是否需要口令 | 原因 |
|---|---|---|
| `/2026-10-25/` 等页面 HTML | **公开** | 微信爬虫要靠它生成带标题和封面的卡片 |
| `/assets/logo.jpg` | **公开** | logo 就是分享封面 |
| `/img/**` | **需要** | 真正要保护的内容在这里 |

所以：
- 分享链接带 `?k=口令` → 群友点开自动获得 cookie → 图片正常
- **轮换 `GATE_TOKEN` = 瞬间收回所有人的图片访问权**，比逐个删 R2 对象干净得多
- 不带口令访问：页面框架正常、图片为空，并弹出明确提示条（不会白屏）

不设置 `GATE_TOKEN` 就是完全公开（当前默认）。

---

## 撤回内容

| 想撤什么 | 怎么做 |
|---|---|
| 某一天的全部图片 | R2 里删掉 `<日期>/` 前缀；Pages 里删 `published/<日期>/` 后重新部署 |
| 全部收回访问权 | 轮换 `GATE_TOKEN`，或删掉 R2 里的对象 |
| 某个分类 | R2 里删 `<日期>/<分类>/` 前缀，再重新构建部署该日页面 |

---

## 定时自动发布（可选）

Windows 任务计划程序，每天 23:30 执行：

```powershell
powershell -ExecutionPolicy Bypass -File E:\voice-pilot\daily-image-site\tools\publish.ps1
```

任务计划跑的是新会话，环境变量读不到 —— 但 `.env.local` 会被自动加载，不受影响。

---

## 改脚本时注意（一个真实的坑）

**`.ps1` 文件必须存成 UTF-8 with BOM。**

Windows 自带的 PowerShell 5.1 读取「UTF-8 无 BOM + 中文」时，会按 ANSI/GBK 解码，
多字节序列被拆开后可能变成孤立的引号，导致脚本**在解析阶段就报错、一个字都跑不了**
（实测报「语句块或类型定义中缺少右 }」「字符串缺少终止符」）。

本项目的两个 `.ps1` 已经加好 BOM。以后用编辑器改完，如果出现莫名其妙的语法错误，
先确认编码是 **UTF-8 with BOM**。

一键自检：

```powershell
powershell -NoProfile -Command "Get-ChildItem E:\voice-pilot\daily-image-site\tools -Filter *.ps1 | ForEach-Object { $b=[IO.File]::ReadAllBytes($_.FullName); $t=$null;$e=$null; [System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$t,[ref]$e)|Out-Null; '{0}  BOM={1}  解析错误={2}' -f $_.Name, ($b[0] -eq 0xEF), $e.Count }"
```

`.js` / `.mjs` / `.css` / `.html` 不受影响（Node 与浏览器都按 UTF-8 处理，HTML 里有 `<meta charset>`）。

---

## 部署完成后你的链接长什么样

| 用途 | 链接 |
|---|---|
| **发到微信群（推荐，固定不变）** | `https://daily.onetone.app/` |
| 当天页 | `https://daily.onetone.app/2026-10-25/` |
| 开了口令时的当天页 | `https://daily.onetone.app/2026-10-25/?k=你的口令` |

域名以 `.env.local` 里的 `SITE_URL` 为准；换域名后重跑 `publish.ps1` 即可同步 og 标签。

- **微信内跳转**：需要公众号时，把日期页链接配到公众号自定义菜单即可；本项目不做公众号 API 对接。
- **国内访问速度**：Cloudflare 默认节点在国内时延一般。首屏只加载缩略图（19 KB/张），
  实测首屏可交互 104 ms，日常够用。若要更快，可把图片改挂阿里云 OSS + 国内 CDN。
- **不做历史清理**：`published/` 和 R2 会随天数线性增长。R2 免费额度 10 GB，
  按 20 MB/天算够用一年多；Pages 静态文件不占 R2 额度。

test111


222
