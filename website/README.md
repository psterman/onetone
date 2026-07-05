# OneTone website

Static product site for [onetone.app](https://www.onetone.app).

## Local preview

```powershell
cd website
python -m http.server 8080
```

Open http://localhost:8080

## Deploy

Pushes to `master` (or `main`) that touch `website/` deploy via GitHub Actions (`.github/workflows/pages.yml`).

Preview URL (before custom domain): **https://psterman.github.io/onetone/**

Custom domain: `www.onetone.app` (`website/CNAME`).

**Deploy checklist:** see [DEPLOY.md](DEPLOY.md).
