# 部署 onetone.app

官网静态文件在 `website/`，通过 GitHub Actions 发布到 GitHub Pages。

## 1. 首次启用 GitHub Pages

1. 将 `website/` 与 `.github/workflows/pages.yml` 推送到 `main`
2. 打开仓库 **Settings → Pages**
3. **Build and deployment → Source** 选 **GitHub Actions**
4. 等 `Deploy website` 工作流跑绿

## 2. 自定义域名 www.onetone.app

仓库已包含 [`CNAME`](CNAME)：`www.onetone.app`

在 **Settings → Pages → Custom domain** 填写：

```
www.onetone.app
```

保存后按 GitHub 提示勾选 **Enforce HTTPS**（证书就绪后）。

### DNS（在域名服务商）

| 类型 | 主机 | 值 |
|------|------|-----|
| CNAME | `www` | `psterman.github.io` |

> 若仓库名不是 `psterman.github.io` 而是 `voice-pilot` 等项目页，CNAME 仍指向 `psterman.github.io`，由 GitHub 根据 CNAME 文件路由。

### 根域名 onetone.app（可选）

GitHub Pages 不直接托管 apex。常见做法：

- 用 Cloudflare / 域名商 **重定向** `onetone.app` → `https://www.onetone.app`
- 或按域名商文档配置 ALIAS/ANAME 到 `psterman.github.io`

## 3. 本地预览

```powershell
cd website
python -m http.server 8080
```

浏览器打开 http://localhost:8080

## 4. 更新网站

改 `website/` 下文件后 push 到 `main`，工作流会自动重新部署。

## 5. 替换截图

将真实应用截图放入 `assets/screenshots/`，至少更新：

- `welcome.svg` → 可改为 `welcome.png`
- `record-keys.svg` → `record-keys.png`
- `success-state.svg` → **`success-state.png`**（上手页成功判定用）

HTML 里把对应 `src` 扩展名改成 `.png` 即可。
