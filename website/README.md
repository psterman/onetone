# OneTone website

Static product site for [onetone.app](https://www.onetone.app). Dark HUD shell (brand cyan `#2a9cc4`), sourced from `website2/` prototypes.

## Local preview

```powershell
cd website
python -m http.server 8080
```

Open http://localhost:8080

## Pages

| Path | Source |
|------|--------|
| `index.html` | Overview / peripheral trigger demo |
| `quickstart.html` | 3-step usage lab |
| `vision.html` | Camera vision hub |
| `agent.html` | Codex Micro Agent HUD |
| `download.html` | Windows installer + GitHub Releases |
| `faq.html` / `support.html` / legal | Secondary |

Shared: `css/tokens.css`, `css/shell.css`, `js/shell.js`, `js/i18n.js`.

## Deploy

Pushes to `master` (or `main`) that touch `website/` deploy via GitHub Actions (`.github/workflows/pages.yml`).

Preview URL: **https://psterman.github.io/onetone/**

Custom domain: `www.onetone.app` (`website/CNAME`).

**Deploy checklist:** see [DEPLOY.md](DEPLOY.md).
