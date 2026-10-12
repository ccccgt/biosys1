const express = require("express");
const router = express.Router();
const { extractManual } = require("../service/chiyu.service");

// PERIOD: inserta en registros_MM_YYYY
router.post("/extract", async (req, res) => {
  try {
    const { start_date, end_date } = req.body;
    if (!start_date || !end_date) {
      return res.status(400).json({ message: "start_date y end_date requeridos" });
    }

    await extractManual(start_date, end_date, "PERIOD");
    return res.json({ message: "Extracción completada correctamente (PERIOD)" });
  } catch (e) {
    console.error("❌ Extract error:", e);
    return res.status(500).json({ message: "Error en extracción" });
  }
});

// CACHE: inserta en attendance_cache (temporal)
router.post("/cache-fill", async (req, res) => {
  try {
    const { start_date, end_date } = req.body;
    if (!start_date || !end_date) {
      return res.status(400).json({ message: "start_date y end_date requeridos" });
    }

    const s = new Date(`${start_date}T00:00:00`);
    const e = new Date(`${end_date}T00:00:00`);
    if (isNaN(s) || isNaN(e)) {
      return res.status(400).json({ message: "Fechas inválidas" });
    }

    const days = Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1;
    if (days > 7) {
      return res.status(400).json({ message: "cache-fill máximo 7 días por petición" });
    }

    await extractManual(start_date, end_date, "CACHE");
    return res.json({ message: "Cache llenado correctamente (LIVE)" });
  } catch (e) {
    console.error("❌ cache-fill error:", e);
    return res.status(500).json({ message: "Error llenando cache" });
  }
});

module.exports = router;