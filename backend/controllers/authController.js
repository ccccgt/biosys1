const jwt = require("jsonwebtoken");
const {
  findAdUser,
  verifyAdPassword,
  resolveRoleAndPermissionsFromGroups,
  upsertLocalUserFromAd,
  syncUserGroups,
} = require("../service/adAuth.service");
const db = require("../config/db");

function signUserToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      role_id: user.role_id,
      permissions: user.permissions,
    },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}

async function getExistingLocalAccessByUsername(username) {
  const [rows] = await db.query(
    `
    SELECT
      u.id,
      u.name,
      u.role_id,
      u.is_active
    FROM users u
    WHERE u.name = ?
    LIMIT 1
    `,
    [username]
  );

  return rows?.[0] || null;
}

async function restoreLocalAccessConfig(userId, snapshot) {
  if (!snapshot) return;

  await db.query(
    `
    UPDATE users
    SET
      role_id = ?,
      is_active = ?,
      updated_at = NOW()
    WHERE id = ?
    `,
    [snapshot.role_id || null, Number(snapshot.is_active ? 1 : 0), userId]
  );

  await db.query(`DELETE FROM user_permissions WHERE user_id = ?`, [userId]);
}

async function getUserActiveState(userId) {
  const [rows] = await db.query(
    `
    SELECT id, is_active
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [userId]
  );

  return rows?.[0] || null;
}

async function getEffectiveLocalUser(userId) {
  const [rows] = await db.query(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.display_name,
      u.first_name,
      u.last_name,
      u.employee_code,
      u.card_id,
      u.department,
      u.position,
      u.phone,
      u.city,
      u.birth_date,
      u.organization,
      u.job_title,
      u.bio,
      u.profile_photo_url,
      u.auth_source,
      u.ad_dn,
      u.ad_upn,
      u.role_id,
      u.is_active,
      u.last_login_at,
      u.last_sync_at,
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

  const [groupRows] = await db.query(
    `
    SELECT group_name, group_dn
    FROM user_ad_groups
    WHERE user_id = ?
    ORDER BY group_name ASC
    `,
    [userId]
  );

  return {
    id: row.id,
    username: row.name,
    email: row.email,
    display_name: row.display_name,
    first_name: row.first_name,
    last_name: row.last_name,
    employee_code: row.employee_code,
    card_id: row.card_id,
    department: row.department,
    position: row.position,
    phone: row.phone,
    city: row.city,
    birth_date: row.birth_date,
    organization: row.organization,
    job_title: row.job_title,
    bio: row.bio,
    profile_photo_url: row.profile_photo_url,
    auth_source: row.auth_source,
    ad_dn: row.ad_dn,
    ad_upn: row.ad_upn,
    role_id: row.role_id,
    role: row.role_name || "",
    is_active: Number(row.is_active || 0),
    last_login_at: row.last_login_at,
    last_sync_at: row.last_sync_at,
    permissions: {
      menu_users_enabled: Number(row.menu_users_enabled || 0),
      dashboard_enabled: Number(row.dashboard_enabled || 0),
      reports_enabled: Number(row.reports_enabled || 0),
      biometric_users_enabled: Number(row.biometric_users_enabled || 0),
      mark_requests_enabled: Number(row.mark_requests_enabled || 0),
      mark_requests_manage_enabled: Number(row.mark_requests_manage_enabled || 0),
    },
    ad_groups: groupRows || [],
  };
}

exports.login = async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      return res.status(400).json({
        message: "Usuario y contraseña son requeridos",
      });
    }

    console.log("🔐 Login recibido:", username);

    const adUser = await findAdUser(username);
    console.log(
      "findAdUser result:",
      adUser
        ? {
            dn: adUser.dn,
            username: adUser.username,
            upn: adUser.adUpn,
            email: adUser.email,
          }
        : null
    );

    if (!adUser) {
      console.log("LOGIN 401: usuario no encontrado en AD:", username);
      return res.status(401).json({
        message: "Usuario no encontrado en Active Directory",
      });
    }

    const isValidPassword = await verifyAdPassword(adUser.dn, password);
    console.log("verifyAdPassword result:", isValidPassword, "for", username, "dn:", adUser.dn);

    if (!isValidPassword) {
      console.log("LOGIN 401: contraseña incorrecta para:", username);
      return res.status(401).json({
        message: "Contraseña incorrecta",
      });
    }

    const existingLocalAccess = await getExistingLocalAccessByUsername(username);

    const resolvedRole = await resolveRoleAndPermissionsFromGroups(adUser.groups || []);

    const localUserId = await upsertLocalUserFromAd(adUser, resolvedRole);
    await syncUserGroups(localUserId, adUser.groupsRaw || []);

    if (
      existingLocalAccess &&
      Number(existingLocalAccess.id) === Number(localUserId)
    ) {
      await restoreLocalAccessConfig(localUserId, existingLocalAccess);
    }

    const activeState = await getUserActiveState(localUserId);
    if (activeState && Number(activeState.is_active) !== 1) {
      return res.status(403).json({
        message: "El usuario está desactivado en el sistema",
      });
    }

    const localUser = await getEffectiveLocalUser(localUserId);
    if (!localUser) {
      return res.status(500).json({
        message: "No se pudo cargar el usuario local después del login",
      });
    }

    const token = signUserToken(localUser);

    return res.json({
      message: "Login exitoso",
      token,
      user: localUser,
    });
  } catch (error) {
    console.error("❌ Error en login AD:", error);
    return res.status(500).json({
      message: "Error del servidor en autenticación",
      detail: String(error?.message || error),
    });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await getEffectiveLocalUser(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "Usuario no encontrado",
      });
    }

    return res.json(user);
  } catch (error) {
    console.error("❌ Error en /me:", error);
    return res.status(500).json({
      message: "Error obteniendo perfil",
      detail: String(error?.message || error),
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      display_name,
      first_name,
      last_name,
      phone,
      city,
      birth_date,
      organization,
      job_title,
      bio,
      profile_photo_url,
    } = req.body || {};

    await db.query(
      `
      UPDATE users
      SET
        display_name = ?,
        first_name = ?,
        last_name = ?,
        phone = ?,
        city = ?,
        birth_date = ?,
        organization = ?,
        job_title = ?,
        bio = ?,
        profile_photo_url = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [
        display_name || null,
        first_name || null,
        last_name || null,
        phone || null,
        city || null,
        birth_date || null,
        organization || null,
        job_title || null,
        bio || null,
        profile_photo_url || null,
        userId,
      ]
    );

    const updatedUser = await getEffectiveLocalUser(userId);

    return res.json({
      message: "Perfil actualizado",
      user: updatedUser,
    });
  } catch (error) {
    console.error("❌ Error updateProfile:", error);
    return res.status(500).json({
      message: "Error actualizando perfil",
      detail: String(error?.message || error),
    });
  }
};