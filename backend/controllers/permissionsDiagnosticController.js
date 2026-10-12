const db = require("../config/db");

async function getUserBase(userId) {
  const [rows] = await db.query(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.display_name,
      u.first_name,
      u.last_name,
      u.department,
      u.position,
      u.auth_source,
      u.ad_dn,
      u.ad_upn,
      u.role_id,
      u.is_active,
      u.last_login_at,
      u.last_sync_at,
      r.name AS role_name
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE u.id = ?
    LIMIT 1
    `,
    [userId]
  );

  return rows?.[0] || null;
}

async function getUserGroups(userId) {
  const [rows] = await db.query(
    `
    SELECT
      group_name,
      group_dn
    FROM user_ad_groups
    WHERE user_id = ?
    ORDER BY group_name ASC
    `,
    [userId]
  );

  return rows || [];
}

async function getMatchingMappings(groupNames) {
  if (!groupNames.length) return [];

  const placeholders = groupNames.map(() => "?").join(",");

  const [rows] = await db.query(
    `
    SELECT
      m.id,
      m.ad_group_name,
      m.role_id,
      r.name AS role_name,
      r.description AS role_description,
      m.updated_at
    FROM ad_group_role_map m
    LEFT JOIN roles r ON r.id = m.role_id
    WHERE m.ad_group_name IN (${placeholders})
    ORDER BY
      CASE r.name
        WHEN 'admin' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'supervisor' THEN 3
        WHEN 'viewer' THEN 4
        ELSE 99
      END ASC,
      m.ad_group_name ASC
    `,
    groupNames
  );

  return rows || [];
}

async function getRolePermissions(roleId) {
  if (!roleId) return null;

  const [rows] = await db.query(
    `
    SELECT
      role_id,
      menu_users_enabled,
      dashboard_enabled,
      reports_enabled,
      biometric_users_enabled
    FROM role_permissions
    WHERE role_id = ?
    LIMIT 1
    `,
    [roleId]
  );

  return rows?.[0] || null;
}

function buildResolved(user, rolePermissions) {
  const permissions = {
    menu_users_enabled: Number(rolePermissions?.menu_users_enabled || 0),
    dashboard_enabled: Number(rolePermissions?.dashboard_enabled || 0),
    reports_enabled: Number(rolePermissions?.reports_enabled || 0),
    biometric_users_enabled: Number(rolePermissions?.biometric_users_enabled || 0),
  };

  return {
    role: user?.role_name || "-",
    permissions,
    source: "role_permissions",
  };
}

exports.listUsersLite = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    let sql = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.display_name,
        r.name AS role_name,
        u.is_active
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
    `;
    const params = [];

    if (q) {
      sql += `
        WHERE
          u.name LIKE ?
          OR u.email LIKE ?
          OR u.display_name LIKE ?
      `;
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    sql += ` ORDER BY u.display_name ASC, u.name ASC`;

    const [rows] = await db.query(sql, params);
    return res.json(rows || []);
  } catch (error) {
    console.error("❌ Error listUsersLite diagnóstico:", error);
    return res.status(500).json({
      message: "Error listando usuarios",
      detail: String(error?.message || error),
    });
  }
};

exports.diagnoseUser = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    const user = await getUserBase(userId);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const groups = await getUserGroups(userId);
    const groupNames = groups.map((g) => g.group_name).filter(Boolean);

    const matchingMappings = await getMatchingMappings(groupNames);
    const rolePermissions = await getRolePermissions(user.role_id);
    const resolved = buildResolved(user, rolePermissions);

    return res.json({
      user,
      groups,
      matching_mappings: matchingMappings,
      role_permissions: rolePermissions
        ? {
            menu_users_enabled: Number(rolePermissions.menu_users_enabled || 0),
            dashboard_enabled: Number(rolePermissions.dashboard_enabled || 0),
            reports_enabled: Number(rolePermissions.reports_enabled || 0),
            biometric_users_enabled: Number(rolePermissions.biometric_users_enabled || 0),
          }
        : null,
      resolved,
    });
  } catch (error) {
    console.error("❌ Error diagnoseUser:", error);
    return res.status(500).json({
      message: "Error diagnosticando permisos",
      detail: String(error?.message || error),
    });
  }
};