const { Router } = require("express");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");
const { ascendApiRequest } = require("../utils/ascendApi");

const router = Router();
router.use(authorize.requireAdmin);

// Admin-only raw-passthrough endpoints backing admin/AscendApiKey.tsx's
// "Test connection" panel - kept around after the real integration
// (exerciseSearch.js) shipped, since it's still useful for checking a
// freshly-pasted key or inspecting a response shape without digging
// through browser devtools.
function registerPassthrough(path, upstreamPath) {
  router.get(
    path,
    asyncHandler(async (req, res) => {
      try {
        const body = await ascendApiRequest(upstreamPath, req.query);
        res.json(body);
      } catch (err) {
        res.status(err.status ?? 502).json({ error: { message: err.message } });
      }
    })
  );
}

registerPassthrough("/bodyparts", "/api/v1/bodyparts");
registerPassthrough("/equipments", "/api/v1/equipments");
registerPassthrough("/muscles", "/api/v1/muscles");
registerPassthrough("/exercisetypes", "/api/v1/exercisetypes");
registerPassthrough("/exercises", "/api/v1/exercises");

router.get(
  "/exercises/:exerciseId",
  asyncHandler(async (req, res) => {
    try {
      const body = await ascendApiRequest(
        `/api/v1/exercises/${encodeURIComponent(req.params.exerciseId)}`,
        req.query
      );
      res.json(body);
    } catch (err) {
      res.status(err.status ?? 502).json({ error: { message: err.message } });
    }
  })
);

module.exports = router;
