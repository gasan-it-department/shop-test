# Deploying to Railway

For a demo URL to show a client. Not a production Shopify app — see the
caveats at the bottom.

Roughly 20 minutes the first time.

---

## 1. Postgres

New Railway project → **+ New** → **Database** → **PostgreSQL**.

That's the SQLite migration done, as far as this repo is concerned. The schema
is already `provider = "postgresql"` and `prisma/migrations/0_init` is a
Postgres baseline.

## 2. The app service

**+ New** → **GitHub Repo** (or `railway up` from the Railway CLI if the code
isn't on GitHub yet).

`railway.json` in the repo root already sets the build command, the
pre-deploy migration, the start command and a healthcheck on `/sante`, so
there's nothing to configure in the build UI.

## 3. Variables

On the app service, Variables tab:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — a reference, not a pasted string |
| `SHOPIFY_API_KEY` | from the Partner app, or 32 zeros for a widget-only demo |
| `SHOPIFY_API_SECRET` | same |
| `SHOPIFY_APP_URL` | the public domain from step 4 |
| `SCOPES` | `read_products,read_customers,write_customers` |
| `SHOPPER_HASH_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ENABLE_DEV_HARNESS` | `1` for the demo. See the warning below. |

Use the `${{Postgres.DATABASE_URL}}` reference syntax rather than copying the
connection string — Railway rotates credentials and a pasted string goes stale
silently.

`SHOPIFY_APP_URL` can't be blank. `shopifyApp()` validates at module load, so
an empty value 500s every route including `/sante`, and the healthcheck then
fails the deploy with nothing useful in the logs.

## 4. Domain

Settings → Networking → **Generate Domain**. Copy it into `SHOPIFY_APP_URL`
and redeploy.

Attach a custom domain if this is going to live more than a few days — the
generated subdomain changes if the service is recreated, and every Shopify
redirect URL breaks with a mismatch error that doesn't explain itself.

## 5. Seed

```bash
railway run npm run seed
```

Runs against the Railway database with its env vars. Now `/dev` has posts.

## 6. Check it

- `https://<domain>/sante` → `{"status":"ok",...}`
- `https://<domain>/dev` → the widget, the hostile-theme toggle, the counts

---

## Making it a real Shopify app

Only needed if the demo should include the embedded admin rather than just the
storefront widget.

There are two config files. `shopify.app.toml` is the deployed one;
`shopify.app.local.toml` is for `shopify app dev`. They're separate because
`shopify app dev` rewrites the urls in whichever config it uses — with one
file, a local dev session repoints the live app at a dead tunnel and the next
deploy ships that.

Point each at its **own Partner app**, for the same reason.

**1. Link the deployed config to a Partner app.** Creates it if needed and
fills in `client_id`:

```bash
shopify app config link
```

**2. Set the urls from the Railway domain.** `application_url`, the `[auth]`
redirect and the `[app_proxy]` url all have to agree:

```bash
npm run app:url https://your-app.up.railway.app
```

**3. Copy the client ID and secret** from the Partner dashboard into the
Railway variables, and set `SHOPIFY_APP_URL` to the same domain.

**4. Push the config and the theme extension:**

```bash
npm run app:deploy
```

**5. Install on a development store** from the Partner dashboard, then set
`ENABLE_DEV_HARNESS` to `0`.

### Local dev against a real store

Second Partner app, second config:

```bash
shopify app config link --config local
```

```bash
npm run dev
```

That runs `shopify app dev --config local`, which opens its own tunnel and
rewrites `shopify.app.local.toml` each time. Stale urls in that file are
expected and fine.

---

## Warnings

**`ENABLE_DEV_HARNESS=1` exposes `/dev/posts` with no app proxy signature
check.** It serves public posts for the first shop in the database. Fine for
seeded demo data, not fine alongside a real merchant's forum. The default is
off and it should go back off the moment the Partner app is wired up.

**Turn off app sleeping** if a Shopify app is connected. Shopify fires webhooks
whenever it likes; it retries for 48 hours so downtime isn't fatal, but a cold
start inside the admin iframe looks broken to a merchant.

**Still missing for anything production:** the Instagram access token is stored
in plaintext (there's a TODO on the model), and there's no privacy policy route,
which public distribution requires.

## Cost

Postgres is the ongoing cost. Railway's Hobby plan is about $5/month with usage
credit included — they dropped the free tier a while back, so expect a small
charge rather than nothing. Shut the service down when the demo is over.

## Local development after the Postgres switch

There's no SQLite fallback any more, so local needs a Postgres:

```bash
docker compose up -d
```

Without Docker, paste the Railway database's **public** URL (Variables tab,
`DATABASE_PUBLIC_URL`) into the local `.env` — it works over the internet.

Then:

```bash
npx prisma migrate deploy && npm run seed && npm run dev:local
```
