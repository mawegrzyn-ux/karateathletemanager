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
- **Offline-aware** — athletes check schedules with patchy gym WiFi. The app is an installable PWA with a service worker caching schedules (see "PWA" below).
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
- **Coaches** — name, contact, qualifications, role (admin-managed list, e.g. head coach / assistant), karate style(s), can also be athletes
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
  roles. A user acting as `athlete` doesn't get this tab at all (see the
  Frontend Conventions bottom-nav note) — their own linked athlete record
  is still reachable read-only at `/athletes` (`AthleteSelfProfile`,
  `app/src/components/AthleteSelfProfile.tsx`, shared with `Profile.tsx`)
  — athletes can't edit their own profile. Coaches and referees *can*
  self-edit (see "Referee profiles" above) via `StaffSelfProfile`
  (`app/src/components/StaffSelfProfile.tsx`), rendered on `Profile.tsx`.
  Everyone else (`parent`, no role) sees a placeholder ("ask your coach").
- `nk_athletes`, `nk_coaches`, and `nk_referees` each carry a `photo_url`,
  editable via the shared `MediaField` (`kind="image"`) in the create/
  edit drawer (or the self-edit view, for coaches/referees). `nk_users`
  also carries its own account-level `photo_url` (edited on `Profile.tsx`'s
  generic "Account" section) — distinct from the active entity profile's
  photo. Anywhere a person's photo is displayed instead of edited (list
  rows, self-profile headers, the bottom nav), use `Avatar` (`ui.tsx`) —
  it renders the photo if set, otherwise a circle with the name's
  initials.

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
  `start_time`, `end_time` — both optional, unlike the required times
  on `nk_event_items` — `location`, `notes`, `training_module_id`) —
  `event_type` is one of `competition`,
  `squad_session`, `training`, `travel`, `time_off`, `seminar`,
  `training_camp`. `training_module_id` is only meaningful (and only
  editable in the UI) when `event_type === 'training'` — it lets a
  simple single-session event link a module directly, without needing
  to break it down into nested itinerary items first. `nk_event_athletes`
  (many-to-many) attaches one or more athletes — personal events have
  one, squad-level events have several. `nk_event_items` are the nested
  itinerary rows under an event (`item_type`, `title`, `item_date`,
  `start_time`, `end_time` — both required — `notes`, `training_module_id`,
  `kata_id`) — `item_type` reuses the same vocabulary plus
  `rest`, `other`, and `kata_performance` for things that don't fit the
  top-level list (e.g. an "active rest day" or a single kata
  run-through). `item.notes` here is a general note about the task
  itself (e.g. "bring your own equipment"), separate from the per-athlete
  progress notes below.
- **Per-athlete completion/notes**: `nk_event_item_athlete_status`
  (`item_id`, `athlete_id`, `status`, `notes`, `updated_at`, PK on the
  pair) tracks one three-way status (`pending`/`completed`/`failed`) +
  one notes field per (item, athlete) — a squad-session item assigned to
  several athletes needs each of them flagged and annotated
  independently, not one shared value for the whole item, and a task
  can be explicitly flagged failed, not just left unchecked.
  `GET /api/events/:id` and `/:id/items` attach an `athlete_status` array
  to every item, scoped to what the requester is allowed to see: an
  athlete only gets their own entry, an admin/coach gets the full event
  roster (each entry also carries `can_edit`, true for admins, for
  coaches sharing a club with that athlete, and for the athlete on their
  own row). `PATCH /api/events/:id/items/:itemId/athletes/:athleteId`
  (presence-based `{status?, notes?}`) upserts a row, gated by the same
  rule. In `Schedule.tsx`'s `ItemsSection`, the collapsed row's leading
  control is the current user's own status button (tap toggles
  pending/completed; ✓ green or ✗ red once set) when they're one of the
  event's athletes, or a read-only `completed/total` fraction (red if
  any failed) otherwise; expanding a row always reveals a `Completion`
  section (`AthleteStatusList`) listing every visible athlete with ✓/✗
  buttons + a notes textarea, disabled per-row when `can_edit` is false
  — this section is interactive regardless of the item's edit/read-only
  mode, same as before. The same model applies one level up, to the
  **event itself** (`nk_event_athlete_status`, same `status` column,
  `PATCH /api/events/:id/athletes/:athleteId`) — a simple single-block
  event with no itemized itinerary (the common case for a personal
  schedule entry, e.g. a "rest day") still needs its own per-athlete
  status/notes; `EventDetail` renders the same `AthleteStatusList` for
  `event.athlete_status`, always visible above the Itinerary section
  regardless of edit mode.
  `nk_event_item_athlete_status.completed` (the original boolean column)
  is intentionally never dropped, even though the app no longer reads or
  writes it — an already-shipped migration statement unconditionally
  re-adds `nk_event_items.completed` every deploy and, whenever that
  column exists (which is every deploy), backfills into
  `nk_event_item_athlete_status.completed` as an INSERT target; dropping
  that column would break that statement on every future deploy. If you
  ever touch this migration, keep that column around.
- **Swipe-to-flag gesture**: `SwipeableRow` (pointer events, same
  approach as the Day view's drag-to-move) wraps a row and calls
  `onSwipeComplete`/`onSwipeFailed` once the horizontal drag passes
  `SWIPE_THRESHOLD`, with a colored hint (green ✓ / red ✗) fading in
  behind the row as you drag. It's used in two places: itinerary item
  rows (swipes that one item's status for the current athlete via the
  existing per-item endpoint), and top-level event rows in the Schedule
  List view (swipes ALL of that event's itinerary items — or the event's
  own status if it has none — via the bulk `PATCH /api/events/:id/status`
  endpoint, athlete-only, self only). Only enabled when the viewer is one
  of the event's assigned athletes (`item.athlete_status`'s own entry, or
  the list's `event.my_status` non-null) — coaches/admins get the
  read-only fraction/badge instead, never a swipeable row, since a bulk
  swipe on someone else's behalf isn't a supported gesture.
  `GET /api/events` attaches `my_status` to each event for athlete
  viewers only (`attachMyEventStatus`): rolled up from its items if any
  exist (any `failed` item makes the whole event `failed`,
  all-`completed` makes it `completed`, otherwise `pending`), or from the
  event's own status if it has no items. `ScheduleManager`'s
  `updateEventInList` merges (rather than replaces) incoming event
  objects, since the event-detail endpoints don't recompute this
  list-only rollup field and a plain replace would blank it out after
  any unrelated edit made from the drawer.
- **Recurring items**: `POST /api/events/:id/items` accepts an optional
  `repeat: {freq: 'daily'|'weekly', until, weekdays?}`. The server
  expands this into one independent `nk_event_items` row per occurrence
  date (capped at 60) at creation time — there's no ongoing
  series/recurrence-rule link, so each generated item is thereafter
  edited/deleted on its own, same as a manually-created one.
- **Schedule.tsx view modes**: a `List`/`Day`/`Week`/`Month` segmented
  control (all client-side, no new endpoints) sits above the event list
  in `ScheduleManager`. All four operate on the same `events` array —
  there's no separate "calendar" data source.
  - **List**: events are grouped into date-headed sections ("Today",
    "Tomorrow", or a formatted date). On first load the view
    auto-scrolls the "Today" section (or the nearest future date) into
    place — once only, via a ref flag, so it never fights a user's
    manual scroll — and a floating arrow button re-triggers the same
    scroll on demand.
  - **Month**: a standard 7×6 day grid; each in-month cell shows up to
    3 small `TYPE_ICONS` emoji (one per overlapping event, `+N` beyond
    that) rather than full event rows, since a month cell has no room
    for detail. Tapping a day switches to Day view for that date.
  - **Week**: 7 day columns × hourly rows (6 AM–10 PM, `HOUR_HEIGHT`
    px/hour). An event only gets a time-positioned block if it's
    single-day *and* has both `start_time`/`end_time` — anything else
    (multi-day, or no time set) renders instead as a small all-day strip
    above the grid for each day it overlaps.
  - **Day**: the same split (timed events on an hourly grid, everything
    else in an all-day strip) for a single focused date, with the same
    per-event detail (icon, title, badge, time) as the List view's rows.
    Timed event cards are draggable (pointer events, not HTML5
    drag-and-drop, since that doesn't work on touch) — vertical drag
    moves the block, snapped to 15-minute increments; on release,
    `PATCH /api/events/:id` updates `start_time`/`end_time` (duration
    preserved). Drag only arms after a `LONG_PRESS_MS` (350ms) hold on
    the card — a short press-and-swipe (e.g. scrolling past a card) never
    moves it, since the card doesn't even start listening to
    `pointermove` until the long-press timer fires; if the pointer moves
    more than `MOVE_CANCEL_PX` before that, the pending timer is
    cancelled (treated as a scroll/flick, not drag intent). A
    `justDraggedRef` flag suppresses the click-to-open that would
    otherwise fire immediately after a drag's pointerup; releasing
    without ever moving (a genuine long-press with no drag) falls
    through to the normal open-on-tap behavior.
  - The hour-label ruler column (sticky, to the left of the hour grid in
    both Day and Week view) renders each hour as its own flex-column
    child with an explicit `height: HOUR_HEIGHT` — that child also needs
    `shrink-0`, since without it the browser's flex layout compresses
    the label rows to fit `max-h-[60vh]` (the ruler has no explicit
    total height, unlike the event grid it sits next to, which does),
    silently drifting the hour labels out of sync with the actual
    gridlines/event blocks the longer the visible range runs past the
    viewport height. If timed events ever look vertically misaligned
    with their hour labels again, check this first.
  - All three calendar views share date-math helpers (`startOfWeek`,
    `startOfMonth`, `eventOverlapsDate`, `timeToMinutes`/
    `minutesToTime`, etc.) defined once near the top of `Schedule.tsx`.
  - **Event detail drawer opens read-only, not into a form**: tapping an
    event (from any view) shows a formatted reading view — badge/date/
    time, location, notes as plain text, a linked training module
    rendered in full via `TrainingModuleView` (images/video/exercise
    list, not just its title), and invited athletes as badges — with an
    "✏️ Edit" toggle at the top of the drawer that swaps in the previous
    always-editable form (`EventDetail`'s `isEditing` state). Itinerary
    items (`ItemsSection`, `editable` prop threaded down from the same
    toggle) follow the same split: the collapsed row's completion
    control (see the per-athlete completion/notes model above) stays
    interactive either way (checking off a task isn't "editing", it's the
    point of the reading view), but expanding a row
    shows read-only notes + linked module/kata details when not
    editing, or the full field-editing form (plus the "+ Add itinerary
    item" control, hidden entirely outside edit mode) when editing.
  - **Frozen headers**: the page title/search/view-switcher block is
    `sticky top-0` (negative-margin trick to bleed its background under
    the parent's padding) in every view mode, so it never scrolls out of
    view. In Week/Day specifically, `CalendarNav` + the weekday/date row
    + the all-day strip sit in normal flow *above* a separately bounded
    hour-grid box (`max-h-[60vh] overflow-auto`) — only that inner box
    scrolls, so the nav and headers never need their own `sticky` offset
    math. List-view date-section elements carry `scroll-mt-[190px]` so
    `scrollToToday`'s `scrollIntoView` lands below the sticky bar instead
    of underneath it.
- **Training modules**: `nk_training_modules` (`title`, `explanation`) is
  a reusable library of session plans a coach or admin authors. Each
  plan is an ordered sequence of `nk_training_module_items`
  (`module_id`, `position`, `item_type` — `exercise` or `rest`, `name`,
  `explanation`, `video_url`, `image_url`, `sets`, `reps`,
  `duration_seconds`), replaced as a whole unit on write (same pattern
  as club membership `PUT`s). An `exercise` item carries its own
  name/explanation/optional video and/or image link, and is measured
  either by `sets`+`reps` or by `duration_seconds` (not both); a `rest`
  item just carries `duration_seconds`. Validation is lenient — only
  `item_type` is required, so a plan (including an exercise's name) can
  be built up field-by-field without every in-progress item needing to
  be fully filled in yet — but `sets` (max 50), `reps` (max 1000), and
  `duration_seconds` (max 6 hours) are bounded, both client-side (input
  `max`) and server-side, to catch nonsensical values.
  `api/src/routes/trainingModules.js` — `GET` is open to any
  authenticated user (used by the Schedule item picker),
  `POST`/`PATCH`/`DELETE` require `authorize("coach")` (coach or admin).
  A `training` item can optionally link to one module via
  `training_module_id`. `admin/TrainingModules.tsx`'s default export
  branches on role: `admin`/`coach` get `TrainingModulesManager` (library
  management, `TrainingModuleView`,
  `app/src/components/TrainingModuleView.tsx` — shared with the Schedule
  reading view below, so a linked module looks identical whether you're
  viewing it from the library or from a training event/item), while
  `athlete` gets `AthleteTrainingLog` instead — the module *library*
  isn't athlete-facing at all; an athlete's bottom-nav "Training" tab
  (route `roles={["coach", "athlete"]}` in `App.tsx`, same URL for both)
  shows their own scheduled training history: `GET /api/events/training-log`
  (athlete-only, self-scoped) flattens every `training`-type itinerary
  item and every simple direct-linked `training`-type event they're
  assigned to into one list — exercise group (the linked module's title,
  falling back to the item/event's own title if unlinked), their own
  status (pending/completed/failed, reusing the per-athlete status model
  above), date, and "time spent" (the scheduled `end_time - start_time`
  duration, not actual tracked time — there's no stopwatch feature). For
  editors of the module library, the page surfaces any save failure (bad
  bounds, network error) via a `Toast`, since every field edit auto-saves
  immediately and previously failed silently.
- **Media uploads**: `video_url`/`image_url` on an exercise item accept
  either a pasted link or an uploaded file, via `MediaField` — a shared
  component in `components/ui.tsx` (also used for athlete/coach photos,
  see below) — in `admin/TrainingModules.tsx`. A pasted YouTube link
  renders an embedded player preview; any other video/image URL
  (including an uploaded file's own URL) renders a native
  `<video>`/`<img>` preview. Uploading posts multipart form data to
  `POST /api/uploads` (`authorize("coach")`, image/video mimetypes only,
  50MB cap) via `multer`, which saves to `api/uploads/` (gitignored —
  persists across `git pull` deploys since it's untracked, unlike the
  frontend `dist/` build) and returns `/api/uploads/files/<uuid>.<ext>`;
  that path is served back by the same router's `express.static`, gated
  by the router's `authorize()` so only logged-in users can view a
  module's media, matching the module list's own read gating. Nginx's
  `client_max_body_size` (`nginx/nadakarate.com.conf`) must be at least
  as large as multer's 50MB cap — it isn't part of the automated deploy,
  so bumping it requires a manual `sudo nginx -s reload` on the server
  after updating `/etc/nginx/sites-available/nadakarate.com`. The `/api/`
  location also needs its `^~` modifier: without it, nginx prefers a
  matching *regex* location over a plain prefix one, so the static-asset
  cache rule below (`location ~* \.(js|css|png|...)$`) would otherwise
  intercept any uploaded `/api/uploads/files/*.png` (or `.jpg`/`.gif`/
  etc.) before it reaches the proxy, 404ing the image instead of serving
  it — this bit us in production once already; don't drop the `^~` when
  touching this file.
- **Katas**: `nk_katas` (`name` unique, `style`, `wkf_number`) is an
  admin-managed reference list, seeded via migration with the full
  official WKF Kata Name/Order List — 102 kata names numbered 1-102 in
  a single alphabetical sequence spanning all styles (not per-style
  numbering). `style` is a free-text tag applied only to the subset of
  katas the app also uses elsewhere (Shotokan/Goju-ryu/Shito-ryu/
  Wado-ryu); it's independent of `wkf_number` and fully correctable via
  the admin Katas page. `api/src/routes/katas.js` — `GET` open to
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
- **Coach roles**: `nk_coaches.role` remains a free-text column, but the
  set of role names offered in the UI is now admin-managed rather than
  hardcoded — `nk_coach_roles` (`name` unique), seeded with the two
  values already in use ("head coach", "assistant"). Admins can add more
  (e.g. "fitness coach") via the admin Coach Roles page.
  `api/src/routes/coachRoles.js` — same shape as `karateStyles.js`:
  `GET` open to any authenticated user, `POST`/`PATCH`/`DELETE`
  `authorize.requireAdmin`. `admin/Coaches.tsx`'s role `<select>` (both
  create form and edit drawer) is now populated from this list instead
  of a hardcoded array.
- **Coach styles**: coaches can now select one or more karate styles,
  same as athletes and clubs — `nk_coach_styles` (`coach_id` +
  `style_id`, many-to-many), replaced as a whole unit via
  `PUT /api/admin/coaches/:id/styles` (admin-only, matching the existing
  admin-only gate on all other coach mutations; `GET` open to `admin`/
  `coach` same as the rest of a coach's record).
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

- **`role`** (`'coach' | 'athlete' | 'parent' | 'referee' | null`) means "which
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
  drive the `Profile.tsx` "Acting as" switcher (`POST /api/auth/switch-role`
  now also accepts `'parent'`, valid only when `is_parent` is true). The
  switcher shows a pill for each identity the account actually has
  whenever 2 or more of {athlete, coach, parent} apply.

### Referee profiles

`nk_referees` is a third self-service profile type, a deliberately
minimal parallel to `nk_coaches`: `first_name`, `last_name`, `email`,
`phone`, `qualifications`, `photo_url`, `is_active` — no club/
association scoping and no karate-style linking, since neither applies
to officiating. It follows the exact same plumbing as athlete/coach
profiles throughout the stack:

- `nk_users.referee_id` (active pointer) + `nk_user_referees` (user ↔
  referee, many-to-many, for accounts with more than one referee
  profile) + `wants_referee` (signup intent), mirroring the athlete/
  coach columns.
- `activateUser.js` auto-provisions a referee record the same way as
  athlete/coach when `wants_referee` is set; `autoRole` prefers
  `coach > athlete > referee` when a user qualifies for more than one on
  first activation.
- `POST /api/auth/switch-role` accepts `'referee'`; `GET /api/auth/
  my-profiles` includes a `referees` array alongside `athletes`/
  `coaches`.
- `api/src/routes/referees.js` mirrors `coaches.js` (list/create/read/
  update/delete under `/api/admin/referees`, admin-gated writes) but
  without the styles sub-routes. Both `coaches.js` and `referees.js`
  additionally allow **self-edit**: a coach/referee acting as themselves
  can `PATCH` their own record, restricted to contact/profile fields
  (name, email, phone, qualifications, photo) — `is_active` (and, for
  coaches, `role`/`athlete_id`) stay admin-only.
- Frontend: `/admin/referees` (admin-only, list+drawer, mirrors
  `Coaches.tsx`). `Profile.tsx` renders a self-service editable view
  (`StaffSelfProfile`, shared with the coach case) above the generic
  account form when the active role is `referee`.

### Multiple athlete/coach profiles per account

A single login can own more than one athlete profile and/or more than
one coach profile (e.g. separate registrations at different clubs).
`nk_user_athletes` / `nk_user_coaches` (user ↔ athlete/coach, many-to-
many, mirroring `nk_parent_athletes`) hold the full set; `nk_users.
athlete_id`/`coach_id` remain single columns that point at whichever
profile in that set is *currently active* — every other permission
check and query in the codebase keeps reading those two columns
unchanged.

- `activateUser.js` inserts into the join table alongside setting the
  single-column pointer when it self-provisions a profile.
- `PUT /api/admin/users/:id/athletes` / `/coaches` / `/referees`
  (`{athleteIds: [...]}` / `{coachIds: [...]}` / `{refereeIds: [...]}`,
  replace-all, same shape as `PUT /api/admin/clubs/:id/athletes`) let an
  admin link/unlink profiles from the admin Users page (`MemberEditor`
  search-picker, same convention as `Clubs.tsx`). If the currently-active
  pointer is no longer in the saved set, it falls back to the first
  remaining profile (or `NULL`).
- `GET /api/auth/my-profiles` lists the calling user's own linked
  athlete/coach profiles by name. `POST /api/auth/switch-role` now
  accepts an optional `profile_id`, validated against that same set,
  and always re-sends `athlete_id`/`coach_id` on the response so the
  active pointer updates atomically with the role.
- The profile switcher lives on `Profile.tsx` (reachable via the bottom
  nav's Profile tab, not `More.tsx`): with 2+ role *types* (athlete/
  coach/parent) it renders the same pills as before; tapping "Athlete"
  or "Coach" goes straight through if the user only has one profile of
  that kind, or opens a single-select search picker (same pattern as
  `AssociationPicker`) if there's more than one. With only **one** role
  type but multiple profiles of it (e.g. two athlete profiles, no coach/
  parent role at all), the pills would never render — instead a single
  "Switch {role} profile" button opens that same picker directly, so a
  same-type multi-profile account always has a way to switch even
  without a second role type.
- `athlete_name`/`coach_name` (the active profile's full name) are
  computed server-side and included on every user-returning auth
  response (`USER_SELECT_FIELDS` in `api/src/utils/userFields.js`).
  `Shell` in `App.tsx` renders them as a small red banner ("Viewing as
  {name} (Athlete/Coach)") above every page whenever the active role is
  athlete or coach.

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

- Mobile-first layout — bottom tab navigation. Profile is an `Avatar`
  showing the logged-in user's own name initials (the account, not the
  linked athlete/coach record, so no photo lookup needed) and links to
  `/profile`; Grades moved off the bottom nav into a tile on the More
  page (still its own route, rendered inside the same `Shell` layout).
  The middle two tabs depend on the active `role` (`Shell` in
  `App.tsx`): `athlete` gets Schedule + Training (the read-only
  `admin/TrainingModules.tsx` view — see the Training modules section);
  everyone else (coach, admin, parent, no role) gets Schedule + Athletes,
  same as before. Full tab order: Profile, Schedule, Athletes|Training,
  More.
- The profile switcher (multiple athlete/coach/parent identities on one
  account) lives on `Profile.tsx`, not `More.tsx` — reachable via the
  bottom nav's Profile tab for both viewing/editing your account fields
  and switching which profile you're acting as. See "Multiple
  athlete/coach profiles per account" above for the switcher's exact
  behavior.
- Vite dev server on port 5173, proxies `/api` to `localhost:3001`
- `useApi()` hook wraps fetch with auth headers (if applicable)
- Shared UI components in `components/ui.tsx` (Modal, Toast, Field, Badge, Spinner, etc.)
- Tailwind design tokens as CSS custom properties in `index.css`
- SPA routing via `react-router-dom` v6
- Build output: `app/dist/` → copied to `/var/www/nadakarate/frontend/` on deploy
- Touch targets minimum 44px height
- Use `safe-area-inset-*` for notch/home-bar padding on iOS

## PWA

The app is installable and works offline for previously-loaded data,
via `vite-plugin-pwa` (`app/vite.config.ts`):

- **Manifest** (`manifest.webmanifest`, generated at build time from the
  `manifest` option in `vite.config.ts`): name, `theme_color` (`#dc2626`,
  matching the red accent), `background_color` (`#f5f5f4`, matching the
  stone-100 page background), `display: "standalone"`.
- **Icons**: manifest `icons[].src` and `index.html`'s favicon/
  `apple-touch-icon` `<link>`s all point at `/api/public/branding/*`
  (see "App icon & social image" below) rather than static files under
  `app/public/` — this lets an admin change the icon without a new app
  deploy. `index.html` also sets the `apple-mobile-web-app-*` meta tags
  iOS needs for "Add to Home Screen" that the manifest alone doesn't
  cover.
- **Service worker**: `registerType: "autoUpdate"` (new deploys take
  over silently on next load, no "update available" prompt — acceptable
  here since the app has no user-entered draft state worth preserving
  across an update) registered from `main.tsx` via
  `virtual:pwa-register`. Workbox `runtimeCaching`: `/api/*` requests use
  `NetworkFirst` (try the network, 5s timeout, fall back to the last
  successful response when offline — this is the "check schedules with
  patchy gym WiFi" case from the Design Principles above) and images use
  `CacheFirst`. The app shell (JS/CSS/HTML) is precached, so the SPA
  still boots offline even before any `/api` call has ever succeeded.
- `navigateFallbackDenylist` excludes `/api/` paths from the SPA
  navigation fallback (not that this matters much in practice — `/api`
  calls are `fetch`, not page navigations — but keeps the rule explicit).

### App icon & social image

An admin can upload a single image (More → Admin → App icon,
`app/src/pages/admin/AppIcon.tsx`) that becomes the app's home-screen
icon, favicon, apple-touch-icon, PWA manifest icon, *and* the preview
image shown when the site is shared on social media/iMessage/Slack —
one upload, all slots, no rebuild required.

- `nk_settings` (key/value table that's existed since the first
  migration) stores the chosen image's URL under key
  `branding_icon_url`. `api/src/routes/settings.js`
  (`authorize.requireAdmin`) exposes `GET`/`PATCH
  /admin/settings/branding-icon` to read/write it; the upload itself
  reuses the existing `POST /api/uploads` endpoint
  (`app/src/components/ui.tsx`'s `uploadFile`) the same way any other
  `MediaField` does.
- `api/src/routes/publicBranding.js`, mounted unauthenticated at
  `/api/public/branding/*`, serves the configured image at 7 fixed path
  aliases: `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`,
  `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, and
  `social-image.png`. It must be unauthenticated — PWA icon fetchers and
  social-media link-preview crawlers (Facebook/Twitter/Slack/iMessage)
  never carry the app's session cookie, so gating this behind
  `authorize()` (like the general `/api/uploads/files/*` static route
  is) would break every one of them. It resolves the configured
  filename from `nk_settings` and validates it against a strict
  `^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$` pattern before reading it off disk
  from `api/uploads/`, to rule out path traversal since this route has
  no auth layer to fall back on. Before any admin upload (or if
  `nk_settings` has no row yet), it falls back to a committed default
  (`api/src/assets/default-icon.jpg`).
- `index.html`'s favicon/apple-touch-icon `<link>`s and its OG/Twitter
  `<meta>` tags (`og:image`, `twitter:image`, absolute URL
  `https://nadakarate.com/api/public/branding/social-image.png` — OG
  crawlers read raw HTML only, no JS execution, so this has to be a real
  `<meta>` tag with an absolute URL, not something set client-side) and
  the PWA manifest's `icons[].src` (`vite.config.ts`) all point at these
  same 7 URLs. Because the URLs are stable and the bytes behind them
  are what changes, updating the admin-uploaded image takes effect
  immediately across app icon, favicon, and social preview — no new
  frontend deploy needed.
- **v1 simplification**: the exact same raw uploaded image is served at
  all 7 slots — there's no server-side resizing/padding (no `sharp` or
  similar added), so the maskable icons' safe-zone padding and the
  apple-touch-icon's "no transparency" preference aren't actually
  enforced; the browser/OS scales the one image as needed. Fully
  functional, just not pixel-ideal for every slot — revisit with real
  per-size image processing if that ever matters.

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

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
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
│   └── uploads/                 # User-uploaded media (gitignored, persists
│                                 # across deploys — not touched by git pull)
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
8. `scripts/smoke-test.sh` — fast curl-based checks (see below)
9. Playwright smoke suite (`app/tests/e2e/smoke.spec.ts`)

Both test steps run read-only against the live site (`https://nadakarate.com`)
right after the health check, so a broken deploy is caught immediately —
though note the deploy itself has already happened by that point; there's
no automatic rollback. A failing Playwright run uploads its report
(`playwright-report/`) as a workflow artifact for debugging.

### Smoke tests

- `scripts/smoke-test.sh [base-url]` — bash + curl, no dependencies beyond
  `curl`/`grep`. Checks `/api/health`, that `/` and `/login` serve the SPA,
  and — the one regression-specific check — that a bogus
  `/api/uploads/files/*.png` path reaches Express (401/404 with a JSON
  `error` body) rather than getting swallowed by nginx's static-asset
  cache `location` block (see the "Media uploads" section above for why
  that block needs `^~`). Defaults to `https://nadakarate.com`.
- `app/tests/e2e/smoke.spec.ts` (Playwright, `npm run test:e2e` from
  `app/`) — the same core checks plus rendering assertions (login/register
  pages have the expected fields, an unauthenticated visit redirects to
  `/login`). `SMOKE_BASE_URL` picks the target (defaults to
  `http://localhost:5173`). An optional `describe` block additionally logs
  in and checks the bottom nav renders with no console errors, but only
  runs when `SMOKE_TEST_EMAIL`/`SMOKE_TEST_PASSWORD` are set (env vars
  locally, repo secrets in CI) — a dedicated test account, not a real
  coach/athlete's login. Neither suite ever creates, edits, or deletes
  data, so both are safe to run directly against production.

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
