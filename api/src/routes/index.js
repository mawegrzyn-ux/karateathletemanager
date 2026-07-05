const { Router } = require("express");
const health = require("./health");

const router = Router();

router.use("/health", health);

module.exports = router;
