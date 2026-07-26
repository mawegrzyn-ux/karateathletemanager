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

// Who can generate a profile-invite link for a given athlete/coach/referee.
// Referees have no club-membership concept anywhere else in the app, so
// there's no club-admin angle for them - only a global admin can invite
// one. For athletes/coaches, a club admin can invite either an existing
// member of a club they administer, or (since the whole point of an
// invite can be onboarding someone brand new) anyone at all as long as
// the invite's own target club is one they administer.
async function canManageProfileInvite(user, profileType, profileId, clubId) {
  if (user.is_admin) return true;
  if (profileType === "referee" || !user.coach_id) return false;

  const membershipTable =
    profileType === "athlete" ? "nk_athlete_clubs" : "nk_coach_clubs";
  const idColumn = profileType === "athlete" ? "athlete_id" : "coach_id";
  const { rows } = await pool.query(
    `SELECT 1 FROM ${membershipTable} pc
     JOIN nk_coach_clubs cc ON cc.club_id = pc.club_id
     WHERE pc.${idColumn} = $1 AND cc.coach_id = $2 AND cc.is_admin = TRUE`,
    [profileId, user.coach_id]
  );
  if (rows.length > 0) return true;

  return clubId ? isClubAdmin(user, clubId) : false;
}

module.exports = {
  isClubAdmin,
  isAssociationAdmin,
  isEventEditor,
  canManageProfileInvite,
};
