# Nada Karate — Architecture

## What is this

A mobile-first web portal for managing karate athletes. Coaches and athletes use it to manage training schedules, track session attendance, log grades/belt progression, and maintain competition records.

Domain: nadakarate.com

## Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | React + TypeScript | 18.x |
| Build tool | Vite | 5.x |
| Styling | Tailwind CSS | 3.x |
| Backend | Express.js (Node) | 4.x |
| Database | PostgreSQL | 14+ |
| Process manager | PM2 | latest |
| Reverse proxy | Nginx | 1.24+ |
| SSL | Certbot (Let's Encrypt) | latest |
| Hosting | AWS Lightsail (Ubuntu) | 22.04 |

## Design Principles

- **Mobile-first** — primary use is on phones at the dojo. All layouts must work on 375px+ screens. Touch-friendly tap targets (min 44px). Bottom navigation, not sidebar.
- **Offline-aware** — athletes check schedules with patchy gym WiFi. Consider PWA service worker for caching schedules.
- **Fast** — quick glance at today's schedule, tap to mark attendance. Minimal clicks for common actions.

## Folder Structure

```
/
├── api/                        # Express backend
│   ├── package.json
│   ├── ecosystem.config.js     # PM2 config
│   ├── .env                    # DB credentials, secrets (not committed)
│   ├── .env.example            # Template for .env
│   ├── scripts/
│   │   └── migrate.js          # Database migration script
│   └── src/
│       ├── index.js            # Express entry point (port 3001)
│       ├── db/
│       │   └── pool.js         # PostgreSQL connection pool
│       ├── middleware/
│       │   └── auth.js         # Authentication middleware
│       └── routes/
│           ├── index.js        # Route registry
│           ├── health.js       # GET /api/health
│           └── ...             # Feature routes
│
├── app/                        # React frontend (mobile-first)
│   ├── package.json
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx            # React entry point
│       ├── App.tsx              # Router + bottom nav layout
│       ├── index.css           # Tailwind directives + design tokens
│       ├── hooks/
│       │   └── useApi.ts       # Fetch wrapper
│       ├── components/
│       │   └── ui.tsx          # Shared UI (Modal, Toast, Badge, etc.)
│       └── pages/
│           └── ...             # Page components
│
├── deploy.sh                   # Production deploy script
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD pipeline
└── docs/
    └── ARCHITECTURE.md          # This file
```

## Domain Model

### Core entities

- **Athletes** — name, date of birth, contact, emergency contact, belt/grade, join date, photo, medical notes, active/inactive status
- **Coaches** — name, contact, qualifications, role (head coach / assistant), can also be athletes
- **Classes** — recurring schedule slots (e.g. "Juniors Mon/Wed 5-6pm", "Adults Tue/Thu 7-8:30pm"). Class type (kata, kumite, general, fitness), age group, location, max capacity
- **Sessions** — individual instances of a class on a specific date. Can be cancelled, rescheduled, or have a substitute coach
- **Attendance** — which athletes attended which session. Checked in by coach or self-check-in
- **Grades/Belts** — belt progression history per athlete. Date graded, grading body, examiner, pass/fail, next grade due
- **Competitions** — events with date, location, category. Links to athletes entered, results (gold/silver/bronze/participation)
- **Training Plans** — optional: coach assigns focus areas, drills, or kata to individual athletes or groups

Suggested table prefix: `nk_`

### Suggested initial tables

```
nk_athletes
nk_coaches
nk_classes              (recurring schedule definitions)
nk_sessions             (individual class instances)
nk_attendance           (athlete_id + session_id)
nk_grades               (belt progression per athlete)
nk_competitions
nk_competition_entries  (athlete + competition + category + result)
nk_announcements        (news/notices for athletes)
nk_settings             (app config, club name, etc.)
```

## Database

- Engine: PostgreSQL 14+
- Database name: `nadakarate`
- Table prefix: `nk_`
- Migrations: `api/scripts/migrate.js` — array of SQL statements executed in order inside a transaction. Run via `npm run migrate`.

### Migration pattern

```js
const migrations = [
  `CREATE TABLE IF NOT EXISTS nk_athletes (
     id              SERIAL PRIMARY KEY,
     first_name      VARCHAR(100) NOT NULL,
     last_name       VARCHAR(100) NOT NULL,
     date_of_birth   DATE,
     email           VARCHAR(200),
     phone           VARCHAR(50),
     emergency_name  VARCHAR(200),
     emergency_phone VARCHAR(50),
     belt            VARCHAR(50) NOT NULL DEFAULT 'white',
     join_date       DATE NOT NULL DEFAULT CURRENT_DATE,
     photo_url       TEXT,
     medical_notes   TEXT,
     is_active       BOOLEAN NOT NULL DEFAULT TRUE,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];
```

## API Conventions

- All routes mounted under `/api`
- Route files export an Express Router
- Route registry at `api/src/routes/index.js` mounts all sub-routers
- JSON request/response (`Content-Type: application/json`)
- Error responses: `{ "error": { "message": "..." } }`
- Health check: `GET /api/health` → `{ "status": "ok" }`
- Use `pool.query()` for simple queries, `pool.connect()` + client for transactions

## Frontend Conventions

- Mobile-first layout — bottom tab navigation (Schedule, Athletes, Grades, More)
- Vite dev server on port 5173, proxies `/api` to `localhost:3001`
- `useApi()` hook wraps fetch with auth headers (if applicable)
- Shared UI components in `components/ui.tsx` (Modal, Toast, Field, Badge, Spinner, etc.)
- Tailwind design tokens as CSS custom properties in `index.css`
- SPA routing via `react-router-dom` v6
- Build output: `app/dist/` → copied to `/var/www/nadakarate/frontend/` on deploy
- Touch targets minimum 44px height
- Use `safe-area-inset-*` for notch/home-bar padding on iOS

## Suggested Page Structure (Mobile)

```
Bottom tabs:
  📅 Schedule    — today's sessions, upcoming week, tap to view/check-in
  👥 Athletes    — athlete list, search, tap for profile + grade history
  🥋 Grades      — upcoming gradings, recent results, belt tracker
  ⚙️ More        — competitions, announcements, settings, coach tools

Key flows:
  Coach opens app → sees today's sessions → taps a session → marks attendance
  Athlete opens app → sees their schedule → checks upcoming grading date
  Coach → Athletes → selects athlete → views grade history → records new grade
```

## Nginx

SSL is live via Certbot (auto-renews through `certbot.timer`). Full config
lives at [`nginx/nadakarate.com.conf`](../nginx/nadakarate.com.conf) and on
the server at `/etc/nginx/sites-available/nadakarate.com` — shape:

```nginx
server {
    server_name nadakarate.com www.nadakarate.com;
    root /var/www/nadakarate/frontend;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 20M;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2|woff|ttf)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/nadakarate.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/nadakarate.com/privkey.pem; # managed by Certbot
}

server {
    listen 80;
    server_name nadakarate.com www.nadakarate.com;
    return 301 https://$host$request_uri; # managed by Certbot
}
```

## Server Layout (Lightsail)

```
/var/www/nadakarate/             # App root
├── api/                         # Backend (Express)
├── app/                         # Frontend source (React)
└── frontend/                    # Built frontend (served by Nginx)

/etc/nginx/sites-available/
└── nadakarate.com               # Nginx server config (already created)

PM2 processes:
  nadakarate-api (port 3001)     # Express backend
```

## Deploy

### CI/CD (GitHub Actions)

The deploy workflow triggers on push to `main`:
1. Checkout code
2. Install frontend dependencies
3. Build React app (`npm run build`)
4. SCP built frontend to server
5. SSH into server: `git pull`, `npm install`, `npm run migrate`, `pm2 restart`
6. Reload Nginx
7. Health check

### Manual deploy

```bash
ssh ubuntu@<server-ip>
cd /var/www/nadakarate
git pull origin main

# API
cd api && npm install --production
npm run migrate
pm2 restart nadakarate-api

# Frontend
cd ../app && npm install && npm run build
rm -rf ../frontend/*
cp -r dist/* ../frontend/
sudo nginx -s reload
```

## Initial Server Setup

The Lightsail instance has been wiped and has these system packages pre-installed:
- Node.js 20.x
- Nginx 1.24 (nadakarate.com config already in place, needs SSL)
- PostgreSQL 14+
- PM2 (global)
- Certbot

### First-time setup

```bash
# 1. Create database
sudo -u postgres createuser nadakarate
sudo -u postgres createdb nadakarate -O nadakarate
sudo -u postgres psql -c "ALTER USER nadakarate PASSWORD 'your-password';"

# 2. Clone repo
cd /var/www/nadakarate
git clone https://github.com/<org>/<repo>.git .

# 3. API setup
cd api
cp .env.example .env
nano .env   # fill in DB credentials
npm install --production
npm run migrate
pm2 start ecosystem.config.js
pm2 save

# 4. Frontend build
cd ../app
npm install
npm run build
mkdir -p ../frontend
cp -r dist/* ../frontend/

# 5. SSL (after DNS A record points to server)
sudo certbot --nginx -d nadakarate.com -d www.nadakarate.com

# 6. Verify
curl -I https://nadakarate.com
```

## Environment Variables

### API (`api/.env`)

```
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nadakarate
DB_USER=nadakarate
DB_PASSWORD=
NODE_ENV=production
```

## Git Conventions

- Branch: `main` for production
- Feature branches: `feature/description` or `fix/description`
- Commit messages: imperative tense, describe the why not the what
- Deploy triggers on push to `main`
