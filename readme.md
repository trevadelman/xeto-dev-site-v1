# xeto.dev — site

Astro static site for the Xeto library registry. Full design docs live
in `../docs/` — this readme is just what you need to run, deploy, and
use the registry CLI.

## Deploy

```
npm install
npx netlify dev            # local, port 8888 (_redirects applied)
npm run build              # verify before every deploy
git push origin main       # Netlify auto-deploys from main
```

Need-to-know:
- **V1 launch scope** — which routes are public vs hidden vs gated
  (publishers hidden, signup closed) is defined in `../docs/v1-scope.md`,
  with its implementation checklist
- Repo `trevadelman/xeto-dev-site-v1` → Netlify (personal account)
- Test with `netlify dev`, not `astro dev` — client-rendered routes
  (`/lib/*` → `/lib/index.html`, `/orgs/*` → `/org/index.html`,
  `/publishers/*` → `/publisher/index.html`, note the singular
  page-folder names) only rewrite correctly per `public/_redirects`
- Alternative to `netlify dev`: `npm run build && python3
  scripts/serve.py` serves `dist/` with the same three rewrites, no
  Netlify CLI needed
- Registry API base URL is declared **twice** — `REGISTRY_API` in
  `src/lib/registry.ts` and `SUPABASE_URL`/`API` in
  `src/lib/session.ts` — update both when xeto.dev DNS fronts Supabase
- Testing the account/token side locally without burning the
  magic-link quota (2/hr): sign in once on the production site, copy
  `localStorage.xd_session` from devtools, paste the same value into
  localStorage on localhost — same Supabase project/JWT, works
  identically against the live API (see comment atop `src/lib/session.ts`)
- Explorer bundle regen is manual and whitelist-only — follow
  `../docs/explorer-integration.md` exactly (output to
  `public/explorer-app/`, run the pre-publish check)
- The `/contact` form is **Netlify Forms** — it only works on the
  deployed site (local POSTs 501/404). Form detection must be enabled
  in the Netlify dashboard *before* the deploy that registers the
  form; email notifications are configured there too (Forms →
  Notifications)

## Pages

| route | source |
|---|---|
| `/` | `src/pages/index.astro` |
| `/learn` | `src/pages/learn.astro` |
| `/docs/lang`, `/docs/lang/{page}` | `src/pages/docs/lang/` |
| `/domains`, `/domains/{slug}` | `src/pages/domains/` |
| `/libs`, `/libs/{id}` | `src/pages/libs/` — curated, static |
| `/lib/{name}` | `src/pages/lib.astro` — any registry lib, client-rendered |
| `/orgs`, `/orgs/{name}` | `src/pages/orgs/index.astro`, `src/pages/org.astro` |
| `/publishers/{handle}` | `src/pages/publisher.astro` |
| `/account` | `src/pages/account.astro` — magic-link sign-in, tokens, claims |
| `/explorer` | `src/pages/explorer.astro` — embeds `public/explorer-app/` |
| `/about` | `src/pages/about.astro` |
| `/contact` | `src/pages/contact.astro` — Netlify Forms (deploy-only) |
| `/legal` | `src/pages/legal.astro` — Terms & Privacy placeholder |
| 404 | `src/pages/404.astro` — served by Netlify for unknown routes |


## Registry CLI: publish and install

The `xetoDevRepo` pod (`xb-play/src/xetoDevRepo/`) adds `xeto publish`
and `xeto worker` to the standard xeto CLI. It must be built and on
your fantom path.

### One-time setup

1. Register the repo — in your env's `etc/xeto/config.props`:

   ```
   repo.xdev.uri=https://aberopmtegsusdukrncd.supabase.co/functions/v1/api/
   ```

2. Sign in at `/account` on the site, mint a token, export it
   (`XETO_REPO_{repo name upper}`):

   ```
   export XETO_REPO_XDEV=xd_...
   ```

### Publish

```
xeto build cc.you.mylib               # produce the versioned xetolib
xeto publish cc.you.mylib -r xdev     # upload → "pending ..." → published/rejected
```

The publish sits `pending` until a worker validates it. The worker is
run manually today (needs `REGISTRY_WORKER_TOKEN` exported):

```
xeto worker -r xdev -once
```

### Install (no account needed)

```
xeto install -r xdev -y cc.you.mylib   # deps pulled transitively
```

### Rules that will bite you

- Lib names must be dotted, every segment starting lowercase
  (`cc.you.mylib`); `cc.{segment}` belongs to whoever publishes under
  it first
- A published version number can never be reused — bump and republish
- Org prefixes (`ph.*`, `hx.*`, `xb.*`, ...) require org membership;
  unknown prefixes are rejected
- If a publish dies mid-upload leaving a stuck `pending`, just re-run
  `xeto publish` — the stale row is replaced
