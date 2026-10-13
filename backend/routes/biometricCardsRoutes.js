const express = require("express");
const router = express.Router();

const controller = require("../controllers/biometricCardsController");
const {
  verifyToken,
  checkPermission,
} = require("../middleware/authMiddleware");

router.get(
  "/employees/search",
  verifyToken,
  checkPermission("biometric_users_enabled"),
  controller.searchEmployees
);

router.post(
  "/status",
  verifyToken,
  checkPermission("biometric_users_enabled"),
  controller.checkCardStatus
);

router.post(
  "/action",
  verifyToken,
  checkPermission("biometric_users_enabled"),
  controller.changeCardStatus
);


router.post(
  "/delete",
  verifyToken,
  checkPermission("biometric_users_enabled"),
  controller.deleteCard
);

module.exports = router;
