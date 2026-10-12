const db = require("../config/db");

function toBit(value, defaultValue = 0) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return Number(value) ? 1 : 0;
}

exports.listRoles = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        r.id,
        r.name,
        r.description,
        rp.menu_users_enabled,
        rp.dashboard_enabled,
        rp.reports_enabled,
        rp.biometric_users_enabled,
        rp.mark_requests_enabled,
        rp.mark_requests_manage_enabled
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      ORDER BY r.id ASC
      `
    );

    return res.json(
      (rows || []).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        menu_users_enabled: Number(r.menu_users_enabled || 0),
        dashboard_enabled: Number(r.dashboard_enabled || 0),
        reports_enabled: Number(r.reports_enabled || 0),
        biometric_users_enabled: Number(r.biometric_users_enabled || 0),
        mark_requests_enabled: Number(r.mark_requests_enabled || 0),
        mark_requests_manage_enabled: Number(r.mark_requests_manage_enabled || 0),
      }))
    );
  } catch (error) {
    console.error("❌ Error listRoles rolesController:", error);
    return res.status(500).json({
      message: "Error listando roles",
      detail: String(error?.message || error),
    });
  }
};

exports.getRolePermissions = async (req, res) => {
  try {
    const roleId = Number(req.params.id);

    const [rows] = await db.query(
      `
      SELECT
        r.id,
        r.name,
        r.description,
        rp.menu_users_enabled,
        rp.dashboard_enabled,
        rp.reports_enabled,
        rp.biometric_users_enabled,
        rp.mark_requests_enabled,
        rp.mark_requests_manage_enabled
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      WHERE r.id = ?
      LIMIT 1
      `,
      [roleId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Rol no encontrado" });
    }

    const row = rows[0];

    return res.json({
      id: row.id,
      name: row.name,
      description: row.description,
      menu_users_enabled: Number(row.menu_users_enabled || 0),
      dashboard_enabled: Number(row.dashboard_enabled || 0),
      reports_enabled: Number(row.reports_enabled || 0),
      biometric_users_enabled: Number(row.biometric_users_enabled || 0),
      mark_requests_enabled: Number(row.mark_requests_enabled || 0),
      mark_requests_manage_enabled: Number(row.mark_requests_manage_enabled || 0),
    });
  } catch (error) {
    console.error("❌ Error getRolePermissions:", error);
    return res.status(500).json({
      message: "Error obteniendo permisos del rol",
      detail: String(error?.message || error),
    });
  }
};

exports.updateRolePermissions = async (req, res) => {
  try {
    const roleId = Number(req.params.id);

    const [roleRows] = await db.query(
      `SELECT id, name FROM roles WHERE id = ? LIMIT 1`,
      [roleId]
    );

    if (!roleRows.length) {
      return res.status(404).json({ message: "Rol no encontrado" });
    }

    const payload = {
      menu_users_enabled: toBit(req.body?.menu_users_enabled, 0),
      dashboard_enabled: toBit(req.body?.dashboard_enabled, 1),
      reports_enabled: toBit(req.body?.reports_enabled, 1),
      biometric_users_enabled: toBit(req.body?.biometric_users_enabled, 1),
      mark_requests_enabled: toBit(req.body?.mark_requests_enabled, 1),
      mark_requests_manage_enabled: toBit(req.body?.mark_requests_manage_enabled, 0),
    };

    const [permRows] = await db.query(
      `SELECT id FROM role_permissions WHERE role_id = ? LIMIT 1`,
      [roleId]
    );

    if (permRows.length) {
      await db.query(
        `
        UPDATE role_permissions
        SET
          menu_users_enabled = ?,
          dashboard_enabled = ?,
          reports_enabled = ?,
          biometric_users_enabled = ?,
          mark_requests_enabled = ?,
          mark_requests_manage_enabled = ?,
          updated_at = NOW()
        WHERE role_id = ?
        `,
        [
          payload.menu_users_enabled,
          payload.dashboard_enabled,
          payload.reports_enabled,
          payload.biometric_users_enabled,
          payload.mark_requests_enabled,
          payload.mark_requests_manage_enabled,
          roleId,
        ]
      );
    } else {
      await db.query(
        `
        INSERT INTO role_permissions (
          role_id,
          menu_users_enabled,
          dashboard_enabled,
          reports_enabled,
          biometric_users_enabled,
          mark_requests_enabled,
          mark_requests_manage_enabled,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `,
        [
          roleId,
          payload.menu_users_enabled,
          payload.dashboard_enabled,
          payload.reports_enabled,
          payload.biometric_users_enabled,
          payload.mark_requests_enabled,
          payload.mark_requests_manage_enabled,
        ]
      );
    }

    return res.json({ message: "Permisos del rol actualizados" });
  } catch (error) {
    console.error("❌ Error updateRolePermissions:", error);
    return res.status(500).json({
      message: "Error actualizando permisos del rol",
      detail: String(error?.message || error),
    });
  }
};