const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { verifyToken } = require("../middleware/authMiddleware");

/* =======================================================
   Helpers
======================================================= */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toYmd(dateObj) {
  const y = dateObj.getFullYear();
  const m = pad2(dateObj.getMonth() + 1);
  const d = pad2(dateObj.getDate());
  return `${y}-${m}-${d}`;
}

function normalizeDateValue(v) {
  if (!v) return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) return toYmd(v);

  const s = String(v).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return toYmd(parsed);

  return "";
}

function startOfMonth(dateObj) {
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
}

function endOfMonth(dateObj) {
  return new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0);
}

function isBusinessDay(dateObj) {
  const day = dateObj.getDay();
  return day >= 1 && day <= 5;
}

function tableNameForDate(dateObj) {
  return `registros_${pad2(dateObj.getMonth() + 1)}_${dateObj.getFullYear()}`;
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isValidMonth(value) {
  return /^\d{4}-\d{2}$/.test(String(value || ""));
}

function getMonthStartEnd(monthStr) {
  const [y, m] = String(monthStr).split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start, end };
}

async function tableExists(tableName) {
  const [rows] = await db.query(
    `
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = ?
    LIMIT 1
    `,
    [tableName]
  );
  return rows.length > 0;
}

async function getTablesForRange(startDate, endDate) {
  const names = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (cur <= last) {
    const t = tableNameForDate(cur);
    if (await tableExists(t)) names.push(t);
    cur.setMonth(cur.getMonth() + 1);
  }

  return names;
}

function terminalPrioritySql(termExpr = "terminal") {
  return `
    CASE
      WHEN LOWER(COALESCE(${termExpr}, '')) LIKE '%fiscal%' THEN 0
      WHEN LOWER(COALESCE(${termExpr}, '')) LIKE '%sala%' THEN 1
      ELSE 2
    END
  `;
}

function groupCaseSql(empAlias = "e", termAlias = "r") {
  return `
    CASE
      WHEN LOWER(COALESCE(${termAlias}.terminal, '')) LIKE '%fiscal%' THEN 'Fiscalia'
      WHEN LOWER(COALESCE(${termAlias}.terminal, '')) LIKE '%sala%' THEN 'Salas'
      WHEN LOWER(COALESCE(${empAlias}.department, '')) LIKE '%oficial%' THEN 'Oficiales'
      WHEN LOWER(COALESCE(${empAlias}.department, '')) LIKE '%analist%' THEN 'Analistas'
      WHEN LOWER(COALESCE(${empAlias}.department, '')) LIKE '%archiv%' THEN 'Archivo'
      WHEN LOWER(COALESCE(${empAlias}.department, '')) LIKE '%fiscal%' THEN 'Fiscalia'
      WHEN LOWER(COALESCE(${empAlias}.department, '')) LIKE '%sala%' THEN 'Salas'
      ELSE 'Sin grupo'
    END
  `;
}

function timeExpr(col = "time") {
  return `STR_TO_DATE(TRIM(${col}), '%H:%i:%s')`;
}

async function getUserLocalProfile(userId) {
  const [rows] = await db.query(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.display_name,
      u.employee_code,
      u.card_id,
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

function normalizeViewerGroup(groupRows) {
  const set = new Set(
    (groupRows || []).map((g) => String(g.group_name || "").trim().toLowerCase())
  );

  if (set.has("oficiales")) return "Oficiales";
  if (set.has("analistas")) return "Analistas";
  if (set.has("fiscales") || set.has("fiscalia")) return "Fiscalia";
  if (set.has("archivo")) return "Archivo";
  if (set.has("salas")) return "Salas";
  return "Sin grupo";
}

async function buildUnionSql(startDate, endDate) {
  const tables = await getTablesForRange(startDate, endDate);
  const includeCache = await tableExists("attendance_cache");
  const includeLive = await tableExists("registros_live");

  const parts = [];

  for (const t of tables) {
    parts.push(`
      SELECT
        device_id,
        card_id,
        employee_id,
        name,
        date,
        time,
        terminal,
        in_out,
        door_number,
        created_at
      FROM \`${t}\`
      WHERE date BETWEEN '${toYmd(startDate)}' AND '${toYmd(endDate)}'
    `);
  }

  if (includeCache) {
    parts.push(`
      SELECT
        device_id,
        card_id,
        employee_id,
        name,
        date,
        time,
        terminal,
        in_out,
        door_number,
        created_at
      FROM attendance_cache
      WHERE date BETWEEN '${toYmd(startDate)}' AND '${toYmd(endDate)}'
    `);
  }

  if (includeLive) {
    parts.push(`
      SELECT
        device_id,
        card_id,
        employee_id,
        name,
        date,
        time,
        terminal,
        in_out,
        door_number,
        created_at
      FROM registros_live
      WHERE date BETWEEN '${toYmd(startDate)}' AND '${toYmd(endDate)}'
    `);
  }

  if (!parts.length) {
    return `
      SELECT
        NULL AS device_id,
        NULL AS card_id,
        NULL AS employee_id,
        NULL AS name,
        NULL AS date,
        NULL AS time,
        NULL AS terminal,
        NULL AS in_out,
        NULL AS door_number,
        NULL AS created_at
      WHERE 1=0
    `;
  }

  return parts.join(" UNION ALL ");
}

async function buildCte(startDate, endDate) {
  const unionSql = await buildUnionSql(startDate, endDate);

  return `
    WITH base_data AS (
      SELECT *
      FROM (${unionSql}) z
      WHERE z.employee_id IS NOT NULL
        AND TRIM(z.employee_id) <> ''
        AND TRIM(z.employee_id) <> '----'
        AND (z.name IS NULL OR z.name <> '---- ----')
        AND (z.in_out IS NULL OR z.in_out <> 127)
        AND TRIM(COALESCE(z.time, '')) <> ''
    ),
    clean_data AS (
      SELECT DISTINCT
        device_id,
        card_id,
        TRIM(employee_id) AS employee_id,
        name,
        date,
        TRIM(time) AS time,
        terminal,
        in_out,
        door_number
      FROM base_data
    ),
    emp AS (
      SELECT
        TRIM(employee_code) AS employee_code,
        full_name,
        department
      FROM employees
      WHERE status = 'active'
    )
  `;
}

/* =======================================================
   ADMIN SUMMARY
======================================================= */

router.get("/summary", verifyToken, async (req, res) => {
  try {
    const role = String(req.user?.role || "").toLowerCase();
    if (role === "viewer") {
      return res.status(403).json({ message: "Resumen general no disponible para viewer" });
    }

    let targetDate = "";
    let targetMonth = "";

    if (req.query.date) {
      if (!isValidDate(req.query.date)) {
        return res.status(400).json({ message: "date inválido. Formato esperado YYYY-MM-DD" });
      }
      targetDate = String(req.query.date);
      targetMonth = targetDate.slice(0, 7);
    } else if (req.query.month) {
      if (!isValidMonth(req.query.month)) {
        return res.status(400).json({ message: "month inválido. Formato esperado YYYY-MM" });
      }
      targetMonth = String(req.query.month);
    } else {
      const today = new Date();
      targetDate = toYmd(today);
      targetMonth = targetDate.slice(0, 7);
    }

    let mainStart;
    let mainEnd;
    let todayStr;

    if (targetDate) {
      const d = new Date(`${targetDate}T00:00:00`);
      mainStart = d;
      mainEnd = d;
      todayStr = targetDate;
    } else {
      const { start, end } = getMonthStartEnd(targetMonth);
      mainStart = start;
      mainEnd = end;
      todayStr = "";
    }

    const cteMain = await buildCte(mainStart, mainEnd);

    const [empRows] = await db.query(
      `SELECT COUNT(*) AS total FROM employees WHERE status = 'active'`
    );
    const totalEmployees = Number(empRows?.[0]?.total || 0);

    let present = 0;
    let late = 0;
    let absent = 0;
    let byHour = [];
    let last7 = [];
    let byDevice = [];
    let topLate = [];
    let recentPunches = [];

    if (targetDate) {
      const start7 = new Date(`${targetDate}T00:00:00`);
      start7.setDate(start7.getDate() - 6);
      const cte7 = await buildCte(start7, new Date(`${targetDate}T00:00:00`));

      const [presentRows] = await db.query(
        `
        ${cteMain}
        SELECT COUNT(DISTINCT e.employee_code) AS total
        FROM emp e
        INNER JOIN clean_data r
          ON r.employee_id = e.employee_code
        WHERE r.date = ?
        `,
        [todayStr]
      );
      present = Number(presentRows?.[0]?.total || 0);

      const [lateRows] = await db.query(
        `
        ${cteMain},
        first_marks AS (
          SELECT
            r.employee_id,
            r.date,
            MIN(${timeExpr("r.time")}) AS first_time,
            MAX(CASE WHEN ${timeExpr("r.time")} < STR_TO_DATE('08:00:00', '%H:%i:%s') THEN 1 ELSE 0 END) AS has_early
          FROM clean_data r
          INNER JOIN emp e
            ON e.employee_code = r.employee_id
          WHERE r.date = ?
          GROUP BY r.employee_id, r.date
        )
        SELECT COUNT(*) AS total
        FROM first_marks
        WHERE has_early = 0
          AND first_time > STR_TO_DATE('08:00:00', '%H:%i:%s')
        `,
        [todayStr]
      );
      late = Number(lateRows?.[0]?.total || 0);

      absent = Math.max(totalEmployees - present, 0);

      const [byHourRows] = await db.query(
        `
        ${cteMain}
        SELECT HOUR(${timeExpr("time")}) AS hour, COUNT(*) AS count
        FROM clean_data
        WHERE date = ?
        GROUP BY HOUR(${timeExpr("time")})
        ORDER BY hour ASC
        `,
        [todayStr]
      );
      byHour = byHourRows || [];

      const [last7Rows] = await db.query(
        `
        ${cte7}
        SELECT r.date, COUNT(DISTINCT e.employee_code) AS count
        FROM clean_data r
        INNER JOIN emp e
          ON e.employee_code = r.employee_id
        WHERE r.date BETWEEN ? AND ?
        GROUP BY r.date
        ORDER BY r.date ASC
        `,
        [toYmd(start7), todayStr]
      );
      last7 = last7Rows || [];

      const [byDeviceRows] = await db.query(
        `
        ${cteMain}
        SELECT terminal AS device, COUNT(*) AS count
        FROM clean_data
        WHERE date = ?
        GROUP BY terminal
        ORDER BY count DESC
        `,
        [todayStr]
      );
      byDevice = byDeviceRows || [];

      const [topLateRows] = await db.query(
        `
        ${cteMain},
        first_marks AS (
          SELECT
            r.employee_id,
            r.date,
            MIN(${timeExpr("r.time")}) AS first_time,
            MAX(CASE WHEN ${timeExpr("r.time")} < STR_TO_DATE('08:00:00', '%H:%i:%s') THEN 1 ELSE 0 END) AS has_early
          FROM clean_data r
          INNER JOIN emp e
            ON e.employee_code = r.employee_id
          WHERE r.date = ?
          GROUP BY r.employee_id, r.date
        )
        SELECT
          f.employee_id,
          MAX(COALESCE(e.full_name, r.name)) AS name,
          COUNT(*) AS late_count
        FROM first_marks f
        LEFT JOIN clean_data r
          ON r.employee_id = f.employee_id
         AND r.date = f.date
         AND ${timeExpr("r.time")} = f.first_time
        LEFT JOIN emp e
          ON e.employee_code = f.employee_id
        WHERE f.has_early = 0
          AND f.first_time > STR_TO_DATE('08:00:00', '%H:%i:%s')
        GROUP BY f.employee_id
        ORDER BY late_count DESC, f.employee_id ASC
        LIMIT 10
        `,
        [todayStr]
      );
      topLate = topLateRows || [];

      const [recentPunchesRows] = await db.query(
        `
        ${cteMain}
        SELECT
          r.date,
          r.time,
          r.employee_id,
          COALESCE(e.full_name, r.name) AS name,
          r.terminal,
          r.in_out,
          ${groupCaseSql("e", "r")} AS group_name
        FROM clean_data r
        LEFT JOIN emp e ON e.employee_code = r.employee_id
        WHERE r.date = ?
        ORDER BY ${timeExpr("r.time")} DESC, ${terminalPrioritySql("r.terminal")} ASC
        LIMIT 20
        `,
        [todayStr]
      );
      recentPunches = recentPunchesRows || [];
    } else {
      const monthStartStr = toYmd(mainStart);
      const monthEndStr = toYmd(mainEnd);

      const [presentRows] = await db.query(
        `
        ${cteMain}
        SELECT COUNT(DISTINCT e.employee_code) AS total
        FROM emp e
        INNER JOIN clean_data r
          ON r.employee_id = e.employee_code
        WHERE r.date BETWEEN ? AND ?
        `,
        [monthStartStr, monthEndStr]
      );
      present = Number(presentRows?.[0]?.total || 0);

      const [lateRows] = await db.query(
        `
        ${cteMain},
        first_marks AS (
          SELECT
            r.employee_id,
            r.date,
            MIN(${timeExpr("r.time")}) AS first_time,
            MAX(CASE WHEN ${timeExpr("r.time")} < STR_TO_DATE('08:00:00', '%H:%i:%s') THEN 1 ELSE 0 END) AS has_early
          FROM clean_data r
          INNER JOIN emp e
            ON e.employee_code = r.employee_id
          WHERE r.date BETWEEN ? AND ?
          GROUP BY r.employee_id, r.date
        )
        SELECT COUNT(*) AS total
        FROM first_marks
        WHERE has_early = 0
          AND first_time > STR_TO_DATE('08:00:00', '%H:%i:%s')
        `,
        [monthStartStr, monthEndStr]
      );
      late = Number(lateRows?.[0]?.total || 0);

      absent = 0;

      const [byHourRows] = await db.query(
        `
        ${cteMain}
        SELECT HOUR(${timeExpr("time")}) AS hour, COUNT(*) AS count
        FROM clean_data
        WHERE date BETWEEN ? AND ?
        GROUP BY HOUR(${timeExpr("time")})
        ORDER BY hour ASC
        `,
        [monthStartStr, monthEndStr]
      );
      byHour = byHourRows || [];

      const [last7Rows] = await db.query(
        `
        ${cteMain}
        SELECT *
        FROM (
          SELECT r.date, COUNT(DISTINCT e.employee_code) AS count
          FROM clean_data r
          INNER JOIN emp e
            ON e.employee_code = r.employee_id
          WHERE r.date BETWEEN ? AND ?
          GROUP BY r.date
          ORDER BY r.date DESC
          LIMIT 7
        ) x
        ORDER BY date ASC
        `,
        [monthStartStr, monthEndStr]
      );
      last7 = last7Rows || [];

      const [byDeviceRows] = await db.query(
        `
        ${cteMain}
        SELECT terminal AS device, COUNT(*) AS count
        FROM clean_data
        WHERE date BETWEEN ? AND ?
        GROUP BY terminal
        ORDER BY count DESC
        `,
        [monthStartStr, monthEndStr]
      );
      byDevice = byDeviceRows || [];

      const [topLateRows] = await db.query(
        `
        ${cteMain},
        first_marks AS (
          SELECT
            r.employee_id,
            r.date,
            MIN(${timeExpr("r.time")}) AS first_time,
            MAX(CASE WHEN ${timeExpr("r.time")} < STR_TO_DATE('08:00:00', '%H:%i:%s') THEN 1 ELSE 0 END) AS has_early
          FROM clean_data r
          INNER JOIN emp e
            ON e.employee_code = r.employee_id
          WHERE r.date BETWEEN ? AND ?
          GROUP BY r.employee_id, r.date
        )
        SELECT
          f.employee_id,
          MAX(COALESCE(e.full_name, r.name)) AS name,
          COUNT(*) AS late_count
        FROM first_marks f
        LEFT JOIN clean_data r
          ON r.employee_id = f.employee_id
         AND r.date = f.date
         AND ${timeExpr("r.time")} = f.first_time
        LEFT JOIN emp e
          ON e.employee_code = f.employee_id
        WHERE f.has_early = 0
          AND f.first_time > STR_TO_DATE('08:00:00', '%H:%i:%s')
        GROUP BY f.employee_id
        ORDER BY late_count DESC, f.employee_id ASC
        LIMIT 10
        `,
        [monthStartStr, monthEndStr]
      );
      topLate = topLateRows || [];

      const [recentPunchesRows] = await db.query(
        `
        ${cteMain}
        SELECT
          r.date,
          r.time,
          r.employee_id,
          COALESCE(e.full_name, r.name) AS name,
          r.terminal,
          r.in_out,
          ${groupCaseSql("e", "r")} AS group_name
        FROM clean_data r
        LEFT JOIN emp e ON e.employee_code = r.employee_id
        WHERE r.date BETWEEN ? AND ?
        ORDER BY r.date DESC, ${timeExpr("r.time")} DESC, ${terminalPrioritySql("r.terminal")} ASC
        LIMIT 20
        `,
        [monthStartStr, monthEndStr]
      );
      recentPunches = recentPunchesRows || [];
    }

    return res.json({
      meta: {
        today: targetDate || "",
        month: targetMonth,
      },
      kpi: {
        totalEmployees,
        present,
        late,
        absent,
      },
      distribution: [
        { name: "Presentes", value: present },
        { name: "Tarde", value: late },
        { name: "Ausentes", value: absent },
      ],
      charts: {
        byHour: (byHour || []).map((r) => ({
          hour: Number(r.hour),
          count: Number(r.count),
        })),
        last7: (last7 || []).map((r) => ({
          date: normalizeDateValue(r.date),
          count: Number(r.count),
        })),
        byDevice: (byDevice || []).map((r) => ({
          device: String(r.device || "N/A"),
          count: Number(r.count),
        })),
      },
      tables: {
        topLate: (topLate || []).map((r) => ({
          employee_id: r.employee_id,
          name: r.name || "",
          late_count: Number(r.late_count),
        })),
        recentPunches: (recentPunches || []).map((r) => ({
          date: normalizeDateValue(r.date),
          time: String(r.time || ""),
          employee_id: r.employee_id,
          name: r.name || "",
          terminal: r.terminal || "",
          in_out: Number(r.in_out),
          group_name: r.group_name || "Sin grupo",
        })),
      },
    });
  } catch (error) {
    console.error("❌ Error summary dashboard:", error);
    return res.status(500).json({
      message: "Error generando dashboard",
      detail: String(error?.message || error),
    });
  }
});

/* =======================================================
   VIEWER PERSONAL SUMMARY
======================================================= */

router.get("/my-summary", verifyToken, async (req, res) => {
  try {
    const user = await getUserLocalProfile(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "Usuario local no encontrado" });
    }

    const [groupRows] = await db.query(
      `
      SELECT group_name
      FROM user_ad_groups
      WHERE user_id = ?
      ORDER BY group_name ASC
      `,
      [req.user.id]
    );

    const userGroup = normalizeViewerGroup(groupRows);
    const entryTime = "08:00:00";

    if (!user.employee_code) {
      return res.json({
        needs_mapping: true,
        message:
          "Este usuario no tiene employee_code configurado en BioSys. Asígnalo en Usuarios del sistema.",
        user: {
          id: user.id,
          username: user.name,
          display_name: user.display_name,
          employee_code: null,
          role: user.role_name,
          group_name: userGroup,
          entry_time: entryTime,
        },
        month: {
          start: toYmd(startOfMonth(new Date())),
          end: toYmd(new Date()),
        },
        cards: {
          tardanzas: 0,
          ausencias: 0,
          totalLateMinutes: 0,
        },
        lastMark: null,
        charts: {
          daily: [],
        },
        tables: {
          daily: [],
          recentMarks: [],
        },
      });
    }

    const today = new Date();
    const start = startOfMonth(today);
    const end = today;

    const cte = await buildCte(start, end);

    const [firstInRows] = await db.query(
      `
      ${cte},
      first_marks AS (
        SELECT
          date,
          MIN(${timeExpr("time")}) AS first_in,
          MAX(CASE WHEN ${timeExpr("time")} < STR_TO_DATE('08:00:00', '%H:%i:%s') THEN 1 ELSE 0 END) AS has_early
        FROM clean_data
        WHERE employee_id = TRIM(?)
        GROUP BY date
      )
      SELECT date, first_in, has_early
      FROM first_marks
      ORDER BY date ASC
      `,
      [user.employee_code]
    );

    const firstInByDate = new Map(
      (firstInRows || []).map((r) => [
        normalizeDateValue(r.date),
        {
          first_in: String(r.first_in || ""),
          has_early: Number(r.has_early || 0),
        },
      ])
    );

    let tardanzas = 0;
    let ausencias = 0;
    let totalLateMinutes = 0;
    const daily = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const cur = new Date(d);
      const dateStr = toYmd(cur);

      if (!isBusinessDay(cur)) continue;

      const info = firstInByDate.get(dateStr);

      if (!info) {
        ausencias += 1;
        daily.push({
          date: dateStr,
          status: "Ausente",
          late_minutes: 0,
          first_in: null,
        });
        continue;
      }

      const firstIn = info.first_in;
      const hasEarly = info.has_early === 1;

      let lateMinutes = 0;

      if (!hasEarly && firstIn && firstIn > "08:00:00") {
        const [hh, mm, ss] = firstIn.split(":").map(Number);
        const firstMinutes = hh * 60 + mm + (ss > 0 ? 1 : 0);
        lateMinutes = Math.max(firstMinutes - 8 * 60, 0);
      }

      if (lateMinutes > 0) tardanzas += 1;
      totalLateMinutes += lateMinutes;

      daily.push({
        date: dateStr,
        status: lateMinutes > 0 ? "Tarde" : "A tiempo",
        late_minutes: lateMinutes,
        first_in: firstIn || null,
      });
    }

    const [recentMarks] = await db.query(
      `
      ${cte}
      SELECT DISTINCT date, time, terminal, in_out
      FROM clean_data
      WHERE employee_id = TRIM(?)
      ORDER BY date DESC, ${timeExpr("time")} DESC, ${terminalPrioritySql("terminal")} ASC
      LIMIT 15
      `,
      [user.employee_code]
    );

    const [lastMarkRows] = await db.query(
      `
      ${cte}
      SELECT DISTINCT date, time, terminal, in_out
      FROM clean_data
      WHERE employee_id = TRIM(?)
      ORDER BY date DESC, ${timeExpr("time")} DESC, ${terminalPrioritySql("terminal")} ASC
      LIMIT 1
      `,
      [user.employee_code]
    );

    return res.json({
      needs_mapping: false,
      user: {
        id: user.id,
        username: user.name,
        display_name: user.display_name,
        employee_code: user.employee_code,
        role: user.role_name,
        group_name: userGroup,
        entry_time: entryTime,
      },
      month: {
        start: toYmd(start),
        end: toYmd(end),
      },
      cards: {
        tardanzas,
        ausencias,
        totalLateMinutes,
      },
      lastMark: lastMarkRows?.[0]
        ? {
            date: normalizeDateValue(lastMarkRows[0].date),
            time: String(lastMarkRows[0].time),
            terminal: lastMarkRows[0].terminal || "",
            in_out: Number(lastMarkRows[0].in_out),
          }
        : null,
      charts: {
        daily: daily.map((d) => ({
          date: d.date,
          late_minutes: d.late_minutes,
          status: d.status,
        })),
      },
      tables: {
        daily,
        recentMarks: (recentMarks || []).map((r) => ({
          date: normalizeDateValue(r.date),
          time: String(r.time),
          terminal: r.terminal || "",
          in_out: Number(r.in_out),
        })),
      },
    });
  } catch (error) {
    console.error("❌ Error my-summary dashboard:", error);
    return res.status(500).json({
      message: "Error generando dashboard personal",
      detail: String(error?.message || error),
    });
  }
});

/* =======================================================
   DRILLDOWN ADMIN
======================================================= */

router.get("/drilldown", verifyToken, async (req, res) => {
  try {
    const role = String(req.user?.role || "").toLowerCase();
    if (role === "viewer") {
      return res.status(403).json({ message: "No disponible para viewer" });
    }

    const type = String(req.query.type || "");
    const date = normalizeDateValue(req.query.date || toYmd(new Date()));
    const drillDate = normalizeDateValue(req.query.drillDate || date);
    let month = String(req.query.month || (date ? date.slice(0, 7) : "")).trim();

    if ((!month || !isValidMonth(month)) && drillDate) {
      month = drillDate.slice(0, 7);
    }

    if (!month || !isValidMonth(month)) {
      return res.status(400).json({ message: "Mes inválido para drilldown" });
    }

    const monthStart = new Date(`${month}-01T00:00:00`);
    const monthEnd = endOfMonth(monthStart);
    const cte = await buildCte(monthStart, monthEnd);

    let sql = "";
    let params = [];

    if (type === "byHour") {
      const hour = Number(req.query.hour || 0);

      sql = `
        ${cte},
        first_hour_marks AS (
          SELECT
            r.employee_id,
            r.date,
            MIN(${timeExpr("r.time")}) AS first_time
          FROM clean_data r
          WHERE r.date = ?
            AND HOUR(${timeExpr("r.time")}) = ?
          GROUP BY r.employee_id, r.date
        )
        SELECT
          r.employee_id,
          COALESCE(e.full_name, r.name) AS name,
          r.time,
          r.date,
          r.terminal,
          ${groupCaseSql("e", "r")} AS group_name
        FROM clean_data r
        INNER JOIN first_hour_marks f
          ON f.employee_id = r.employee_id
         AND f.date = r.date
         AND ${timeExpr("r.time")} = f.first_time
        LEFT JOIN emp e ON e.employee_code = r.employee_id
        WHERE r.date = ?
          AND HOUR(${timeExpr("r.time")}) = ?
        ORDER BY ${timeExpr("r.time")} ASC, name ASC
        LIMIT 300
      `;
      params = [date, hour, date, hour];
    } else if (type === "byDevice") {
      const device = String(req.query.device || "");

      sql = `
        ${cte},
        first_device_marks AS (
          SELECT
            r.employee_id,
            r.date,
            r.terminal,
            MIN(${timeExpr("r.time")}) AS first_time
          FROM clean_data r
          WHERE r.date = ?
            AND r.terminal = ?
          GROUP BY r.employee_id, r.date, r.terminal
        )
        SELECT
          r.employee_id,
          COALESCE(e.full_name, r.name) AS name,
          r.time,
          r.date,
          r.terminal,
          ${groupCaseSql("e", "r")} AS group_name
        FROM clean_data r
        INNER JOIN first_device_marks f
          ON f.employee_id = r.employee_id
         AND f.date = r.date
         AND f.terminal = r.terminal
         AND ${timeExpr("r.time")} = f.first_time
        LEFT JOIN emp e ON e.employee_code = r.employee_id
        WHERE r.date = ?
          AND r.terminal = ?
        ORDER BY ${timeExpr("r.time")} ASC, name ASC
        LIMIT 300
      `;
      params = [date, device, date, device];
    } else if (type === "last7") {
      const cteLast7 = await buildCte(
        new Date(`${drillDate}T00:00:00`),
        new Date(`${drillDate}T00:00:00`)
      );

      sql = `
        ${cteLast7},
        first_marks AS (
          SELECT
            employee_id,
            date,
            MIN(${timeExpr("time")}) AS first_time
          FROM clean_data
          WHERE date = ?
          GROUP BY employee_id, date
        )
        SELECT
          r.employee_id,
          COALESCE(e.full_name, r.name) AS name,
          r.time,
          r.date,
          r.terminal,
          ${groupCaseSql("e", "r")} AS group_name
        FROM clean_data r
        INNER JOIN first_marks f
          ON f.employee_id = r.employee_id
         AND f.date = r.date
         AND ${timeExpr("r.time")} = f.first_time
        LEFT JOIN emp e ON e.employee_code = r.employee_id
        WHERE r.date = ?
        ORDER BY ${timeExpr("r.time")} ASC, name ASC
        LIMIT 300
      `;
      params = [drillDate, drillDate];
    } else if (type === "distribution") {
      const category = String(req.query.category || "");

      if (category === "Ausentes") {
        sql = `
          ${cte}
          SELECT
            e.employee_code AS employee_id,
            e.full_name AS name,
            '-' AS time,
            ? AS date,
            '-' AS terminal,
            'Sin grupo' AS group_name
          FROM emp e
          LEFT JOIN (
            SELECT DISTINCT employee_id
            FROM clean_data
            WHERE date = ?
          ) r
            ON r.employee_id = e.employee_code
          WHERE r.employee_id IS NULL
          ORDER BY e.full_name ASC
          LIMIT 300
        `;
        params = [date, date];
      } else if (category === "Tarde") {
        sql = `
          ${cte},
          first_marks AS (
            SELECT
              employee_id,
              date,
              MIN(${timeExpr("time")}) AS first_time,
              MAX(CASE WHEN ${timeExpr("time")} < STR_TO_DATE('08:00:00', '%H:%i:%s') THEN 1 ELSE 0 END) AS has_early
            FROM clean_data
            WHERE date = ?
            GROUP BY employee_id, date
          )
          SELECT
            r.employee_id,
            COALESCE(e.full_name, r.name) AS name,
            r.time,
            r.date,
            r.terminal,
            ${groupCaseSql("e", "r")} AS group_name
          FROM clean_data r
          INNER JOIN first_marks f
            ON f.employee_id = r.employee_id
           AND f.date = r.date
           AND ${timeExpr("r.time")} = f.first_time
          LEFT JOIN emp e ON e.employee_code = r.employee_id
          WHERE r.date = ?
            AND f.has_early = 0
            AND f.first_time > STR_TO_DATE('08:00:00', '%H:%i:%s')
          ORDER BY ${timeExpr("r.time")} ASC, name ASC
          LIMIT 300
        `;
        params = [date, date];
      } else if (category === "Presentes") {
        sql = `
          ${cte},
          first_marks AS (
            SELECT
              employee_id,
              date,
              MIN(${timeExpr("time")}) AS first_time
            FROM clean_data
            WHERE date = ?
            GROUP BY employee_id, date
          )
          SELECT
            r.employee_id,
            COALESCE(e.full_name, r.name) AS name,
            r.time,
            r.date,
            r.terminal,
            ${groupCaseSql("e", "r")} AS group_name
          FROM clean_data r
          INNER JOIN first_marks f
            ON f.employee_id = r.employee_id
           AND f.date = r.date
           AND ${timeExpr("r.time")} = f.first_time
          LEFT JOIN emp e ON e.employee_code = r.employee_id
          WHERE r.date = ?
          ORDER BY ${timeExpr("r.time")} ASC, name ASC
          LIMIT 300
        `;
        params = [date, date];
      } else {
        return res.status(400).json({ message: "Categoría de distribución no soportada" });
      }
    } else {
      return res.status(400).json({ message: "Tipo de drilldown no soportado" });
    }

    const [rows] = await db.query(sql, params);

    return res.json({
      rows: (rows || []).map((r) => ({
        employee_id: r.employee_id,
        name: r.name || "",
        time: r.time || "",
        date: normalizeDateValue(r.date),
        terminal: r.terminal || "",
        group_name: r.group_name || "Sin grupo",
      })),
    });
  } catch (error) {
    console.error("❌ Error drilldown dashboard:", error);
    return res.status(500).json({
      message: "Error obteniendo detalle del dashboard",
      detail: String(error?.message || error),
    });
  }
});

router.get("/debug", verifyToken, async (req, res) => {
  try {
    const [tables] = await db.query(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND (
          table_name REGEXP '^registros_[0-9]{2}_[0-9]{4}$'
          OR table_name IN ('attendance_cache', 'registros_live')
        )
      ORDER BY table_name ASC
      `
    );

    return res.json({
      ok: true,
      tables: tables.map((t) => t.table_name),
    });
  } catch (error) {
    console.error("❌ Error debug dashboard:", error);
    return res.status(500).json({
      message: "Error debug dashboard",
      detail: String(error?.message || error),
    });
  }
});

module.exports = router;