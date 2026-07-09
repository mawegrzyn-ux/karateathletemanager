const pool = require("../db/pool");

async function isClubAdmin(user, clubId) {
  if (user.is_admin) return true;
  if (!user.coach_id) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM nk_coach_clubs
     WHERE club_id = $1 AND coach_id = $2 AND is_admin = TRUE`,
    [clubId, user.coach_id]
  );
  return rows.length > 0;
}

async function isAssociationAdmin(user, associationId) {
  if (user.is_admin) return true;
  if (!user.coach_id) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM nk_coach_associations
     WHERE association_id = $1 AND coach_id = $2`,
    [associationId, user.coach_id]
  );
  return rows.length > 0;
}

async function isEventEditor(user, eventId) {
  if (user.is_admin) return true;

  if (user.role === "athlete" && user.athlete_id) {
    const { rows } = await pool.query(
      `SELECT 1 FROM nk_event_athletes
       WHERE event_id = $1 AND athlete_id = $2`,
      [eventId, user.athlete_id]
    );
    return rows.length > 0;
  }

  if (user.role === "coach" && user.coach_id) {
    const { rows } = await pool.query(
      `SELECT 1 FROM nk_event_athletes ea
       JOIN nk_athlete_clubs ac ON ac.athlete_id = ea.athlete_id
       JOIN nk_coach_clubs cc ON cc.club_id = ac.club_id
       WHERE ea.event_id = $1 AND cc.coach_id = $2`,
      [eventId, user.coach_id]
    );
    return rows.length > 0;
  }

  return false;
}

module.exports = { isClubAdmin, isAssociationAdmin, isEventEditor };
