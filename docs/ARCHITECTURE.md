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
  behind the row as you drag — the hint divs are positioned on the side
  the drag actually uncovers (dragging left slides the row's content
  left, exposing its *right* edge, so the green ✓/complete hint lives at
  `right-0`; dragging right exposes the *left* edge, so red ✗/failed
  lives at `left-0`) — swapped this way after finding the hints
  rendered on the wrong, permanently-covered side otherwise. It's used
  in two places: itinerary item rows (swipes that one item's status for
  the current athlete via the existing per-item endpoint), and top-level
  event rows in the Schedule List view (swipes ALL of that event's
  itinerary items — or the event's own status if it has none — via the
  bulk `PATCH /api/events/:id/status` endpoint, athlete-only, self
  only). Only enabled when the viewer is one of the event's assigned
  athletes (`item.athlete_status`'s own entry, or the list's
  `event.my_status` non-null) — coaches/admins get the read-only
  fraction/badge instead, never a swipeable row, since a bulk swipe on
  someone else's behalf isn't a supported gesture; dragging still
  tracks for them (`disabled` no longer blocks `onPointerDown`), growing
  a neutral "Only athletes can swipe" message behind the row instead of
  the ✓/✗ hint (`DISABLED_SWIPE_MAX`, wider and un-thresholded since
  there's no action to trigger), and releasing never calls
  `onSwipeComplete`/`onSwipeFailed`.
- **Completed/failed background tint**: an itinerary item's row
  (`myEffectiveStatus` — the viewer's own status if they're the
  assigned athlete, else the same failed/completed/pending rollup used
  for the title's strikethrough/red-text styling) gets `bg-green-50
  border-green-200` when completed or `bg-red-50 border-red-200` when
  failed, on top of (not instead of) the existing corner indicator (the
  ✓/✗ circle for the assigned athlete, or the completed/total fraction
  for everyone else) — the tint applies for every viewer, not just the
  assigned athlete, since it's read from the same rollup value the title
  styling already used.
  `GET /api/events` attaches `my_status` to each event for athlete
  viewers only (`attachMyEventStatus`): rolled up from its items if any
  exist (any `failed` item makes the whole event `failed`,
  all-`completed` makes it `completed`, otherwise `pending`), or from the
  event's own status if it has no items. `ScheduleManager`'s
  `updateEventInList` merges (rather than replaces) incoming event
  objects, since the event-detail endpoints don't recompute this
  list-only rollup field and a plain replace would blank it out after
  any unrelated edit made from the drawer.
- **Recurring items**: available on every item type (training,
  competition, kata_performance, rest, etc — the form and endpoint never
  special-case `item_type`). `POST /api/events/:id/items` accepts an
  optional `repeat`:
  ```
  {
    freq: 'daily' | 'weekly' | 'monthly',
    interval?: number,       // "every N days/weeks/months", default 1
    weekdays?: number[],     // 0-6, weekly only; defaults to item_date's weekday
    day_of_month?: number,   // 1-31, monthly only; defaults to item_date's day
    end: { type: 'until', date } | { type: 'count', count },
  }
  ```
  `resolveOccurrenceDates` (`events.js`) expands this into one
  independent `nk_event_items` row per occurrence date (capped at 60).
  Weekly walks day-by-day, filtering to the selected weekdays and to
  weeks that are a multiple of `interval` weeks from the start date (so
  "every 2 weeks on Mon/Wed" lands correctly). Monthly walks month-by-
  month at `day_of_month`, silently skipping months too short for that
  day (e.g. day 31 in April) rather than erroring or shifting the date.
  The end condition is either a hard `until` date or a fixed `count` of
  occurrences — exactly one of the two, not both. Every item generated
  from one `repeat` request shares a server-generated `recurrence_id`
  (UUID, `nk_event_items.recurrence_id`, null for manually-created
  items) so they can later be identified/deleted as a series — there's
  otherwise no ongoing series/recurrence-rule link, so each occurrence
  is independently edited or deleted like a manually-created item (this
  is how "move this one occurrence" and "delete just this occurrence"
  work with no special-casing).
- **Duplicating/repeating an existing item**: an already-created
  itinerary item's expanded edit view has a "Duplicate / repeat" button
  (`duplicateItem` in `ItemsSection`, `Schedule.tsx`) that copies its
  current fields (title, type, date, times, notes, training module/kata)
  into the same inline add-item form used for brand-new items, with
  `repeat` reset to "Does not repeat" — collapsing the original item and
  opening the primed form. Submitting as-is creates a single independent
  copy (a plain duplicate); setting the form's existing Repeats picker
  before submitting reuses the same `repeat` expansion as new items,
  which is how an already-created item is turned into a recurring
  series after the fact — there's no separate "make recurring" endpoint,
  since duplicate + repeat covers both asks with the add-item form's
  existing machinery.
- **Deleting a series**: `DELETE /api/events/:id/items/:itemId/series`
  looks up that item's `recurrence_id` and deletes every item sharing
  it (400 if the item isn't part of a series). In the item's expanded
  edit view, a "Delete series" button (`DeleteButton` with
  `label="Delete series"`, alongside the ordinary per-item delete
  relabeled `label="Delete this occurrence"` when the item has a
  `recurrence_id`) only renders when 2+ items still share that id —
  `DeleteButton` (`ui.tsx`) grew an optional `label` prop for this, so
  the two adjacent delete buttons read distinctly instead of both
  showing the default "🗑 Delete".
- **Date/time field layout**: on both event and itinerary-item forms,
  a date field and its associated time field are always placed in a
  `grid grid-cols-2` row together (Start date next to Start time, End
  date next to End time; an item's single Date next to its Start time,
  with End time on its own row below) rather than grouping all dates
  together and all times together — so the two fields describing one
  moment are visually paired.
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
- **Squads, groups, and venues**: club-scoped structure, distinct from
  the global-reference-list model used by katas/karate styles/coach
  roles above. `nk_squads`/`nk_groups` (`club_id` FK, `name`) each have a
  join table (`nk_squad_athletes`/`nk_group_athletes`) recording which
  athletes belong; both are managed only by that club's admin (coaches
  with `is_admin: true` in `nk_coach_clubs`, or a global admin) via
  `api/src/utils/clubCollections.js`'s `registerClubCollection` — a
  shared helper registering the full CRUD + `PUT .../athletes`
  (replace-all-membership) route set once, called twice in
  `api/src/routes/clubs.js` (once for squads, once for groups) since the
  two are structurally identical. `nk_venues` (`club_id` nullable —
  `NULL` means a global venue) is either admin-managed globally
  (`api/src/routes/adminVenues.js`, mirrors `karateStyles.js`: `GET` open
  to any authenticated user, `POST`/`PATCH`/`DELETE`
  `authorize.requireAdmin`) or club-manager-managed
  (`/api/admin/clubs/:id/venues`, `isClubAdmin`-gated writes, alongside
  the squads/groups routes in `clubs.js`). All three are edited inline in
  the club detail drawer in `admin/Clubs.tsx` (`ClubCollectionSection` for
  squads/groups — accordion rows, tap to expand into a name field +
  `MemberEditor` + `DeleteButton`, "+ Add" reveals an inline create form
  below the list, matching `CLAUDE.md`'s nested-line-items convention;
  `ClubVenuesSection` is the same accordion shape with name/address/notes
  fields instead of a membership picker) — there's also a standalone
  `admin/Venues.tsx` (list+drawer, admin-only route) for managing global
  venues outside any specific club.
  Since a coach or athlete's Schedule view spans every club they belong
  to, three read-only cross-club visibility endpoints feed its pickers:
  `GET /api/squads`, `GET /api/groups` (`api/src/utils/
  visibleCollections.js`'s `registerVisibilityRoute` — admins see every
  club's, coaches see only clubs they belong to via `nk_coach_clubs`,
  anyone else gets `{squads: []}`/`{groups: []}`) and `GET /api/venues`
  (every global venue plus — for a coach — their own clubs' venues, or
  every club's for an admin; readable by any authenticated user, unlike
  squads/groups, since seeing a venue's address isn't sensitive the way
  athlete-roster membership is). `nk_events` gained a nullable `venue_id`
  FK (`ON DELETE SET NULL`) *alongside* the pre-existing free-text
  `location` column, not replacing it — `Schedule.tsx`'s create form and
  `EventDetail` edit mode show a `SingleSelectPicker` for venue right
  under the plain Location input; the read-only view prefers the linked
  venue's name/address when set, falling back to the free-text location.
  The athlete picker in both the create form and `EventDetail` gains a
  `GroupQuickAdd` row above it — one chip per visible squad/group,
  labeled with its club name; tapping a chip bulk-adds every athlete in
  it (never removes) to the selection, leaving the existing
  add/remove/search picker underneath for fine-tuning.
- **Grades**: belts and grades are unified into one concept.
  `nk_grade_levels` (`kind` `'kyu'|'dan'`, `rank_order` — a flat ascending
  beginner→advanced scale spanning both kinds, `name`, `belt_color`,
  nullable `club_id`) replaces the old free-text `nk_athletes.belt`
  column (migrated: backfilled to the lowest-ranked standard grade
  sharing that belt color, then dropped) with `nk_athletes.grade_id`
  (`ON DELETE SET NULL`). `club_id IS NULL` rows are the standard list,
  seeded with a typical 9-kyu (9th→1st, white→brown) + 10-dan
  progression and conventional belt colors; `club_id` set means that
  club's own override list, which *replaces* (not merges with) the
  standard list for that club's athletes — same override relationship as
  club karate styles. Two partial unique indexes
  (`... WHERE club_id IS NULL` / `... WHERE club_id IS NOT NULL`) keep
  names unique within each scope without treating the seed's repeated
  `NULL` club_id as distinct rows (Postgres's default `UNIQUE` behavior,
  which would otherwise let the seed insert duplicate on every
  migration re-run).
  Three route files mirror the venues split: `api/src/routes/
  adminGrades.js` (global list only, `GET` open to any authenticated
  user, `POST`/`PATCH`/`DELETE` `authorize.requireAdmin`, mounted at
  `/api/admin/grades`), club-scoped override CRUD alongside the venues
  block in `clubs.js` (`isClubAdmin`-gated writes, mounted under
  `/api/admin/clubs/:id/grades`), and `api/src/routes/grades.js` (`GET`
  only, combined visibility for pickers — every standard grade plus each
  visible club's overrides: an admin sees every club's, a coach sees
  their own clubs', and — unlike venues/squads/groups — an *athlete*
  also sees their own clubs' overrides too, via `nk_athlete_clubs`, so
  their self-profile can still resolve their own grade's name/color even
  under a club-specific list). `Grades.tsx` (previously an empty
  placeholder) reads this combined endpoint: standard grades grouped
  into Kyu/Dan sections with a small `BeltSwatch` color indicator per
  row (`ui.tsx`, backed by a shared `BELT_COLOR_HEX` map), any visible
  club overrides listed read-only underneath grouped by club name
  (management happens in that club's own drawer, not here), and — admin
  only — the standard rows become tappable to edit/delete, plus an
  `AddButton` to create new ones. `admin/Clubs.tsx`'s club drawer gained
  a `ClubGradesSection` (same accordion shape as squads/groups/venues)
  for managing that club's override list. Athletes no longer pick a
  belt from a plain `<select>` — `Athletes.tsx`'s create/edit forms and
  list rows use a `GradePicker` (search-box + single-select, matching
  `CLAUDE.md`'s picker convention, with a `BeltSwatch` per result) bound
  to `grade_id`. `belt_color` isn't a plain flat color for every grade —
  a few (early beginner grades some federations insert between two main
  colors, or brown-belt sub-ranks marked by stripe count) are a base
  color plus a contrasting stripe. `ui.tsx`'s `BELT_STRIPES` map flags
  those, and `BeltSwatch` renders them as band(s) across the circle
  instead of a flat fill; `BELT_COLOR_OPTIONS` (also `ui.tsx`) is the one
  shared `{value, label}` list every belt-color `<select>` in the app
  (`Grades.tsx`, `admin/Clubs.tsx`'s `ClubGradesSection`) renders from,
  so the option list and its display labels can't drift between pages.
- **Grading records**: `nk_grades` (already existed, unused, since the
  original scaffold) is now the athlete grading-history table: one row
  per graded attempt, tying an `athlete_id` to the `grade_id` they were
  attempting, whether they `passed`, and optional `grading_body`/
  `examiner`/`next_grade_due`/`event_id` (nullable link to the Grading
  event/session it happened at) /`recorded_by_coach_id` (who recorded
  it). `POST /api/athletes/:id/gradings` (coach/admin) inserts a record
  and, when `passed` (default `true`), also updates the athlete's
  current `nk_athletes.grade_id` in the same transaction — recording a
  grading *is* how an athlete's current grade changes now, there's no
  separate "just edit the grade field" flow for a real promotion (the
  grade picker on the athlete's edit form is still there for direct
  correction, e.g. fixing a data-entry mistake, without going through
  the grading-history flow). `GET /api/athletes/:id/gradings` is
  readable by coach/admin/the athlete themself (same `isSelf` pattern as
  `GET /api/athletes/:id`); `DELETE .../gradings/:gradingId` removes a
  single history entry (coach/admin) without reverting the athlete's
  current grade. `Athletes.tsx`'s edit drawer gained a
  `GradingHistorySection` — accordion rows (tap to expand into grading
  body/examiner/next-due-date + `DeleteButton`), a `GradePicker` inside
  an inline "+ Record grading" form (date, examiner, grading body,
  passed checkbox, next grade due). `AthleteSelfProfile.tsx` shows the
  same history read-only (no recording action) alongside the athlete's
  current grade.
- **Grading event type**: `"grading"` was added to `EVENT_TYPES` in both
  `events.js` and `Schedule.tsx` — a plain event/item type like any other,
  no dedicated fields of its own; the actual grading result is recorded
  separately via the athlete's Grading history, not on the event.
- **Competition results**: `nk_competition_results` — one row per
  recorded performance, tying an `athlete_id` to `competition_name`,
  `competition_date`, `location`, `rounds_completed`, `final_position`
  (`VARCHAR`, not an int/enum — placements aren't on one consistent scale
  across formats: "1st", "Gold", "Round of 16", "DNF" are all valid),
  `notes`, and `recorded_by_user_id`. Unlike gradings, this is a
  deliberate permission divergence: POST/PATCH/DELETE on
  `/api/athletes/:id/competition-results` allow the athlete themself (not
  just coach/admin) — a competition result is the athlete's own
  self-reported performance, not something requiring third-party
  certification. `event_id` and `event_item_id` are both nullable and
  mutually optional (no XOR constraint) — a result can stand alone, tie
  to a whole event, or tie to one nested itinerary item, since a
  competition can be either (see "Events and itinerary items share one
  type set" above). `GET /api/events/:id/competition-results`
  (`isEventEditor`-gated, the same trust level already governing the
  whole event view) returns every result tied to the event *or* to any of
  its items in one query; the frontend filters client-side by
  `event_item_id` to scope what's shown at each render site.
  `app/src/components/CompetitionResults.tsx` exports
  `CompetitionResultsSection` (athlete-scoped, accordion add/expand/
  delete, same shape as `GradingHistorySection`) — used in `Athletes.tsx`'s
  edit drawer and, as the one editable section on an otherwise read-only
  page, `AthleteSelfProfile.tsx` — and `EventCompetitionResults`
  (event/item-scoped), rendered in `Schedule.tsx`'s `EventDetail` for a
  whole competition event and in `ItemsSection` for an expanded
  competition-type item. Capturing a result for someone else (coach/admin)
  shows an athlete `<select>`; capturing your own (self-athlete) skips it
  and prefills your own profile automatically.
- **Events and itinerary items share one type set**: `EVENT_TYPES` and
  `ITEM_TYPES` are literally the same array (`const ITEM_TYPES =
  EVENT_TYPES`) in both `events.js` and `Schedule.tsx`, covering every
  type either could need (`rest`/`other`/`kata_performance` used to be
  item-only; a lone event can now be any of them too). A `kata_performance`
  event gets the same treatment a `kata_performance` item already had:
  `nk_events.kata_id` (mirrors `training_module_id`) plus a Kata
  `SingleSelectPicker` in both the create form and `EventDetail` edit
  mode that auto-fills the (still-editable) title.
- **Events can recur, the same way itinerary items already did**:
  `nk_events.recurrence_id` (mirrors `nk_event_items.recurrence_id`) plus
  a `repeat` object accepted by `POST /api/events`, reusing the exact
  same `resolveOccurrenceDates` helper items use (daily/weekly/monthly,
  interval, weekday/day-of-month selection, until-date or occurrence-
  count end condition, capped at 60 occurrences). Since an event is a
  date *range* rather than an item's single date, each generated
  occurrence keeps the original's day-span (a 2-day event repeating
  weekly produces a new 2-day event every week, anchored to
  `start_date`). `POST /api/events` returns `{ events: [...] }` (array)
  when `repeat` is present, `{ event }` otherwise — same response-shape
  split `POST /api/events/:id/items` already used. The "New event" form
  in `Schedule.tsx` grew the identical "Repeats" control the itinerary
  add-item form has.
- **Copy and delete, for both events and itinerary items**: "copy" is
  client-side only (no dedicated endpoint) — a "Duplicate / repeat"
  button in `EventDetail`'s edit mode (matching the itinerary item one
  that already existed) pre-fills the "New event" form with the source
  event's fields *and* its athlete roster, reusing the ordinary create
  flow once the user reviews and submits. Deleting a single occurrence
  already worked (`DELETE /api/events/:id`); events gained the
  itinerary-item-style series delete too — `DELETE /api/events/:id/series`
  removes every event sharing that `recurrence_id` — surfaced as a
  "Delete series" button in `EventDetail`, shown only when the currently-
  loaded event list has more than one event with the same
  `recurrence_id`.
- **Itinerary items are bound by their event's date range**: `POST
  /api/events/:id/items` and `PATCH /api/events/:id/items/:itemId`
  reject (400) an `item_date` — or, for a repeat, any generated
  occurrence date — outside the parent event's `start_date`/`end_date`
  (`getEventDateRange`/`datesWithinRange` helpers in `events.js`).
  `Schedule.tsx`'s item date inputs (add form, edit form, and the
  "repeat until" date) get matching `min`/`max` attributes bound to the
  event's dates, so the common case is caught by the browser before it
  ever reaches the server-side check.
- **Fixed: completing an item in the detail view left the Schedule list
  stale.** Marking an itinerary item (or a no-items event) complete/failed
  from `EventDetail` only ever updated `EventDetail`'s own local state —
  the list view's `my_status` badge/checkbox lives on `ScheduleManager`'s
  separate `events` array, computed once server-side at initial load
  (`attachMyEventStatus`) and never recomputed after a status edit made
  in the detail view. `EventDetail` now mirrors that same rollup logic
  client-side (`syncMyStatus`: any failed item → failed, all items
  completed → completed, no items → the event's own direct status) and
  pushes the recomputed status up through the existing `onUpdated`
  callback after every relevant change — both the item-level path
  (`setItemsAndSync`, wrapping the `setItems` passed to `ItemsSection`)
  and the event-level one (`updateEventAthleteStatus`, for events with no
  itemized itinerary).

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

### Club join links

A club admin (per `isClubAdmin` — the club's global admin, or a coach
holding `is_admin` on that club in `nk_coach_clubs`) can generate a
shareable link that takes new registrants straight to a registration
form pre-locked to "athlete, assigned to this club" — skipping the
checkboxes and club search entirely. Deliberately modeled as a variant
of the PIN-linking pattern above, but multi-use and long-lived rather
than single-use/short-lived, since many people register from the same
link over time rather than one parent redeeming one code:

- `nk_clubs.join_token` (nullable, unique) holds a long random hex
  string (`crypto.randomBytes(24).toString("hex")`, not a short PIN —
  it's embedded in a URL, not typed in by hand, so brute-force
  guessability isn't a concern the way it is for the 6-digit PIN).
  `GET/POST/DELETE /api/admin/clubs/:id/join-link` (all `isClubAdmin`-
  gated, in `clubs.js`) read the current token, generate/regenerate one
  (overwriting any previous token — old links stop working
  immediately), or clear it (revoke). Never included in the general
  club list/detail SELECTs — only these three dedicated endpoints ever
  return it, since (unlike the list endpoints) they're actually scoped
  to admins of that specific club, and the token is otherwise sensitive
  (whoever holds it can let people self-register into the club).
- `GET /api/public/join/:token` (`publicJoin.js`, unauthenticated, same
  reasoning as `publicClubs.js` — registration runs before any session
  exists) resolves a token to `{id, name}` only, 404 on an invalid/
  revoked/regenerated-away token.
- Surfaced as a "Join link" section in the club's detail drawer
  (`JoinLink` in `Clubs.tsx`, gated by the same `canSeePending` check
  used for `PendingMembers`, right above it), showing the full URL
  (`${origin}/register?join=${token}`) with Copy/Regenerate/Revoke.
- `Register.tsx` reads a `?join=` query param and, if present, resolves
  it via the public endpoint on mount. While resolving: a loading line;
  on success: the checkboxes/`ClubPicker` are replaced entirely by a
  fixed "You're joining **{club}** as an athlete" banner, and submission
  always sends `wants_athlete: true, wants_coach: false,
  wants_referee: false, requested_club_id: <that club>` regardless of
  the (now-hidden) form state; on an invalid/expired token: an error
  banner, but the ordinary checkboxes/picker still render underneath as
  a fallback so the visitor can still register normally. The resulting
  `nk_users` row is otherwise unremarkable — same `pending`-by-default
  status and the same `activateUser` consumption of `requested_club_id`
  on approval as any other registration; a join link only changes how
  the intent fields get set, not what happens with them afterward.

Since a join-link registrant has no `nk_athletes` row until an admin/
club-admin approves them (`activateUser` is what creates it), completing
their profile — avatar, date of birth — has to happen while `status` is
still `'pending'`, staged on `nk_users` itself the same way
`first_name`/`last_name`/`phone` already were:

- `nk_users.date_of_birth` mirrors `nk_athletes.date_of_birth` as a
  pre-activation staging field, editable via the existing self-service
  `PATCH /api/auth/me` (which has never gated on `status`/role — only
  `req.user` needs to exist). `activateUser` now also copies
  `user.photo_url`/`user.date_of_birth` onto the newly-created
  `nk_athletes` row, alongside the name/email/phone it already copied —
  this was a pre-existing gap (those two columns just weren't copied)
  rather than something new to the join-link flow.
- `Profile.tsx`'s "Account" form (rendered unconditionally regardless of
  `status`) gained a "Date of birth" field next to the existing avatar
  `MediaField`, both writing to `nk_users` via the same `updateProfile`/
  `PATCH /me` call as first/last name.
- The avatar upload itself was blocked for a pending user before this
  fix: `POST /api/uploads` sat behind `authorize("coach")`, and the
  router-level `authorize()` on top of it 403s anyone whose `status !==
  'active'` regardless of role. `authorize.js` gained a third gate,
  `authorize.authenticated` (session required, no status/role check),
  used for the whole `uploads.js` router in place of `authorize()` —
  uploading your own avatar/video is safe regardless of approval state
  or role, unlike every other coach-gated write in the app.
- `wants_athlete` is now included in `USER_SELECT_FIELDS` (previously
  write-only — set at registration, never read back), so the client can
  tell a still-pending user registered with athlete intent before
  `role`/`athlete_id` exist to confirm it. `Profile.tsx` uses this (plus
  `role === 'athlete'` once active) to hide the "Link a child" section —
  someone registering as an athlete via a join link is the athlete, not
  a parent, so the child-PIN UI doesn't apply to them.

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

### Osu — admin chatbot & MCP server

"Osu" is a Claude-powered chat assistant for admins, plus a standalone MCP
(Model Context Protocol) server exposing the same task-performing tools to
any MCP client. Both surfaces share one set of tool definitions so they can
never drift apart on what a tool does or what it's called:

- `api/src/mcp/tools.js` is the single source of truth: an array of
  `{name, description, input_schema, handler}` — plain JSON Schema (not a
  Zod/validation-library shape), reusable as-is for both Claude's tool-use
  API and MCP's `tools/list`. Handlers talk to the database directly
  (`pool`/`activateUser`), the same way `activateUser.js` does, rather than
  going through the HTTP routes. Current tools: `list_clubs`,
  `create_club`, `list_athletes`, `list_pending_users`, `approve_user`
  (wraps `activateUser`, same auto-provisioning as the admin Users page),
  `list_events`, `create_event` (single, non-repeating, no athletes
  assigned — a deliberately narrower slice of what `POST /api/events`
  supports, kept simple for a first cut).
- `api/src/mcp/server.js` is a standalone MCP server (stdio transport, the
  low-level `@modelcontextprotocol/sdk` `Server` class — not the
  Zod-based `McpServer` convenience wrapper, precisely so it can reuse the
  same plain JSON Schema `tools.js` already defines) that any MCP client
  (Claude Desktop, another Claude Code session, etc.) can connect to. Run
  it directly with `npm run mcp` from `api/`. It carries the same
  admin-equivalent trust as the chat route below — anyone who can run it
  can call any tool — so it's meant for admins running it themselves, not
  for exposing over a network.
- `POST /api/osu/chat` (`osu.js`, gated by `authorize.requireAdmin` — the
  chatbot is admin-only for now, per the initial ask) is the chat backend.
  Stateless per request: the client resends the full conversation as
  `{messages: [{role, content}, ...]}` (plain strings, no tool blocks —
  a prior turn's tool calls don't need to be replayed for the model to
  stay coherent, only its final text reply does), and the server runs a
  manual Claude API tool-use loop in-process (model `claude-opus-4-8`,
  adaptive thinking, capped at `MAX_TOOL_ITERATIONS` steps as a runaway
  guard) directly against `tools.js`'s `callTool`, returning
  `{reply, actions}` where `actions` is every tool call made this turn
  (name/input/output or error) so the UI can show what Osu actually did,
  not just what it said.
- `Osu.tsx` (route `/osu`, `RequireAuth adminOnly`, tile in `More.tsx`'s
  Admin section) is a plain chat UI — message bubbles plus small "🔧
  tool_name" chips under each assistant reply for any tool calls made,
  hovering a chip shows its input as a tooltip. It's a deliberate
  exception to the list+drawer convention in `CLAUDE.md`: a conversation
  isn't an entity list, so it doesn't try to force-fit that pattern.
- Needs `ANTHROPIC_API_KEY` set in `api/.env` (see Environment Variables
  below) — the Anthropic SDK's default client reads it directly from the
  environment, no extra plumbing.

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
- Each of the 7 slots is rendered from the one configured source image
  on request via `sharp`, not served as raw passthrough bytes — this
  matters because Chrome/Android's PWA-installability check requires
  icons that are actually the declared pixel size and a real decodable
  `image/png`; serving arbitrary source dimensions/format at those URLs
  silently downgrades "Install app" to a plain bookmark-style "Add to
  Home Screen" instead of a real install. `favicon`/`icon-*`/
  `apple-touch-icon` use `fit: "cover"` (crop to fill); the two
  `icon-maskable-*` slots shrink the source to its inner ~80% ("safe
  zone") and pad the rest with the brand red (`#dc2626`) so Android's
  adaptive-icon mask can't clip anything important; `apple-touch-icon`
  is flattened onto the same brand red since iOS renders alpha as
  black; `social-image` is cropped to the OG-recommended 1200×630.
  Rendered per-request rather than precomputed at upload time, since
  traffic to these URLs is low — the `Cache-Control` header above keeps
  repeat fetches cheap.

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
ANTHROPIC_API_KEY=
```

## Git Conventions

- Branch: `main` for production
- Feature branches: `feature/description` or `fix/description`
- Commit messages: imperative tense, describe the why not the what
- Deploy triggers on push to `main`
