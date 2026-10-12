const express = require("express");
const router = express.Router();
const controller = require("../controllers/markRequestsController");
const { verifyToken } = require("../middleware/authMiddleware");

router.get("/me-context", verifyToken, controller.getMyContext);
router.post("/", verifyToken, controller.createRequest);
router.get("/mine", verifyToken, controller.listMyRequests);
router.get("/all", verifyToken, controller.listAllRequests);
router.get("/:id", verifyToken, controller.getRequestById);
router.post("/:id/approve", verifyToken, controller.approveRequest);
router.post("/:id/reject", verifyToken, controller.rejectRequest);

module.exports = router;