// Shared SELECT/RETURNING column list for nk_users, used everywhere a
// user row is read or written back to the client. athlete_name/coach_name
// reflect whichever profile is currently active (nk_users.athlete_id/
// coach_id), used to label the "acting as" banner in the app header.
// athlete_photo_url/coach_photo_url/referee_photo_url are that profile's
// own photo (distinct from nk_users.photo_url, the account's own) - used
// for the bottom-nav Profile tab's avatar so it shows the athlete/coach/
// referee's actual photo rather than falling back to initials.
// wants_athlete/date_of_birth are exposed so the client can tell a
// pending join-link registrant is athlete-only before their role/
// athlete_id are set (e.g. to hide the "link a child" section) and so
// they can stage their DOB ahead of admin approval.
// nav_tabs is the user's own bottom-nav tab customization (NULL = role
// default). club_forced_nav_tabs resolves any club the active athlete
// profile belongs to that has set a forced menu for all its athletes
// (nk_clubs.forced_nav_tabs) - the client treats this as taking priority
// over the user's own nav_tabs when non-null. Only ever populated for an
// active athlete_id (a coach/admin/etc. viewing isn't subject to a
// club's athlete-menu override), and arbitrarily picks the first such
// club if the athlete belongs to more than one with an override set.
const USER_SELECT_FIELDS = `
  id, email, role, status, is_admin, athlete_id, coach_id, referee_id,
  first_name, last_name, phone, photo_url, date_of_birth, wants_athlete,
  nav_tabs,
  (SELECT first_name || ' ' || last_name FROM nk_athletes WHERE id = nk_users.athlete_id) AS athlete_name,
  (SELECT first_name || ' ' || last_name FROM nk_coaches WHERE id = nk_users.coach_id) AS coach_name,
  (SELECT first_name || ' ' || last_name FROM nk_referees WHERE id = nk_users.referee_id) AS referee_name,
  (SELECT photo_url FROM nk_athletes WHERE id = nk_users.athlete_id) AS athlete_photo_url,
  (SELECT photo_url FROM nk_coaches WHERE id = nk_users.coach_id) AS coach_photo_url,
  (SELECT photo_url FROM nk_referees WHERE id = nk_users.referee_id) AS referee_photo_url,
  (SELECT c.forced_nav_tabs FROM nk_athlete_clubs ac JOIN nk_clubs c ON c.id = ac.club_id
   WHERE ac.athlete_id = nk_users.athlete_id AND c.forced_nav_tabs IS NOT NULL LIMIT 1) AS club_forced_nav_tabs,
  EXISTS(
    SELECT 1 FROM nk_parent_athletes WHERE user_id = nk_users.id
  ) AS is_parent
`;

module.exports = { USER_SELECT_FIELDS };
