const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

const MODULE_QUERY = `
  SELECT tm.id, tm.title, tm.explanation, tm.video_url, tm.duration_seconds, tm.created_at,
    COALESCE(
      json_agg(json_build_object('id', s.id, 'position', s.position, 'reps', s.reps)
        ORDER BY s.position) FILTER (WHERE s.id IS NOT NULL),
      '[]'
    ) AS sets
  FROM nk_training_modules tm
  LEFT JOIN nk_training_module_sets s ON s.module_id = tm.id
  GROUP BY tm.id
`;

router.use(authorize());

async function insertSets(client, moduleId, sets) {
  if (!Array.isArray(sets)) return;
  await client.query(`DELETE FROM nk_training_module_sets WHERE module_id = $1`, [
    moduleId,
  ]);
  for (let i = 0; i < sets.length; i++) {
    const reps = Number(sets[i]?.reps);
    if (!Number.isInteger(reps) || reps <= 0) {
      throw { status: 400, message: "Each set needs a positive integer reps value" };
    }
    await client.query(
      `INSERT INTO nk_training_module_sets (module_id, position, reps) VALUES ($1, $2, $3)`,
      [moduleId, i, reps]
    );
  }
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`${MODULE_QUERY} ORDER BY tm.title`);
    res.json({ modules: rows });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`${MODULE_QUERY} HAVING tm.id = $1`, [
      req.params.id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: { message: "Module not found" } });
    }
    res.json({ module: rows[0] });
  })
);

router.post(
  "/",
  authorize("coach"),
  asyncHandler(async (req, res) => {
    const { title, explanation, video_url, duration_seconds, sets } =
      req.body ?? {};

    if (typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: { message: "Title is required" } });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO nk_training_modules (title, explanation, video_url, duration_seconds)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [title, explanation ?? null, video_url ?? null, duration_seconds ?? null]
      );
      const moduleId = rows[0].id;
      await insertSets(client, moduleId, sets);
      await client.query("COMMIT");

      const { rows: full } = await client.query(`${MODULE_QUERY} HAVING tm.id = $1`, [
        moduleId,
      ]);
      res.status(201).json({ module: full[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.status) {
        return res.status(err.status).json({ error: { message: err.message } });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

router.patch(
  "/:id",
  authorize("coach"),
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const { title, explanation, video_url, duration_seconds, sets } = body;

    const fields = { title, explanation, video_url, duration_seconds };
    const setClauses = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key in body) {
        values.push(value);
        setClauses.push(`${key} = $${values.length}`);
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (setClauses.length > 0) {
        values.push(req.params.id);
        const { rowCount } = await client.query(
          `UPDATE nk_training_modules SET ${setClauses.join(", ")}, updated_at = NOW()
           WHERE id = $${values.length}`,
          values
        );
        if (rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: { message: "Module not found" } });
        }
      }

      if ("sets" in body) {
        await insertSets(client, req.params.id, sets);
      }

      await client.query("COMMIT");

      const { rows: full } = await pool.query(`${MODULE_QUERY} HAVING tm.id = $1`, [
        req.params.id,
      ]);
      if (full.length === 0) {
        return res.status(404).json({ error: { message: "Module not found" } });
      }
      res.json({ module: full[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.status) {
        return res.status(err.status).json({ error: { message: err.message } });
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

router.delete(
  "/:id",
  authorize("coach"),
  asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
      `DELETE FROM nk_training_modules WHERE id = $1`,
      [req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: { message: "Module not found" } });
    }
    res.status(204).end();
  })
);

module.exports = router;
