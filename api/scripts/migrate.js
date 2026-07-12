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

  `ALTER TABLE nk_athletes
     ADD COLUMN IF NOT EXISTS link_pin VARCHAR(6),
     ADD COLUMN IF NOT EXISTS link_pin_expires_at TIMESTAMPTZ`,

  `CREATE TABLE IF NOT EXISTS nk_events (
     id          SERIAL PRIMARY KEY,
     title       VARCHAR(200) NOT NULL,
     event_type  VARCHAR(30) NOT NULL CHECK (event_type IN
                   ('competition','squad_session','training','travel',
                    'time_off','seminar','training_camp')),
     start_date  DATE NOT NULL,
     end_date    DATE NOT NULL,
     location    VARCHAR(200),
     notes       TEXT,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS nk_event_athletes (
     event_id   INTEGER NOT NULL REFERENCES nk_events(id) ON DELETE CASCADE,
     athlete_id INTEGER NOT NULL REFERENCES nk_athletes(id) ON DELETE CASCADE,
     PRIMARY KEY (event_id, athlete_id)
  )`,

  `CREATE TABLE IF NOT EXISTS nk_event_items (
     id          SERIAL PRIMARY KEY,
     event_id    INTEGER NOT NULL REFERENCES nk_events(id) ON DELETE CASCADE,
     item_type   VARCHAR(30) NOT NULL CHECK (item_type IN
                   ('competition','squad_session','training','travel',
                    'time_off','seminar','training_camp','rest','other')),
     title       VARCHAR(200) NOT NULL,
     item_date   DATE NOT NULL,
     start_time  TIME,
     end_time    TIME,
     notes       TEXT,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `UPDATE nk_event_items
     SET start_time = '09:00', end_time = '10:00'
     WHERE start_time IS NULL OR end_time IS NULL`,

  `ALTER TABLE nk_event_items
     ALTER COLUMN start_time SET NOT NULL,
     ALTER COLUMN end_time SET NOT NULL`,

  `CREATE TABLE IF NOT EXISTS nk_training_modules (
     id               SERIAL PRIMARY KEY,
     title            VARCHAR(200) NOT NULL,
     explanation      TEXT,
     video_url        VARCHAR(500),
     duration_seconds INTEGER,
     created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS nk_training_module_sets (
     id        SERIAL PRIMARY KEY,
     module_id INTEGER NOT NULL REFERENCES nk_training_modules(id) ON DELETE CASCADE,
     position  INTEGER NOT NULL,
     reps      INTEGER NOT NULL
  )`,

  `ALTER TABLE nk_event_items
     ADD COLUMN IF NOT EXISTS training_module_id INTEGER
       REFERENCES nk_training_modules(id) ON DELETE SET NULL`,

  `CREATE TABLE IF NOT EXISTS nk_katas (
     id         SERIAL PRIMARY KEY,
     name       VARCHAR(200) NOT NULL UNIQUE,
     style      VARCHAR(50),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // Best-effort starting list of well-known traditional/WKF-style katas
  // across the four major styles. Not guaranteed to exactly match the
  // current official WKF kata list from memory alone — fully editable
  // afterward via the admin Katas page.
  `INSERT INTO nk_katas (name, style) VALUES
     ('Heian Shodan', 'Shotokan'),
     ('Heian Nidan', 'Shotokan'),
     ('Heian Sandan', 'Shotokan'),
     ('Heian Yondan', 'Shotokan'),
     ('Heian Godan', 'Shotokan'),
     ('Tekki Shodan', 'Shotokan'),
     ('Tekki Nidan', 'Shotokan'),
     ('Tekki Sandan', 'Shotokan'),
     ('Bassai Dai', 'Shotokan'),
     ('Bassai Sho', 'Shotokan'),
     ('Kanku Dai', 'Shotokan'),
     ('Kanku Sho', 'Shotokan'),
     ('Empi', 'Shotokan'),
     ('Jion', 'Shotokan'),
     ('Jitte', 'Shotokan'),
     ('Hangetsu', 'Shotokan'),
     ('Gankaku', 'Shotokan'),
     ('Chinte', 'Shotokan'),
     ('Meikyo', 'Shotokan'),
     ('Nijushiho', 'Shotokan'),
     ('Sochin', 'Shotokan'),
     ('Unsu', 'Shotokan'),
     ('Wankan', 'Shotokan'),
     ('Gojushiho Dai', 'Shotokan'),
     ('Gojushiho Sho', 'Shotokan'),
     ('Gekisai Dai Ichi', 'Goju-ryu'),
     ('Gekisai Dai Ni', 'Goju-ryu'),
     ('Saifa', 'Goju-ryu'),
     ('Seiyunchin', 'Goju-ryu'),
     ('Shisochin', 'Goju-ryu'),
     ('Sanseiru', 'Goju-ryu'),
     ('Seipai', 'Goju-ryu'),
     ('Seisan', 'Goju-ryu'),
     ('Suparinpei', 'Goju-ryu'),
     ('Kururunfa', 'Goju-ryu'),
     ('Tensho', 'Goju-ryu'),
     ('Sanchin', 'Goju-ryu'),
     ('Matsukaze', 'Shito-ryu'),
     ('Seienchin', 'Shito-ryu'),
     ('Nipaipo', 'Shito-ryu'),
     ('Chatanyara Kushanku', 'Shito-ryu'),
     ('Rohai', 'Shito-ryu'),
     ('Pinan Shodan', 'Wado-ryu'),
     ('Pinan Nidan', 'Wado-ryu'),
     ('Pinan Sandan', 'Wado-ryu'),
     ('Pinan Yondan', 'Wado-ryu'),
     ('Pinan Godan', 'Wado-ryu'),
     ('Naihanchi', 'Wado-ryu'),
     ('Seishan', 'Wado-ryu'),
     ('Chinto', 'Wado-ryu'),
     ('Niseishi', 'Wado-ryu'),
     ('Kushanku', 'Wado-ryu')
   ON CONFLICT (name) DO NOTHING`,

  `ALTER TABLE nk_katas ADD COLUMN IF NOT EXISTS wkf_number INTEGER`,

  // Best-effort WKF Kata List numbers (numbered within each style, as
  // published on the official WKF kata scoresheet). Not guaranteed to
  // exactly match the current official WKF document from memory alone,
  // especially for the Shito-ryu subset (whose full official list runs
  // to 40+ katas and is only partially seeded here) — fully editable
  // afterward via the admin Katas page.
  `UPDATE nk_katas SET wkf_number = v.num FROM (VALUES
     ('Bassai Dai', 1), ('Bassai Sho', 2), ('Kanku Dai', 3), ('Kanku Sho', 4),
     ('Empi', 5), ('Jion', 6), ('Jitte', 7), ('Hangetsu', 8), ('Gankaku', 9),
     ('Chinte', 10), ('Meikyo', 11), ('Nijushiho', 12), ('Sochin', 13),
     ('Unsu', 14), ('Wankan', 15), ('Gojushiho Sho', 16), ('Gojushiho Dai', 17),
     ('Heian Shodan', 18), ('Heian Nidan', 19), ('Heian Sandan', 20),
     ('Heian Yondan', 21), ('Heian Godan', 22), ('Tekki Shodan', 23),
     ('Tekki Nidan', 24), ('Tekki Sandan', 25)
   ) AS v(name, num) WHERE nk_katas.name = v.name AND nk_katas.style = 'Shotokan'`,

  `UPDATE nk_katas SET wkf_number = v.num FROM (VALUES
     ('Saifa', 1), ('Seiyunchin', 2), ('Shisochin', 3), ('Sanseiru', 4),
     ('Seipai', 5), ('Seisan', 6), ('Suparinpei', 7), ('Kururunfa', 8),
     ('Sanchin', 9), ('Tensho', 10), ('Gekisai Dai Ichi', 11), ('Gekisai Dai Ni', 12)
   ) AS v(name, num) WHERE nk_katas.name = v.name AND nk_katas.style = 'Goju-ryu'`,

  `UPDATE nk_katas SET wkf_number = v.num FROM (VALUES
     ('Pinan Shodan', 1), ('Pinan Nidan', 2), ('Pinan Sandan', 3),
     ('Pinan Yondan', 4), ('Pinan Godan', 5), ('Kushanku', 6),
     ('Naihanchi', 7), ('Seishan', 8), ('Chinto', 9), ('Niseishi', 10)
   ) AS v(name, num) WHERE nk_katas.name = v.name AND nk_katas.style = 'Wado-ryu'`,

  `UPDATE nk_katas SET wkf_number = v.num FROM (VALUES
     ('Matsukaze', 1), ('Seienchin', 2), ('Nipaipo', 3),
     ('Chatanyara Kushanku', 4), ('Rohai', 5)
   ) AS v(name, num) WHERE nk_katas.name = v.name AND nk_katas.style = 'Shito-ryu'`,

  `ALTER TABLE nk_event_items
     ADD COLUMN IF NOT EXISTS kata_id INTEGER
       REFERENCES nk_katas(id) ON DELETE SET NULL`,

  `ALTER TABLE nk_event_items DROP CONSTRAINT IF EXISTS nk_event_items_item_type_check;
   ALTER TABLE nk_event_items ADD CONSTRAINT nk_event_items_item_type_check
     CHECK (item_type IN ('competition','squad_session','training','travel',
       'time_off','seminar','training_camp','rest','other','kata_performance'))`,

  `CREATE TABLE IF NOT EXISTS nk_karate_styles (
     id         SERIAL PRIMARY KEY,
     name       VARCHAR(100) NOT NULL UNIQUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // Seeded to match the style strings already used on nk_katas; admin can
  // add more (Kyokushin, Uechi-ryu, etc.) via the admin Karate Styles page.
  `INSERT INTO nk_karate_styles (name) VALUES
     ('Shotokan'), ('Goju-ryu'), ('Shito-ryu'), ('Wado-ryu')
   ON CONFLICT (name) DO NOTHING`,

  `CREATE TABLE IF NOT EXISTS nk_athlete_styles (
     athlete_id INTEGER NOT NULL REFERENCES nk_athletes(id) ON DELETE CASCADE,
     style_id   INTEGER NOT NULL REFERENCES nk_karate_styles(id) ON DELETE CASCADE,
     PRIMARY KEY (athlete_id, style_id)
  )`,

  `CREATE TABLE IF NOT EXISTS nk_club_styles (
     club_id  INTEGER NOT NULL REFERENCES nk_clubs(id) ON DELETE CASCADE,
     style_id INTEGER NOT NULL REFERENCES nk_karate_styles(id) ON DELETE CASCADE,
     PRIMARY KEY (club_id, style_id)
  )`,

  // Training modules are now a session plan made of ordered exercise/rest
  // items rather than a single exercise with a flat rep list — those
  // per-exercise fields (video, duration) move onto each item instead.
  `ALTER TABLE nk_training_modules
     DROP COLUMN IF EXISTS video_url,
     DROP COLUMN IF EXISTS duration_seconds`,

  `DROP TABLE IF EXISTS nk_training_module_sets`,

  `CREATE TABLE IF NOT EXISTS nk_training_module_items (
     id               SERIAL PRIMARY KEY,
     module_id        INTEGER NOT NULL REFERENCES nk_training_modules(id) ON DELETE CASCADE,
     position         INTEGER NOT NULL,
     item_type        VARCHAR(20) NOT NULL CHECK (item_type IN ('exercise', 'rest')),
     name             VARCHAR(200),
     explanation      TEXT,
     video_url        VARCHAR(500),
     sets             INTEGER,
     reps             INTEGER,
     duration_seconds INTEGER
  )`,

  `ALTER TABLE nk_events
     ADD COLUMN IF NOT EXISTS start_time TIME,
     ADD COLUMN IF NOT EXISTS end_time TIME`,

  // The earlier wkf_number seed above was wrong: it numbered each style's
  // katas 1..N independently, but the official WKF Kata List (per the
  // reference document supplied 2026-07-10) is a single list of 102
  // katas in alphabetical order, numbered 1-102 across all styles. This
  // replaces those per-style numbers with the correct global numbers,
  // matched by name (including the couple of spelling variants already
  // present in our seed, e.g. "Chatanyara Kushanku" for the official
  // "Chatanyara Kusanku").
  `UPDATE nk_katas SET wkf_number = v.num FROM (VALUES
     ('Anan', 1), ('Anan Dai', 2), ('Ananko', 3), ('Aoyagi', 4), ('Bassai', 5),
     ('Bassai Dai', 6), ('Bassai Sho', 7),
     ('Chatanyara Kusanku', 8), ('Chatanyara Kushanku', 8),
     ('Chibana No Kushanku', 9), ('Chinte', 10), ('Chinto', 11), ('Empi', 12),
     ('Fukyugata Ichi', 13), ('Fukyugata Ni', 14), ('Gankaku', 15), ('Garyu', 16),
     ('Gekisai (Geksai) 1', 17), ('Gekisai Dai Ichi', 17),
     ('Gekisai (Geksai) 2', 18), ('Gekisai Dai Ni', 18),
     ('Gojushiho', 19), ('Gojushiho Dai', 20), ('Gojushiho Sho', 21),
     ('Hakucho', 22), ('Hangetsu', 23), ('Haufa (Haffa)', 24),
     ('Heian Shodan', 25), ('Heian Nidan', 26), ('Heian Sandan', 27),
     ('Heian Yondan', 28), ('Heian Godan', 29), ('Heiku', 30),
     ('Ishimine Bassai', 31), ('Itosu Rohai Shodan', 32),
     ('Itosu Rohai Nidan', 33), ('Itosu Rohai Sandan', 34),
     ('Jiin', 35), ('Jion', 36), ('Jitte', 37), ('Juroku', 38), ('Kanchin', 39),
     ('Kanku Dai', 40), ('Kanku Sho', 41), ('Kanshu', 42),
     ('Kishimoto No Kushanku', 43), ('Kousoukun', 44), ('Kousoukun Dai', 45),
     ('Kousoukun Sho', 46), ('Kururunfa', 47), ('Kusanku', 48), ('Kushanku', 48),
     ('Kyan No Chinto', 49), ('Kyan No Wanshu', 50), ('Matsukaze', 51),
     ('Matsumura Bassai', 52), ('Matsumura Rohai', 53), ('Meikyo', 54),
     ('Myojo', 55), ('Naifanchin Shodan', 56), ('Naifanchin Nidan', 57),
     ('Naifanchin Sandan', 58), ('Naihanchi', 59), ('Nijushiho', 60),
     ('Nipaipo', 61), ('Niseishi', 62), ('Ohan', 63), ('Ohan Dai', 64),
     ('Oyadomari No Passai', 65), ('Pachu', 66), ('Paiku', 67), ('Papuren', 68),
     ('Passai', 69), ('Pinan Shodan', 70), ('Pinan Nidan', 71),
     ('Pinan Sandan', 72), ('Pinan Yondan', 73), ('Pinan Godan', 74),
     ('Rohai', 75), ('Saifa', 76), ('Sanchin', 77), ('Sansai', 78),
     ('Sanseiru', 79), ('Sanseru', 80), ('Seichin', 81),
     ('Seienchin (Seiyunchin)', 82), ('Seienchin', 82), ('Seiyunchin', 82),
     ('Seipai', 83), ('Seiryu', 84), ('Seishan', 85),
     ('Seisan (Sesan)', 86), ('Seisan', 86), ('Shiho Kousoukun', 87),
     ('Shinpa', 88), ('Shinsei', 89), ('Shisochin', 90), ('Sochin', 91),
     ('Suparinpei', 92), ('Tekki Shodan', 93), ('Tekki Nidan', 94),
     ('Tekki Sandan', 95), ('Tensho', 96), ('Tomari Bassai', 97),
     ('Unshu', 98), ('Unsu', 99), ('Useishi', 100), ('Wankan', 101), ('Wanshu', 102)
   ) AS v(name, num) WHERE nk_katas.name = v.name`,

  // Fill in the katas from the official list that our earlier best-effort
  // seed was missing entirely, so the library matches the reference
  // document in full. No style is set for these (the official list
  // isn't organized by style) — admins can tag one via the Katas page.
  `INSERT INTO nk_katas (name, wkf_number) VALUES
     ('Anan', 1), ('Anan Dai', 2), ('Ananko', 3), ('Aoyagi', 4), ('Bassai', 5),
     ('Chibana No Kushanku', 9), ('Fukyugata Ichi', 13), ('Fukyugata Ni', 14),
     ('Garyu', 16), ('Gojushiho', 19), ('Hakucho', 22), ('Haufa (Haffa)', 24),
     ('Heiku', 30), ('Ishimine Bassai', 31), ('Itosu Rohai Shodan', 32),
     ('Itosu Rohai Nidan', 33), ('Itosu Rohai Sandan', 34), ('Jiin', 35),
     ('Juroku', 38), ('Kanchin', 39), ('Kanshu', 42),
     ('Kishimoto No Kushanku', 43), ('Kousoukun', 44), ('Kousoukun Dai', 45),
     ('Kousoukun Sho', 46), ('Kyan No Chinto', 49), ('Kyan No Wanshu', 50),
     ('Matsumura Bassai', 52), ('Matsumura Rohai', 53), ('Myojo', 55),
     ('Naifanchin Shodan', 56), ('Naifanchin Nidan', 57), ('Naifanchin Sandan', 58),
     ('Ohan', 63), ('Ohan Dai', 64), ('Oyadomari No Passai', 65), ('Pachu', 66),
     ('Paiku', 67), ('Papuren', 68), ('Passai', 69), ('Sansai', 78),
     ('Sanseru', 80), ('Seichin', 81), ('Seiryu', 84), ('Shiho Kousoukun', 87),
     ('Shinpa', 88), ('Shinsei', 89), ('Tomari Bassai', 97), ('Unshu', 98),
     ('Useishi', 100), ('Wanshu', 102)
   ON CONFLICT (name) DO NOTHING`,

  `ALTER TABLE nk_training_module_items
     ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)`,

  `CREATE TABLE IF NOT EXISTS nk_coach_roles (
     id         SERIAL PRIMARY KEY,
     name       VARCHAR(100) NOT NULL UNIQUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  // Seeded to match the role strings already used on nk_coaches; admin
  // can add more (e.g. "fitness coach") via the admin Coach Roles page.
  `INSERT INTO nk_coach_roles (name) VALUES
     ('head coach'), ('assistant')
   ON CONFLICT (name) DO NOTHING`,

  `CREATE TABLE IF NOT EXISTS nk_coach_styles (
     coach_id INTEGER NOT NULL REFERENCES nk_coaches(id) ON DELETE CASCADE,
     style_id INTEGER NOT NULL REFERENCES nk_karate_styles(id) ON DELETE CASCADE,
     PRIMARY KEY (coach_id, style_id)
  )`,

  // A user account can own more than one athlete/coach profile (e.g. two
  // separate club registrations). nk_users.athlete_id/coach_id remain as
  // the "currently active" profile pointer used everywhere else in the
  // app; these tables hold the full set the user can switch between.
  `CREATE TABLE IF NOT EXISTS nk_user_athletes (
     user_id    INTEGER NOT NULL REFERENCES nk_users(id) ON DELETE CASCADE,
     athlete_id INTEGER NOT NULL REFERENCES nk_athletes(id) ON DELETE CASCADE,
     PRIMARY KEY (user_id, athlete_id)
  )`,

  `CREATE TABLE IF NOT EXISTS nk_user_coaches (
     user_id  INTEGER NOT NULL REFERENCES nk_users(id) ON DELETE CASCADE,
     coach_id INTEGER NOT NULL REFERENCES nk_coaches(id) ON DELETE CASCADE,
     PRIMARY KEY (user_id, coach_id)
  )`,

  `INSERT INTO nk_user_athletes (user_id, athlete_id)
     SELECT id, athlete_id FROM nk_users WHERE athlete_id IS NOT NULL
     ON CONFLICT DO NOTHING`,

  `INSERT INTO nk_user_coaches (user_id, coach_id)
     SELECT id, coach_id FROM nk_users WHERE coach_id IS NOT NULL
     ON CONFLICT DO NOTHING`,

  `ALTER TABLE nk_coaches
     ADD COLUMN IF NOT EXISTS photo_url TEXT`,

  // A third profile type, parallel to athletes/coaches: officiates
  // competitions rather than competing or coaching. Kept intentionally
  // minimal (no club/style scoping) to match how little of that applies.
  `CREATE TABLE IF NOT EXISTS nk_referees (
     id              SERIAL PRIMARY KEY,
     first_name      VARCHAR(100) NOT NULL,
     last_name       VARCHAR(100) NOT NULL,
     email           VARCHAR(200),
     phone           VARCHAR(50),
     qualifications  TEXT,
     photo_url       TEXT,
     is_active       BOOLEAN NOT NULL DEFAULT TRUE,
     created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `ALTER TABLE nk_users
     ADD COLUMN IF NOT EXISTS referee_id INTEGER REFERENCES nk_referees(id) ON DELETE SET NULL,
     ADD COLUMN IF NOT EXISTS wants_referee BOOLEAN NOT NULL DEFAULT FALSE,
     ADD COLUMN IF NOT EXISTS photo_url TEXT`,

  `CREATE TABLE IF NOT EXISTS nk_user_referees (
     user_id     INTEGER NOT NULL REFERENCES nk_users(id) ON DELETE CASCADE,
     referee_id  INTEGER NOT NULL REFERENCES nk_referees(id) ON DELETE CASCADE,
     PRIMARY KEY (user_id, referee_id)
  )`,

  `INSERT INTO nk_user_referees (user_id, referee_id)
     SELECT id, referee_id FROM nk_users WHERE referee_id IS NOT NULL
     ON CONFLICT DO NOTHING`,

  // Safe to rerun every deploy: the DROP happens first each time.
  `ALTER TABLE nk_users DROP CONSTRAINT IF EXISTS nk_users_role_check`,
  `ALTER TABLE nk_users ADD CONSTRAINT nk_users_role_check
     CHECK (role IN ('admin', 'coach', 'athlete', 'parent', 'referee'))`,

  // A top-level event of type 'training' can link a module directly,
  // for simple single-session events that don't need an itinerary
  // breakdown into nested items.
  `ALTER TABLE nk_events
     ADD COLUMN IF NOT EXISTS training_module_id INTEGER
       REFERENCES nk_training_modules(id) ON DELETE SET NULL`,

  // Lets whoever the itinerary item belongs to (athlete/coach/admin) mark
  // it done, same trust level as editing its notes.
  `ALTER TABLE nk_event_items
     ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE`,

  // Completion/notes move from one shared value per item to one per
  // (item, athlete) pair, since a squad-session item is often assigned to
  // several athletes who each need their own checkbox and coach notes.
  `CREATE TABLE IF NOT EXISTS nk_event_item_athlete_status (
     item_id     INTEGER NOT NULL REFERENCES nk_event_items(id) ON DELETE CASCADE,
     athlete_id  INTEGER NOT NULL REFERENCES nk_athletes(id) ON DELETE CASCADE,
     completed   BOOLEAN NOT NULL DEFAULT FALSE,
     notes       TEXT,
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (item_id, athlete_id)
  )`,

  // Best-effort carry-over of the old shared completed/notes into the new
  // per-athlete table, only for single-athlete events (unambiguous owner).
  // Guarded by information_schema since nk_event_items.completed is
  // dropped by the statement below on a later run of this same script.
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'nk_event_items' AND column_name = 'completed'
     ) THEN
       INSERT INTO nk_event_item_athlete_status (item_id, athlete_id, completed, notes)
         SELECT i.id, ea.athlete_id, i.completed, i.notes
         FROM nk_event_items i
         JOIN nk_event_athletes ea ON ea.event_id = i.event_id
         WHERE (i.completed = TRUE OR i.notes IS NOT NULL)
           AND (SELECT COUNT(*) FROM nk_event_athletes ea2 WHERE ea2.event_id = i.event_id) = 1
         ON CONFLICT (item_id, athlete_id) DO NOTHING;
     END IF;
   END $$`,

  `ALTER TABLE nk_event_items DROP COLUMN IF EXISTS completed`,

  // Simple single-block events (no itemized itinerary) still need their
  // own per-athlete status/notes record, same shape as items above.
  `CREATE TABLE IF NOT EXISTS nk_event_athlete_status (
     event_id    INTEGER NOT NULL REFERENCES nk_events(id) ON DELETE CASCADE,
     athlete_id  INTEGER NOT NULL REFERENCES nk_athletes(id) ON DELETE CASCADE,
     status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'completed', 'failed')),
     notes       TEXT,
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (event_id, athlete_id)
  )`,

  // Completion moves from a plain boolean to a three-way status so an
  // athlete/coach can flag a task as failed, not just done-or-not.
  //
  // `completed` is intentionally never dropped: an already-shipped
  // migration statement further up unconditionally re-adds
  // nk_event_items.completed every deploy (its own ADD/DROP pair is
  // self-contained) and, whenever that column exists, backfills into
  // nk_event_item_athlete_status.completed as an INSERT target. Since
  // that guard is satisfied on every future deploy, dropping this
  // column here would break that INSERT permanently. The app itself
  // never reads or writes `completed` after this point.
  `ALTER TABLE nk_event_item_athlete_status
     ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'`,

  // One-time backfill, gated on the status check constraint not existing
  // yet (added at the end of this same migration, permanently, right
  // after) rather than on `completed`'s existence, since `completed`
  // itself is never removed and would otherwise re-run this every
  // deploy, clobbering any status change made after the first deploy.
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'nk_event_item_athlete_status_status_check'
     ) THEN
       UPDATE nk_event_item_athlete_status SET status = 'completed' WHERE completed = TRUE;
     END IF;
   END $$`,

  // Safe to rerun every deploy: the DROP happens first each time.
  `ALTER TABLE nk_event_item_athlete_status
     DROP CONSTRAINT IF EXISTS nk_event_item_athlete_status_status_check`,
  `ALTER TABLE nk_event_item_athlete_status
     ADD CONSTRAINT nk_event_item_athlete_status_status_check
     CHECK (status IN ('pending', 'completed', 'failed'))`,

  // Shared by every occurrence generated from one repeat request, so a
  // "delete whole series" action can find its siblings. Null for
  // manually-created (non-repeating) items.
  `ALTER TABLE nk_event_items ADD COLUMN IF NOT EXISTS recurrence_id UUID`,

  // A club-admin-generated, multi-use, no-expiry token for a shareable
  // join link (unlike nk_athletes.link_pin, which is single-use/short-
  // lived). Null means no active join link for that club.
  `ALTER TABLE nk_clubs ADD COLUMN IF NOT EXISTS join_token VARCHAR(64)`,
  // Safe to rerun every deploy: the DROP happens first each time.
  `ALTER TABLE nk_clubs DROP CONSTRAINT IF EXISTS nk_clubs_join_token_unique`,
  `ALTER TABLE nk_clubs ADD CONSTRAINT nk_clubs_join_token_unique UNIQUE (join_token)`,

  // Squads and groups: club-scoped named athlete collections (e.g. a
  // competition squad, a training-level group), managed by that club's
  // admin. Structurally identical - two separate concepts per the
  // domain, not one generic table - so each gets its own table/join
  // table, mirroring nk_karate_styles' global-list + join-table shape
  // but scoped to a single club instead of being shared globally.
  `CREATE TABLE IF NOT EXISTS nk_squads (
     id         SERIAL PRIMARY KEY,
     club_id    INTEGER NOT NULL REFERENCES nk_clubs(id) ON DELETE CASCADE,
     name       VARCHAR(100) NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS nk_squad_athletes (
     squad_id   INTEGER NOT NULL REFERENCES nk_squads(id) ON DELETE CASCADE,
     athlete_id INTEGER NOT NULL REFERENCES nk_athletes(id) ON DELETE CASCADE,
     PRIMARY KEY (squad_id, athlete_id)
   )`,
  `CREATE TABLE IF NOT EXISTS nk_groups (
     id         SERIAL PRIMARY KEY,
     club_id    INTEGER NOT NULL REFERENCES nk_clubs(id) ON DELETE CASCADE,
     name       VARCHAR(100) NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS nk_group_athletes (
     group_id   INTEGER NOT NULL REFERENCES nk_groups(id) ON DELETE CASCADE,
     athlete_id INTEGER NOT NULL REFERENCES nk_athletes(id) ON DELETE CASCADE,
     PRIMARY KEY (group_id, athlete_id)
   )`,

  // Venues: club_id NULL means a global venue (admin-managed, usable by
  // any club/event); club_id set means that club's own venue, managed
  // by that club's admin.
  `CREATE TABLE IF NOT EXISTS nk_venues (
     id         SERIAL PRIMARY KEY,
     club_id    INTEGER REFERENCES nk_clubs(id) ON DELETE CASCADE,
     name       VARCHAR(150) NOT NULL,
     address    VARCHAR(300),
     notes      TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE nk_events ADD COLUMN IF NOT EXISTS venue_id INTEGER REFERENCES nk_venues(id) ON DELETE SET NULL`,

  // Grades unify what used to be a free-text `belt` column into a proper,
  // ordered reference list: standard kyu (descending 9th->1st, beginner to
  // advanced) then dan grades, each carrying its conventional belt color.
  // club_id NULL means a standard grade, available everywhere; club_id set
  // means that club's own override list, which takes precedence over the
  // standard list for that club's athletes (management UI decides which
  // list to show, same override-not-merge relationship as club karate
  // styles vs. the global list). rank_order is a flat, ascending
  // beginner->advanced scale spanning both kinds, used for sorting/
  // comparing progression regardless of kind.
  `CREATE TABLE IF NOT EXISTS nk_grade_levels (
     id         SERIAL PRIMARY KEY,
     club_id    INTEGER REFERENCES nk_clubs(id) ON DELETE CASCADE,
     kind       VARCHAR(10) NOT NULL CHECK (kind IN ('kyu', 'dan')),
     rank_order INTEGER NOT NULL,
     name       VARCHAR(100) NOT NULL,
     belt_color VARCHAR(50) NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // Two partial unique indexes instead of one plain UNIQUE(club_id, name):
  // Postgres treats NULLs as distinct for uniqueness purposes, so a plain
  // constraint wouldn't stop the standard-grade seed below from
  // duplicating on every migration re-run.
  `CREATE UNIQUE INDEX IF NOT EXISTS nk_grade_levels_global_name_idx
     ON nk_grade_levels (name) WHERE club_id IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS nk_grade_levels_club_name_idx
     ON nk_grade_levels (club_id, name) WHERE club_id IS NOT NULL`,

  `INSERT INTO nk_grade_levels (kind, rank_order, name, belt_color) VALUES
     ('kyu', 1, '9th Kyu', 'white'),
     ('kyu', 2, '8th Kyu', 'yellow'),
     ('kyu', 3, '7th Kyu', 'orange'),
     ('kyu', 4, '6th Kyu', 'green'),
     ('kyu', 5, '5th Kyu', 'blue'),
     ('kyu', 6, '4th Kyu', 'purple'),
     ('kyu', 7, '3rd Kyu', 'brown'),
     ('kyu', 8, '2nd Kyu', 'brown'),
     ('kyu', 9, '1st Kyu', 'brown'),
     ('dan', 10, '1st Dan', 'black'),
     ('dan', 11, '2nd Dan', 'black'),
     ('dan', 12, '3rd Dan', 'black'),
     ('dan', 13, '4th Dan', 'black'),
     ('dan', 14, '5th Dan', 'black'),
     ('dan', 15, '6th Dan', 'black'),
     ('dan', 16, '7th Dan', 'black'),
     ('dan', 17, '8th Dan', 'black'),
     ('dan', 18, '9th Dan', 'black'),
     ('dan', 19, '10th Dan', 'black')
   ON CONFLICT (name) WHERE club_id IS NULL DO NOTHING`,

  `ALTER TABLE nk_athletes ADD COLUMN IF NOT EXISTS grade_id INTEGER REFERENCES nk_grade_levels(id) ON DELETE SET NULL`,
  // Best-effort backfill from the old free-text belt to the lowest-ranked
  // standard grade sharing that belt color (e.g. every "brown" belt maps
  // to 3rd Kyu, the first brown grade) - fully correctable afterward via
  // the athlete's grade picker. Guarded by a column-existence check (not
  // just IF NOT EXISTS on the later DROP) since re-running this same
  // statement after the belt column is gone would otherwise error out on
  // every subsequent deploy.
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'nk_athletes' AND column_name = 'belt'
     ) THEN
       UPDATE nk_athletes a
       SET grade_id = g.id
       FROM (
         SELECT DISTINCT ON (belt_color) id, belt_color
         FROM nk_grade_levels
         WHERE club_id IS NULL
         ORDER BY belt_color, rank_order
       ) g
       WHERE a.grade_id IS NULL AND a.belt = g.belt_color;
     END IF;
   END $$`,
  `ALTER TABLE nk_athletes DROP COLUMN IF EXISTS belt`,

  // nk_grades already existed (unused) as a per-athlete grading-history
  // table; extended in place rather than replaced, since its shape (one
  // row per grading attempt) is exactly the "coach records a grading
  // against an athlete" record. `belt` (free text) is replaced by
  // `grade_id` (the grade attained), `event_id` optionally links to the
  // Grading event/session it happened at, `recorded_by_coach_id` is who
  // recorded it.
  `ALTER TABLE nk_grades ADD COLUMN IF NOT EXISTS grade_id INTEGER REFERENCES nk_grade_levels(id) ON DELETE SET NULL`,
  `ALTER TABLE nk_grades ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES nk_events(id) ON DELETE SET NULL`,
  `ALTER TABLE nk_grades ADD COLUMN IF NOT EXISTS recorded_by_coach_id INTEGER REFERENCES nk_coaches(id) ON DELETE SET NULL`,
  `ALTER TABLE nk_grades DROP COLUMN IF EXISTS belt`,

  // The "Grading" event type needs both the JS-level EVENT_TYPES/ITEM_TYPES
  // arrays (already updated in events.js) and these DB-level CHECK
  // constraints extended - same DROP-then-ADD pattern already used above
  // for item_type when kata_performance was added, safe to rerun every
  // deploy since the DROP happens first each time.
  `ALTER TABLE nk_events DROP CONSTRAINT IF EXISTS nk_events_event_type_check;
   ALTER TABLE nk_events ADD CONSTRAINT nk_events_event_type_check
     CHECK (event_type IN ('competition','squad_session','training','travel',
       'time_off','seminar','training_camp','grading'))`,
  `ALTER TABLE nk_event_items DROP CONSTRAINT IF EXISTS nk_event_items_item_type_check;
   ALTER TABLE nk_event_items ADD CONSTRAINT nk_event_items_item_type_check
     CHECK (item_type IN ('competition','squad_session','training','travel',
       'time_off','seminar','training_camp','rest','other','kata_performance','grading'))`,

  // Events and itinerary items now share the exact same type set (a lone
  // event can be a rest day, a one-off note, or a kata performance just
  // like an itinerary item can) - supersedes the grading-only constraint
  // above with the full unified list. Events also gain their own
  // `kata_id` (mirrors `training_module_id`, used when event_type is
  // 'kata_performance') and `recurrence_id` (mirrors
  // nk_event_items.recurrence_id - a whole event can now be generated as
  // part of a repeating series the same way an itinerary item can).
  `ALTER TABLE nk_events DROP CONSTRAINT IF EXISTS nk_events_event_type_check;
   ALTER TABLE nk_events ADD CONSTRAINT nk_events_event_type_check
     CHECK (event_type IN ('competition','squad_session','training','travel',
       'time_off','seminar','training_camp','grading','rest','other','kata_performance'))`,
  `ALTER TABLE nk_events ADD COLUMN IF NOT EXISTS kata_id INTEGER REFERENCES nk_katas(id) ON DELETE SET NULL`,
  `ALTER TABLE nk_events ADD COLUMN IF NOT EXISTS recurrence_id UUID`,
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
