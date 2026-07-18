const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

const FIELDS = `id, first_name, last_name, date_of_birth, email, phone,
                emergency_name, emergency_phone, grade_id, join_date, photo_url,
                medical_notes, is_active, created_at`;

router.use(authorize());

router.get(
  "/",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin && req.user.role !== "coach") {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { q } = req.query;
    const { rows } = q
      ? await pool.query(
          `SELECT ${FIELDS} FROM nk_athletes
           WHERE first_name ILIKE $1 OR last_name ILIKE $1
           ORDER BY last_name, first_name`,
          [`%${q}%`]
        )
      : await pool.query(
          `SELECT ${FIELDS} FROM nk_athletes ORDER BY last_name, first_name`
        );
    res.json({ athletes: rows });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin && req.user.role !== "coach") {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const {
      first_name,
      last_name,
      date_of_birth,
      email,
      phone,
      emergency_name,
      emergency_phone,
      grade_id,
      join_date,
      photo_url,
      medical_notes,
      is_active,
    } = req.body ?? {};

    if (typeof first_name !== "string" || typeof last_name !== "string") {
      return res
        .status(400)
        .json({ error: { message: "first_name and last_name are required" } });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO nk_athletes
           (first_name, last_name, date_of_birth, email, phone,
            emergency_name, emergency_phone, grade_id, join_date, photo_url, medical_notes, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, CURRENT_DATE), $10, $11, COALESCE($12, TRUE))
         RETURNING ${FIELDS}`,
        [
          first_name,
          last_name,
          date_of_birth,
          email,
          phone,
          emergency_name,
          emergency_phone,
          grade_id ?? null,
          join_date,
          photo_url,
          medical_notes,
          is_active,
        ]
      );

      res.status(201).json({ athlete: rows[0] });
    } catch (err) {
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "That grade does not exist" } });
      }
      throw err;
    }
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "athlete" &&
      req.user.athlete_id === Number(req.params.id);
    if (!req.user.is_admin && req.user.role !== "coach" && !isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM nk_athletes WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Athlete not found" } });
    }
    res.json({ athlete: rows[0] });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin && req.user.role !== "coach") {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const body = req.body ?? {};
    const fields = {
      first_name: body.first_name,
      last_name: body.last_name,
      date_of_birth: body.date_of_birth,
      email: body.email,
      phone: body.phone,
      emergency_name: body.emergency_name,
      emergency_phone: body.emergency_phone,
      grade_id: body.grade_id,
      join_date: body.join_date,
      photo_url: body.photo_url,
      medical_notes: body.medical_notes,
      is_active: body.is_active,
    };
    const setClauses = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key in body) {
        values.push(value);
        setClauses.push(`${key} = $${values.length}`);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: { message: "No fields to update" } });
    }

    values.push(req.params.id);

    try {
      const { rows } = await pool.query(
        `UPDATE nk_athletes SET ${setClauses.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length}
         RETURNING ${FIELDS}`,
        values
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: { message: "Athlete not found" } });
      }
      res.json({ athlete: rows[0] });
    } catch (err) {
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "That grade does not exist" } });
      }
      throw err;
    }
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rowCount } = await pool.query(
      `DELETE FROM nk_athletes WHERE id = $1`,
      [req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Athlete not found" } });
    }
    res.status(204).end();
  })
);

router.post(
  "/:id/generate-pin",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "athlete" &&
      req.user.athlete_id === Number(req.params.id);
    if (!req.user.is_admin && req.user.role !== "coach" && !isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    let pin;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = String(Math.floor(Math.random() * 1000000)).padStart(
        6,
        "0"
      );
      const { rows } = await pool.query(
        `SELECT 1 FROM nk_athletes
         WHERE link_pin = $1 AND link_pin_expires_at > NOW()`,
        [candidate]
      );
      if (rows.length === 0) {
        pin = candidate;
        break;
      }
    }
    if (!pin) {
      return res
        .status(500)
        .json({ error: { message: "Could not generate a PIN, try again" } });
    }

    const { rows } = await pool.query(
      `UPDATE nk_athletes SET
         link_pin = $1,
         link_pin_expires_at = NOW() + INTERVAL '1 hour'
       WHERE id = $2
       RETURNING link_pin, link_pin_expires_at`,
      [pin, req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Athlete not found" } });
    }
    res.json({
      pin: rows[0].link_pin,
      expires_at: rows[0].link_pin_expires_at,
    });
  })
);

router.get(
  "/:id/styles",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "athlete" &&
      req.user.athlete_id === Number(req.params.id);
    if (!req.user.is_admin && req.user.role !== "coach" && !isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows } = await pool.query(
      `SELECT style_id FROM nk_athlete_styles WHERE athlete_id = $1 ORDER BY style_id`,
      [req.params.id]
    );
    res.json({ styleIds: rows.map((r) => r.style_id) });
  })
);

router.put(
  "/:id/styles",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin && req.user.role !== "coach") {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { styleIds } = req.body ?? {};
    if (!Array.isArray(styleIds)) {
      return res
        .status(400)
        .json({ error: { message: "styleIds must be an array" } });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM nk_athlete_styles WHERE athlete_id = $1`,
        [req.params.id]
      );
      for (const styleId of styleIds) {
        await client.query(
          `INSERT INTO nk_athlete_styles (athlete_id, style_id) VALUES ($1, $2)`,
          [req.params.id, styleId]
        );
      }
      await client.query("COMMIT");
      res.json({ styleIds });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.code === "23503") {
        return res
          .status(400)
          .json({ error: { message: "One or more style IDs do not exist" } });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

const GRADING_FIELDS = `id, athlete_id, grade_id, event_id, recorded_by_coach_id,
                        graded_at, grading_body, examiner, passed, next_grade_due, created_at`;

// A coach recording a grading result against an athlete - the history of
// every grading attempt (pass or fail), not just their current grade.
router.get(
  "/:id/gradings",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "athlete" &&
      req.user.athlete_id === Number(req.params.id);
    if (!req.user.is_admin && req.user.role !== "coach" && !isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows } = await pool.query(
      `SELECT ${GRADING_FIELDS} FROM nk_grades
       WHERE athlete_id = $1
       ORDER BY graded_at DESC, created_at DESC`,
      [req.params.id]
    );
    res.json({ gradings: rows });
  })
);

router.post(
  "/:id/gradings",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin && req.user.role !== "coach") {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const {
      grade_id,
      event_id,
      graded_at,
      grading_body,
      examiner,
      passed,
      next_grade_due,
    } = req.body ?? {};

    if (!Number.isInteger(grade_id)) {
      return res.status(400).json({ error: { message: "grade_id is required" } });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO nk_grades
           (athlete_id, grade_id, event_id, recorded_by_coach_id, graded_at,
            grading_body, examiner, passed, next_grade_due)
         VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6, $7, COALESCE($8, TRUE), $9)
         RETURNING ${GRADING_FIELDS}`,
        [
          req.params.id,
          grade_id,
          event_id ?? null,
          req.user.coach_id ?? null,
          graded_at,
          grading_body,
          examiner,
          passed,
          next_grade_due,
        ]
      );
      const grading = rows[0];

      if (grading.passed) {
        await client.query(
          `UPDATE nk_athletes SET grade_id = $1, updated_at = NOW() WHERE id = $2`,
          [grade_id, req.params.id]
        );
      }

      await client.query("COMMIT");
      res.status(201).json({ grading });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.code === "23503") {
        return res.status(400).json({
          error: { message: "The athlete, grade, or event does not exist" },
        });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

router.delete(
  "/:id/gradings/:gradingId",
  asyncHandler(async (req, res) => {
    if (!req.user.is_admin && req.user.role !== "coach") {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rowCount } = await pool.query(
      `DELETE FROM nk_grades WHERE id = $1 AND athlete_id = $2`,
      [req.params.gradingId, req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Grading not found" } });
    }
    res.status(204).end();
  })
);

const RESULT_FIELDS = `id, athlete_id, event_id, event_item_id, competition_name,
                        competition_date, location, rounds_completed, final_position,
                        notes, recorded_by_user_id, created_at, updated_at`;

// Competition results - unlike gradings, an athlete may record their own
// (it's their own performance they're reporting, not something only a
// coach can certify), so POST/PATCH/DELETE all use the same isSelf
// pattern as GET rather than being coach/admin only.
router.get(
  "/:id/competition-results",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "athlete" &&
      req.user.athlete_id === Number(req.params.id);
    if (!req.user.is_admin && req.user.role !== "coach" && !isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rows } = await pool.query(
      `SELECT ${RESULT_FIELDS} FROM nk_competition_results
       WHERE athlete_id = $1
       ORDER BY competition_date DESC, created_at DESC`,
      [req.params.id]
    );
    res.json({ results: rows });
  })
);

router.post(
  "/:id/competition-results",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "athlete" &&
      req.user.athlete_id === Number(req.params.id);
    if (!req.user.is_admin && req.user.role !== "coach" && !isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const {
      competition_name,
      competition_date,
      location,
      rounds_completed,
      final_position,
      notes,
      event_id,
      event_item_id,
    } = req.body ?? {};

    if (typeof competition_name !== "string" || !competition_name.trim()) {
      return res
        .status(400)
        .json({ error: { message: "competition_name is required" } });
    }
    if (!competition_date) {
      return res
        .status(400)
        .json({ error: { message: "competition_date is required" } });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO nk_competition_results
           (athlete_id, event_id, event_item_id, competition_name, competition_date,
            location, rounds_completed, final_position, notes, recorded_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING ${RESULT_FIELDS}`,
        [
          req.params.id,
          event_id ?? null,
          event_item_id ?? null,
          competition_name,
          competition_date,
          location ?? null,
          rounds_completed ?? null,
          final_position ?? null,
          notes ?? null,
          req.user.id,
        ]
      );
      res.status(201).json({ result: rows[0] });
    } catch (err) {
      if (err.code === "23503") {
        return res.status(400).json({
          error: { message: "The athlete, event, or event item does not exist" },
        });
      }
      throw err;
    }
  })
);

router.patch(
  "/:id/competition-results/:resultId",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "athlete" &&
      req.user.athlete_id === Number(req.params.id);
    if (!req.user.is_admin && req.user.role !== "coach" && !isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const body = req.body ?? {};
    const fields = {
      competition_name: body.competition_name,
      competition_date: body.competition_date,
      location: body.location,
      rounds_completed: body.rounds_completed,
      final_position: body.final_position,
      notes: body.notes,
    };
    const setClauses = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key in body) {
        values.push(value);
        setClauses.push(`${key} = $${values.length}`);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: { message: "No fields to update" } });
    }

    values.push(req.params.resultId, req.params.id);

    const { rows } = await pool.query(
      `UPDATE nk_competition_results SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND athlete_id = $${values.length}
       RETURNING ${RESULT_FIELDS}`,
      values
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Result not found" } });
    }
    res.json({ result: rows[0] });
  })
);

router.delete(
  "/:id/competition-results/:resultId",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "athlete" &&
      req.user.athlete_id === Number(req.params.id);
    if (!req.user.is_admin && req.user.role !== "coach" && !isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rowCount } = await pool.query(
      `DELETE FROM nk_competition_results WHERE id = $1 AND athlete_id = $2`,
      [req.params.resultId, req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Result not found" } });
    }
    res.status(204).end();
  })
);

// Athlete social profile - bio + a self-controlled public/private toggle
// (no coach/admin approval step) and a Facebook-style post feed. Coach
// can always view (same trust level as the full athlete record they can
// already see); a non-coach/non-admin/non-self viewer only sees it when
// the athlete has opted into is_public_profile.
async function loadSocialProfile(athleteId) {
  const { rows } = await pool.query(
    `SELECT a.id, a.first_name, a.last_name, a.photo_url, a.bio, a.is_public_profile,
            gl.name AS grade_name, gl.belt_color
     FROM nk_athletes a
     LEFT JOIN nk_grade_levels gl ON gl.id = a.grade_id
     WHERE a.id = $1`,
    [athleteId]
  );
  return rows[0] ?? null;
}

function canViewSocialProfile(req, athlete) {
  const isSelf =
    req.user.role === "athlete" && req.user.athlete_id === athlete.id;
  return (
    req.user.is_admin ||
    req.user.role === "coach" ||
    isSelf ||
    athlete.is_public_profile
  );
}

router.get(
  "/:id/social-profile",
  asyncHandler(async (req, res) => {
    const athlete = await loadSocialProfile(Number(req.params.id));
    if (!athlete) {
      return res.status(404).json({ error: { message: "Athlete not found" } });
    }
    if (!canViewSocialProfile(req, athlete)) {
      return res
        .status(403)
        .json({ error: { message: "This profile is private" } });
    }
    res.json({ athlete });
  })
);

router.patch(
  "/:id/social-profile",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "athlete" &&
      req.user.athlete_id === Number(req.params.id);
    if (!req.user.is_admin && !isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const body = req.body ?? {};
    const fields = {
      bio: body.bio,
      is_public_profile: body.is_public_profile,
      photo_url: body.photo_url,
    };
    const setClauses = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key in body) {
        values.push(value);
        setClauses.push(`${key} = $${values.length}`);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: { message: "No fields to update" } });
    }

    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE nk_athletes SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id, bio, is_public_profile, photo_url`,
      values
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Athlete not found" } });
    }
    res.json({ athlete: rows[0] });
  })
);

const POST_JOIN_SQL = `
  SELECT p.id, p.athlete_id, p.body, p.image_url, p.share_kind, p.created_at,
         e.title AS share_event_title, e.start_date AS share_event_date,
         ei.title AS share_item_title, ei.item_date AS share_item_date,
         gl.name AS share_grade_name, gl.belt_color AS share_grade_color,
         g.graded_at AS share_graded_at, g.passed AS share_passed,
         cr.competition_name AS share_competition_name,
         cr.competition_date AS share_competition_date,
         cr.final_position AS share_final_position,
         cr.rounds_completed AS share_rounds_completed
  FROM nk_athlete_posts p
  LEFT JOIN nk_events e ON e.id = p.share_event_id
  LEFT JOIN nk_event_items ei ON ei.id = p.share_event_item_id
  LEFT JOIN nk_grades g ON g.id = p.share_grading_id
  LEFT JOIN nk_grade_levels gl ON gl.id = g.grade_id
  LEFT JOIN nk_competition_results cr ON cr.id = p.share_competition_result_id
`;

// A post is either a plain freeform note (body/image_url only) or a share
// of something from the athlete's own schedule/history - share_kind says
// which of the four nullable share_* columns to read, resolved via JOIN at
// read time (rather than duplicating the shared record's fields) so an
// edit to the underlying grading/result stays reflected in the feed.
router.get(
  "/:id/posts",
  asyncHandler(async (req, res) => {
    const athlete = await loadSocialProfile(Number(req.params.id));
    if (!athlete) {
      return res.status(404).json({ error: { message: "Athlete not found" } });
    }
    if (!canViewSocialProfile(req, athlete)) {
      return res
        .status(403)
        .json({ error: { message: "This profile is private" } });
    }

    const { rows } = await pool.query(
      `${POST_JOIN_SQL} WHERE p.athlete_id = $1 ORDER BY p.created_at DESC`,
      [req.params.id]
    );
    res.json({ posts: rows });
  })
);

const SHARE_OWNERSHIP_QUERIES = {
  event: `SELECT 1 FROM nk_event_athletes WHERE event_id = $1 AND athlete_id = $2`,
  event_item: `SELECT 1 FROM nk_event_items ei
               JOIN nk_event_athletes ea ON ea.event_id = ei.event_id
               WHERE ei.id = $1 AND ea.athlete_id = $2`,
  grading: `SELECT 1 FROM nk_grades WHERE id = $1 AND athlete_id = $2`,
  competition_result: `SELECT 1 FROM nk_competition_results WHERE id = $1 AND athlete_id = $2`,
};

// Posting as an athlete is self-only (even coach/admin can't post in
// someone else's voice) - it's their own facebook-style feed, not a
// record a third party certifies the way a grading or club membership is.
router.post(
  "/:id/posts",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "athlete" &&
      req.user.athlete_id === Number(req.params.id);
    if (!isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { body, image_url, share_kind, share_id } = req.body ?? {};
    if (!body?.trim() && !image_url && !share_kind) {
      return res.status(400).json({
        error: { message: "Post must have text, an image, or a shared item" },
      });
    }

    const shareColumns = {
      share_event_id: null,
      share_event_item_id: null,
      share_grading_id: null,
      share_competition_result_id: null,
    };

    if (share_kind) {
      const ownershipQuery = SHARE_OWNERSHIP_QUERIES[share_kind];
      if (!ownershipQuery) {
        return res.status(400).json({ error: { message: "Invalid share_kind" } });
      }
      if (!Number.isInteger(share_id)) {
        return res
          .status(400)
          .json({ error: { message: "share_id is required when sharing" } });
      }
      const { rows: ownRows } = await pool.query(ownershipQuery, [
        share_id,
        req.params.id,
      ]);
      if (ownRows.length === 0) {
        return res
          .status(400)
          .json({ error: { message: "You can only share your own items" } });
      }
      shareColumns[`share_${share_kind}_id`] = share_id;
    }

    const { rows } = await pool.query(
      `INSERT INTO nk_athlete_posts
         (athlete_id, body, image_url, share_kind, share_event_id,
          share_event_item_id, share_grading_id, share_competition_result_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        req.params.id,
        body?.trim() || null,
        image_url || null,
        share_kind || null,
        shareColumns.share_event_id,
        shareColumns.share_event_item_id,
        shareColumns.share_grading_id,
        shareColumns.share_competition_result_id,
      ]
    );

    const { rows: hydrated } = await pool.query(
      `${POST_JOIN_SQL} WHERE p.id = $1`,
      [rows[0].id]
    );
    res.status(201).json({ post: hydrated[0] });
  })
);

router.delete(
  "/:id/posts/:postId",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "athlete" &&
      req.user.athlete_id === Number(req.params.id);
    if (!req.user.is_admin && !isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const { rowCount } = await pool.query(
      `DELETE FROM nk_athlete_posts WHERE id = $1 AND athlete_id = $2`,
      [req.params.postId, req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Post not found" } });
    }
    res.status(204).end();
  })
);

// Feeds the "share from schedule" picker in the post composer - every
// event/item the athlete's assigned to plus their own gradings and
// competition results, self-only like the composer itself.
router.get(
  "/:id/shareable",
  asyncHandler(async (req, res) => {
    const isSelf =
      req.user.role === "athlete" &&
      req.user.athlete_id === Number(req.params.id);
    if (!isSelf) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    const [events, items, gradings, results] = await Promise.all([
      pool.query(
        `SELECT e.id, e.title, e.start_date FROM nk_events e
         JOIN nk_event_athletes ea ON ea.event_id = e.id
         WHERE ea.athlete_id = $1 ORDER BY e.start_date DESC LIMIT 25`,
        [req.params.id]
      ),
      pool.query(
        `SELECT ei.id, ei.title, ei.item_date FROM nk_event_items ei
         JOIN nk_event_athletes ea ON ea.event_id = ei.event_id
         WHERE ea.athlete_id = $1 ORDER BY ei.item_date DESC LIMIT 25`,
        [req.params.id]
      ),
      pool.query(
        `SELECT g.id, g.graded_at, gl.name AS grade_name FROM nk_grades g
         JOIN nk_grade_levels gl ON gl.id = g.grade_id
         WHERE g.athlete_id = $1 ORDER BY g.graded_at DESC LIMIT 25`,
        [req.params.id]
      ),
      pool.query(
        `SELECT id, competition_name, competition_date FROM nk_competition_results
         WHERE athlete_id = $1 ORDER BY competition_date DESC LIMIT 25`,
        [req.params.id]
      ),
    ]);
    res.json({
      events: events.rows,
      items: items.rows,
      gradings: gradings.rows,
      competitionResults: results.rows,
    });
  })
);

module.exports = router;
