const { Router } = require("express");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");
const { getS3Config, publicUrlFor } = require("../utils/s3");

const router = Router();
router.use(authorize.requireAdmin);

router.get(
  "/branding-icon",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT value FROM nk_settings WHERE key = 'branding_icon_url'`
    );
    res.json({ url: rows[0]?.value ?? null });
  })
);

router.patch(
  "/branding-icon",
  asyncHandler(async (req, res) => {
    const { url } = req.body ?? {};
    if (typeof url !== "string" || !url.trim()) {
      return res.status(400).json({ error: { message: "url is required" } });
    }

    await pool.query(
      `INSERT INTO nk_settings (key, value, updated_at)
       VALUES ('branding_icon_url', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [url]
    );
    res.json({ url });
  })
);

// GET/PATCH/DELETE triple for a secret stored in nk_settings. Never echoed
// back to the client once saved - GET only reports whether one is
// configured (from nk_settings or, as a fallback for keys that started
// life as an .env-only setting, process.env), so the admin UI can offer a
// setup form without needing to display or re-enter a live secret.
function registerSecretRoutes(path, settingsKey, envFallback) {
  router.get(
    path,
    asyncHandler(async (req, res) => {
      const { rows } = await pool.query(
        `SELECT value FROM nk_settings WHERE key = $1`,
        [settingsKey]
      );
      const configured = !!(rows[0]?.value || (envFallback && process.env[envFallback]));
      res.json({ configured });
    })
  );

  router.patch(
    path,
    asyncHandler(async (req, res) => {
      const { api_key } = req.body ?? {};
      if (typeof api_key !== "string" || !api_key.trim()) {
        return res.status(400).json({ error: { message: "api_key is required" } });
      }

      await pool.query(
        `INSERT INTO nk_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [settingsKey, api_key.trim()]
      );
      res.json({ configured: true });
    })
  );

  router.delete(
    path,
    asyncHandler(async (req, res) => {
      await pool.query(`DELETE FROM nk_settings WHERE key = $1`, [settingsKey]);
      const configured = !!(envFallback && process.env[envFallback]);
      res.json({ configured });
    })
  );
}

// Osu's Anthropic API key, for talking to Claude.
registerSecretRoutes("/anthropic-key", "anthropic_api_key", "ANTHROPIC_API_KEY");

// Osu's Brave Search API key, for the web_search tool.
registerSecretRoutes("/brave-key", "brave_api_key", "BRAVE_API_KEY");

// The app's own Google OAuth client, used for the Google Calendar sync
// connect flow (api/src/routes/googleCalendar.js) - not a per-user secret.
registerSecretRoutes("/google-client-id", "google_client_id", "GOOGLE_CLIENT_ID");
registerSecretRoutes("/google-client-secret", "google_client_secret", "GOOGLE_CLIENT_SECRET");

// AscendAPI's ExerciseDB (RapidAPI) - lets Training modules pull real
// exercise data (video/image, target muscles, equipment, instructions)
// instead of every exercise item being typed/uploaded by hand. See
// api/src/routes/ascendApi.js for where this key is used.
registerSecretRoutes("/ascendapi-key", "ascendapi_key", "ASCENDAPI_KEY");

// S3 storage for uploads (api/src/utils/s3.js, api/src/routes/uploads.js,
// api/src/routes/publicBranding.js) - bucket/region/access key id aren't
// sensitive on their own so they're shown back to the admin (like
// branding-icon/default-timezone above), only secret_access_key is
// write-only like the registerSecretRoutes keys. A PATCH only touches
// whichever fields are present in the body (same dynamic-SET-clause
// convention as every other PATCH in the app) so e.g. rotating just the
// secret key doesn't require resending the bucket/region too. Uploads
// fall back to local disk automatically whenever this isn't (fully)
// configured - see docs/ARCHITECTURE.md's S3 storage bullet for the
// bucket policy / IAM policy needed on the AWS side.
router.get(
  "/s3-config",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT key, value FROM nk_settings WHERE key IN (
         's3_bucket', 's3_region', 's3_access_key_id', 's3_secret_access_key', 's3_public_base_url'
       )`
    );
    const found = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({
      bucket: found.s3_bucket ?? null,
      region: found.s3_region ?? null,
      access_key_id: found.s3_access_key_id ?? null,
      public_base_url: found.s3_public_base_url ?? null,
      secret_access_key_configured: !!found.s3_secret_access_key,
    });
  })
);

router.patch(
  "/s3-config",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const fields = {
      s3_bucket: body.bucket,
      s3_region: body.region,
      s3_access_key_id: body.access_key_id,
      s3_secret_access_key: body.secret_access_key,
      s3_public_base_url: body.public_base_url,
    };

    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (value === null || String(value).trim() === "") {
        await pool.query(`DELETE FROM nk_settings WHERE key = $1`, [key]);
      } else {
        await pool.query(
          `INSERT INTO nk_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
          [key, String(value).trim()]
        );
      }
    }
    res.json({ ok: true });
  })
);

router.delete(
  "/s3-config",
  asyncHandler(async (req, res) => {
    await pool.query(
      `DELETE FROM nk_settings WHERE key IN (
         's3_bucket', 's3_region', 's3_access_key_id', 's3_secret_access_key', 's3_public_base_url'
       )`
    );
    res.json({ ok: true });
  })
);

// One fixed key, overwritten in place on every run (rather than a fresh
// UUID each time) so repeat testing doesn't litter the bucket with
// throwaway objects - the app never deletes uploaded media anywhere else
// either, so this deliberately doesn't need s3:DeleteObject added to the
// IAM policy documented in docs/ARCHITECTURE.md. Uploads a real object
// (proves the credentials + s3:PutObject actually work), then fetches
// its own public URL unauthenticated (proves the bucket policy actually
// grants public s3:GetObject too - a PutObject success alone wouldn't
// catch a bucket that still blocks public reads).
router.post(
  "/s3-config/test",
  asyncHandler(async (req, res) => {
    const s3 = await getS3Config();
    if (!s3) {
      return res.status(400).json({
        error: {
          message:
            "S3 isn't fully configured yet - fill in bucket, region, access key, and secret above, then save before testing.",
        },
      });
    }

    const client = new S3Client({
      region: s3.region,
      credentials: {
        accessKeyId: s3.accessKeyId,
        secretAccessKey: s3.secretAccessKey,
      },
    });
    const key = "_connection-test.txt";

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: s3.bucket,
          Key: key,
          Body: `Nada Karate S3 connection test - ${new Date().toISOString()}`,
          ContentType: "text/plain",
        })
      );
    } catch (err) {
      return res.status(502).json({
        error: {
          message: `Upload failed: ${err.message} - check the bucket name/region, and that the IAM user has s3:PutObject on this bucket.`,
        },
      });
    }

    const url = publicUrlFor(s3, key);
    try {
      const getRes = await fetch(url);
      if (!getRes.ok) {
        return res.status(502).json({
          error: {
            message: `Upload worked, but the public URL returned ${getRes.status} - check the bucket policy grants public s3:GetObject (see docs/ARCHITECTURE.md's "S3 Storage Setup").`,
          },
          url,
        });
      }
    } catch (err) {
      return res.status(502).json({
        error: { message: `Upload worked, but fetching the public URL failed: ${err.message}` },
        url,
      });
    }

    res.json({ ok: true, url });
  })
);

// Not a secret (the admin needs to see/edit it), so it gets its own
// GET/PATCH pair modeled on branding-icon above rather than
// registerSecretRoutes. One global IANA timezone covers every synced
// event, since the app has no per-club timezone concept anywhere today.
router.get(
  "/default-timezone",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT value FROM nk_settings WHERE key = 'default_timezone'`
    );
    res.json({ value: rows[0]?.value ?? "UTC" });
  })
);

router.patch(
  "/default-timezone",
  asyncHandler(async (req, res) => {
    const { value } = req.body ?? {};
    if (typeof value !== "string" || !value.trim()) {
      return res.status(400).json({ error: { message: "value is required" } });
    }

    await pool.query(
      `INSERT INTO nk_settings (key, value, updated_at)
       VALUES ('default_timezone', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [value.trim()]
    );
    res.json({ value: value.trim() });
  })
);

module.exports = router;
