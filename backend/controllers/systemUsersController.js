const db = require("../config/db");
const { resyncUserFromAdByUsername } = require("../service/adAuth.service");

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeName(value) {
  return normalizeText(value)
    .split(" ")
    .map((x) => x.trim())
    .filter((x) => x.length >= 2);
}

function scoreEmployeeMatch(employeeFullName, candidateNames) {
  const empNorm = normalizeText(employeeFullName || "");
  if (!empNorm) return 0;

  let best = 0;

  for (const candidate of candidateNames) {
    const candNorm = normalizeText(candidate || "");
    if (!candNorm) continue;

    if (empNorm === candNorm) {
      best = Math.max(best, 100);
      continue;
    }

    if (empNorm.includes(candNorm) || candNorm.includes(empNorm)) {
      best = Math.max(best, 85);
    }

    const empTokens = tokenizeName(empNorm);
    const candTokens = tokenizeName(candNorm);

    const overlap = candTokens.filter((t) => empTokens.includes(t)).length;

    if (overlap >= 3) best = Math.max(best, 80);
    else if (overlap === 2) best = Math.max(best, 72);
    else if (overlap === 1) best = Math.max(best, 55);
  }

  return best;
}

async function resolveEmployeeMatchForUserRow(user) {
  const candidateNames = [
    user.display_name,
    [user.first_name, user.last_name].filter(Boolean).join(" "),
    user.name,
  ].filter(Boolean);

  if (user.employee_code || user.card_id) {
    const [rows] = await db.query(
      `
      SELECT
        employee_code,
        card_id,
        full_name,
        department,
        position,
        status
      FROM employees
      WHERE status = 'active'
        AND (
          employee_code = ?
          OR card_id = ?
        )
      ORDER BY full_name ASC
      LIMIT 1
      `,
      [user.employee_code || "", user.card_id || ""]
    );

    if (rows.length) {
      return {
        matched: true,
        method: "direct_user_mapping",
        score: 100,
        employee: rows[0],
      };
    }
  }

  const [employees] = await db.query(
    `
    SELECT
      employee_code,
      card_id,
      full_name,
      department,
      position,
      status
    FROM employees
    WHERE status = 'active'
    ORDER BY full_name ASC
    `
  );

  let best = null;
  let bestScore = 0;

  for (const emp of employees || []) {
    const score = scoreEmployeeMatch(emp.full_name, candidateNames);
    if (score > bestScore) {
      bestScore = score;
      best = emp;
    }
  }

  if (!best || bestScore < 72) {
    return {
      matched: false,
      method: "not_found",
      score: bestScore,
      employee: null,
    };
  }

  return {
    matched: true,
    method: "name_match",
    score: bestScore,
    employee: best,
  };
}

exports.listUsers = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    let sql = `
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
        r.name AS role_name
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
          OR u.first_name LIKE ?
          OR u.last_name LIKE ?
          OR u.department LIKE ?
          OR u.position LIKE ?
          OR u.employee_code LIKE ?
          OR u.card_id LIKE ?
      `;
      const like = `%${q}%`;
      params.push(like, like, like, like, like, like, like, like, like);
    }

    sql += ` ORDER BY u.display_name ASC, u.name ASC`;

    const [rows] = await db.query(sql, params);
    return res.json(rows || []);
  } catch (error) {
    console.error("❌ Error listUsers:", error);
    return res.status(500).json({
      message: "Error listando usuarios del sistema",
      detail: String(error?.message || error),
    });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [rows] = await db.query(
      `
      SELECT
        u.*,
        r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const [groups] = await db.query(
      `
      SELECT group_name, group_dn
      FROM user_ad_groups
      WHERE user_id = ?
      ORDER BY group_name ASC
      `,
      [id]
    );

    return res.json({
      ...rows[0],
      ad_groups: groups || [],
    });
  } catch (error) {
    console.error("❌ Error getUserById:", error);
    return res.status(500).json({
      message: "Error obteniendo usuario",
      detail: String(error?.message || error),
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const id = Number(req.params.id);

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
      role_id,
      is_active,
      employee_code,
      card_id,
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
        employee_code = ?,
        card_id = ?,
        role_id = ?,
        is_active = ?,
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
        employee_code || null,
        card_id || null,
        role_id || null,
        Number(is_active ? 1 : 0),
        id,
      ]
    );

    await db.query(`DELETE FROM user_permissions WHERE user_id = ?`, [id]);

    return res.json({ message: "Usuario actualizado" });
  } catch (error) {
    console.error("❌ Error updateUser:", error);
    return res.status(500).json({
      message: "Error actualizando usuario",
      detail: String(error?.message || error),
    });
  }
};

exports.listRoles = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, description FROM roles ORDER BY id ASC`
    );
    return res.json(rows || []);
  } catch (error) {
    console.error("❌ Error listRoles:", error);
    return res.status(500).json({
      message: "Error listando roles",
      detail: String(error?.message || error),
    });
  }
};

exports.resyncFromAd = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [rows] = await db.query(
      `SELECT id, name, auth_source FROM users WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const user = rows[0];

    if (String(user.auth_source || "").toLowerCase() !== "ad") {
      return res.status(400).json({
        message: "Solo se pueden resincronizar usuarios con auth_source='ad'",
      });
    }

    if (typeof resyncUserFromAdByUsername !== "function") {
      throw new Error("resyncUserFromAdByUsername no está disponible en adAuth.service");
    }

    const result = await resyncUserFromAdByUsername(user.name);

    return res.json({
      message: "Usuario resincronizado desde AD",
      user: result.localUser,
      resolvedRole: result.resolvedRole,
    });
  } catch (error) {
    console.error("❌ Error resyncFromAd:", error);
    return res.status(500).json({
      message: "Error resincronizando usuario desde AD",
      detail: String(error?.message || error),
    });
  }
};

exports.employeeMatch = async (req, res) => {
  try {
    const id = Number(req.params.id);

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
        u.auth_source,
        u.department,
        u.position
      FROM users u
      WHERE u.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const user = rows[0];
    const result = await resolveEmployeeMatchForUserRow(user);

    return res.json({
      user,
      matched: result.matched,
      method: result.method,
      score: result.score,
      employee: result.employee,
    });
  } catch (error) {
    console.error("❌ Error employeeMatch:", error);
    return res.status(500).json({
      message: "Error buscando coincidencia en employees",
      detail: String(error?.message || error),
    });
  }
};