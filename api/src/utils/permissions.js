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

async function coachSharedAthleteIds(coachId, athleteIds) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ac.athlete_id
     FROM nk_athlete_clubs ac
     JOIN nk_coach_clubs cc ON cc.club_id = ac.club_id
     WHERE cc.coach_id = $1 AND ac.athlete_id = ANY($2::int[])`,
    [coachId, athleteIds]
  );
  return new Set(rows.map((r) => r.athlete_id));
}

// Resolves which athlete_ids `user` is allowed to act on, or throws a
// {status, message} shaped error if the request is invalid/forbidden.
// Shared by events.js's create/roster routes and trainingPrograms.js's
// enroll route, so a coach/admin bulk-assigning a squad and an athlete
// self-enrolling go through the exact same branching.
//
// An explicit `requested` list, when given, always wins (subject to the
// caller's own permission check below) - this is what lets an admin or
// coach pick OTHER athletes, e.g. to bulk-enroll a squad into a training
// programme. With no explicit list, this falls back to "myself," but
// only when the caller currently has an athlete identity to fall back to
// (their active role is 'athlete') - this covers both a plain athlete
// AND an admin/coach who's presently acting as their own athlete profile
// (e.g. self-enrolling), without changing behavior for an admin/coach
// with no active athlete identity, who still must specify who they mean.
async function resolveAthleteIds(user, requested) {
  const hasRequested = Array.isArray(requested) && requested.length > 0;

  if (hasRequested) {
    if (user.is_admin) return requested;

    if (user.role === "coach" && user.coach_id) {
      const shared = await coachSharedAthleteIds(user.coach_id, requested);
      const notShared = requested.filter((id) => !shared.has(id));
      if (notShared.length > 0) {
        throw {
          status: 403,
          message: "You don't share a club with one or more of those athletes",
        };
      }
      return requested;
    }

    // A plain athlete caller can't act on anyone but themselves, no
    // matter what was requested - matches the previous behavior of
    // ignoring `requested` entirely for this role.
    if (user.role === "athlete") {
      return [user.athlete_id];
    }

    throw { status: 403, message: "Forbidden" };
  }

  if (user.role === "athlete" && user.athlete_id) {
    return [user.athlete_id];
  }
  if (user.is_admin || (user.role === "coach" && user.coach_id)) {
    throw { status: 400, message: "athlete_ids is required" };
  }

  throw { status: 403, message: "Forbidden" };
}

// Same three-way shape as isEventEditor (admin / the athlete themselves /
// a coach sharing a club with them), but scoped to one training-program
// enrollment's athlete_id rather than an event's roster - isEventEditor
// itself is single-event-scoped and doesn't apply here.
async function isEnrollmentManager(user, enrollment) {
  if (user.is_admin) return true;
  if (user.role === "athlete") return user.athlete_id === enrollment.athlete_id;
  if (user.role === "coach" && user.coach_id) {
    const shared = await coachSharedAthleteIds(user.coach_id, [enrollment.athlete_id]);
    return shared.has(enrollment.athlete_id);
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
  coachSharedAthleteIds,
  resolveAthleteIds,
  isEnrollmentManager,
  canManageProfileInvite,
};
