const { Router } = require("express");
const authorize = require("../middleware/authorize");
const { registerVisibilityRoute } = require("../utils/visibleCollections");

const router = Router();

router.use(authorize());

registerVisibilityRoute(router, {
  key: "groups",
  table: "nk_groups",
  joinTable: "nk_group_athletes",
  joinKey: "group_id",
});

module.exports = router;
