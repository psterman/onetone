# OneTone website

Static product site for [onetone.app](https://www.onetone.app).

## Local preview

```powershell
cd website
python -m http.server 8080
```

Open http://localhost:8080

## Deploy

Pushes to `main` that touch `website/` deploy via GitHub Actions (`.github/workflows/pages.yml`).

Custom domain: `www.onetone.app` (`website/CNAME`).

**Deploy checklist:** see [DEPLOY.md](DEPLOY.md).
