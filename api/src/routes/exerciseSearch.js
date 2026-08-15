const { Router } = require("express");
const authorize = require("../middleware/authorize");
const asyncHandler = require("../utils/asyncHandler");
const {
  ascendApiRequest,
  normalizeExerciseListItem,
  normalizeExerciseDetail,
} = require("../utils/ascendApi");

const router = Router();
router.use(authorize("coach"));

const RESULT_LIMIT = 20;

// Confirmed against a real AscendAPI key (see docs/ARCHITECTURE.md's
// AscendAPI bullet): `name` fuzzy-matches by relevance (not a strict
// substring), cursor-paginated via meta.nextCursor/hasNextPage.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    try {
      const body = await ascendApiRequest("/api/v1/exercises", {
        name: req.query.name,
        cursor: req.query.cursor,
        limit: RESULT_LIMIT,
      });
      res.json({
        exercises: (body.data ?? []).map(normalizeExerciseListItem),
        nextCursor: body.meta?.nextCursor ?? null,
        hasNextPage: !!body.meta?.hasNextPage,
      });
    } catch (err) {
      res.status(err.status ?? 502).json({ error: { message: err.message } });
    }
  })
);

// Maps one AscendAPI exercise detail onto the training-module exercise
// item fields it's meant to pre-fill (name/explanation/video_url/
// image_url - see api/src/routes/trainingModules.js's nk_training_module_items
// columns) rather than the app carrying AscendAPI's own shape further
// than this one translation point. sets/reps/duration stay coach-entered
// since AscendAPI doesn't provide those.
router.get(
  "/:exerciseId",
  asyncHandler(async (req, res) => {
    try {
      const body = await ascendApiRequest(
        `/api/v1/exercises/${encodeURIComponent(req.params.exerciseId)}`
      );
      res.json(normalizeExerciseDetail(body.data ?? {}));
    } catch (err) {
      res.status(err.status ?? 502).json({ error: { message: err.message } });
    }
  })
);

module.exports = router;
