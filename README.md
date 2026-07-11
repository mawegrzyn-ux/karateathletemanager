# Nada Karate

Mobile-first web portal for managing karate athletes — schedules,
attendance, grades/belt progression, and competition records.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture,
domain model, and deployment reference.

## Local development

### Backend (`api/`)

```bash
cd api
cp .env.example .env   # point at your local Postgres
npm install
npm run migrate        # creates the nk_* tables
npm run dev             # http://localhost:3001, GET /api/health
```

### Frontend (`app/`)

```bash
cd app
npm install
npm run dev             # http://localhost:5173, proxies /api to :3001
```

## Testing

Read-only smoke tests — safe to run against production, nothing creates,
edits, or deletes data:

```bash
# Fast curl-based checks (health, SPA routes, the nginx uploads regression)
scripts/smoke-test.sh https://nadakarate.com   # or a local URL

# Fuller Playwright suite (also covers login/register page rendering)
cd app
npm install
npx playwright install --with-deps chromium    # first time only
SMOKE_BASE_URL=http://localhost:5173 npm run test:e2e
```

Set `SMOKE_TEST_EMAIL`/`SMOKE_TEST_PASSWORD` (env vars locally, repo
secrets in CI) to also exercise a real login + authenticated page load —
use a dedicated test account, not a real coach/athlete's own login. Both
are skipped automatically if unset.

## Deploying

Push to `main` runs `.github/workflows/deploy.yml`, which builds the
frontend and deploys to the Lightsail server over SSH (build → SCP the
build → SSH in for `git pull` + `npm run migrate` + `pm2 restart` → health
check → smoke test → Playwright smoke suite). It relies on three
repository secrets:

- `SSH_HOST`
- `SSH_USER`
- `SSH_KEY`

`SMOKE_TEST_EMAIL`/`SMOKE_TEST_PASSWORD` are optional (see Testing above).

The Lightsail instance is provisioned, DNS points at it, SSL is live via
Certbot, and this pipeline has a verified successful run end-to-end. See
the "Initial Server Setup" section of `docs/ARCHITECTURE.md` if you ever
need to bootstrap a replacement server, and `deploy.sh` for the manual
redeploy steps.

Note: nginx config (`nginx/nadakarate.com.conf`) is **not** part of this
pipeline — it's a reference copy. Changes to it require manually updating
`/etc/nginx/sites-available/nadakarate.com` on the server and running
`sudo nginx -t && sudo nginx -s reload`.
