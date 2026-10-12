const express = require("express");
const router = express.Router();
const controller = require("../controllers/systemUsersController");
const { verifyToken, checkPermission } = require("../middleware/authMiddleware");

router.get("/", verifyToken, checkPermission("menu_users_enabled"), controller.listUsers);
router.get("/roles", verifyToken, checkPermission("menu_users_enabled"), controller.listRoles);
router.get("/:id", verifyToken, checkPermission("menu_users_enabled"), controller.getUserById);
router.put("/:id", verifyToken, checkPermission("menu_users_enabled"), controller.updateUser);
router.post("/:id/resync-ad", verifyToken, checkPermission("menu_users_enabled"), controller.resyncFromAd);
router.get("/:id/employee-match", verifyToken, checkPermission("menu_users_enabled"), controller.employeeMatch);

module.exports = router;