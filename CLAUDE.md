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
Coaches, and any future one — Classes, Grades, Competitions, etc.) follows
the same pattern. Don't invent a new layout per page; extend this one.

- **List rows show only the name** (or, where there's no guaranteed name,
  email + a status `Badge`) — nothing else. Rows are full-width tappable
  buttons, minimum 44px tall.
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
`AddButton`, `DeleteButton`, `Field`, `Badge`, `Spinner`, `Modal`, `Toast`.
Look at `app/src/pages/admin/Clubs.tsx` for the fullest example (it also
has the sub-pattern for many-to-many membership pickers — see
`MemberEditor` in that file).

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

## Other conventions

- Backend routes: one Express Router per resource in `api/src/routes/`,
  `asyncHandler`-wrapped, `authorize(...roles)`-gated, `COALESCE`-based
  partial updates for `PATCH`. See `api/src/routes/adminUsers.js` as the
  reference implementation.
- Migrations are a flat, append-only array of idempotent SQL statements
  in `api/scripts/migrate.js` (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN
  IF NOT EXISTS`) — never edit a past entry, only append new ones.
- Mobile-first, 44px minimum tap targets, bottom tab nav — see the
  "Design Principles" section of `docs/ARCHITECTURE.md`.
