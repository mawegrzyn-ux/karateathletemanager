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

  `CREATE TABLE IF NOT EXISTS nk_users (
     id              SERIAL PRIMARY KEY,
     email           VARCHAR(200) NOT NULL UNIQUE,
     password_hash   TEXT NOT NULL,
     role            VARCHAR(20) CHECK (role IN ('admin', 'coach', 'athlete', 'parent')),
     status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
     athlete_id      INTEGER REFERENCES nk_athletes(id) ON DELETE SET NULL,
     coach_id        INTEGER REFERENCES nk_coaches(id) ON DELETE SET NULL,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS nk_parent_athletes (
     user_id         INTEGER NOT NULL REFERENCES nk_users(id) ON DELETE CASCADE,
     athlete_id      INTEGER NOT NULL REFERENCES nk_athletes(id) ON DELETE CASCADE,
     PRIMARY KEY (user_id, athlete_id)
  )`,

  `ALTER TABLE nk_users
     ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
     ADD COLUMN IF NOT EXISTS last_name  VARCHAR(100),
     ADD COLUMN IF NOT EXISTS phone      VARCHAR(50)`,

  `CREATE TABLE IF NOT EXISTS nk_associations (
     id             SERIAL PRIMARY KEY,
     name           VARCHAR(200) NOT NULL,
     description    TEXT,
     contact_email  VARCHAR(200),
     contact_phone  VARCHAR(50),
     created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS nk_clubs (
     id             SERIAL PRIMARY KEY,
     name           VARCHAR(200) NOT NULL,
     association_id INTEGER REFERENCES nk_associations(id) ON DELETE SET NULL,
     location       VARCHAR(200),
     contact_email  VARCHAR(200),
     contact_phone  VARCHAR(50),
     created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS nk_athlete_clubs (
     athlete_id INTEGER NOT NULL REFERENCES nk_athletes(id) ON DELETE CASCADE,
     club_id    INTEGER NOT NULL REFERENCES nk_clubs(id) ON DELETE CASCADE,
     PRIMARY KEY (athlete_id, club_id)
  )`,

  `CREATE TABLE IF NOT EXISTS nk_coach_clubs (
     coach_id INTEGER NOT NULL REFERENCES nk_coaches(id) ON DELETE CASCADE,
     club_id  INTEGER NOT NULL REFERENCES nk_clubs(id) ON DELETE CASCADE,
     PRIMARY KEY (coach_id, club_id)
  )`,

  `ALTER TABLE nk_coach_clubs
     ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE`,

  `CREATE TABLE IF NOT EXISTS nk_coach_associations (
     coach_id       INTEGER NOT NULL REFERENCES nk_coaches(id) ON DELETE CASCADE,
     association_id INTEGER NOT NULL REFERENCES nk_associations(id) ON DELETE CASCADE,
     PRIMARY KEY (coach_id, association_id)
  )`,

  `ALTER TABLE nk_users
     ADD COLUMN IF NOT EXISTS wants_athlete BOOLEAN NOT NULL DEFAULT FALSE,
     ADD COLUMN IF NOT EXISTS wants_coach   BOOLEAN NOT NULL DEFAULT FALSE,
     ADD COLUMN IF NOT EXISTS requested_club_id INTEGER REFERENCES nk_clubs(id) ON DELETE SET NULL`,

  `ALTER TABLE nk_users
     ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE`,

  `UPDATE nk_users SET is_admin = TRUE WHERE role = 'admin'`,

  `UPDATE nk_users SET is_admin = TRUE WHERE email = 'mawegrzyn@gmail.com'`,
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
