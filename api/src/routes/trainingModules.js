const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

const ITEM_TYPES = ["exercise", "rest"];

const MODULE_QUERY = `
  SELECT tm.id, tm.title, tm.explanation, tm.created_at, tm.updated_at,
    COALESCE(
      json_agg(json_build_object(
        'id', i.id, 'position', i.position, 'item_type', i.item_type,
        'name', i.name, 'explanation', i.explanation, 'video_url', i.video_url,
        'sets', i.sets, 'reps', i.reps, 'duration_seconds', i.duration_seconds
      ) ORDER BY i.position) FILTER (WHERE i.id IS NOT NULL),
      '[]'
    ) AS items
  FROM nk_training_modules tm
  LEFT JOIN nk_training_module_items i ON i.module_id = tm.id
  GROUP BY tm.id
`;

router.use(authorize());

async function insertItems(client, moduleId, items) {
  if (!Array.isArray(items)) return;
  await client.query(
    `DELETE FROM nk_training_module_items WHERE module_id = $1`,
    [moduleId]
  );

  for (let i = 0; i < items.length; i++) {
    const it = items[i] ?? {};

    if (!ITEM_TYPES.includes(it.item_type)) {
      throw { status: 400, message: "Each item needs a valid item_type" };
    }
    if (
      it.item_type === "exercise" &&
      (typeof it.name !== "string" || it.name.trim().length === 0)
    ) {
      throw { status: 400, message: "Each exercise needs a name" };
    }

    const sets = it.sets != null ? Number(it.sets) : null;
    const reps = it.reps != null ? Number(it.reps) : null;
    const duration = it.duration_seconds != null ? Number(it.duration_seconds) : null;
    if (sets != null && (!Number.isInteger(sets) || sets <= 0)) {
      throw { status: 400, message: "sets must be a positive integer" };
    }
    if (reps != null && (!Number.isInteger(reps) || reps <= 0)) {
      throw { status: 400, message: "reps must be a positive integer" };
    }
    if (duration != null && (!Number.isInteger(duration) || duration <= 0)) {
      throw { status: 400, message: "duration_seconds must be a positive integer" };
    }

    await client.query(
      `INSERT INTO nk_training_module_items
         (module_id, position, item_type, name, explanation, video_url, sets, reps, duration_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        moduleId,
        i,
        it.item_type,
        it.item_type === "exercise" ? it.name : null,
        it.explanation ?? null,
        it.video_url ?? null,
        sets,
        reps,
        duration,
      ]
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
    const { title, explanation, items } = req.body ?? {};

    if (typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: { message: "Title is required" } });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO nk_training_modules (title, explanation)
         VALUES ($1, $2)
         RETURNING id`,
        [title, explanation ?? null]
      );
      const moduleId = rows[0].id;
      await insertItems(client, moduleId, items);
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
    const { title, explanation, items } = body;

    const fields = { title, explanation };
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

      if ("items" in body) {
        await insertItems(client, req.params.id, items);
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
