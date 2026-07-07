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

module.exports = { isClubAdmin, isAssociationAdmin };
