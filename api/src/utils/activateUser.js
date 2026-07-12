async function activateUser(client, user) {
  let athleteId = user.athlete_id;
  let coachId = user.coach_id;
  let refereeId = user.referee_id;

  if (user.wants_athlete && !athleteId) {
    const { rows } = await client.query(
      `INSERT INTO nk_athletes (first_name, last_name, email, phone, photo_url, date_of_birth)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        user.first_name || "",
        user.last_name || "",
        user.email,
        user.phone,
        user.photo_url,
        user.date_of_birth,
      ]
    );
    athleteId = rows[0].id;
    await client.query(
      `INSERT INTO nk_user_athletes (user_id, athlete_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, athleteId]
    );
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
    await client.query(
      `INSERT INTO nk_user_coaches (user_id, coach_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, coachId]
    );
    if (user.requested_club_id) {
      await client.query(
        `INSERT INTO nk_coach_clubs (coach_id, club_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [coachId, user.requested_club_id]
      );
    }
  }

  if (user.wants_referee && !refereeId) {
    const { rows } = await client.query(
      `INSERT INTO nk_referees (first_name, last_name, email, phone)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [user.first_name || "", user.last_name || "", user.email, user.phone]
    );
    refereeId = rows[0].id;
    await client.query(
      `INSERT INTO nk_user_referees (user_id, referee_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, refereeId]
    );
  }

  const autoRole = coachId
    ? "coach"
    : athleteId
      ? "athlete"
      : refereeId
        ? "referee"
        : null;

  const { rows } = await client.query(
    `UPDATE nk_users SET
       athlete_id = COALESCE(athlete_id, $1),
       coach_id   = COALESCE(coach_id, $2),
       referee_id = COALESCE(referee_id, $3),
       role       = COALESCE(role, $4),
       updated_at = NOW()
     WHERE id = $5
     RETURNING id, email, role, status, is_admin, athlete_id, coach_id, referee_id,
               first_name, last_name, phone`,
    [athleteId, coachId, refereeId, autoRole, user.id]
  );

  return rows[0];
}

module.exports = { activateUser };
