const { Pool, types } = require("pg");

// DATE columns (oid 1082) default to parsing into a JS Date object, which
// serializes to a full ISO timestamp ("1990-05-15T00:00:00.000Z") over
// JSON — not the "YYYY-MM-DD" string that <input type="date"> requires.
// Return the raw date string as-is instead.
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

module.exports = pool;
