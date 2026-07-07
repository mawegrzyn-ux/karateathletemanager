const { Router } = require("express");
const health = require("./health");
const auth = require("./auth");
const adminUsers = require("./adminUsers");
const associations = require("./associations");
const clubs = require("./clubs");

const router = Router();

router.use("/health", health);
router.use("/auth", auth);
router.use("/admin/users", adminUsers);
router.use("/admin/associations", associations);
router.use("/admin/clubs", clubs);

module.exports = router;
