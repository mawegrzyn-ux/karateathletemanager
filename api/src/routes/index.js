const { Router } = require("express");
const health = require("./health");
const auth = require("./auth");
const adminUsers = require("./adminUsers");

const router = Router();

router.use("/health", health);
router.use("/auth", auth);
router.use("/admin/users", adminUsers);

module.exports = router;
