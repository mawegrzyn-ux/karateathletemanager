const pool = require("../db/pool");
const asyncHandler = require("./asyncHandler");
const { isClubAdmin } = require("./permissions");

// Squads and groups are structurally identical - a club-scoped named
// athlete collection, managed by that club's admin - so this registers
// the full CRUD + membership route set once per table/join-table pair
// instead of writing it out twice. `table`/`joinTable`/`joinKey` are
// always fixed strings supplied by the caller below, never request
// input, so building SQL from them is safe.
function registerClubCollection(router, { path, table, joinTable, joinKey, label }) {
  router.get(
    `/:id/${path}`,
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT s.id, s.name,
                COALESCE(array_agg(j.athlete_id) FILTER (WHERE j.athlete_id IS NOT NULL), '{}') AS athlete_ids
         FROM ${table} s
         LEFT JOIN ${joinTable} j ON j.${joinKey} = s.id
         WHERE s.club_id = $1
         GROUP BY s.id
         ORDER BY s.name`,
        [req.params.id]
      );
      res.json({
        [path]: rows.map((r) => ({ id: r.id, name: r.name, athlete_ids: r.athlete_ids })),
      });
    })
  );

  router.post(
    `/:id/${path}`,
    asyncHandler(async (req, res) => {
      if (!(await isClubAdmin(req.user, req.params.id))) {
        return res.status(403).json({ error: { message: "Forbidden" } });
      }
      const { name } = req.body ?? {};
      if (typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: { message: "Name is required" } });
      }
      const { rows } = await pool.query(
        `INSERT INTO ${table} (club_id, name) VALUES ($1, $2) RETURNING id, name`,
        [req.params.id, name]
      );
      res.status(201).json({ [label]: { ...rows[0], athlete_ids: [] } });
    })
  );

  router.patch(
    `/:id/${path}/:collectionId`,
    asyncHandler(async (req, res) => {
      if (!(await isClubAdmin(req.user, req.params.id))) {
        return res.status(403).json({ error: { message: "Forbidden" } });
      }
      const { name } = req.body ?? {};
      if (typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: { message: "Name is required" } });
      }
      const { rows } = await pool.query(
        `UPDATE ${table} SET name = $1 WHERE id = $2 AND club_id = $3 RETURNING id, name`,
        [name, req.params.collectionId, req.params.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: { message: `${label} not found` } });
      }
      res.json({ [label]: rows[0] });
    })
  );

  router.delete(
    `/:id/${path}/:collectionId`,
    asyncHandler(async (req, res) => {
      if (!(await isClubAdmin(req.user, req.params.id))) {
        return res.status(403).json({ error: { message: "Forbidden" } });
      }
      const { rowCount } = await pool.query(
        `DELETE FROM ${table} WHERE id = $1 AND club_id = $2`,
        [req.params.collectionId, req.params.id]
      );
      if (rowCount === 0) {
        return res.status(404).json({ error: { message: `${label} not found` } });
      }
      res.status(204).end();
    })
  );

  router.put(
    `/:id/${path}/:collectionId/athletes`,
    asyncHandler(async (req, res) => {
      if (!(await isClubAdmin(req.user, req.params.id))) {
        return res.status(403).json({ error: { message: "Forbidden" } });
      }
      const { athleteIds } = req.body ?? {};
      if (!Array.isArray(athleteIds)) {
        return res
          .status(400)
          .json({ error: { message: "athleteIds must be an array" } });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rowCount: found } = await client.query(
          `SELECT 1 FROM ${table} WHERE id = $1 AND club_id = $2`,
          [req.params.collectionId, req.params.id]
        );
        if (found === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: { message: `${label} not found` } });
        }
        await client.query(`DELETE FROM ${joinTable} WHERE ${joinKey} = $1`, [
          req.params.collectionId,
        ]);
        for (const athleteId of athleteIds) {
          await client.query(
            `INSERT INTO ${joinTable} (${joinKey}, athlete_id) VALUES ($1, $2)`,
            [req.params.collectionId, athleteId]
          );
        }
        await client.query("COMMIT");
        res.json({ athleteIds });
      } catch (err) {
        await client.query("ROLLBACK");
        if (err.code === "23503") {
          return res
            .status(400)
            .json({ error: { message: "One or more athlete IDs do not exist" } });
        }
        throw err;
      } finally {
        client.release();
      }
    })
  );
}

module.exports = { registerClubCollection };
