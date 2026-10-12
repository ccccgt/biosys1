const db = require("../config/db");

/**
 * Detecta cómo se llama el campo "nombre" en la tabla devices.
 * Soporta: name, device_name, nombre, terminal_name (fallback)
 */
let _devicesNameExpr = null;

async function getDevicesNameExpr() {
  if (_devicesNameExpr) return _devicesNameExpr;

  const [cols] = await db.query("SHOW COLUMNS FROM devices");
  const fields = new Set(cols.map((c) => String(c.Field).toLowerCase()));

  // intenta nombres comunes
  if (fields.has("name")) return (_devicesNameExpr = "name");
  if (fields.has("device_name")) return (_devicesNameExpr = "device_name");
  if (fields.has("nombre")) return (_devicesNameExpr = "nombre");
  if (fields.has("terminal_name")) return (_devicesNameExpr = "terminal_name");

  // fallback: usa ip_address si existe
  if (fields.has("ip_address")) return (_devicesNameExpr = "ip_address");

  // último fallback (evita crash)
  return (_devicesNameExpr = "CAST(id AS CHAR)");
}

/**
 * GET /api/devices
 * Devuelve: [{id, name}]
 */
exports.listDevices = async (req, res) => {
  try {
    const nameExpr = await getDevicesNameExpr();

    // Si existe columna active, filtramos por active=1
    const [cols] = await db.query("SHOW COLUMNS FROM devices");
    const fields = new Set(cols.map((c) => String(c.Field).toLowerCase()));
    const hasActive = fields.has("active");

    const sql = `
      SELECT
        id,
        ${nameExpr} AS name
      FROM devices
      ${hasActive ? "WHERE active = 1" : ""}
      ORDER BY id ASC
    `;

    const [rows] = await db.query(sql);
    return res.json(rows);
  } catch (e) {
    console.error("❌ listDevices:", e);
    return res.status(500).json({ message: "Error listando dispositivos" });
  }
};

/**
 * GET /api/devices/:id/doors
 * Devuelve: [{door_number, door_name}]
 */
exports.listDeviceDoors = async (req, res) => {
  try {
    const deviceId = Number(req.params.id);
    if (!Number.isFinite(deviceId)) {
      return res.status(400).json({ message: "device id inválido" });
    }

    const [rows] = await db.query(
      `
      SELECT door_number, door_name
      FROM device_doors
      WHERE device_id = ?
      ORDER BY door_number ASC
      `,
      [deviceId]
    );

    return res.json(rows);
  } catch (e) {
    console.error("❌ listDeviceDoors:", e);
    return res.status(500).json({ message: "Error listando puertas" });
  }
};