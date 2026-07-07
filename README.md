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

## Deploying

Push to `main` runs `.github/workflows/deploy.yml`, which builds the
frontend and deploys to the Lightsail server over SSH (build → SCP the
build → SSH in for `git pull` + `npm run migrate` + `pm2 restart` → health
check). It relies on three repository secrets:

- `SSH_HOST`
- `SSH_USER`
- `SSH_KEY`

The Lightsail instance is provisioned, DNS points at it, SSL is live via
Certbot, and this pipeline has a verified successful run end-to-end. See
the "Initial Server Setup" section of `docs/ARCHITECTURE.md` if you ever
need to bootstrap a replacement server, and `deploy.sh` for the manual
redeploy steps.
