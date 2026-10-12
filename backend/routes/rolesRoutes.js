const express = require("express");
const router = express.Router();

const controller = require("../controllers/rolesController");
const { verifyToken, checkPermission } = require("../middleware/authMiddleware");

router.get("/", verifyToken, checkPermission("menu_users_enabled"), controller.listRoles);
router.get("/:id", verifyToken, checkPermission("menu_users_enabled"), controller.getRolePermissions);
router.put("/:id", verifyToken, checkPermission("menu_users_enabled"), controller.updateRolePermissions);

module.exports = router;