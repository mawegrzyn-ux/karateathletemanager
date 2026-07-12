const { Router } = require("express");
const authorize = require("../middleware/authorize");
const { registerVisibilityRoute } = require("../utils/visibleCollections");

const router = Router();

router.use(authorize());

registerVisibilityRoute(router, {
  key: "squads",
  table: "nk_squads",
  joinTable: "nk_squad_athletes",
  joinKey: "squad_id",
});

module.exports = router;
