const { Router } = require("express");
const pool = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name FROM nk_clubs ORDER BY name ASC`
    );
    res.json({ clubs: rows });
  })
);

module.exports = router;
