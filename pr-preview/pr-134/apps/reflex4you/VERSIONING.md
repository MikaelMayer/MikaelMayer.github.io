## Reflex4You versioning (for agents)

Reflex4You has **three** separate but related “version” knobs that must stay consistent:

- **`APP_VERSION`** (integer) in `apps/reflex4you/main.js`  
  - This is the **app major** shown to users (`v20`, `v21`, …) and used in local-storage keys.
- **`CACHE_MINOR`** (string `M.m`) in `apps/reflex4you/service-worker.js`  
  - This controls the **CacheStorage names**. Bump it when you need clients to fetch a fresh precache.
- **Service worker registration URL** cache-buster (`service-worker.js?sw=M.m`)  
  - Appears in `main.js`, `formula-page.mjs`, and `explore-page.mjs`. Bump it to ensure browsers don’t keep using a cached SW script.

To avoid missing one of these, use the repo-local one-command tool:

```bash
# From repo root:
npm run reflex4you:version -- major
```

### Supported operations

- **Bump major (app version)**:

```bash
npm run reflex4you:version -- major
```

- **Bump minor (cache + SW refresh only)**:

```bash
npm run reflex4you:version -- minor
```

- **Set an explicit version (useful for reverts)**:

```bash
# Set app major and (optionally) explicit cache/SW versions.
npm run reflex4you:version -- set 20 --cache 20.1 --sw 20.2
```

### What the command edits

- `apps/reflex4you/main.js`
  - `APP_VERSION = …`
  - `service-worker.js?sw=…`
- `apps/reflex4you/service-worker.js`
  - `CACHE_MINOR = '…'`
- `apps/reflex4you/formula-page.mjs`
  - `service-worker.js?sw=…`
- `apps/reflex4you/explore-page.mjs`
  - `service-worker.js?sw=…`
- `apps/reflex4you/index.html`
  - `#app-version-pill` fallback text (`v…`)

