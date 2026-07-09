const { Router } = require("express");
const health = require("./health");
const auth = require("./auth");
const adminUsers = require("./adminUsers");
const associations = require("./associations");
const clubs = require("./clubs");
const athletes = require("./athletes");
const coaches = require("./coaches");
const publicClubs = require("./publicClubs");
const events = require("./events");
const trainingModules = require("./trainingModules");
const katas = require("./katas");

const router = Router();

router.use("/health", health);
router.use("/auth", auth);
router.use("/admin/users", adminUsers);
router.use("/admin/associations", associations);
router.use("/admin/clubs", clubs);
router.use("/athletes", athletes);
router.use("/admin/coaches", coaches);
router.use("/public/clubs", publicClubs);
router.use("/events", events);
router.use("/training-modules", trainingModules);
router.use("/katas", katas);

module.exports = router;
