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
frontend and deploys to the Lightsail server over SSH. That workflow needs
these repository secrets set before it can run successfully:

- `SSH_HOST`
- `SSH_USER`
- `SSH_KEY`

Until the Lightsail instance is provisioned and DNS points at it, see the
"Initial Server Setup" section of `docs/ARCHITECTURE.md` for the manual
first-time setup, and `deploy.sh` for the manual redeploy steps.
