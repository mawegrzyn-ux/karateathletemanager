require("dotenv").config();

const pool = require("../src/db/pool");

const migrations = [
  `CREATE TABLE IF NOT EXISTS nk_athletes (
     id              SERIAL PRIMARY KEY,
     first_name      VARCHAR(100) NOT NULL,
     last_name       VARCHAR(100) NOT NULL,
     date_of_birth   DATE,
     email           VARCHAR(200),
     phone           VARCHAR(50),
     emergency_name  VARCHAR(200),
     emergency_phone VARCHAR(50),
     belt            VARCHAR(50) NOT NULL DEFAULT 'white',
     join_date       DATE NOT NULL DEFAULT CURRENT_DATE,
     photo_url       TEXT,
     medical_notes   TEXT,
     is_active       BOOLEAN NOT NULL DEFAULT TRUE,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS nk_coaches (
     id              SERIAL PRIMARY KEY,
     first_name      VARCHAR(100) NOT NULL,
     last_name       VARCHAR(100) NOT NULL,
     email           VARCHAR(200),
     phone           VARCHAR(50),
     qualifications  TEXT,
     role            VARCHAR(50) NOT NULL DEFAULT 'assistant',
     athlete_id      INTEGER REFERENCES nk_athletes(id) ON DELETE SET NULL,
     is_active       BOOLEAN NOT NULL DEFAULT TRUE,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS nk_classes (
     id              SERIAL PRIMARY KEY,
     name            VARCHAR(150) NOT NULL,
     class_type      VARCHAR(50) NOT NULL DEFAULT 'general',
     age_group       VARCHAR(50),
     location        VARCHAR(150),
     max_capacity    INTEGER,
     coach_id        INTEGER REFERENCES nk_coaches(id) ON DELETE SET NULL,
     is_active       BOOLEAN NOT NULL DEFAULT TRUE,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS nk_sessions (
     id              SERIAL PRIMARY KEY,
     class_id        INTEGER NOT NULL REFERENCES nk_classes(id) ON DELETE CASCADE,
     session_date    DATE NOT NULL,
     start_time      TIME,
     end_time        TIME,
     status          VARCHAR(50) NOT NULL DEFAULT 'scheduled',
     substitute_coach_id INTEGER REFERENCES nk_coaches(id) ON DELETE SET NULL,
     notes           TEXT,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS nk_attendance (
     id              SERIAL PRIMARY KEY,
     session_id      INTEGER NOT NULL REFERENCES nk_sessions(id) ON DELETE CASCADE,
     athlete_id      INTEGER NOT NULL REFERENCES nk_athletes(id) ON DELETE CASCADE,
     checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     checked_in_by   VARCHAR(50) NOT NULL DEFAULT 'coach',
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (session_id, athlete_id)
  )`,

  `CREATE TABLE IF NOT EXISTS nk_grades (
     id              SERIAL PRIMARY KEY,
     athlete_id      INTEGER NOT NULL REFERENCES nk_athletes(id) ON DELETE CASCADE,
     belt            VARCHAR(50) NOT NULL,
     graded_at       DATE NOT NULL DEFAULT CURRENT_DATE,
     grading_body    VARCHAR(150),
     examiner        VARCHAR(150),
     passed          BOOLEAN NOT NULL DEFAULT TRUE,
     next_grade_due  DATE,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS nk_competitions (
     id              SERIAL PRIMARY KEY,
     name            VARCHAR(200) NOT NULL,
     competition_date DATE NOT NULL,
     location        VARCHAR(200),
     category        VARCHAR(100),
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS nk_competition_entries (
     id              SERIAL PRIMARY KEY,
     competition_id  INTEGER NOT NULL REFERENCES nk_competitions(id) ON DELETE CASCADE,
     athlete_id      INTEGER NOT NULL REFERENCES nk_athletes(id) ON DELETE CASCADE,
     category        VARCHAR(100),
     result          VARCHAR(50),
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (competition_id, athlete_id, category)
  )`,

  `CREATE TABLE IF NOT EXISTS nk_announcements (
     id              SERIAL PRIMARY KEY,
     title           VARCHAR(200) NOT NULL,
     body            TEXT NOT NULL,
     published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS nk_settings (
     key             VARCHAR(100) PRIMARY KEY,
     value           TEXT,
     updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of migrations) {
      await client.query(statement);
    }
    await client.query("COMMIT");
    console.log(`Ran ${migrations.length} migration statements successfully.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed, rolled back:", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
