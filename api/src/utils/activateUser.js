async function activateUser(client, user) {
  let athleteId = user.athlete_id;
  let coachId = user.coach_id;

  if (user.wants_athlete && !athleteId) {
    const { rows } = await client.query(
      `INSERT INTO nk_athletes (first_name, last_name, email, phone)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [user.first_name || "", user.last_name || "", user.email, user.phone]
    );
    athleteId = rows[0].id;
    if (user.requested_club_id) {
      await client.query(
        `INSERT INTO nk_athlete_clubs (athlete_id, club_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [athleteId, user.requested_club_id]
      );
    }
  }

  if (user.wants_coach && !coachId) {
    const { rows } = await client.query(
      `INSERT INTO nk_coaches (first_name, last_name, email, phone)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [user.first_name || "", user.last_name || "", user.email, user.phone]
    );
    coachId = rows[0].id;
    if (user.requested_club_id) {
      await client.query(
        `INSERT INTO nk_coach_clubs (coach_id, club_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [coachId, user.requested_club_id]
      );
    }
  }

  const autoRole = coachId ? "coach" : athleteId ? "athlete" : null;

  const { rows } = await client.query(
    `UPDATE nk_users SET
       athlete_id = COALESCE(athlete_id, $1),
       coach_id   = COALESCE(coach_id, $2),
       role       = COALESCE(role, $3),
       updated_at = NOW()
     WHERE id = $4
     RETURNING id, email, role, status, athlete_id, coach_id,
               first_name, last_name, phone`,
    [athleteId, coachId, autoRole, user.id]
  );

  return rows[0];
}

module.exports = { activateUser };
