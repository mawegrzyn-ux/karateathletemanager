# CLAUDE.md

Guidance for Claude Code (or any future contributor) working in this repo.

## Project

Mobile-first web portal for managing karate athletes — schedules,
attendance, grades/belt progression, competition records. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture,
domain model, and deployment reference, and [`README.md`](README.md) for
local dev commands.

## UI convention: list + drawer

Every entity-management page (Users, Associations, Clubs, Athletes,
Coaches, Schedule, Training modules, Katas, Karate styles, and any
future one — Grades, Competitions, etc.) follows the same pattern.
Don't invent a new layout per page; extend this one.

- **List rows show only the name** (or, where there's no guaranteed name,
  email + a status `Badge`) — nothing else. Rows are full-width tappable
  buttons, minimum 44px tall. Entities with a `photo_url` (athletes,
  coaches) prefix the name with an `Avatar` (`ui.tsx`) — the photo, or the
  name's initials if none is set — this is how the name is presented, not
  extra info on the row.
- **Adding a record**: a `+` icon (`AddButton`) in the top-right of the
  page header opens a `Drawer` with a blank form containing *every* field
  the entity supports. Submitting `POST`s, appends the new record to the
  list, and closes the drawer. (Skip this entirely for entities with no
  create flow — e.g. `Users`, since accounts self-register.)
- **Viewing/editing a record**: tapping a list row opens the same kind of
  `Drawer`, pre-filled with that record's current values. Fields use the
  existing `onBlur`-triggers-`PATCH` pattern (or `onChange` for
  `<select>`s/checkboxes) — no separate "Save" button, no dirty-state
  tracking. Each field saves itself the moment it's edited.
- **Deleting a record**: a `DeleteButton` (🗑 icon) at the bottom of the
  detail drawer. Never a bare text "Delete" button, never inline on the
  list row.
- **The `Drawer`** (`app/src/components/ui.tsx`) overtakes the full
  screen on mobile and becomes a right-side panel (`sm:` breakpoint) on
  wider viewports. It's a distinct component from `Modal` (which is a
  bottom-sheet, used for lighter-weight confirmations).

Reusable pieces, all in `app/src/components/ui.tsx`: `Drawer`,
`AddButton`, `DeleteButton`, `Field`, `Badge`, `Spinner`, `Modal`, `Toast`,
`Avatar`, `MediaField`. Look at `app/src/pages/admin/Clubs.tsx` for the
fullest example (it also has the sub-pattern for many-to-many membership
pickers — see `MemberEditor` in that file).

## UI convention: photo/video upload

Any field that holds a photo or video (athlete/coach `photo_url`, a
training-module exercise's `video_url`/`image_url` — see
`admin/TrainingModules.tsx`) uses the shared `MediaField` (`ui.tsx`,
`kind: "image" | "video"`): a text input to paste a link, an "Upload"
button that posts the chosen file to `POST /api/uploads`, and a live
preview (YouTube links embed a player; other video/image URLs render a
native `<video>`/`<img>`). Don't build a page-local copy of this — extend
`MediaField` itself if the pattern needs to change. Anywhere a person's
photo is displayed instead of edited (list rows, read-only profile
views), use `Avatar` — it renders the photo if `photo_url` is set,
otherwise a circle with the name's initials; never leave a person-shaped
field blank when there's no photo.

## UI convention: delete confirmation

`DeleteButton` always confirms before deleting — it's self-contained, so
this is automatic wherever you use the component: tapping it opens a
`Modal` ("Delete {itemLabel}? This can't be undone.") with Cancel and
Delete actions, and only the Delete tap calls your `onClick` handler.
Always pass `itemLabel` (the record's name) so the confirmation is
specific. Never wire a delete straight to an icon tap, and never build a
second confirmation mechanism — extend `DeleteButton` itself if the
pattern needs to change.

## UI convention: search-based membership pickers

Any many-to-many assignment UI (e.g. the athlete/coach picker on a club's
detail drawer — see `MemberEditor` in `app/src/pages/admin/Clubs.tsx`) is
a single search box over the full option list, not a `<select>` dropdown
and not a separate "current members" list:

- A text input filters the option list by name as you type (substring,
  case-insensitive); an empty query shows everyone.
- Every matching person appears in one scrollable result list. Already-
  assigned people are flagged in place ("✓ Added", tap to remove) rather
  than hidden or edited through a different control; not-yet-assigned
  people show "+ Add" (tap to add).
- Same pattern for a **single-select** relationship (e.g. a club's one
  optional association — see `AssociationPicker` in the same file):
  identical search box + result list, but the currently-selected row
  shows "✓ Selected" instead of "Added", and selecting a different row
  replaces the selection rather than adding to it. Never use a `<select>`
  dropdown for this kind of assignment, single- or multi-select.

## UI convention: list filter search

Every top-level entity list (Associations, Clubs, Athletes, Coaches, and
any future one) gets a plain search `<input>` directly under the page
header, above the list — no submit button, filters instantly as you type
(substring, case-insensitive, empty query shows everyone). This is a
simpler sibling of the membership-picker search above: same box/feel, but
it just filters the page's own already-loaded list client-side rather
than adding/removing an assignment. `Athletes.tsx` is the one exception —
it round-trips to the server (`GET /athletes?q=`) instead of filtering
client-side, since athlete rosters can be large; new list pages should
default to the simple client-side filter unless there's a similar reason
not to.

## UI convention: nested line items in a drawer

When a record has its own dated sub-entries (e.g. an event's day-by-day
itinerary — see `ItemsSection` in `app/src/pages/Schedule.tsx`), manage
them **inline within the same detail drawer**, not a second stacked
`Drawer` — two full-screen drawers stacked on mobile is disorienting.
Each sub-entry is a row that expands in place when tapped (accordion
style) to reveal its fields (same auto-save + `DeleteButton` pattern as
any other record); adding a new one reveals an inline form below the
list rather than opening anything else.

## Other conventions

- Backend routes: one Express Router per resource in `api/src/routes/`,
  `asyncHandler`-wrapped, `authorize(...roles)`-gated. `PATCH` handlers
  build their `SET` clause from whichever keys are actually present in
  the request body (see `api/src/routes/adminUsers.js`) rather than
  `COALESCE`, so an explicit `null` (e.g. "unlink this") is applied
  instead of being indistinguishable from an omitted field.
- Migrations are a flat, append-only array of idempotent SQL statements
  in `api/scripts/migrate.js` (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN
  IF NOT EXISTS`) — never edit a past entry, only append new ones.
- Mobile-first, 44px minimum tap targets, bottom tab nav — see the
  "Design Principles" section of `docs/ARCHITECTURE.md`.
- Bottom nav tabs: Profile (an `Avatar` of the logged-in user's own name
  initials, links to `/profile`), Schedule, Athletes, More. Keep the tab
  bar to the handful of most-used destinations — anything else (Grades,
  admin pages) lives under More as a tile instead of getting its own tab.
