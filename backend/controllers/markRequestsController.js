const db = require("../config/db");

function isValidYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function normalizeSelectedDates(raw) {
  let arr = raw;

  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      arr = arr
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
  }

  if (!Array.isArray(arr)) arr = [];

  return Array.from(new Set(arr.map((x) => String(x).trim()).filter(isValidYmd))).sort();
}

function canManage(req) {
  const perms = req.user?.permissions || {};
  return Number(perms.mark_requests_manage_enabled || 0) === 1;
}

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

async function getCurrentUserProfile(userId) {
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
      u.ad_dn,
      u.ad_upn
    FROM users u
    WHERE u.id = ?
    LIMIT 1
    `,
    [userId]
  );

  return rows?.[0] || null;
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

async function resolveEmployeeForLoggedUser(userId) {
  const user = await getCurrentUserProfile(userId);
  if (!user) {
    throw new Error("Usuario autenticado no encontrado");
  }

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
        position
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
        user,
        employee: rows[0],
        resolution_method: "direct_user_mapping",
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
      position
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
      user,
      employee: null,
      resolution_method: "not_found",
    };
  }

  return {
    user,
    employee: best,
    resolution_method: "name_match",
  };
}

exports.getMyContext = async (req, res) => {
  try {
    const resolved = await resolveEmployeeForLoggedUser(req.user.id);

    return res.json({
      user: {
        id: resolved.user.id,
        username: resolved.user.name,
        email: resolved.user.email,
        display_name: resolved.user.display_name,
        first_name: resolved.user.first_name,
        last_name: resolved.user.last_name,
        employee_code: resolved.user.employee_code,
        card_id: resolved.user.card_id,
        auth_source: resolved.user.auth_source,
        ad_dn: resolved.user.ad_dn,
        ad_upn: resolved.user.ad_upn,
      },
      employee: resolved.employee
        ? {
            employee_code: resolved.employee.employee_code,
            card_id: resolved.employee.card_id,
            full_name: resolved.employee.full_name,
            department: resolved.employee.department,
            position: resolved.employee.position,
          }
        : null,
      resolution_method: resolved.resolution_method,
    });
  } catch (error) {
    console.error("❌ Error getMyContext:", error);
    return res.status(500).json({
      message: "Error obteniendo contexto del usuario",
      detail: String(error?.message || error),
    });
  }
};

exports.createRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const reason = String(req.body?.reason || "").trim() || null;

    let start_date = String(req.body?.start_date || "").trim();
    let end_date = String(req.body?.end_date || "").trim();
    const selectedDates = normalizeSelectedDates(req.body?.selected_dates || []);

    if ((!start_date || !end_date) && selectedDates.length) {
      start_date = selectedDates[0];
      end_date = selectedDates[selectedDates.length - 1];
    }

    if (!isValidYmd(start_date) || !isValidYmd(end_date)) {
      return res.status(400).json({
        message: "Debes indicar start_date y end_date válidos o seleccionar días específicos",
      });
    }

    const resolved = await resolveEmployeeForLoggedUser(userId);

    if (!resolved.employee) {
      return res.status(400).json({
        message:
          "No fue posible identificar tu registro en employees usando tu información de Active Directory. Contacta al administrador.",
      });
    }

    await db.query(
      `
      INSERT INTO mark_requests (
        user_id,
        employee_id,
        card_id,
        start_date,
        end_date,
        selected_dates_json,
        reason,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', NOW(), NOW())
      `,
      [
        userId,
        resolved.employee.employee_code || null,
        resolved.employee.card_id || null,
        start_date,
        end_date,
        JSON.stringify(selectedDates),
        reason,
      ]
    );

    return res.json({
      message: "Solicitud creada correctamente",
      resolved_employee: {
        employee_code: resolved.employee.employee_code,
        card_id: resolved.employee.card_id,
        full_name: resolved.employee.full_name,
      },
      resolution_method: resolved.resolution_method,
    });
  } catch (error) {
    console.error("❌ Error createRequest:", error);
    return res.status(500).json({
      message: "Error creando solicitud",
      detail: String(error?.message || error),
    });
  }
};

exports.listMyRequests = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        mr.*,
        u.name AS approved_by_username,
        u.display_name AS approved_by_display_name
      FROM mark_requests mr
      LEFT JOIN users u ON u.id = mr.approved_by
      WHERE mr.user_id = ?
      ORDER BY mr.created_at DESC, mr.id DESC
      `,
      [req.user.id]
    );

    return res.json(rows || []);
  } catch (error) {
    console.error("❌ Error listMyRequests:", error);
    return res.status(500).json({
      message: "Error listando solicitudes",
      detail: String(error?.message || error),
    });
  }
};

exports.listAllRequests = async (req, res) => {
  try {
    if (!canManage(req)) {
      return res.status(403).json({ message: "Permiso denegado" });
    }

    const status = String(req.query?.status || "").trim();

    let sql = `
      SELECT
        mr.*,
        owner.name AS owner_username,
        owner.display_name AS owner_display_name,
        approver.name AS approved_by_username,
        approver.display_name AS approved_by_display_name
      FROM mark_requests mr
      INNER JOIN users owner ON owner.id = mr.user_id
      LEFT JOIN users approver ON approver.id = mr.approved_by
    `;
    const params = [];

    if (status) {
      sql += ` WHERE mr.status = ? `;
      params.push(status);
    }

    sql += ` ORDER BY mr.created_at DESC, mr.id DESC`;

    const [rows] = await db.query(sql, params);
    return res.json(rows || []);
  } catch (error) {
    console.error("❌ Error listAllRequests:", error);
    return res.status(500).json({
      message: "Error listando solicitudes",
      detail: String(error?.message || error),
    });
  }
};

exports.approveRequest = async (req, res) => {
  try {
    if (!canManage(req)) {
      return res.status(403).json({ message: "Permiso denegado" });
    }

    const id = Number(req.params.id);

    await db.query(
      `
      UPDATE mark_requests
      SET
        status = 'aprobada',
        approved_by = ?,
        approved_at = NOW(),
        rejection_reason = NULL,
        updated_at = NOW()
      WHERE id = ?
      `,
      [req.user.id, id]
    );

    return res.json({ message: "Solicitud aprobada" });
  } catch (error) {
    console.error("❌ Error approveRequest:", error);
    return res.status(500).json({
      message: "Error aprobando solicitud",
      detail: String(error?.message || error),
    });
  }
};

exports.rejectRequest = async (req, res) => {
  try {
    if (!canManage(req)) {
      return res.status(403).json({ message: "Permiso denegado" });
    }

    const id = Number(req.params.id);
    const rejection_reason = String(req.body?.rejection_reason || "").trim() || null;

    await db.query(
      `
      UPDATE mark_requests
      SET
        status = 'rechazada',
        approved_by = ?,
        approved_at = NOW(),
        rejection_reason = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [req.user.id, rejection_reason, id]
    );

    return res.json({ message: "Solicitud rechazada" });
  } catch (error) {
    console.error("❌ Error rejectRequest:", error);
    return res.status(500).json({
      message: "Error rechazando solicitud",
      detail: String(error?.message || error),
    });
  }
};

exports.getRequestById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [rows] = await db.query(
      `
      SELECT *
      FROM mark_requests
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Solicitud no encontrada" });
    }

    const row = rows[0];

    if (Number(row.user_id) !== Number(req.user.id) && !canManage(req)) {
      return res.status(403).json({ message: "Permiso denegado" });
    }

    return res.json(row);
  } catch (error) {
    console.error("❌ Error getRequestById:", error);
    return res.status(500).json({
      message: "Error obteniendo solicitud",
      detail: String(error?.message || error),
    });
  }
};