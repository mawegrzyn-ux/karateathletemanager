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

module.exports = router;
