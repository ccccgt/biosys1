const express = require("express");
const router = express.Router();

const controller = require("../controllers/adGroupsCatalogController");
const { verifyToken, checkPermission } = require("../middleware/authMiddleware");

router.get("/", verifyToken, checkPermission("menu_users_enabled"), controller.list);
router.post("/sync", verifyToken, checkPermission("menu_users_enabled"), controller.sync);

module.exports = router;