# shopify-practice

Practice app for the Insider Club takeover role. Not a product, a training rig:
every piece of it maps to a line in that job description.

| Brief says | Here |
|---|---|
| React Router 7, `@shopify/shopify-app-react-router`, App Bridge 4 | [app/shopify.server.ts](app/shopify.server.ts), [app/routes/app.tsx](app/routes/app.tsx) |
| App Proxy | [app/routes/proxy.posts.tsx](app/routes/proxy.posts.tsx), `[app_proxy]` in [shopify.app.toml](shopify.app.toml) |
| Theme app extensions | [extensions/forum-embed/](extensions/forum-embed/) |
| Billing API | [app/routes/app.billing.tsx](app/routes/app.billing.tsx) |
| Access scopes | `[access_scopes]`, [webhooks.app.scopes-update.tsx](app/routes/webhooks.app.scopes-update.tsx) |
| Prisma, SQLite → PostgreSQL | [prisma/schema.prisma](prisma/schema.prisma), [docs/sqlite-to-postgres.md](docs/sqlite-to-postgres.md) |
| Third-party API, delegated auth, rate limits, retries | [app/lib/retry.ts](app/lib/retry.ts), [app/lib/instagram.server.ts](app/lib/instagram.server.ts) |
| Instagram import with continuous sync | `ImportJob` queue in the schema |
| No hard-coded Europe/Paris timezone | `ianaTimezone` read from Shopify in [app.\_index.tsx](app/routes/app._index.tsx) |
| GDPR webhooks, member anonymisation | [webhooks.compliance.tsx](app/routes/webhooks.compliance.tsx), [privacy.server.ts](app/lib/privacy.server.ts) |
| No IP stored, no password stored, systematic escaping | [escape.ts](app/lib/escape.ts), [privacy.server.ts](app/lib/privacy.server.ts) |
| `/sante` monitoring endpoint | [app/routes/sante.tsx](app/routes/sante.tsx) |
| Front-end surviving hostile merchant themes | [forum.js](extensions/forum-embed/assets/forum.js) |
| Guardrails verified by breaking the code they protect | [tests/](tests/) |

## What runs locally, and what needs an account

Node 22.17 / npm 11.6, Windows 11.

| | Shopify account? | |
|---|---|---|
| `npx vitest run` | no | 94 passed (5 files) |
| `npx tsc --noEmit` | no | clean |
| `npx react-router build` | no | client + SSR bundles |
| `npx prisma migrate deploy` + `npm run seed` | no | Postgres schema + demo data |
| **`/dev`** | no | renders the real storefront widget |
| `/dev/posts` | no | unsigned twin of the proxy fragment |
| `/sante` | no | `{"status":"ok","latencyMs":2}`, a real query |
| `/` | no | landing stub |
| `/app`, `/app/billing`, `/app/instagram` | **yes** | redirect to OAuth and stop |
| `/proxy/posts` | **yes** | rejects unsigned requests by design |
| Theme extension in a real storefront | **yes** | needs a dev store |
| Instagram import | Meta app too | not wired to a live account |

Everything that's logic runs here today. Everything that's platform needs a
free Partner account — no card, no business details.

### `/dev`

`/` is a stub and `/app` is behind OAuth, so without this there's nothing to
look at. `/dev`:

- mounts the real `extensions/forum-embed/assets/forum.js`, read from disk not
  copied, against the real rendered fragment;
- seeds hostile content — a post titled `</h3><img src=x onerror=alert(1)>`,
  a member called `<script>alert("xss")</script>` — which has to show as text;
- has a **"Simulate a hostile theme"** toggle that injects the CSS a bad theme
  ships (`* { font-family: Comic Sans !important }`, `p { display: none }`).
  The widget shouldn't move. If it does, the shadow root isn't working;
- hides the seeded private category, so the public/total gap is visible.

Both `/dev` routes 404 in production unless `ENABLE_DEV_HARNESS=1`, which is
how the deployed demo shows the widget without the viewer needing a store.

## Running it

```bash
npm install
```

```bash
cp .env.example .env
```

The placeholder `SHOPIFY_*` values matter: `shopifyApp()` throws at module load
on an empty `SHOPIFY_APP_URL`, which 500s the whole server including routes
that never touch Shopify.

Generate a `SHOPPER_HASH_SECRET` and paste it in:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

On Windows don't write `.env` with `Set-Content -Encoding utf8` — BOM, and the
first variable reads back undefined. Editor, or `[IO.File]::WriteAllText` with
`UTF8Encoding($false)`.

Local needs a Postgres — there's no SQLite fallback since the migration:

```bash
docker compose up -d
```

Without Docker, paste the Railway database's public URL (`DATABASE_PUBLIC_URL`)
into `.env` instead. Then, no Shopify account needed:

```bash
npx prisma migrate deploy && npm run seed && npm run dev:local
```

Open <http://localhost:5182/dev>.

### Full embedded experience

Free [Partner account](https://partners.shopify.com) and a dev store.

```bash
npm install -g @shopify/cli@latest
```

```bash
shopify app dev
```

The CLI creates the Partner app, opens a Cloudflare tunnel (so no port
forwarding, no ngrok) and rewrites `client_id`, `application_url` and
`redirect_urls` in `shopify.app.toml`.

## Read next

1. [docs/deploy-railway.md](docs/deploy-railway.md) — getting a demo URL up.
2. [PREP-PLAN.md](PREP-PLAN.md) — the four-week ramp.
3. [docs/gotchas.md](docs/gotchas.md) — traps, including two that failed the
   build here.
4. [docs/sqlite-to-postgres.md](docs/sqlite-to-postgres.md) — migration
   runbook. Already carried out here; kept as the plan for the real app.

## Not done, on purpose

- No `shopify app dev` run yet — needs the Partner account (week 1).
- No real Instagram connection — needs a Meta app and a business IG account.
- Instagram token stored in plaintext, and no privacy policy route. Both block
  public distribution; neither blocks a demo.
- Polaris React deliberately absent: deprecated in favour of the web components
  `AppProvider` now injects. Insider Club almost certainly still uses Polaris
  React, so knowing both and which way the migration runs is the point.
