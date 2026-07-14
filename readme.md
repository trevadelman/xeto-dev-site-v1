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
- Repo `trevadelman/xeto-dev-site-v1` → Netlify (personal account)
- Test with `netlify dev`, not `astro dev` — `/lib/{name}`, `/orgs/*`,
  `/publishers/*` depend on `public/_redirects` rewrites
- Registry API base URL is `REGISTRY_API` in `src/lib/registry.ts` —
  change it when xeto.dev DNS fronts Supabase
- Explorer bundle regen is manual and whitelist-only — follow
  `../docs/explorer-integration.md` exactly (output to
  `public/explorer-app/`, run the pre-publish check)

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
