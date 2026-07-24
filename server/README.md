# PrintDesk server

Multi-tenant invoicing SaaS: any print shop can create its own account, set its own
prices, add staff, and generate branded PDF invoices — everything stored server-side
instead of in a browser.

## How it fits with the Chrome extension

The extension (`../src`) is a standalone, offline, single-shop tool that stores data in
`chrome.storage`. This server is a separate, hosted product for shops that want their
invoice history centralized online and reachable from any device. Both reuse the exact
same PDF layout (`../src/xpt-pdf.js` is vendored unmodified into the Docker image) so an
invoice looks identical whichever one produced it.

## Local development

Needs a PostgreSQL instance to connect to — either run the bundled one:

```bash
docker compose up db
```

or point at any Postgres you already have. Then:

```bash
cd server
npm install
DATABASE_URL=postgresql://printdesk:<password>@localhost:5432/printdesk node index.js
```

Opens on `http://localhost:4100`. The schema (`lib/db.js` `initSchema()`) is created
automatically on startup — no separate migration step. Set `JWT_SECRET` in your
environment for anything beyond local testing — without it a hardcoded dev secret is
used, which is fine on your machine but must never reach production.

## Data model

PostgreSQL (`pg`, same driver and Pool setup as this repo's RestOrder platform —
`DATABASE_URL`, SSL auto-disabled for `localhost`, `PG_POOL_MAX` default 20). Every
table that isn't `businesses` itself carries `business_id` and every query is scoped to
the caller's own `business_id` (taken from their JWT) — the same tenant-isolation
pattern used elsewhere in this codebase, just with `business_id` playing the role
`customer_id` plays for RestOrder. Verified against a real Postgres instance during
development (not just SQL written by inspection): two businesses registered side by
side cannot see each other's invoices, staff, or settings; invoice numbering
(`INV-YYYY-NNNN`) restarts independently per business; 25 concurrent invoice-creation
requests for the same business each got a unique number; 10 concurrent duplicate
payment-webhook deliveries credited Premium exactly once.

Two things worth knowing if you touch `lib/db.js`:

- **Concurrency-safe counters.** `allocateInvoiceNumber` and `extendPremium` are each a
  single `UPDATE ... RETURNING` statement, not a JS read-then-write. That distinction
  didn't matter under the project's original SQLite version (synchronous, single-
  threaded — a read and write could never interleave); it matters here because `pg`'s
  connection pool genuinely can run two requests concurrently.
- **BIGINT comes back as a string by default.** `pg` returns 64-bit columns
  (`premium_until`, `created_at`) as strings to avoid precision loss outside
  `Number.MAX_SAFE_INTEGER` — which these timestamps never approach. Left at the
  default, the frontend's `new Date(ms)` calls would silently produce "Invalid Date"
  (`Date`'s single-string-argument form expects an ISO date string, not a raw epoch
  numeral). `lib/db.js` overrides the type parser for OID 20 globally at the top of the
  file so every caller just gets a plain number, as under SQLite. Caught by testing
  against a real database, not by reading the code — worth remembering before removing it.

## Deploying to Coolify

This repo already deploys `menu` (RestOrder) to Coolify the same way — the pattern here
is identical:

1. Push this project to its own git repo (or a subfolder of one Coolify can build from).
2. In Coolify: **New Resource → Docker Compose**, point it at this project's root
   (where `Dockerfile` and `docker-compose.yaml` live). Compose brings up both the app
   and its `db` (Postgres) service — Coolify doesn't need a separate managed database
   resource unless you'd rather use one.
3. Set environment variables:
   ```bash
   POSTGRES_PASSWORD=<a long random password>
   JWT_SECRET=$(openssl rand -hex 32)
   ```
4. Attach your domain/subdomain (e.g. `invoices.yourdomain.com`) and let Coolify issue TLS.
5. Deploy. The `printdesk_pgdata` volume persists the database across deploys — don't
   delete it, and back it up periodically (`pg_dump` on a schedule, or point your
   existing backup routine at the volume).
6. Health check is `GET /healthz` — it actually queries the database (not just "the
   Node process is alive"), so a broken `DATABASE_URL` fails the check rather than
   silently serving 500s. Coolify's default Docker healthcheck already points at it.

Two containers, one volume: the app, and the Postgres it depends on.

## Monetization: Free vs Premium

| | Free | Premium |
|---|---|---|
| Invoices | 20 / calendar month | Unlimited |
| Staff users | 1 | Unlimited |
| PDF watermark | Yes, diagonal "FREE PLAN" | None |
| Price | — | $9 (PayPal) or 25,000 TZS (ClickPesa) per 30 days |

Limits are enforced server-side (`POST /api/invoices` and `POST /api/staff` return `402`
with `{upgradeRequired: true}` once hit — the UI shows an "Upgrade →" link straight to
`billing.html`). Nothing already created is ever deleted or hidden when Premium lapses;
only *new* invoices/staff beyond the cap are blocked until the next payment.

**Neither gateway auto-renews.** PayPal here uses the Orders API (a single $9 charge),
not the Subscriptions API — same pattern already proven in this codebase's RestOrder
platform (`E:\github\menu\routes\payments.js`), which avoids needing a pre-created
Billing Plan in the PayPal dashboard. ClickPesa is a one-off mobile-money/card checkout
by nature — there's no recurring concept to hook into. Each successful payment (either
gateway) extends `premium_until` by 30 days from whichever is later: the current expiry
(renewing early stacks on top) or now. `lib/plan.js`'s `isPremium()` re-evaluates that
timestamp on every check — nothing needs a cron job to "expire" a lapsed business.

Both gateways are called via `fetch` directly against their REST APIs (`lib/paypal.js`,
`lib/clickpesa.js`) — no SDK packages, since this environment had no npm registry access
when it was built. Every payment is recorded in a `payments` ledger keyed by
`UNIQUE(provider, provider_ref)`, so a retried webhook or a double-submitted capture can
never credit the same payment twice (verified in testing: replaying the same
provider reference is a guaranteed no-op).

### PayPal setup

1. Create a [PayPal Developer](https://developer.paypal.com) account, then **Apps &
   Credentials → Create App**. Copy the **Client ID** and **Secret** (sandbox first).
2. Set:
   ```
   PAYPAL_CLIENT_ID=...
   PAYPAL_CLIENT_SECRET=...
   PAYPAL_ENVIRONMENT=sandbox   # switch to "live" once ready to accept real cards
   SITE_URL=https://<your-domain>
   ```
3. Restart. Test with a [PayPal sandbox buyer account](https://developer.paypal.com/dashboard/accounts)
   before switching to live keys.

### ClickPesa setup

1. Register at [ClickPesa](https://clickpesa.com) and get your **API Key** and
   **Client ID** from the merchant dashboard.
2. Set:
   ```
   CLICKPESA_API_KEY=...
   CLICKPESA_CLIENT_ID=...
   SITE_URL=https://<your-domain>
   ```
3. Restart. ClickPesa will call `POST /api/billing/clickpesa/webhook` on payment
   completion — that handler never trusts the callback body on its own, it calls
   ClickPesa's status API back to confirm before crediting anything.

Until either is set, `billing.html` shows "Neither payment method is set up" and the
corresponding button is disabled (verified: both create-order endpoints return a clear
`400` instead of crashing) — the app is fully usable free-only in that state.

## Admin panel

`/admin/login.html` — a platform-owner view across every tenant: total/premium/free
business counts, revenue collected, a searchable business table, and one-click **Comp
30 days** (support gesture / manual reconciliation) or **Downgrade to Free** (refunds,
abuse) per business. This is a *different* login from any print shop's own account —
one shared operator password, not a `businesses` row, verified with a constant-time
comparison, and its session token is a structurally distinct JWT (`{role:'admin'}`
instead of `{businessId}`) that tenant-auth routes explicitly reject and vice versa.

Set `ADMIN_PASSWORD` to enable it:
```
ADMIN_PASSWORD=<a long random password>
```
Leave it unset to disable `/admin` entirely — `POST /api/admin/login` returns `400`
rather than ever accepting a password check against nothing.

## API surface

Tenant routes require `Authorization: Bearer <token>` from `/api/auth/*`. Admin routes
require a separate token from `/api/admin/login` — the two are never interchangeable.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create a business account |
| POST | `/api/auth/login` | Get a session token |
| GET | `/api/me` | Current business settings + staff |
| PUT | `/api/business` | Update settings/prices |
| PUT | `/api/business/logo` | Set/remove invoice logo |
| GET/POST | `/api/staff` | List/add staff |
| DELETE | `/api/staff/:id` | Remove staff (keeps at least one) |
| GET/POST | `/api/invoices` | List/create invoices (totals recomputed server-side) |
| GET | `/api/invoices/:id/pdf` | Download the invoice as PDF |
| GET | `/api/billing/plan` | Current plan, usage, expiry, which gateways are configured |
| GET | `/api/billing/history` | This business's own payment history |
| POST | `/api/billing/paypal/create-order` | Create a PayPal order, returns `{approveUrl}` to redirect to |
| POST | `/api/billing/paypal/capture-order` | Capture an approved order, credits 30 days |
| POST | `/api/billing/clickpesa/create-order` | Create a ClickPesa checkout link, returns `{checkoutUrl}` |
| GET | `/api/billing/clickpesa/status` | Poll a checkout's status; also finalizes crediting |
| POST | `/api/billing/clickpesa/webhook` | ClickPesa calls this directly — re-verified server-side, not JWT-authenticated |
| POST | `/api/admin/login` | Get an admin session token |
| GET | `/api/admin/stats` | Platform-wide counts and revenue |
| GET | `/api/admin/businesses` | Search/list every tenant |
| GET | `/api/admin/payments` | Recent payments across all tenants |
| POST | `/api/admin/businesses/:id/comp` | Grant N days of Premium manually |
| POST | `/api/admin/businesses/:id/downgrade` | Force a business back to Free immediately |
