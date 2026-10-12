const express = require("express");
const multer = require("multer");
const uploadController = require("../controllers/uploadController");
const { verifyToken, checkRole } = require("../middleware/authMiddleware");

const router = express.Router();

const upload = multer({ dest: "uploads/" });

router.post(
  "/",
  verifyToken,
  checkRole(["admin", "supervisor"]),
  upload.single("file"),
  uploadController.uploadCSV
);

module.exports = router;
