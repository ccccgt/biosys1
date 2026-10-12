const express = require("express");
const router = express.Router();

const controller = require("../controllers/adGroupRoleMapController");
const { verifyToken, checkPermission } = require("../middleware/authMiddleware");

router.get("/", verifyToken, checkPermission("menu_users_enabled"), controller.list);
router.get("/detected", verifyToken, checkPermission("menu_users_enabled"), controller.listDetectedGroups);
router.post("/", verifyToken, checkPermission("menu_users_enabled"), controller.create);
router.put("/:id", verifyToken, checkPermission("menu_users_enabled"), controller.update);
router.delete("/:id", verifyToken, checkPermission("menu_users_enabled"), controller.remove);

module.exports = router;