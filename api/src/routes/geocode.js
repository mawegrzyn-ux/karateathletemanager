// Free address lookup for venue Address fields - proxies OpenStreetMap's
// Nominatim search API (no API key needed, unlike Brave Search) rather than
// calling it directly from the browser: Nominatim's usage policy requires a
// descriptive User-Agent identifying the calling application, which a
// browser's fetch can't set, and caps usage at ~1 request/second, which is
// easier to guarantee from one server process than from every client.
const { Router } = require("express");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");

const router = Router();
router.use(authorize());

const USER_AGENT = "NadaKarateAthleteManager/1.0 (https://nadakarate.com)";
const MIN_INTERVAL_MS = 1100;
let lastRequestAt = 0;

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) return res.json({ results: [] });

    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "5");

    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) {
      return res.status(502).json({ error: { message: "Address lookup failed" } });
    }
    const data = await response.json();
    res.json({
      results: data.map((r) => ({ display_name: r.display_name })),
    });
  })
);

module.exports = router;
