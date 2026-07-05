# 部署 onetone.app / GitHub Pages

官网静态文件在 `website/`。通过 **GitHub Actions** 发布，不要从仓库根目录部署。

## 为什么 `psterman.github.io/onetone/` 显示 README？

若打开 [https://psterman.github.io/onetone/](https://psterman.github.io/onetone/) 看到的是旧版 README（Voice Pilot 文档），说明 Pages **没有** 用 `website/` 目录，而是把仓库根目录当成了站点。

常见原因：

1. **Pages 来源选错了**：Settings → Pages → Source 仍是 “Deploy from a branch / root”，会渲染根目录 `README.md`
2. **工作流没跑**：`.github/workflows/pages.yml` 原先只监听 `main`，本仓库默认分支是 **`master`**

按下面步骤改一次即可。

---

## 1. 启用 GitHub Actions 部署

1. 打开仓库 **Settings → Pages**
2. **Build and deployment → Source** 选 **GitHub Actions**（不要选 Deploy from branch）
3. 推送包含 `website/` 与 `.github/workflows/pages.yml` 的代码到 **`master`**
4. 打开 **Actions** → 运行 **Deploy website**（或 `workflow_dispatch` 手动触发）
5. 等任务变绿

成功后访问：

- 项目页：**https://psterman.github.io/onetone/**
- 应看到一声官网首页（「想什么，说一声」），而不是 README

### 本地预览

```powershell
cd website
python -m http.server 8080
```

浏览器打开 http://localhost:8080

---

## 2. 自定义域名 `onetone.app`（二选一）

### 方案 A：GitHub Pages + CNAME

仓库已包含 [`CNAME`](CNAME)：`www.onetone.app`

1. **Settings → Pages → Custom domain** 填 `www.onetone.app`
2. DNS：`www` CNAME → `psterman.github.io`
3. 证书就绪后开启 **Enforce HTTPS**
4. 根域名 `onetone.app` 在 DNS 商或 Cloudflare 做 301 → `https://www.onetone.app`

### 方案 B：Cloudflare Pages（推荐）

1. Cloudflare → **Workers & Pages** → Connect Git → 仓库 `psterman/onetone`
2. Production branch：`master`
3. Build command：留空；Output directory：`website`
4. Custom domains：`onetone.app` + `www.onetone.app`
5. 关闭 GitHub Pages 自定义域名，删除或停用 `pages.yml`，避免双部署

`website/` 内链接与 `canonical` 已指向 `https://www.onetone.app`，绑域名后无需改 HTML。

---

## 3. 日常更新

改 `website/` 后 push 到 `master`，**Deploy website** 工作流会自动重新部署（约 1–3 分钟）。

仅改应用代码、未改 `website/` 时不会触发网站部署。

---

## 4. 替换截图

将真实应用截图放入 `assets/screenshots/`，至少更新：

- `welcome.svg` → 可改为 `welcome.png`
- `record-keys.svg` → `record-keys.png`
- `success-state.svg` → **`success-state.png`**（上手页成功判定用）

HTML 里把对应 `src` 扩展名改成 `.png` 即可。
