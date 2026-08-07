const { Router } = require("express");
const crypto = require("crypto");
const pool = require("../db/pool");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");
const tokenCrypto = require("../utils/tokenCrypto");
const googleCalendar = require("../utils/googleCalendar");

const router = Router();

const STATE_COOKIE = "google_oauth_state";

// GET /callback is a top-level cross-site redirect from Google, not a
// same-origin fetch - it can't go through the normal authorize() gate
// (which 401s), since some clients (e.g. an installed PWA's webview) may
// not carry the session cookie on that navigation. It checks req.user
// itself and redirects to login instead of hard-failing.
router.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const appUrl = process.env.PUBLIC_APP_URL;
    const { code, state, error } = req.query ?? {};
    const cookieState = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE);

    if (!req.user) {
      return res.redirect(`${appUrl}/login?next=/more/google-calendar`);
    }

    if (error || !code || !state || !cookieState || state !== cookieState) {
      return res.redirect(`${appUrl}/more/google-calendar?error=1`);
    }

    const tokens = await googleCalendar.exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Google only issues a refresh token on the first-ever consent (or
      // when prompt=consent forces re-consent, which /connect always
      // sets) - if it's still missing here something's wrong upstream,
      // and storing an account with no refresh token would just break
      // silently the moment the access token expires.
      return res.redirect(`${appUrl}/more/google-calendar?error=1`);
    }

    const userInfo = await googleCalendar.fetchUserInfo(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await pool.query(
      `INSERT INTO nk_google_calendar_accounts
         (user_id, google_email, access_token, refresh_token, token_expires_at, needs_reauth, last_error, updated_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, NULL, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         google_email = $2, access_token = $3, refresh_token = $4, token_expires_at = $5,
         needs_reauth = FALSE, last_error = NULL, updated_at = NOW()`,
      [
        req.user.id,
        userInfo?.email ?? null,
        tokenCrypto.encrypt(tokens.access_token),
        tokenCrypto.encrypt(tokens.refresh_token),
        expiresAt,
      ]
    );

    googleCalendar
      .backfillUpcomingEvents(req.user.id)
      .catch((err) => console.error("[google-calendar] backfill failed:", err));

    res.redirect(`${appUrl}/more/google-calendar?connected=1`);
  })
);

router.use(authorize());

router.get(
  "/status",
  asyncHandler(async (req, res) => {
    const [adminConfigured, { rows }] = await Promise.all([
      googleCalendar.isConfigured(),
      pool.query(
        `SELECT google_email, needs_reauth FROM nk_google_calendar_accounts WHERE user_id = $1`,
        [req.user.id]
      ),
    ]);

    const account = rows[0];
    res.json({
      admin_configured: adminConfigured,
      connected: !!account,
      google_email: account?.google_email ?? null,
      needs_reauth: account?.needs_reauth ?? false,
    });
  })
);

router.get(
  "/connect",
  asyncHandler(async (req, res) => {
    if (!(await googleCalendar.isConfigured())) {
      return res.status(400).json({ error: { message: "Google Calendar is not configured" } });
    }

    const state = crypto.randomBytes(24).toString("hex");
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 5 * 60 * 1000,
    });

    res.redirect(await googleCalendar.buildAuthorizeUrl(state));
  })
);

router.delete(
  "/disconnect",
  asyncHandler(async (req, res) => {
    await googleCalendar.disconnectUser(req.user.id);
    res.status(204).end();
  })
);

module.exports = router;
