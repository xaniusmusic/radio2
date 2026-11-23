# Deploying to Netlify

This app is a static Vite + React single-page build. `vite-plugin-singlefile` inlines all JS/CSS into `dist/index.html`, so no server, functions, or environment variables are required.

## Option A — Git-connected deploy (recommended)

1. Push this project to a GitHub/GitLab/Bitbucket repository.
2. In Netlify: **Add new site → Import an existing project** and pick the repo.
3. Netlify reads `netlify.toml` automatically:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Node 22
4. **Deploy site.** Every push to the default branch rebuilds and redeploys.

## Option B — Netlify CLI

```bash
npm install -g netlify-cli
npm run build
netlify deploy --prod --dir=dist
```

## Option C — Drag and drop

```bash
npm run build
```

Then upload the `dist/` folder at https://app.netlify.com/drop.

## Notes

- **No secrets or env vars** are needed. The radio-browser.info API is a free, CORS-enabled public service called directly from the browser; the site ships with a built-in snapshot fallback if the API is unreachable.
- **Live audio streams** are played with a plain `<audio>` element from arbitrary HTTPS hosts worldwide; this cannot be proxied without a server and works fine from static hosting. HTTP-only stream URLs found in the directory are upgraded to HTTPS at runtime where possible.
- **`X-Frame-Options: DENY`** is set via `netlify.toml`; embed the player in iframes elsewhere by relaxing that header if desired.
- After changing code, trigger a redeploy (or push) — because the bundle is inlined, `index.html` is served with `must-revalidate` so users get the latest build.
