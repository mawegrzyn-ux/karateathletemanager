const crypto = require("crypto");
const pool = require("../db/pool");

const INVITE_TTL_INTERVAL = "14 days";

async function getInvite(profileType, profileId) {
  const { rows } = await pool.query(
    `SELECT pi.email, pi.club_id, pi.token, pi.expires_at, c.name AS club_name
     FROM nk_profile_invites pi
     LEFT JOIN nk_clubs c ON c.id = pi.club_id
     WHERE pi.profile_type = $1 AND pi.profile_id = $2 AND pi.expires_at > NOW()`,
    [profileType, profileId]
  );
  return rows[0] ?? null;
}

// Generating a new invite for a profile replaces any still-pending one for
// that same profile (regardless of which email it was for) - same
// "regenerate replaces" convention as nk_clubs.join_token.
async function createInvite(profileType, profileId, email, clubId) {
  const token = crypto.randomBytes(24).toString("hex");
  const { rows } = await pool.query(
    `INSERT INTO nk_profile_invites (profile_type, profile_id, email, club_id, token, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '${INVITE_TTL_INTERVAL}')
     ON CONFLICT (profile_type, profile_id) DO UPDATE SET
       email = EXCLUDED.email,
       club_id = EXCLUDED.club_id,
       token = EXCLUDED.token,
       expires_at = EXCLUDED.expires_at
     RETURNING email, club_id, token, expires_at`,
    [profileType, profileId, email, clubId, token]
  );
  const invite = rows[0];
  if (clubId) {
    const { rows: clubRows } = await pool.query(
      `SELECT name FROM nk_clubs WHERE id = $1`,
      [clubId]
    );
    invite.club_name = clubRows[0]?.name ?? null;
  } else {
    invite.club_name = null;
  }
  return invite;
}

async function deleteInvite(profileType, profileId) {
  await pool.query(
    `DELETE FROM nk_profile_invites WHERE profile_type = $1 AND profile_id = $2`,
    [profileType, profileId]
  );
}

async function findInviteByToken(token) {
  const { rows } = await pool.query(
    `SELECT profile_type, profile_id, email, club_id FROM nk_profile_invites
     WHERE token = $1 AND expires_at > NOW()`,
    [token]
  );
  return rows[0] ?? null;
}

async function consumeInviteToken(client, token) {
  await client.query(`DELETE FROM nk_profile_invites WHERE token = $1`, [token]);
}

module.exports = {
  getInvite,
  createInvite,
  deleteInvite,
  findInviteByToken,
  consumeInviteToken,
};
