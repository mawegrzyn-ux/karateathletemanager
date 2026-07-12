// Shared SELECT/RETURNING column list for nk_users, used everywhere a
// user row is read or written back to the client. athlete_name/coach_name
// reflect whichever profile is currently active (nk_users.athlete_id/
// coach_id), used to label the "acting as" banner in the app header.
// wants_athlete/date_of_birth are exposed so the client can tell a
// pending join-link registrant is athlete-only before their role/
// athlete_id are set (e.g. to hide the "link a child" section) and so
// they can stage their DOB ahead of admin approval.
const USER_SELECT_FIELDS = `
  id, email, role, status, is_admin, athlete_id, coach_id, referee_id,
  first_name, last_name, phone, photo_url, date_of_birth, wants_athlete,
  (SELECT first_name || ' ' || last_name FROM nk_athletes WHERE id = nk_users.athlete_id) AS athlete_name,
  (SELECT first_name || ' ' || last_name FROM nk_coaches WHERE id = nk_users.coach_id) AS coach_name,
  (SELECT first_name || ' ' || last_name FROM nk_referees WHERE id = nk_users.referee_id) AS referee_name,
  EXISTS(
    SELECT 1 FROM nk_parent_athletes WHERE user_id = nk_users.id
  ) AS is_parent
`;

module.exports = { USER_SELECT_FIELDS };
