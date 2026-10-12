const express = require("express");
const router = express.Router();

const reportsController = require("../controllers/reportsController");

/* ===================================================== */
/* Reporte de asistencia */
/* ===================================================== */

router.get(
  "/attendance",
  reportsController.attendanceReport
);

/* ===================================================== */
/* Resumen diario */
/* ===================================================== */

router.get(
  "/summary/daily",
  reportsController.dailySummary
);

/* ===================================================== */
/* Exportación XLSX */
/* ===================================================== */

router.get(
  "/attendance/export.xlsx",
  reportsController.exportAttendanceXlsx
);

/* ===================================================== */
/* Datos completos para PDF */
/* ===================================================== */

router.get(
  "/attendance/export-data",
  reportsController.exportAttendanceData
);

/* ===================================================== */
/* Reporte por empleado */
/* ===================================================== */

router.get(
  "/employee/:employee_id",
  reportsController.byEmployee
);

/* ===================================================== */
/* Reporte por tarjeta */
/* ===================================================== */

router.get(
  "/card/:card_id",
  reportsController.byCard
);

module.exports = router;
