const express = require("express");
const router = express.Router();
const devicesController = require("../controllers/devicesController");

// GET /api/devices
router.get("/", devicesController.listDevices);

// GET /api/devices/:id/doors
router.get("/:id/doors", devicesController.listDeviceDoors);

module.exports = router;