const express = require("express");
const router = express.Router();

const controller = require("../controllers/permissionsDiagnosticController");
const { verifyToken, checkPermission } = require("../middleware/authMiddleware");

router.get(
  "/users",
  verifyToken,
  checkPermission("menu_users_enabled"),
  controller.listUsersLite
);

router.get(
  "/user/:id",
  verifyToken,
  checkPermission("menu_users_enabled"),
  controller.diagnoseUser
);

module.exports = router;