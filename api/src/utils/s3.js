const pool = require("../db/pool");

// Optional S3 storage for uploads (api/src/routes/uploads.js,
// api/src/routes/publicBranding.js) - admin-configurable via nk_settings
// (More > Configuration > S3 storage), same instant-effect-no-redeploy
// pattern as the Brave/Osu/AscendAPI keys, with an env-var fallback for
// bootstrapping before an admin has set anything. Returns null (not a
// partial config) unless bucket/region/access key/secret are all
// present, so callers can treat "not configured" as one simple check
// and fall back to local disk.
async function getS3Config() {
  const { rows } = await pool.query(
    `SELECT key, value FROM nk_settings WHERE key IN (
       's3_bucket', 's3_region', 's3_access_key_id', 's3_secret_access_key', 's3_public_base_url'
     )`
  );
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const bucket = settings.s3_bucket || process.env.AWS_S3_BUCKET;
  const region = settings.s3_region || process.env.AWS_REGION;
  const accessKeyId = settings.s3_access_key_id || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    settings.s3_secret_access_key || process.env.AWS_SECRET_ACCESS_KEY;
  const publicBaseUrl =
    settings.s3_public_base_url || process.env.S3_PUBLIC_BASE_URL || null;

  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;
  return { bucket, region, accessKeyId, secretAccessKey, publicBaseUrl };
}

// publicBaseUrl lets a custom domain or CDN (e.g. CloudFront) front the
// bucket instead of the raw virtual-hosted-style S3 URL - the bucket
// itself still needs a public-read bucket policy either way (see
// docs/ARCHITECTURE.md's S3 storage bullet for the exact policy JSON;
// modern S3 buckets have object ACLs disabled by default, so this app
// never sets a per-object ACL on PutObject).
function publicUrlFor(config, key) {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/+$/, "")}/${key}`;
  }
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

module.exports = { getS3Config, publicUrlFor };
