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
  bottom-sheet, used for lighter-weight confirmations). It slides in
  from the right (a 300ms transform transition) rather than popping in,
  and stays mounted for one extra tick after closing so the close also
  slides out instead of vanishing instantly — don't reintroduce a bare
  `if (!open) return null` early-out, that skips the closing animation.
  Its header is also swipeable: dragging it rightward (the direction the
  drawer slides out) past a threshold and releasing dismisses it, the
  same as tapping ✕ — this lives on the shared component, so every
  drawer in the app gets it automatically; don't build a page-local
  swipe-to-close.

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
`MediaField` itself if the pattern needs to change. A spot that wants a
single field covering either media type (e.g. the Schedule swipe-to-post
composer, see `QuickPostDrawer` in `Schedule.tsx`) passes `kind="image"
allowVideo` instead of adding a second field — the action sheet gains a
"🎥 Record video" capture option alongside "Take photo"/"Choose from
library", and the preview auto-detects video vs. image from the stored
URL's extension (`isVideoUrl`, also exported from `ui.tsx` — use it
anywhere else an `image_url`-shaped field might now hold a video, e.g.
`PostCard`'s feed rendering). Anywhere a person's photo is displayed
instead of edited (list rows, read-only profile views), use `Avatar` — it
renders the photo if `photo_url` is set, otherwise a circle with the
name's initials; never leave a person-shaped field blank when there's no
photo.

Not every capture flow is a form field, though — the Schedule List view's
shallow-right swipe (`CaptureSheet` in `Schedule.tsx`) takes a photo/video
and attaches it straight to the event (`nk_event_media`, browsable via
the deep-right swipe's `GalleryDrawer`), with no title/body/post
involved. For a spot like that, reuse `uploadFile` (also exported from
`ui.tsx`) directly against your own action sheet rather than wrapping
`MediaField` around a value that doesn't actually have a form field to
live in.

## UI convention: delete confirmation

`DeleteButton` always confirms before deleting — it's self-contained, so
this is automatic wherever you use the component: tapping it opens a
`Modal` ("Delete {itemLabel}? This can't be undone.") with Cancel and
Delete actions, and only the Delete tap calls your `onClick` handler.
Always pass `itemLabel` (the record's name) so the confirmation is
specific. Never wire a delete straight to an icon tap, and never build a
second confirmation mechanism — extend `DeleteButton` itself if the
pattern needs to change. For a spot that needs an icon-only trigger (no
text/border pill — e.g. a social post's top-right corner, see `PostCard`
in `AthleteSocialProfile.tsx`), pass `iconOnly` rather than rolling a
separate button; the confirm `Modal` behavior is unchanged either way.

For an entity that supports **archiving** (e.g. Training modules), the
list row's icon-only action is an archive/unarchive toggle (📦 to
archive, 📤 to unarchive) instead of an icon-only delete — archiving is
reversible and non-destructive, so it needs no confirmation, unlike
`DeleteButton`. Actual deletion moves entirely into the entity's detail
`Drawer`, as a full `DeleteButton` (not `iconOnly`) at the bottom, same
placement as any other detail-drawer delete. This still honors "never
inline on the list row" for the one truly destructive action; only the
reversible one gets a row-level shortcut.

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

## UI convention: type filter + grouping drawer

Beyond the plain search box above, a list with a natural "type" to slice
by (Schedule's event types; Training modules' module types) adds a
funnel-icon button in the header (next to `AddButton`, badge showing the
active-filter count) that opens a `Drawer` ("Filter <list>"):

- Any view-option checkboxes first (Schedule: "Hide completed"; Training
  modules: "Show archived", "Group by type") — plain `<label>` rows with
  a checkbox, `bg-stone-50` background.
- A "Clear type filters" button, shown only once at least one type is
  selected.
- A grid of icon tiles, one per type (icon + name), tap to toggle —
  multi-select, not a `<select>` dropdown. Either layout is fine: a
  vertical icon-over-label square (`grid-cols-3`, Schedule's own filter)
  or a horizontal icon-left pill (`grid-cols-2`, Training modules) — pick
  whichever reads better for the list's type names. Either way, the
  selected tile fills with the type's own `bg_color` and its icon circle
  turns translucent white; an unselected tile stays plain white.
- Grouping toggles (e.g. "Group by type") aren't filters themselves —
  they don't count toward the header badge, only view options and type
  selections do — but they belong in the same drawer since they're still
  "how do I want to look at this list" controls. When grouping is on, the
  list renders as labeled sections instead of one flat list, keyed by
  type with an explicit "No type" bucket for records that don't have
  one. Each section header is an `<h2>` with the same classes as
  Schedule's own date-group headers (`text-sm font-semibold
  text-stone-500`) so the global `h2` rule (Oswald, uppercase, tracked)
  gives both an identical look. If rows elsewhere show a per-row type
  icon (see Training modules below), hide it while grouped — the section
  header's own icon already carries that context, so repeating it on
  every row underneath is redundant.
- Where it's worth surviving a refresh (Training modules does this;
  Schedule's own filter drawer doesn't yet), the drawer's state (selected
  types plus every view-option checkbox) persists to `localStorage` and
  reloads on mount — the plain search box above is deliberately excluded
  even then, since that's a one-off lookup rather than a saved view.

Reuse this shape rather than inventing a new filter UI per list; each
page keeps its own small funnel-icon SVG (matching the rest of the app's
per-page icon conventions) rather than sharing one component.

Every type-with-icon-and-color library (Schedule's `admin/EventTypes.tsx`,
Training modules' `admin/TrainingModuleTypes.tsx`) manages its own
`bg_color` the same way: an "Icon" + "Color" field pair side by side
(`grid-cols-2`) in both the create form and the edit drawer, `<input
type="color">` for the color, and the list row itself shows the color as
a filled circle behind the icon so admins can preview their choice
without leaving the list. This `bg_color` is what feeds both the filter
tiles above and any per-row icon segment on the entity's own list (e.g.
Training modules' row icon, below).

## UI convention: nested line items in a drawer

When a record has its own dated sub-entries (e.g. an event's day-by-day
itinerary — see `ItemsSection` in `app/src/pages/Schedule.tsx`), manage
them **inline within the same detail drawer**, not a second stacked
`Drawer` — two full-screen drawers stacked on mobile is disorienting.
Each sub-entry is a row that expands in place when tapped (accordion
style) to reveal its fields (same auto-save + `DeleteButton` pattern as
any other record); adding a new one reveals an inline form below the
list rather than opening anything else.

## UI convention: combined date+time picker

Wherever a record has a single date and time that get edited together
(an itinerary item's start, the Training tab's quick-add composer), use
`DateTimeField` (`app/src/components/ui.tsx`) instead of two side-by-side
`<input type="date">`/`<input type="time">` fields. It renders one
tappable field showing both values together ("Sat, Jul 25, 2026 ·
14:30") that opens a `Modal` with both the Date input and the Time input
(each with its own native picker — a calendar for date, a clock for
time) stacked and visible at once, so the user can set either or both
without switching between separate screens. Where a field only ever has
a time with no paired date (e.g. an itinerary item's "End time", which
shares the item's own date), leave it as a plain time `<input>` —
`DateTimeField` is for pairs, not a blanket replacement for every date or
time input.

Where a record has a *start and end* date+time together (an event's
start/end), use `DateTimeRangeField` instead — same idea, but its two
trigger fields (Start, End) share one `Modal` showing both pairs side by
side as two columns (Start's Date+Time, then End's Date+Time, separated
by a vertical divider, then one Done button), so setting the whole range
doesn't mean closing one picker and reopening another.

Don't wrap `DateTimeField`/`DateTimeRangeField` themselves in `Field` (or
any other `<label>` wrapper): a `<label>` containing more than one
interactive control has a tendency to re-fire its implicit
click-forwarding onto the *first* control inside it whenever another
control inside the same label is clicked (observed here as clicking the
modal's "Done" button also re-triggering the trigger button's `onClick`,
reopening the modal it had just closed). Both components render their
own label `<span>`s instead of using `Field` for exactly this reason.

## UI convention: view/edit toggle for a self-service page

A full-page self-service view that mixes several distinct pieces (e.g.
the athlete's own `/profile` — the social-profile hero/bio/toggle from
`AthleteSocialProfile.tsx` plus `Profile.tsx`'s own "Account" form) can
default to **view-only** rather than always-editable, when there's more
read-only info to show at a glance than there is to edit. See
`AthleteSocialProfile`/`Profile.tsx` for the reference implementation:

- A single `editing` boolean lives in the top-level page component (not
  in any sub-component), passed down as `editing`/`onToggleEdit` props to
  whichever pieces need to react to it — this is what lets one icon gate
  multiple, structurally separate blocks of UI at once.
- The toggle itself is a circular icon button (✏️ / ✓ while editing)
  overlaid top-right on the page's hero image (`absolute right-4 top-4`,
  `bg-black/40 backdrop-blur`), not a text button or a separate row.
  `aria-label` swaps between `"Edit profile"` / `"Done editing"`.
- While not editing, fields that stay visible in view mode (e.g. the
  bio, a public/private status line) render as styled read-only text
  (reuse `ReadOnlyField` from `AthleteSelfProfile.tsx` for label/value
  rows) rather than a disabled input. Whole sections that are pure
  detail/edit affordances with nothing worth showing at a glance (e.g.
  `Profile.tsx`'s "My profile" card and "Account" form) are instead
  omitted entirely while not editing, not rendered read-only — only
  reappear, fully editable, once `editing` is true.
- This is opt-in per page/role, not a new default for every form in the
  app — most self-service and admin editors (`StaffSelfProfile`, the
  entity list+drawer pattern) stay always-editable; only add the toggle
  where a page is otherwise cluttered with more always-visible editable
  fields than a glance-first view needs.

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
  initials, links to `/profile`), Schedule, Athletes, More — except the
  `athlete` role, which gets Training (read-only `admin/TrainingModules.tsx`)
  instead of Athletes, since a plain athlete has no access to the athlete
  directory anyway (see `App.tsx`'s `ATHLETE_TABS`/`DEFAULT_TABS`). Keep
  the tab bar to the handful of most-used destinations for the active
  role — anything else (Grades, admin pages) lives under More as a tile
  instead of getting its own tab.
- The profile switcher (when an account has 2+ role identities, or
  multiple profiles of the same type) lives on `Profile.tsx`, reached via
  the bottom nav's Profile tab — not on `More.tsx`. A single-profile
  account just sees the plain edit form there; don't re-add a second
  switcher UI elsewhere.
