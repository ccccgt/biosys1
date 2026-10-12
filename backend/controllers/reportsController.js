const db = require("../config/db");
const ExcelJS = require("exceljs");

/* ===================================================== */
/* Helpers */
/* ===================================================== */

function parseYmd(ymd) {
  const d = new Date(`${ymd}T00:00:00`);
  return isNaN(d) ? null : d;
}

function formatYmd(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ymKey(dateObj) {
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}`;
}

function monthTableName(dateObj) {
  return `registros_${pad2(dateObj.getMonth() + 1)}_${dateObj.getFullYear()}`;
}

function isValidYmd(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function parseSelectedDatesFromQuery(query) {
  if (!query) return [];

  let raw = query.selected_dates_json ?? query.selected_dates ?? [];

  if (typeof raw === "string") {
    const trimmed = raw.trim();

    if (!trimmed) return [];

    try {
      raw = JSON.parse(trimmed);
    } catch {
      raw = trimmed.split(",").map((x) => x.trim());
    }
  }

  if (!Array.isArray(raw)) raw = [raw];

  return Array.from(
    new Set(raw.map((x) => String(x).trim()).filter(isValidYmd))
  ).sort();
}

function resolveEffectiveRange(query) {
  const selectedDates = parseSelectedDatesFromQuery(query);

  let { start, end } = query;

  if ((!start || !end) && selectedDates.length > 0) {
    start = selectedDates[0];
    end = selectedDates[selectedDates.length - 1];
  }

  return {
    start: start || "",
    end: end || "",
    selectedDates,
  };
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

async function getHistoricalTablesForRange(start, end) {
  const startD = parseYmd(start);
  const endD = parseYmd(end);

  if (!startD || !endD) return [];

  const tables = [];
  const seen = new Set();

  const cur = new Date(
    startD.getFullYear(),
    startD.getMonth(),
    1
  );

  const last = new Date(
    endD.getFullYear(),
    endD.getMonth(),
    1
  );

  while (cur <= last) {
    const t = monthTableName(cur);

    if (!seen.has(t)) {
      seen.add(t);
      tables.push(t);
    }

    cur.setMonth(cur.getMonth() + 1);
  }

  const existing = [];

  for (const t of tables) {
    if (await tableExists(t)) {
      existing.push(t);
    }
  }

  return existing;
}

function rangeTouchesCurrentMonth(start, end) {
  const now = new Date();
  const current = ymKey(now);

  return (
    String(start).slice(0, 7) <= current &&
    String(end).slice(0, 7) >= current
  );
}

function startOfCurrentMonthYmd() {
  const now = new Date();

  return `${now.getFullYear()}-${pad2(
    now.getMonth() + 1
  )}-01`;
}

/* ===================================================== */
/* Employees active mapping */
/* ===================================================== */

const EMP_TABLE = "employees";
const EMP_CODE_COL = "employee_code";
const EMP_BIO_USER_COL = "biometric_user_id";
const EMP_CARD_COL = "card_id";
const EMP_NAME_COL = "full_name";
const EMP_DEPT_COL = "department";
const EMP_POSITION_COL = "position";
const EMP_STATUS_COL = "status";

function buildActiveEmployeesSql() {
  return `
    SELECT
      id,
      TRIM(CAST(\`${EMP_CODE_COL}\` AS CHAR)) AS employee_code,
      TRIM(CAST(\`${EMP_BIO_USER_COL}\` AS CHAR)) AS biometric_user_id,
      TRIM(CAST(\`${EMP_CARD_COL}\` AS CHAR)) AS employee_card_id,
      \`${EMP_NAME_COL}\` AS full_name,
      \`${EMP_DEPT_COL}\` AS department,
      \`${EMP_POSITION_COL}\` AS position
    FROM \`${EMP_TABLE}\`
    WHERE \`${EMP_STATUS_COL}\` = 'active'
  `;
}

/* ===================================================== */
/* FUENTES DE DATOS */
/* ===================================================== */

async function buildUnionSql(start, end) {
  const historicalTables = await getHistoricalTablesForRange(
    start,
    end
  );

  const parts = [];
  const params = [];
  const tablesUsed = [];

  /*
   * Fuente histórica mensual.
   *
   * Esta sigue teniendo prioridad sobre registros_live.
   * Si el registro existe en la tabla mensual, será el que
   * sobreviva a la deduplicación.
   */
  for (const t of historicalTables) {
    parts.push(`
      SELECT
        id,
        device_id,
        TRIM(CAST(card_id AS CHAR)) AS card_id,
        TRIM(CAST(employee_id AS CHAR)) AS employee_id,
        name,
        date,
        time,
        terminal,
        in_out,
        door_number,
        created_at,
        1 AS source_priority
      FROM \`${t}\`
      WHERE date BETWEEN ? AND ?
    `);

    params.push(start, end);
    tablesUsed.push(t);
  }

  /*
   * registros_live también puede contener registros históricos
   * que todavía no fueron incorporados a la tabla mensual.
   *
   * Ejemplo:
   *   2026-07-31 / employee_id 20110001
   *
   * Por eso NO debemos limitar esta fuente únicamente al mes
   * actual.
   *
   * La deduplicación posterior conserva primero la fuente
   * histórica mensual (source_priority = 1) y utiliza live
   * únicamente cuando el registro no existe allí.
   */
  if (await tableExists("registros_live")) {
    parts.push(`
      SELECT
        id,
        device_id,
        TRIM(CAST(card_id AS CHAR)) AS card_id,
        TRIM(CAST(employee_id AS CHAR)) AS employee_id,
        name,
        date,
        time,
        terminal,
        in_out,
        door_number,
        created_at,
        2 AS source_priority
      FROM registros_live
      WHERE date BETWEEN ? AND ?
    `);

    params.push(start, end);
    tablesUsed.push("registros_live");
  }

  if (!parts.length) {
    return {
      unionSql: `
        SELECT
          NULL AS id,
          NULL AS device_id,
          NULL AS card_id,
          NULL AS employee_id,
          NULL AS name,
          NULL AS date,
          NULL AS time,
          NULL AS terminal,
          NULL AS in_out,
          NULL AS door_number,
          NULL AS created_at,
          99 AS source_priority
        WHERE 1=0
      `,
      params: [],
      tablesUsed: [],
    };
  }

  return {
    unionSql: parts.join(" UNION ALL "),
    params,
    tablesUsed,
  };
}

/* ===================================================== */
/* BASE FILTRADA Y DEDUP */
/* ===================================================== */

async function buildFilteredBaseSql(query) {
  const {
    employee_id,
    card_id,
    device_id,
    door_number,
    in_out,
    name_like,
    terminal_like,
    department,
  } = query;

  const {
    start,
    end,
    selectedDates,
  } = resolveEffectiveRange(query);

  const {
    unionSql,
    params: baseParams,
    tablesUsed,
  } = await buildUnionSql(start, end);

  const activeEmpSql = buildActiveEmployeesSql();

  const filters = [];
  const params = [...baseParams];

  if (selectedDates.length) {
    filters.push(
      `date IN (${selectedDates.map(() => "?").join(",")})`
    );

    params.push(...selectedDates);
  }

  if (employee_id) {
    const value = String(employee_id).trim();

    filters.push(`
      (
        employee_id = ?
        OR biometric_user_id = ?
        OR biometric_employee_id_raw = ?
      )
    `);

    params.push(value, value, value);
  }

  if (card_id) {
    const value = String(card_id).trim();

    filters.push(`
      (
        employee_card_id = ?
        OR biometric_user_id = ?
        OR card_id = ?
      )
    `);

    params.push(value, value, value);
  }

  if (device_id !== undefined && device_id !== "") {
    filters.push("device_id = ?");
    params.push(Number(device_id));
  }

  if (door_number !== undefined && door_number !== "") {
    filters.push("door_number = ?");
    params.push(Number(door_number));
  }

  if (in_out !== undefined && in_out !== "") {
    filters.push("in_out = ?");
    params.push(Number(in_out));
  }

  if (name_like) {
    filters.push("name LIKE ?");
    params.push(`%${String(name_like).trim()}%`);
  }

  if (terminal_like) {
    filters.push("terminal LIKE ?");
    params.push(`%${String(terminal_like).trim()}%`);
  }

  if (department) {
    filters.push("department = ?");
    params.push(String(department).trim());
  }

  const where = filters.length
    ? `WHERE ${filters.join(" AND ")}`
    : "";

  const baseSql = `
    WITH raw_union AS (
      ${unionSql}
    ),
    filtered_raw AS (
      SELECT *
      FROM raw_union
      WHERE
        (
          (
            employee_id IS NOT NULL
            AND employee_id <> ''
            AND employee_id NOT IN (
              '----',
              '---',
              '--',
              '-'
            )
          )
          OR
          (
            card_id IS NOT NULL
            AND card_id <> ''
            AND card_id <> '0'
          )
        )
    ),
    deduped AS (
      SELECT *
      FROM (
        SELECT
          r.*,
          ROW_NUMBER() OVER (
            PARTITION BY
              COALESCE(
                CAST(r.device_id AS CHAR),
                ''
              ),
              COALESCE(
                CAST(r.card_id AS CHAR),
                ''
              ),
              COALESCE(
                CAST(r.employee_id AS CHAR),
                ''
              ),
              COALESCE(
                CAST(r.date AS CHAR),
                ''
              ),
              COALESCE(
                CAST(r.time AS CHAR),
                ''
              ),
              COALESCE(
                CAST(r.terminal AS CHAR),
                ''
              ),
              COALESCE(
                CAST(r.in_out AS CHAR),
                ''
              ),
              COALESCE(
                CAST(r.door_number AS CHAR),
                ''
              )
            ORDER BY
              r.source_priority ASC,
              r.id DESC
          ) AS rn
        FROM filtered_raw r
      ) z
      WHERE z.rn = 1
    ),
    matched AS (
      SELECT
        d.id,
        d.device_id,
        d.card_id,
        COALESCE(
          e.employee_code,
          d.employee_id
        ) AS employee_id,
        COALESCE(
          e.full_name,
          d.name
        ) AS name,
        e.department,
        e.position,
        d.date,
        d.time,
        d.terminal,
        d.in_out,
        d.door_number,
        d.created_at,
        d.employee_id AS biometric_employee_id_raw,
        e.biometric_user_id,
        e.employee_card_id
      FROM deduped d
      LEFT JOIN (${activeEmpSql}) e
        ON (
          e.employee_code IS NOT NULL
          AND e.employee_code <> ''
          AND d.employee_id = e.employee_code
        )
        OR (
          e.biometric_user_id IS NOT NULL
          AND e.biometric_user_id <> ''
          AND d.card_id = e.biometric_user_id
        )
        OR (
          e.employee_card_id IS NOT NULL
          AND e.employee_card_id <> ''
          AND d.card_id = e.employee_card_id
        )
    )
    SELECT *
    FROM matched
    ${where}
  `;

  return {
    baseSql,
    params,
    start,
    end,
    selectedDates,
    tablesUsed,
  };
}

/* ===================================================== */
/* Attendance */
/* ===================================================== */

exports.attendanceReport = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 50,
      mode = "all",
    } = req.query;

    const {
      start,
      end,
    } = resolveEffectiveRange(req.query);

    if (!start || !end) {
      return res.status(400).json({
        message:
          "Debes enviar start y end, o al menos selected_dates.",
      });
    }

    const p = Math.max(1, Number(page));

    const ps = Math.min(
      1000,
      Math.max(1, Number(pageSize))
    );

    const offset = (p - 1) * ps;

    const {
      baseSql,
      params,
      tablesUsed,
    } = await buildFilteredBaseSql({
      ...req.query,
      start,
      end,
    });

    if (mode === "first_last") {
      const countSql = `
        WITH base AS (${baseSql}),
        ranked AS (
          SELECT
            b.*,
            ROW_NUMBER() OVER (
              PARTITION BY
                b.employee_id,
                b.date
              ORDER BY
                b.time ASC,
                b.id ASC
            ) AS rn_asc,
            ROW_NUMBER() OVER (
              PARTITION BY
                b.employee_id,
                b.date
              ORDER BY
                b.time DESC,
                b.id DESC
            ) AS rn_desc
          FROM base b
        )
        SELECT COUNT(*) AS total
        FROM ranked r
        WHERE
          r.rn_asc = 1
          OR r.rn_desc = 1
      `;

      const [countRows] = await db.query(
        countSql,
        params
      );

      const total = Number(
        countRows?.[0]?.total || 0
      );

      const dataSql = `
        WITH base AS (${baseSql}),
        ranked AS (
          SELECT
            b.*,
            ROW_NUMBER() OVER (
              PARTITION BY
                b.employee_id,
                b.date
              ORDER BY
                b.time ASC,
                b.id ASC
            ) AS rn_asc,
            ROW_NUMBER() OVER (
              PARTITION BY
                b.employee_id,
                b.date
              ORDER BY
                b.time DESC,
                b.id DESC
            ) AS rn_desc
          FROM base b
        )
        SELECT
          r.*,
          dd.door_name
        FROM ranked r
        LEFT JOIN device_doors dd
          ON dd.device_id = r.device_id
         AND dd.door_number = r.door_number
        WHERE
          r.rn_asc = 1
          OR r.rn_desc = 1
        ORDER BY
          r.date DESC,
          r.employee_id ASC,
          r.time ASC
        LIMIT ? OFFSET ?
      `;

      const [rows] = await db.query(
        dataSql,
        [...params, ps, offset]
      );

      return res.json({
        page: p,
        pageSize: ps,
        total,
        rows,
        tables_used: tablesUsed,
      });
    }

    const countSql = `
      SELECT COUNT(*) AS total
      FROM (${baseSql}) c
    `;

    const [countRows] = await db.query(
      countSql,
      params
    );

    const total = Number(
      countRows?.[0]?.total || 0
    );

    const dataSql = `
      SELECT
        x.*,
        dd.door_name
      FROM (${baseSql}) x
      LEFT JOIN device_doors dd
        ON dd.device_id = x.device_id
       AND dd.door_number = x.door_number
      ORDER BY
        x.date DESC,
        x.time DESC,
        x.id DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.query(
      dataSql,
      [...params, ps, offset]
    );

    return res.json({
      page: p,
      pageSize: ps,
      total,
      rows,
      tables_used: tablesUsed,
    });
  } catch (error) {
    console.error("❌ Error report:", error);

    return res.status(500).json({
      message: "Error generando reporte",
      detail: String(error?.message || error),
    });
  }
};

/* ===================================================== */
/* Summary Daily SOLO activos */
/* ===================================================== */

exports.dailySummary = async (req, res) => {
  try {
    const {
      start,
      end,
    } = resolveEffectiveRange(req.query);

    if (!start || !end) {
      return res.status(400).json({
        message:
          "Debes enviar start y end, o al menos selected_dates.",
      });
    }

    const {
      baseSql,
      params,
    } = await buildFilteredBaseSql({
      ...req.query,
      start,
      end,
    });

    const sql = `
      SELECT
        b.date,
        COUNT(*) AS total,
        SUM(b.in_out = 1) AS in_count,
        SUM(b.in_out = 0) AS out_count
      FROM (${baseSql}) b
      GROUP BY b.date
      ORDER BY b.date DESC
    `;

    const [rows] = await db.query(
      sql,
      params
    );

    return res.json(rows || []);
  } catch (error) {
    console.error(
      "❌ Error dailySummary:",
      error
    );

    return res.status(500).json({
      message: "Error generando resumen diario",
      detail: String(error?.message || error),
    });
  }
};

/* ===================================================== */
/* Export XLSX COMPLETO */
/* ===================================================== */

exports.exportAttendanceXlsx = async (req, res) => {
  try {
    const {
      mode = "all",
    } = req.query;

    const {
      start,
      end,
    } = resolveEffectiveRange(req.query);

    if (!start || !end) {
      return res.status(400).json({
        message:
          "Debes enviar start y end, o al menos selected_dates.",
      });
    }

    const {
      baseSql,
      params,
    } = await buildFilteredBaseSql({
      ...req.query,
      start,
      end,
    });

    let sql = "";

    if (mode === "first_last") {
      sql = `
        WITH base AS (${baseSql}),
        ranked AS (
          SELECT
            b.*,
            ROW_NUMBER() OVER (
              PARTITION BY
                b.employee_id,
                b.date
              ORDER BY
                b.time ASC,
                b.id ASC
            ) AS rn_asc,
            ROW_NUMBER() OVER (
              PARTITION BY
                b.employee_id,
                b.date
              ORDER BY
                b.time DESC,
                b.id DESC
            ) AS rn_desc
          FROM base b
        )
        SELECT
          r.*,
          dd.door_name
        FROM ranked r
        LEFT JOIN device_doors dd
          ON dd.device_id = r.device_id
         AND dd.door_number = r.door_number
        WHERE
          r.rn_asc = 1
          OR r.rn_desc = 1
        ORDER BY
          r.date DESC,
          r.employee_id ASC,
          r.time ASC
      `;
    } else {
      sql = `
        SELECT
          x.*,
          dd.door_name
        FROM (${baseSql}) x
        LEFT JOIN device_doors dd
          ON dd.device_id = x.device_id
         AND dd.door_number = x.door_number
        ORDER BY
          x.date DESC,
          x.time DESC,
          x.id DESC
      `;
    }

    /*
     * IMPORTANTE:
     * No existe LIMIT 200000.
     * El XLSX debe contener todos los registros
     * que cumplen los filtros seleccionados.
     */
    const [rows] = await db.query(
      sql,
      params
    );

    const wb = new ExcelJS.Workbook();

    const ws = wb.addWorksheet(
      "Marcajes"
    );

    ws.columns = [
      {
        header: "ID",
        key: "id",
        width: 10,
      },
      {
        header: "Device",
        key: "device_id",
        width: 12,
      },
      {
        header: "Card ID Registro",
        key: "card_id",
        width: 16,
      },
      {
        header: "Employee Code",
        key: "employee_id",
        width: 16,
      },
      {
        header: "Biometric User ID",
        key: "biometric_user_id",
        width: 18,
      },
      {
        header: "Card ID Empleado",
        key: "employee_card_id",
        width: 18,
      },
      {
        header: "Nombre",
        key: "name",
        width: 32,
      },
      {
        header: "Departamento",
        key: "department",
        width: 22,
      },
      {
        header: "Puesto",
        key: "position",
        width: 22,
      },
      {
        header: "Fecha",
        key: "date",
        width: 12,
      },
      {
        header: "Hora",
        key: "time",
        width: 12,
      },
      {
        header: "Terminal",
        key: "terminal",
        width: 18,
      },
      {
        header: "In/Out",
        key: "in_out",
        width: 8,
      },
      {
        header: "Door#",
        key: "door_number",
        width: 8,
      },
      {
        header: "Door Name",
        key: "door_name",
        width: 24,
      },
      {
        header: "Importado",
        key: "created_at",
        width: 20,
      },
    ];

    rows.forEach((r) => {
      ws.addRow(r);
    });

    ws.getRow(1).font = {
      bold: true,
    };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="marcajes_${start}_a_${end}_${mode}.xlsx"`
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(
      "❌ Error export XLSX:",
      error
    );

    return res.status(500).json({
      message: "Error exportando XLSX",
      detail: String(
        error?.message || error
      ),
    });
  }
};

/* ===================================================== */
/* Exportación COMPLETA de datos para PDF                */
/* ===================================================== */

exports.exportAttendanceData = async (
  req,
  res
) => {
  try {
    const {
      start,
      end,
      mode = "all",
    } = req.query;

    if (
      !isValidYmd(start) ||
      !isValidYmd(end)
    ) {
      return res.status(400).json({
        message:
          "start y end son obligatorios y deben tener formato YYYY-MM-DD",
      });
    }

    const {
      baseSql,
      params,
      tablesUsed,
    } = await buildFilteredBaseSql(
      req.query
    );

    let sql = "";

    if (mode === "first_last") {
      sql = `
        WITH base AS (${baseSql}),
        ranked AS (
          SELECT
            b.*,
            ROW_NUMBER() OVER (
              PARTITION BY
                b.employee_id,
                b.date
              ORDER BY
                b.time ASC,
                b.id ASC
            ) AS rn_asc,
            ROW_NUMBER() OVER (
              PARTITION BY
                b.employee_id,
                b.date
              ORDER BY
                b.time DESC,
                b.id DESC
            ) AS rn_desc
          FROM base b
        )
        SELECT
          r.*,
          dd.door_name
        FROM ranked r
        LEFT JOIN device_doors dd
          ON dd.device_id = r.device_id
         AND dd.door_number = r.door_number
        WHERE
          r.rn_asc = 1
          OR r.rn_desc = 1
        ORDER BY
          r.date DESC,
          r.employee_id ASC,
          r.time ASC
      `;
    } else {
      sql = `
        SELECT
          x.*,
          dd.door_name
        FROM (${baseSql}) x
        LEFT JOIN device_doors dd
          ON dd.device_id = x.device_id
         AND dd.door_number = x.door_number
        ORDER BY
          x.date DESC,
          x.time DESC,
          x.id DESC
      `;
    }

    /*
     * Sin LIMIT.
     *
     * Este endpoint existe para que el frontend pueda
     * obtener TODOS los registros del rango filtrado
     * cuando necesita construir el PDF.
     */
    const [rows] = await db.query(
      sql,
      params
    );

    return res.json({
      rows,
      total: rows.length,
      tables_used: tablesUsed,
    });
  } catch (error) {
    console.error(
      "❌ Error export data reporte:",
      error
    );

    return res.status(500).json({
      message:
        "Error obteniendo datos completos del reporte",
      detail: String(
        error?.message || error
      ),
    });
  }
};

/* ===================================================== */
/* Reporte por empleado */
/* ===================================================== */

exports.byEmployee = async (
  req,
  res
) => {
  try {
    const {
      employee_id,
    } = req.params;

    req.query.employee_id =
      employee_id;

    return exports.attendanceReport(
      req,
      res
    );
  } catch (e) {
    console.error(
      "❌ byEmployee:",
      e
    );

    return res.status(500).json({
      message: "Error",
    });
  }
};

/* ===================================================== */
/* Reporte por tarjeta */
/* ===================================================== */

exports.byCard = async (
  req,
  res
) => {
  try {
    const {
      card_id,
    } = req.params;

    req.query.card_id =
      card_id;

    return exports.attendanceReport(
      req,
      res
    );
  } catch (e) {
    console.error(
      "❌ byCard:",
      e
    );

    return res.status(500).json({
      message: "Error",
    });
  }
};
