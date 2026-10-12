const db = require("../config/db");

/* =========================
   Helpers
========================= */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isValidMonth(value) {
  return /^\d{4}-\d{2}$/.test(String(value || ""));
}

function getTodayLocalDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  return `${y}-${m}-${d}`;
}

function getTodayParts() {
  const now = new Date();
  return {
    y: now.getFullYear(),
    m: now.getMonth() + 1,
    d: now.getDate(),
  };
}

function resolveDefaultMonth() {
  const { y, m, d } = getTodayParts();

  let yy = y;
  let mm = m;

  // del 1 al 4 usar mes anterior
  if (d <= 4) {
    mm -= 1;
    if (mm === 0) {
      mm = 12;
      yy -= 1;
    }
  }

  return `${yy}-${pad2(mm)}`;
}

function resolveTableFromMonth(monthStr) {
  const [y, m] = String(monthStr).split("-");
  return `registros_${pad2(Number(m))}_${y}`;
}

function getMonthRange(monthStr) {
  const [yStr, mStr] = String(monthStr).split("-");
  const y = Number(yStr);
  const m = Number(mStr);

  const start = `${y}-${pad2(m)}-01`;

  let nextY = y;
  let nextM = m + 1;
  if (nextM === 13) {
    nextM = 1;
    nextY += 1;
  }

  const nextStart = `${nextY}-${pad2(nextM)}-01`;

  return { start, nextStart };
}

async function tableExists(tableName) {
  const sql = `
    SELECT COUNT(*) AS total
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = ?
  `;
  const [rows] = await db.promise().query(sql, [tableName]);
  return Number(rows?.[0]?.total || 0) > 0;
}

function buildScope({ targetDate, targetMonth }) {
  if (targetDate) {
    return {
      mode: "date",
      whereSql: " AND date = ? ",
      params: [targetDate],
      metaToday: targetDate,
      metaMonth: targetDate.slice(0, 7),
    };
  }

  const { start, nextStart } = getMonthRange(targetMonth);

  return {
    mode: "month",
    whereSql: " AND date >= ? AND date < ? ",
    params: [start, nextStart],
    metaToday: "",
    metaMonth: targetMonth,
  };
}

/* =========================
   DASHBOARD PRINCIPAL
========================= */

exports.getSummary = async (req, res) => {
  const startedAt = Date.now();

  try {
    let { date, month } = req.query;

    // normalización / default
    if (date && !isValidDate(date)) {
      return res.status(400).json({
        message: "Parámetro date inválido. Formato esperado: YYYY-MM-DD",
      });
    }

    if (month && !isValidMonth(month)) {
      return res.status(400).json({
        message: "Parámetro month inválido. Formato esperado: YYYY-MM",
      });
    }

    if (!date && !month) {
      const defaultMonth = resolveDefaultMonth();
      const today = getTodayLocalDateString();

      // si hoy pertenece al mes por defecto, usa día; si no, usa mes
      if (today.slice(0, 7) === defaultMonth) {
        date = today;
      } else {
        month = defaultMonth;
      }
    }

    if (date && !month) {
      month = date.slice(0, 7);
    }

    const table = resolveTableFromMonth(month);

    console.log("[dashboard] date:", date || "-", "month:", month || "-", "table:", table);

    const exists = await tableExists(table);
    if (!exists) {
      return res.status(404).json({
        message: `No existe la tabla ${table}`,
      });
    }

    const scope = buildScope({
      targetDate: date || "",
      targetMonth: month || "",
    });

    const baseWhere = `
      FROM ${table}
      WHERE date IS NOT NULL
        AND employee_id IS NOT NULL
        AND (in_out IS NULL OR in_out <> 127)
    `;

    /* =========================
       KPI
    ========================= */

    const kpiQuery = `
      SELECT
        COUNT(DISTINCT employee_id) AS totalEmployees,
        COUNT(*) AS totalRecords
      ${baseWhere}
      ${scope.whereSql}
    `;

    /* =========================
       DISTRIBUCIÓN
    ========================= */

    const distributionQuery = `
      SELECT
        CASE
          WHEN TIME(time) <= '08:15:00' THEN 'Presentes'
          WHEN TIME(time) > '08:15:00' THEN 'Tarde'
          ELSE 'Ausentes'
        END AS name,
        COUNT(*) AS value
      ${baseWhere}
      ${scope.whereSql}
      GROUP BY name
    `;

    /* =========================
       POR HORA
    ========================= */

    const byHourQuery = `
      SELECT
        HOUR(STR_TO_DATE(time, '%H:%i:%s')) AS hour,
        COUNT(*) AS count
      ${baseWhere}
      ${scope.whereSql}
      AND time IS NOT NULL
      GROUP BY hour
      ORDER BY hour
    `;

    /* =========================
       ÚLTIMOS 7 DÍAS
       - si es fecha: 7 días hacia atrás dentro del mismo mes/tabla
       - si es mes: últimos 7 días disponibles del mes
    ========================= */

    let last7Query = "";
    let last7Params = [];

    if (scope.mode === "date") {
      last7Query = `
        SELECT
          date,
          COUNT(DISTINCT employee_id) AS count
        ${baseWhere}
        AND date >= DATE_SUB(?, INTERVAL 6 DAY)
        AND date <= ?
        GROUP BY date
        ORDER BY date
      `;
      last7Params = [scope.params[0], scope.params[0]];
    } else {
      last7Query = `
        SELECT *
        FROM (
          SELECT
            date,
            COUNT(DISTINCT employee_id) AS count
          ${baseWhere}
          ${scope.whereSql}
          GROUP BY date
          ORDER BY date DESC
          LIMIT 7
        ) x
        ORDER BY date
      `;
      last7Params = [...scope.params];
    }

    /* =========================
       POR DISPOSITIVO
    ========================= */

    const byDeviceQuery = `
      SELECT
        terminal AS device,
        COUNT(*) AS count
      ${baseWhere}
      ${scope.whereSql}
      AND terminal IS NOT NULL
      AND TRIM(terminal) <> ''
      GROUP BY terminal
      ORDER BY count DESC
      LIMIT 10
    `;

    /* =========================
       TOP TARDANZAS
       IMPORTANTÍSIMO: filtrado al alcance actual
    ========================= */

    const topLateQuery = `
      SELECT
        employee_id,
        name,
        COUNT(*) AS late_count
      ${baseWhere}
      ${scope.whereSql}
      AND time IS NOT NULL
      AND TIME(time) > '08:15:00'
      GROUP BY employee_id, name
      ORDER BY late_count DESC
      LIMIT 10
    `;

    /* =========================
       ÚLTIMOS MARCAJES
       IMPORTANTÍSIMO: filtrado al alcance actual
    ========================= */

    const recentQuery = `
      SELECT
        date,
        time,
        employee_id,
        name,
        terminal,
        '' AS group_name
      ${baseWhere}
      ${scope.whereSql}
      ORDER BY date DESC, time DESC
      LIMIT 20
    `;

    /* =========================
       EJECUCIÓN
    ========================= */

    const t1 = Date.now();
    const [kpiRows] = await db.promise().query(kpiQuery, [...scope.params]);
    console.log("[dashboard] kpi:", Date.now() - t1, "ms");

    const t2 = Date.now();
    const [distributionRows] = await db.promise().query(distributionQuery, [...scope.params]);
    console.log("[dashboard] distribution:", Date.now() - t2, "ms");

    const t3 = Date.now();
    const [byHourRows] = await db.promise().query(byHourQuery, [...scope.params]);
    console.log("[dashboard] byHour:", Date.now() - t3, "ms");

    const t4 = Date.now();
    const [last7Rows] = await db.promise().query(last7Query, last7Params);
    console.log("[dashboard] last7:", Date.now() - t4, "ms");

    const t5 = Date.now();
    const [byDeviceRows] = await db.promise().query(byDeviceQuery, [...scope.params]);
    console.log("[dashboard] byDevice:", Date.now() - t5, "ms");

    const t6 = Date.now();
    const [topLateRows] = await db.promise().query(topLateQuery, [...scope.params]);
    console.log("[dashboard] topLate:", Date.now() - t6, "ms");

    const t7 = Date.now();
    const [recentPunchesRows] = await db.promise().query(recentQuery, [...scope.params]);
    console.log("[dashboard] recentPunches:", Date.now() - t7, "ms");

    const kpi = kpiRows?.[0] || {};
    const distribution = Array.isArray(distributionRows) ? distributionRows : [];
    const byHour = Array.isArray(byHourRows) ? byHourRows : [];
    const last7 = Array.isArray(last7Rows) ? last7Rows : [];
    const byDevice = Array.isArray(byDeviceRows) ? byDeviceRows : [];
    const topLate = Array.isArray(topLateRows) ? topLateRows : [];
    const recentPunches = Array.isArray(recentPunchesRows) ? recentPunchesRows : [];

    console.log("[dashboard] tiempo total:", Date.now() - startedAt, "ms");

    return res.json({
      ok: true,
      meta: {
        today: scope.metaToday,
        month: scope.metaMonth,
        table,
      },
      kpi: {
        totalEmployees: Number(kpi.totalEmployees || 0),
        present: Number(distribution.find((x) => x.name === "Presentes")?.value || 0),
        late: Number(distribution.find((x) => x.name === "Tarde")?.value || 0),
        absent: Number(distribution.find((x) => x.name === "Ausentes")?.value || 0),
      },
      distribution,
      charts: {
        byHour,
        last7,
        byDevice,
      },
      tables: {
        topLate,
        recentPunches,
      },
    });
  } catch (err) {
    console.error("ERROR DASHBOARD:", err);

    return res.status(500).json({
      message: "Error en dashboard",
      error: err.message,
    });
  }
};