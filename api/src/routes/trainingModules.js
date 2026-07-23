const { Router } = require("express");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

const ITEM_TYPES = ["exercise", "rest"];
const MAX_SETS = 50;
const MAX_REPS = 1000;
const MAX_DURATION_SECONDS = 6 * 60 * 60; // 6 hours
const MAX_DISTANCE_METERS = 100000; // 100km

const MODULE_QUERY = `
  SELECT tm.id, tm.title, tm.explanation, tm.type_id, tmt.name AS type_name,
    tm.icon, tmt.icon AS type_icon,
    tm.created_at, tm.updated_at,
    COALESCE(
      json_agg(json_build_object(
        'id', i.id, 'position', i.position, 'item_type', i.item_type,
        'name', i.name, 'explanation', i.explanation, 'video_url', i.video_url,
        'image_url', i.image_url,
        'sets', i.sets, 'reps', i.reps, 'duration_seconds', i.duration_seconds,
        'distance_meters', i.distance_meters
      ) ORDER BY i.position) FILTER (WHERE i.id IS NOT NULL),
      '[]'
    ) AS items
  FROM nk_training_modules tm
  LEFT JOIN nk_training_module_types tmt ON tmt.id = tm.type_id
  LEFT JOIN nk_training_module_items i ON i.module_id = tm.id
  GROUP BY tm.id, tmt.name, tmt.icon
`;

function validIcon(icon) {
  return icon == null || (typeof icon === "string" && icon.length <= 8);
}

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

    const sets = it.sets != null ? Number(it.sets) : null;
    const reps = it.reps != null ? Number(it.reps) : null;
    const duration = it.duration_seconds != null ? Number(it.duration_seconds) : null;
    const distance = it.distance_meters != null ? Number(it.distance_meters) : null;
    if (sets != null && (!Number.isInteger(sets) || sets <= 0 || sets > MAX_SETS)) {
      throw { status: 400, message: `sets must be a whole number between 1 and ${MAX_SETS}` };
    }
    if (reps != null && (!Number.isInteger(reps) || reps <= 0 || reps > MAX_REPS)) {
      throw { status: 400, message: `reps must be a whole number between 1 and ${MAX_REPS}` };
    }
    if (
      duration != null &&
      (!Number.isInteger(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS)
    ) {
      throw {
        status: 400,
        message: `duration must be a whole number of seconds between 1 and ${MAX_DURATION_SECONDS}`,
      };
    }
    if (
      distance != null &&
      (!Number.isInteger(distance) || distance <= 0 || distance > MAX_DISTANCE_METERS)
    ) {
      throw {
        status: 400,
        message: `distance must be a whole number of meters between 1 and ${MAX_DISTANCE_METERS}`,
      };
    }

    await client.query(
      `INSERT INTO nk_training_module_items
         (module_id, position, item_type, name, explanation, video_url, image_url, sets, reps, duration_seconds, distance_meters)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        moduleId,
        i,
        it.item_type,
        it.item_type === "exercise" ? it.name : null,
        it.explanation ?? null,
        it.video_url ?? null,
        it.image_url ?? null,
        sets,
        reps,
        duration,
        distance,
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
    const { title, explanation, type_id, icon, items } = req.body ?? {};

    if (typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: { message: "Title is required" } });
    }
    if (!validIcon(icon)) {
      return res
        .status(400)
        .json({ error: { message: "icon must be a string of 8 characters or fewer" } });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO nk_training_modules (title, explanation, type_id, icon)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [title, explanation ?? null, type_id ?? null, icon || null]
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
    const { title, explanation, type_id, icon, items } = body;

    if ("icon" in body && !validIcon(icon)) {
      return res
        .status(400)
        .json({ error: { message: "icon must be a string of 8 characters or fewer" } });
    }

    const fields = { title, explanation, type_id, icon };
    const setClauses = [];
    const values = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key in body) {
        values.push(key === "icon" && value === "" ? null : value);
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
