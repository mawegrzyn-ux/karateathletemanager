// One-way sync of nk_events into each connected user's own Google
// Calendar (their primary calendar - see the plan notes on why not a
// dedicated secondary calendar: that needs Google's "restricted" `calendar`
// scope, which requires a paid third-party security assessment to get out
// of testing mode, versus the "sensitive" `calendar.events` scope used
// here). Plain fetch against Google's REST APIs, matching the no-SDK-
// dependency precedent already set by geocode.js, rather than adding the
// `googleapis` package for what's really a handful of endpoints.
const pool = require("../db/pool");
const tokenCrypto = require("./tokenCrypto");

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.events email";

async function getSetting(key, envFallback) {
  const { rows } = await pool.query(`SELECT value FROM nk_settings WHERE key = $1`, [key]);
  return rows[0]?.value || (envFallback && process.env[envFallback]) || null;
}

async function getClientCredentials() {
  const [clientId, clientSecret] = await Promise.all([
    getSetting("google_client_id", "GOOGLE_CLIENT_ID"),
    getSetting("google_client_secret", "GOOGLE_CLIENT_SECRET"),
  ]);
  return { clientId, clientSecret };
}

async function isConfigured() {
  const { clientId, clientSecret } = await getClientCredentials();
  return !!(clientId && clientSecret);
}

async function getDefaultTimezone() {
  return (await getSetting("default_timezone", null)) || "UTC";
}

function redirectUri() {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI;
}

async function buildAuthorizeUrl(state) {
  const { clientId } = await getClientCredentials();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeCodeForTokens(code) {
  const { clientId, clientSecret } = await getClientCredentials();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function fetchUserInfo(accessToken) {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = await getClientCredentials();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.error_description || body.error || "Token refresh failed");
    error.code = body.error;
    throw error;
  }
  return body;
}

// Returns a valid (refreshing if needed) plaintext access token for this
// user, or null if they're not connected or their connection is broken
// (needs_reauth) - callers should treat null as "skip this user" rather
// than throw, since a single broken connection must never block syncing
// everyone else on the same event.
async function getValidAccessToken(userId) {
  const { rows } = await pool.query(
    `SELECT access_token, refresh_token, token_expires_at
     FROM nk_google_calendar_accounts
     WHERE user_id = $1 AND needs_reauth = FALSE`,
    [userId]
  );
  if (rows.length === 0) return null;
  const account = rows[0];

  const expiresAt = new Date(account.token_expires_at).getTime();
  if (Date.now() < expiresAt - 60_000) {
    return tokenCrypto.decrypt(account.access_token);
  }

  try {
    const refreshToken = tokenCrypto.decrypt(account.refresh_token);
    const refreshed = await refreshAccessToken(refreshToken);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await pool.query(
      `UPDATE nk_google_calendar_accounts
       SET access_token = $1, token_expires_at = $2, refresh_token = COALESCE($3, refresh_token),
           last_error = NULL, updated_at = NOW()
       WHERE user_id = $4`,
      [
        tokenCrypto.encrypt(refreshed.access_token),
        newExpiresAt,
        refreshed.refresh_token ? tokenCrypto.encrypt(refreshed.refresh_token) : null,
        userId,
      ]
    );
    return refreshed.access_token;
  } catch (err) {
    await pool.query(
      `UPDATE nk_google_calendar_accounts
       SET needs_reauth = TRUE, last_error = $1, updated_at = NOW()
       WHERE user_id = $2`,
      [err.message, userId]
    );
    return null;
  }
}

// Google's `end.date` for an all-day event is exclusive - this app's own
// end_date is inclusive, so the day after has to be computed.
function addOneDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Three shapes an nk_events row can take (see docs/ARCHITECTURE.md's
// daily_times note): no times at all (all-day, possibly multi-day); times
// set with daily_times=false (one continuous span, even across days); and
// times set with daily_times=true (the same slot repeats identically every
// day - the only case that needs Google's own RRULE recurrence, distinct
// from this app's separate `repeat` feature which already generates
// independent nk_events rows needing no Google-side recurrence at all).
function eventToGoogleBody(event, timezone) {
  const base = {
    summary: event.title,
    description: event.notes || undefined,
    location: event.location || undefined,
  };

  if (!event.start_time || !event.end_time) {
    return {
      ...base,
      start: { date: event.start_date },
      end: { date: addOneDay(event.end_date) },
    };
  }

  const startTime = event.start_time.slice(0, 5);
  const endTime = event.end_time.slice(0, 5);

  if (event.daily_times && event.end_date !== event.start_date) {
    const until = `${event.end_date.replace(/-/g, "")}T235959Z`;
    return {
      ...base,
      start: { dateTime: `${event.start_date}T${startTime}:00`, timeZone: timezone },
      end: { dateTime: `${event.start_date}T${endTime}:00`, timeZone: timezone },
      recurrence: [`RRULE:FREQ=DAILY;UNTIL=${until}`],
    };
  }

  return {
    ...base,
    start: { dateTime: `${event.start_date}T${startTime}:00`, timeZone: timezone },
    end: { dateTime: `${event.end_date}T${endTime}:00`, timeZone: timezone },
  };
}

async function googleCalendarRequest(accessToken, method, path, body) {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Google Calendar API ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Upserts one nk_events row onto one user's primary calendar - PATCHes the
// existing Google event if we've already synced this (user, event) pair,
// else creates one and records the link.
async function syncEventForUser(userId, event) {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return;

  const [{ rows: accountRows }, { rows: linkRows }, timezone] = await Promise.all([
    pool.query(`SELECT calendar_id FROM nk_google_calendar_accounts WHERE user_id = $1`, [userId]),
    pool.query(
      `SELECT google_event_id FROM nk_google_calendar_events WHERE user_id = $1 AND event_id = $2`,
      [userId, event.id]
    ),
    getDefaultTimezone(),
  ]);
  if (accountRows.length === 0) return;
  const calendarId = accountRows[0].calendar_id;
  const body = eventToGoogleBody(event, timezone);

  if (linkRows.length > 0) {
    await googleCalendarRequest(
      accessToken,
      "PATCH",
      `/calendars/${encodeURIComponent(calendarId)}/events/${linkRows[0].google_event_id}`,
      body
    );
  } else {
    const created = await googleCalendarRequest(
      accessToken,
      "POST",
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      body
    );
    await pool.query(
      `INSERT INTO nk_google_calendar_events (user_id, event_id, google_event_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, event_id) DO UPDATE SET google_event_id = $3, updated_at = NOW()`,
      [userId, event.id, created.id]
    );
  }
}

// Deletes one already-synced Google event. Callers must pass the
// google_event_id/calendar_id captured *before* deleting the underlying
// nk_events row - its FK cascade removes the nk_google_calendar_events
// link row (the only record of which Google event this was) the instant
// the event itself is deleted, so there is no "look it up after" path.
async function deleteGoogleEvent(userId, calendarId, googleEventId) {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return;
  try {
    await googleCalendarRequest(
      accessToken,
      "DELETE",
      `/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`
    );
  } catch (err) {
    // Already gone on Google's side (manually deleted there) is fine -
    // anything else still shouldn't block the caller's own cleanup.
    if (!String(err.message).includes(" 410 ") && !String(err.message).includes(" 404 ")) {
      throw err;
    }
  }
}

// Resolves which connected users should see any of the given athletes'
// events - via nk_user_athletes (the *full* set of athlete profiles a
// login owns, see its own migration comment), not nk_users.athlete_id
// (documented there as just "the currently active profile pointer" -
// background sync isn't tied to whichever profile someone happens to be
// viewing right now).
async function connectedUserIdsForAthletes(athleteIds) {
  if (athleteIds.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT DISTINCT gca.user_id
     FROM nk_google_calendar_accounts gca
     JOIN nk_user_athletes ua ON ua.user_id = gca.user_id
     WHERE ua.athlete_id = ANY($1::int[]) AND gca.needs_reauth = FALSE`,
    [athleteIds]
  );
  return rows.map((r) => r.user_id);
}

// Fire-and-forget entry point for events.js's create/update hooks - never
// awaited on the response path, errors caught by the caller.
async function syncEventToConnectedUsers(event, athleteIds) {
  const userIds = await connectedUserIdsForAthletes(athleteIds);
  await Promise.all(userIds.map((userId) => syncEventForUser(userId, event)));
}

// Fire-and-forget entry point for events.js's delete hooks - `links` is
// the pre-delete snapshot of [{user_id, calendar_id, google_event_id}].
async function deleteEventFromConnectedUsers(links) {
  await Promise.all(
    links.map((link) => deleteGoogleEvent(link.user_id, link.calendar_id, link.google_event_id))
  );
  const eventIds = [...new Set(links.map((l) => l.event_id))];
  if (eventIds.length > 0) {
    await pool.query(`DELETE FROM nk_google_calendar_events WHERE event_id = ANY($1::int[])`, [
      eventIds,
    ]);
  }
}

// Removes every Google event this user has synced, then their account
// row (cascades any remaining link rows) - no calendar-level delete,
// since it's the user's own primary calendar, not a dedicated one.
async function disconnectUser(userId) {
  const { rows: accountRows } = await pool.query(
    `SELECT calendar_id FROM nk_google_calendar_accounts WHERE user_id = $1`,
    [userId]
  );
  if (accountRows.length === 0) return;
  const calendarId = accountRows[0].calendar_id;

  const { rows: links } = await pool.query(
    `SELECT google_event_id FROM nk_google_calendar_events WHERE user_id = $1`,
    [userId]
  );
  for (const link of links) {
    await deleteGoogleEvent(userId, calendarId, link.google_event_id).catch((err) =>
      console.error("[google-calendar] disconnect cleanup failed:", err)
    );
  }
  await pool.query(`DELETE FROM nk_google_calendar_accounts WHERE user_id = $1`, [userId]);
}

// Backfills every upcoming event (today onward) for a newly-connected
// user, batched rather than fired all at once to stay well clear of
// Google's per-user write quota.
async function backfillUpcomingEvents(userId) {
  const { rows: athleteRows } = await pool.query(
    `SELECT athlete_id FROM nk_user_athletes WHERE user_id = $1`,
    [userId]
  );
  const athleteIds = athleteRows.map((r) => r.athlete_id);
  if (athleteIds.length === 0) return;

  const { rows: events } = await pool.query(
    `SELECT DISTINCT e.id, e.title, e.start_date, e.end_date, e.start_time, e.end_time,
            e.daily_times, e.location, e.notes
     FROM nk_events e
     JOIN nk_event_athletes ea ON ea.event_id = e.id
     WHERE ea.athlete_id = ANY($1::int[]) AND e.end_date >= CURRENT_DATE
     ORDER BY e.start_date`,
    [athleteIds]
  );

  const BATCH_SIZE = 5;
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((event) => syncEventForUser(userId, event))).catch((err) =>
      console.error("[google-calendar] backfill batch failed:", err)
    );
  }
}

module.exports = {
  isConfigured,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchUserInfo,
  getValidAccessToken,
  eventToGoogleBody,
  syncEventForUser,
  syncEventToConnectedUsers,
  deleteEventFromConnectedUsers,
  connectedUserIdsForAthletes,
  disconnectUser,
  backfillUpcomingEvents,
  getDefaultTimezone,
};
