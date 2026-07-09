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

- **Associations** — national/regional governing bodies. Name, description, contact info. A club affiliates with at most one association
- **Clubs** — individual dojos. Name, location, contact info, optional link to one association. Athletes and coaches can belong to multiple clubs (many-to-many); a person's associations are derived from their club(s)' association, not tracked directly
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
nk_associations
nk_clubs                (association_id, nullable)
nk_athlete_clubs        (athlete_id + club_id, many-to-many)
nk_coach_clubs          (coach_id + club_id, many-to-many)
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
nk_users                (auth accounts: email/password, role, status)
nk_parent_athletes      (parent user_id <-> athlete_id, many-to-many)
nk_coach_associations   (coach_id + association_id: association-admin grants)
```

`nk_coach_clubs` also carries an `is_admin` boolean (club-admin grant per
coach per club); `nk_coach_associations` existing as a row **is** the
association-admin grant, no flag needed.

### Clubs & Associations API — scoped admin

Read access (`GET` list/detail) is open to any `admin` or `coach` — same
as athletes/coaches — so reference pickers (e.g. a club's association
selector) always see the full list. Write access is scoped:

- `POST` (create) and `DELETE` on both clubs and associations: **admin
  only**, unconditionally.
- `PATCH /api/admin/clubs/:id`: admin, or the coach holding `is_admin` on
  that club in `nk_coach_clubs` (resolved via `req.user.coach_id`).
- `GET/PUT /api/admin/clubs/:id/athletes` and `.../coaches`: same admin-
  or-club-admin check — a club-admin coach can add/remove membership.
- `PATCH /api/admin/clubs/:id/coaches/:coachId {is_admin}`: **admin
  only** — granting/revoking another coach's club-admin status isn't
  something a club-admin coach can do to avoid privilege escalation.
- `PATCH /api/admin/associations/:id`: admin, or the coach with a row in
  `nk_coach_associations` for that association.
- `GET/PUT /api/admin/associations/:id/admins`: **admin only** — manages
  the `nk_coach_associations` grants.
- Resolution logic lives in `api/src/utils/permissions.js`
  (`isClubAdmin`, `isAssociationAdmin`).

Frontend: `/admin/clubs` and `/admin/associations` are reachable by
`role === 'coach'` or any `is_admin` account (`RequireAuth roles={["coach"]}`
in `App.tsx` — the `is_admin` bypass lives in `RequireAuth` itself), but
the "+" create button, delete button, the coach club-admin ★ toggle, and
the association's "Coach admins" picker only render when
`useAuth().user.is_admin` — a coach viewing a club they administer sees
an editable club with membership management, no create/delete, no
admin-granting controls.

A user account is linked to "this is that athlete/coach" via
`nk_users.athlete_id`/`.coach_id`, set from the admin Users page's detail
drawer (`PATCH /api/admin/users/:id`, already existing). A coach's
club/association admin rights only resolve once their account is linked
this way.

### Athletes & Coaches API

- `GET /api/athletes?q=` (name search), `POST`, `GET/PATCH /:id` — `admin`
  and `coach` roles. `DELETE /:id` is admin-only (extra inline check,
  since it's more destructive than the other operations here).
- `GET /api/admin/coaches`, `GET /api/admin/coaches/:id` — `admin` and
  `coach` roles (read-open, same shape as clubs/associations, so the
  coach/athlete pickers on those pages work for coach viewers too).
  `POST`/`PATCH`/`DELETE` are admin-only (inline check). `athlete_id`
  optionally links a coach who is also an athlete.
- The "Athletes" bottom-nav tab shows the full manager UI to `admin`/`coach`
  roles. A user acting as `athlete` sees their own linked athlete record
  read-only (`MyAthleteProfile` in `Athletes.tsx`) instead — editing your
  own profile isn't supported yet. Everyone else (`parent`, no role) sees
  a placeholder ("ask your coach").

### Scheduling API

Athlete-planned itinerary events — competitions, squad sessions,
training, travel, time off, seminars, training camps — each optionally
spanning multiple days and containing a day-by-day sequence of smaller
items (e.g. a competition event might contain: travel day, training
day, rest day, morning warm-up, the competition itself, retrospective,
return travel). This is unrelated to the `nk_classes`/`nk_sessions`
tables further up (a still-unbuilt *recurring weekly class* concept for
coach-run attendance) — this is personal athlete itinerary planning.

- `nk_events` (`title`, `event_type`, `start_date`, `end_date`,
  `location`, `notes`) — `event_type` is one of `competition`,
  `squad_session`, `training`, `travel`, `time_off`, `seminar`,
  `training_camp`. `nk_event_athletes` (many-to-many) attaches one or
  more athletes — personal events have one, squad-level events have
  several. `nk_event_items` are the nested itinerary rows under an
  event (`item_type`, `title`, `item_date`, `start_time`, `end_time`
  — both required — `notes`, `training_module_id`, `kata_id`) —
  `item_type` reuses the same vocabulary plus `rest`, `other`, and
  `kata_performance` for things that don't fit the top-level list (e.g.
  an "active rest day" or a single kata run-through).
- **Recurring items**: `POST /api/events/:id/items` accepts an optional
  `repeat: {freq: 'daily'|'weekly', until, weekdays?}`. The server
  expands this into one independent `nk_event_items` row per occurrence
  date (capped at 60) at creation time — there's no ongoing
  series/recurrence-rule link, so each generated item is thereafter
  edited/deleted on its own, same as a manually-created one.
- **Training modules**: `nk_training_modules` (`title`, `explanation`) is
  a reusable library of session plans a coach or admin authors. Each
  plan is an ordered sequence of `nk_training_module_items`
  (`module_id`, `position`, `item_type` — `exercise` or `rest`, `name`,
  `explanation`, `video_url`, `sets`, `reps`, `duration_seconds`),
  replaced as a whole unit on write (same pattern as club membership
  `PUT`s). An `exercise` item carries its own name/explanation/video and
  is measured either by `sets`+`reps` or by `duration_seconds` (not
  both); a `rest` item just carries `duration_seconds`. Validation is
  lenient (only `item_type` and, for exercises, `name` are required) so
  a plan can be edited field-by-field without every in-progress item
  needing to be fully filled in yet. `api/src/routes/trainingModules.js`
  — `GET` is open to any authenticated user (used by the Schedule item
  picker), `POST`/`PATCH`/`DELETE` require `authorize("coach")` (coach or
  admin). A `training` item can optionally link to one module via
  `training_module_id`.
- **Katas**: `nk_katas` (`name` unique, `style`, `wkf_number`) is an
  admin-managed reference list, seeded via migration with a starting set
  of well-known traditional/WKF-style kata names across Shotokan,
  Goju-ryu, Shito-ryu, and Wado-ryu, each tagged with a best-effort
  official WKF Kata List number (numbered within its style, per the
  published WKF kata scoresheet) — both the names and numbers are a
  starting point, not guaranteed to exactly match the current official
  WKF document from memory alone, and are fully correctable afterward
  via the admin Katas page. `api/src/routes/katas.js` — `GET` open to
  any authenticated user (ordered by style then `wkf_number`),
  `POST`/`PATCH`/`DELETE` `authorize.requireAdmin`. A `kata_performance`
  item links to one kata via `kata_id`; picking a kata in `Schedule.tsx`
  shows its WKF number and style in the picker ("3. Kanku Dai
  (Shotokan)") and auto-fills the item's (still-editable) title with the
  kata's name.
- **Karate styles**: `nk_karate_styles` (`name` unique) is an
  admin-managed reference list, seeded with the same four style names
  already used on `nk_katas` (Shotokan, Goju-ryu, Shito-ryu, Wado-ryu) —
  admins can add more via the admin Karate Styles page.
  `api/src/routes/karateStyles.js` — `GET` open to any authenticated
  user, `POST`/`PATCH`/`DELETE` `authorize.requireAdmin`. Athletes and
  clubs can each select one or more styles: `nk_athlete_styles`
  (`athlete_id` + `style_id`) and `nk_club_styles` (`club_id` +
  `style_id`) are many-to-many join tables, each replaced as a whole
  unit via `PUT /api/athletes/:id/styles` (admin/coach only — self-view
  shows styles read-only, same as the rest of an athlete's profile) and
  `PUT /api/admin/clubs/:id/styles` (`isClubAdmin`-gated, same as club
  athlete/coach membership).
- `api/src/utils/permissions.js`'s `isEventEditor(user, eventId)` gates
  every route in `api/src/routes/events.js`: true for `is_admin`; for
  `role === 'athlete'`, true if they're one of the attached athletes;
  for `role === 'coach'`, true if they share a club (via
  `nk_coach_clubs`/`nk_athlete_clubs`) with *any* attached athlete.
- Creating/reassigning athletes on an event (`POST /api/events`,
  `PUT /api/events/:id/athletes`) resolves who can be attached the same
  way: an athlete's own event is always forced to just themselves
  (client-supplied `athlete_ids` is ignored) — a plain athlete has no
  access to any athlete directory anywhere in this app, so the
  athlete-picker UI is hidden entirely for them. A coach must share a
  club with every athlete they attach (403 otherwise); admin is
  unrestricted.
- Frontend: `Schedule.tsx` (previously an empty placeholder) — list +
  drawer, same conventions as `Clubs.tsx`. The event detail drawer
  contains a nested "Itinerary" section for items, managed inline
  (tap-to-expand-in-place) rather than a second stacked `Drawer` — see
  the note in `CLAUDE.md`. The add-item form additionally exposes a
  "Repeats" control (none/daily/weekly + until date + weekday chips for
  weekly) and, depending on `item_type`, a single-select training-module
  or kata picker (same search-box pattern as the athlete picker).
  `admin/TrainingModules.tsx` and `admin/Katas.tsx` are separate
  list+drawer admin pages (reachable from `More.tsx`, `coach`+admin and
  admin-only respectively) for managing the underlying libraries.

## Auth & RBAC

Self-service email/password registration, gated by admin approval — not
third-party OAuth.

`role` and admin privilege are two **independent** columns on
`nk_users`, on purpose:

- **`role`** (`'coach' | 'athlete' | 'parent' | null`) means "which
  identity am I currently acting as" — it drives which nav links/pages
  are relevant and can be freely switched by the user (see
  `POST /api/auth/switch-role` below) between any profile they actually
  have linked.
- **`is_admin`** (boolean) is a durable privilege grant, set only by an
  existing admin via the Users page (`PATCH /api/admin/users/:id
  {is_admin}`) — never self-service, never touched by the role switcher.
  An admin keeps full admin access regardless of which `role` they're
  currently acting as; there is deliberately no "switch to admin" option,
  because admin-ness is never lost by switching in the first place. (This
  split exists because the two were originally conflated into a single
  `role` value including `'admin'` — switching a dual-profile admin's
  role away from `'admin'` had no way back through the UI. `role`'s CHECK
  constraint still legally allows the string `'admin'` for old rows, but
  no code path reads or writes it anymore — `is_admin` is authoritative.)

- `POST /api/auth/register` `{email,password,wants_athlete?,wants_coach?,
  requested_club_id?}` — creates an `nk_users` row. The **first ever**
  registration is auto-promoted to `is_admin: true`, `status: 'active'`
  (bootstrap, so there's always someone who can approve others); `role`
  stays `null` same as everyone else, since they have no athlete/coach
  profile yet. Every subsequent registration starts as `is_admin: false`,
  `status: 'pending'`. `wants_athlete`/`wants_coach`/`requested_club_id`
  are pure signup intent — stored on the user row and never touched
  again after activation. `GET /api/public/clubs` (unauthenticated) feeds
  the registration club picker, since it runs before any session exists.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- `POST /api/auth/switch-role` `{role: 'athlete'|'coach'}` — self-service;
  400 unless the caller already has the matching `athlete_id`/`coach_id`.
  Lets someone with both a linked athlete and coach profile flip which
  role they're currently acting as (surfaced as pills on the More page).
  Never touches `is_admin`.
- Session is a JWT (holding only the user id) in an `httpOnly`, `sameSite:
  lax` cookie. `api/src/middleware/auth.js` verifies it and re-reads the
  user's current role/status/is_admin from `nk_users` on every request,
  so an admin's approval takes effect immediately — no re-login needed.
- `api/src/middleware/authorize(...roles)` gates routes: no session →
  401; `status !== 'active'` → 403; `is_admin` always bypasses the roles
  check; otherwise role not in the given list → 403. A separate
  `authorize.requireAdmin` middleware gates admin-only routers
  (`api/src/routes/adminUsers.js`) — it accepts `is_admin` only, no role
  ever satisfies it.
- `nk_users.athlete_id` / `.coach_id` identify "this user IS this
  athlete/coach" (set by an admin, or auto-created — see below).
  `nk_parent_athletes` links a `parent` user to the athlete(s) — their
  kids — they should see.
- Admin-only management: `GET/PATCH /api/admin/users`,
  `PUT /api/admin/users/:id/parent-athletes`. Frontend: `/admin/users`
  (linked from the "More" tab, gated by `is_admin`), gated by
  `RequireAuth adminOnly`.
- Pending/disabled users can log in but are shown a "waiting for
  approval" screen (`PendingApproval.tsx`) instead of the app.

### Activation auto-provisions athlete/coach profiles

`api/src/utils/activateUser.js` (`activateUser(client, user)`) is called,
inside the same transaction, any time a user's `status` becomes
`'active'` — from `PATCH /api/admin/users/:id` (admin) or from a
club-admin's approval below. For a user with `wants_athlete`/
`wants_coach` set and no `athlete_id`/`coach_id` yet, it creates the
missing `nk_athletes`/`nk_coaches` row(s) from the user's name/email/
phone, links `nk_athlete_clubs`/`nk_coach_clubs` if `requested_club_id`
is set, and — only if `role` is still null — assigns `role: 'coach'`
(preferred, since it's the superset of access) or `'athlete'`. It never
overwrites a role or profile link an admin already set manually, and
no-ops entirely if both profiles already exist, so it's safe to call
on every activation.

A coach who admins a specific club (see the scoped-admin section above)
can approve signups requesting *that* club without full admin access:
`GET /api/admin/clubs/:id/pending-members` and
`POST /api/admin/clubs/:id/pending-members/:userId/approve` (both gated
by `isClubAdmin`) list/activate `status='pending'` users whose
`requested_club_id` matches the club; approval verifies the request was
actually for that club before running `activateUser`. Surfaced as a
"Pending members" section in the club's detail drawer in `Clubs.tsx`.

### PIN-based parent↔athlete linking

`nk_parent_athletes` (parent user ↔ athlete, many-to-many) is populated
self-service, without ever showing a parent-to-be a searchable list of
athletes (GDPR — no directory of children's names is ever exposed):

- `nk_athletes.link_pin` / `.link_pin_expires_at` hold at most one
  active PIN per athlete at a time. `POST /api/athletes/:id/generate-pin`
  (allowed for the athlete themself, their coach, or an admin — same
  access shape as `GET /:id`) generates a random zero-padded 6-digit
  code, retrying on the rare collision against another athlete's still-
  valid PIN, and sets a 1-hour expiry. Surfaced as a "Link a parent"
  section on the athlete's own read-only profile view
  (`MyAthleteProfile` in `Athletes.tsx`).
- `POST /api/auth/link-child` `{pin}` — self-service, any authenticated
  user. Matches the PIN against `nk_athletes` (must be non-expired),
  inserts the `nk_parent_athletes` row, clears the athlete's PIN
  (single-use), and sets `role = COALESCE(role, 'parent')` — same
  never-overwrite auto-role pattern as `activateUser`. Surfaced as a
  "Link a child" section on `Profile.tsx`, which also lists the user's
  already-linked children via `GET /api/auth/my-children`.
- `api/src/utils/pinRateLimit.js` — a small in-memory per-user attempt
  cap (5 wrong guesses locks that user out of `/link-child` for 5
  minutes) guarding the 6-digit PIN against brute-force guessing. Reset
  on a successful link.
- `nk_users.is_parent` is a computed `EXISTS(SELECT 1 FROM
  nk_parent_athletes WHERE user_id = ...)`, included in `req.user` and
  every auth response — mirrors how `athlete_id`/`coach_id` already
  drive the More-page "Acting as" switcher (`POST /api/auth/switch-role`
  now also accepts `'parent'`, valid only when `is_parent` is true). The
  switcher shows a pill for each identity the account actually has
  whenever 2 or more of {athlete, coach, parent} apply.

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
