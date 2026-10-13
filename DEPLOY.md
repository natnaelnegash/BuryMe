# Deploying BuryMe — staging / demo

This describes a **staging/demo** deploy: real users can sign up and track
obligations, Chapa runs in test mode, and no real money moves. It is not a
production-for-live-funds setup — see [Not covered](#not-covered-yet).

## Shape

Three resources: managed Postgres, the API as a long-lived Node process, and
the web client as static files.

The API must be a **persistent process, not serverless** — it holds Socket.io
connections and runs the §13.3 reminder sweep on an interval. Pick an
instance type that does **not** sleep when idle: a spun-down instance drops
every open socket and stops sending reminders.

## Render

Two routes: a Blueprint, which needs a paid workspace, or creating the three
resources by hand, which works on the free tier.

### Option A — Blueprint (paid workspace)

[`render.yaml`](./render.yaml) describes all three resources. Point Render at
the repo and it prompts for each `sync: false` secret.

### Option B — manual (works on free)

Create three resources in this order. Everything below mirrors
`render.yaml`, which stays in the repo as the reference.

**1. PostgreSQL.** Name `buryme-postgres`, region Frankfurt (closest Render
offers to Ethiopia). Copy both connection strings it gives you — the
_internal_ one for the API service, the _external_ one for running
migrations from your machine.

**2. Web Service** for the API, from the same repo, branch `master`:

| Field             | Value                                                                                |
| ----------------- | ------------------------------------------------------------------------------------ |
| Language          | Node                                                                                 |
| Root Directory    | _(blank — the repo root)_                                                            |
| Build Command     | `pnpm install --frozen-lockfile --prod=false && pnpm --filter @buryme/backend build` |
| Start Command     | `pnpm --filter @buryme/backend start`                                                |
| Health Check Path | `/api/v1/health`                                                                     |

`tsc -b` builds the `/shared` project reference itself, so the API needs no
separate shared build.

`--prod=false` is load-bearing. `NODE_ENV=production` makes pnpm skip
devDependencies, and `prisma`, `typescript` and `vite` are all
devDependencies — without the flag the install succeeds and then backend's
`postinstall` fails with `prisma: not found`.

Note Render also runs its own dependency install before your build command.
If yours omits `--prod=false` it will _remove_ the devDependencies that step
just installed — the log shows `devDependencies: - typescript` followed by
`prisma: not found`.

Do not set `NODE_ENV` on the **static site** at all. It has no runtime
process, so the variable cannot help there and only prunes the build tools.
The static site's `--filter "@buryme/web..."` likewise keeps the install to
the web package and `/shared`, skipping the backend's `prisma generate`.

**3. Static Site** for the web client, same repo and branch:

| Field             | Value                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Build Command     | `pnpm install --frozen-lockfile --prod=false --filter "@buryme/web..." && pnpm --filter @buryme/shared build && pnpm --filter @buryme/web build` |
| Publish Directory | `web/dist`                                                                                                                                       |

`/shared` **must** be built explicitly here. Its `dist` is gitignored, so
Render clones without it, and web's build script is `tsc && vite build` —
plain `tsc` does not build project references. Omit it and the build fails
with a wall of `implicitly has an 'any' type` errors that never mention
`@buryme/shared`.

Then add the SPA rewrite under the static site's **Redirects/Rewrites**:
source `/*`, destination `/index.html`, action **Rewrite**. The committed
`web/public/_redirects` covers hosts that read that file; configure the rule
in Render's UI rather than relying on it.

### Migrations on the free tier

Render's **pre-deploy command is a paid feature**, so `render.yaml`'s
`preDeployCommand: pnpm db:migrate:deploy` does not apply. Run migrations
from your machine against the database's _external_ connection string
instead — `prisma migrate deploy` is idempotent, so re-running is harmless:

```bash
DATABASE_URL="<external connection string>" pnpm db:migrate:deploy
```

```powershell
$env:DATABASE_URL="<external connection string>"; pnpm db:migrate:deploy
```

The inline value wins: `backend/prisma.config.ts` loads the repo-root `.env`
through dotenv, which does not override variables already in the
environment.

Repeat this after any future migration — nothing in the free-tier pipeline
applies them for you. Appending `&& pnpm db:migrate:deploy` to the API's
build command is the automatic alternative, but the build environment may
not reach the database over its internal hostname, so the external URL above
is the dependable one.

### The three circular values

They can't be known before the services exist, but Render's URLs are
predictable from the service names, so you can set all three up front and
avoid a failed first boot:

- `API_PUBLIC_ORIGIN` on the API = the API's own URL, e.g.
  `https://buryme-api.onrender.com`. Chapa posts the per-transaction
  callback to `<this>/api/v1/webhooks/chapa`.
- `WEB_ORIGIN` on the API = the static site's URL. This is the CORS
  allow-list and Chapa's checkout return origin.
- `VITE_API_BASE_URL` on the web = `<API URL>/api/v1`. It is a **build**
  input, not runtime config — Vite inlines it, so changing it needs a
  rebuild, not a restart.

If the API's first deploy crashes with `Missing required environment
variable(s)`, that is `assertRuntimeConfig()` working as intended: set the
values and redeploy.

### What the free tier costs you

- **Free web services sleep after ~15 minutes idle.** A sleeping instance
  holds no Socket.io connections and runs no reminder sweeps, and the next
  request pays a cold start of roughly a minute. Live notifications and
  §13.3 reminders are therefore unreliable on free — acceptable for a demo,
  not for anything being evaluated on responsiveness.
- **Free Postgres expires after 30 days** and is deleted. Any demo data goes
  with it; re-create the database, re-run the migrations and re-seed.
- No pre-deploy command and no shell access, hence the migration step above.

## Railway

Railway has no blueprint format, so configure the same things by hand:

|              |                                                                                      |
| ------------ | ------------------------------------------------------------------------------------ |
| Build        | `pnpm install --frozen-lockfile --prod=false && pnpm --filter @buryme/backend build` |
| Start        | `pnpm --filter @buryme/backend start`                                                |
| Pre-deploy   | `pnpm db:migrate:deploy`                                                             |
| Health check | `/api/v1/health`                                                                     |

Add a Postgres plugin and reference its connection string as `DATABASE_URL`,
then set the same env vars `render.yaml` lists. Railway has no static-site
type — serve `web/dist` with a static file server, or put the web half on
Cloudflare Pages / Netlify (both honour the committed
[`web/public/_redirects`](./web/public/_redirects)).

## Environment

`.env.example` is the full list. The ones that matter in a deploy:

- `NODE_ENV=production` — **set it explicitly.** Nothing in the repo does.
- `DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
  `FIREBASE_PRIVATE_KEY` — the backend throws at import without these.
- `CHAPA_SECRET_KEY`, `CHAPA_WEBHOOK_SECRET`, `WEB_ORIGIN`,
  `API_PUBLIC_ORIGIN` — checked by `assertRuntimeConfig()` at boot, so a
  missing one fails the release instead of surfacing later as a payment that
  went nowhere.
- **Never set `CHAPA_FAKE=1` in a deployed environment.** It selects the
  keyless double, which fabricates successful transfers and accepts _every_
  webhook signature.
- `OTP_PEPPER` — any long random string. Without it, OTP hashes use a
  public constant.
- `AFROMESSAGE_API_KEY` / `AFROMESSAGE_FROM` — leave blank for a demo and OTP
  codes are written to the service log instead of being sent as SMS.

## Firebase

Add the deployed web origin to **Authentication → Settings → Authorized
domains**, or sign-in is rejected from it. The three `VITE_FIREBASE_*` values
come from the web app config; they are public by design.

## Chapa (test mode)

Register `<API_PUBLIC_ORIGIN>/api/v1/webhooks/chapa` as the webhook URL in
the Chapa dashboard. That single route dispatches by event kind, and the
`/checkout` and `/transfer` routes under it remain separate for the two hops.

**The payload handling has never run against the real API.** Everything
below is an assumption in code — verify each with one sandbox checkout and
one sandbox transfer, and correct whatever differs:

| Assumption                                                                                  | Where                            |
| ------------------------------------------------------------------------------------------- | -------------------------------- |
| Signature header `x-chapa-signature` / `chapa-signature`, HMAC-SHA256 hex over the raw body | `backend/src/lib/chapa.ts`       |
| Event fields `tx_ref` vs `reference`, `status`, `event`/`type`                              | `backend/src/routes/webhooks.ts` |
| Telebirr `bank_code` 855 — their bank list is dynamic                                       | `backend/src/lib/chapa.ts`       |
| Account-number reformat `"0" + accountNumber.slice(4)`                                      | `backend/src/lib/chapa.ts`       |

Confirm the bank code against a live `GET /v1/banks` rather than trusting the
constant.

## Smoke test after deploying

1. `GET /api/v1/health` → `{"status":"ok"}`; `GET /api/v1/ready` →
   `{"status":"ready"}` (the second one touches Postgres).
2. `GET /api/v1/nope` → the contract's `Error` envelope with `NOT_FOUND`, not
   an HTML 404.
3. `POST` an unsigned body to `/api/v1/webhooks/chapa` → **401**. If this
   returns 200, `CHAPA_FAKE` is set or the secrets are missing — stop and fix
   it before sharing the URL.
4. Hard-reload `https://<web>/obligations/<some-id>` → the app renders rather
   than a host 404.
5. Two browser profiles: register both → A lends B → B accepts →
   disbursement through Chapa test checkout → the webhook confirms and the
   obligation becomes Active → B repays → both see it settled. Check the
   notification arrives live over the socket, without a refresh.
6. Redeploy and confirm the log shows the `SIGTERM received — shutting down`
   path rather than an abrupt kill.

## Not covered yet

Deliberately out of scope for a demo, and all of it needed before real money:

- **Backups** beyond whatever the managed Postgres does by default.
- **Error monitoring** — there is request logging and `console.error`, no
  Sentry or APM.
- **Rate limiting.** OTP codes are already bounded (5 attempts, 5-minute TTL,
  resend cooldown), but nothing limits request volume generally.
- **Webhook idempotency is state-based**, not an event ledger: a payment is
  only actionable while `PendingAcknowledgement`, and the confirming read
  happens outside its transaction, so two simultaneous deliveries of the same
  event could race.
- **The reminder scheduler is in-process.** Correct on one instance; it would
  fire once per instance if scaled out.
- **A failed payout leaves funds in the merchant balance** — refunding is a
  manual operational step, not an API flow.
- No web tests; FCM push is inert on web (no service worker, and nothing
  registers a token).
