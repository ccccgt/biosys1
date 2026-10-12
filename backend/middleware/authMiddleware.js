const jwt = require("jsonwebtoken");
const db = require("../config/db");

async function getCurrentUserAuthPayload(userId) {
  const [rows] = await db.query(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.role_id,
      u.is_active,
      r.name AS role_name,
      rp.menu_users_enabled,
      rp.dashboard_enabled,
      rp.reports_enabled,
      rp.biometric_users_enabled,
      rp.mark_requests_enabled,
      rp.mark_requests_manage_enabled
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    LEFT JOIN role_permissions rp ON rp.role_id = u.role_id
    WHERE u.id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (!rows.length) return null;

  const row = rows[0];

  return {
    id: row.id,
    username: row.name,
    email: row.email,
    role: row.role_name || "",
    role_id: row.role_id || null,
    is_active: Number(row.is_active ? 1 : 0),
    permissions: {
      menu_users_enabled: Number(row.menu_users_enabled || 0),
      dashboard_enabled: Number(row.dashboard_enabled || 0),
      reports_enabled: Number(row.reports_enabled || 0),
      biometric_users_enabled: Number(row.biometric_users_enabled || 0),
      mark_requests_enabled: Number(row.mark_requests_enabled || 0),
      mark_requests_manage_enabled: Number(row.mark_requests_manage_enabled || 0),
    },
  };
}

exports.verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
      return res.status(403).json({ message: "Token requerido" });
    }

    const parts = authHeader.split(" ");
    const token = parts.length === 2 ? parts[1] : null;

    if (!token) {
      return res.status(403).json({ message: "Formato de token inválido" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const currentUser = await getCurrentUserAuthPayload(decoded.id);
    if (!currentUser) {
      return res.status(401).json({ message: "Usuario no encontrado" });
    }

    if (Number(currentUser.is_active) !== 1) {
      return res.status(403).json({ message: "Usuario desactivado" });
    }

    req.user = currentUser;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token inválido" });
  }
};

exports.checkRole = (roles) => {
  return (req, res, next) => {
    const role = req.user?.role;

    if (!role || !roles.includes(role)) {
      return res.status(403).json({ message: "Acceso denegado" });
    }

    next();
  };
};

exports.checkPermission = (permissionKey) => {
  return (req, res, next) => {
    const perms = req.user?.permissions || {};

    if (!Number(perms?.[permissionKey] || 0)) {
      return res.status(403).json({ message: "Permiso denegado" });
    }

    next();
  };
};