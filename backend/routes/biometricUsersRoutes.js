const express = require("express");
const router = express.Router();
const db = require("../config/db");
const path = require("path");
const { spawn } = require("child_process");
const {
  verifyToken,
  checkPermission,
} = require("../middleware/authMiddleware");

let chiyuSyncRunning = false;


const TABLES_TO_CHECK = ["registros_01_2026", "registros_02_2026"];
const RANGE_START = "2026-01-01";
const RANGE_END = "2026-02-28";

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

async function getExistingAttendanceTables() {
  const out = [];
  for (const t of TABLES_TO_CHECK) {
    if (await tableExists(t)) out.push(t);
  }
  return out;
}

function buildAttendanceSubquery(tables) {
  if (!tables.length) {
    return `
      (
        SELECT
          NULL AS employee_id,
          NULL AS card_id,
          NULL AS date_val
        WHERE 1=0
      )
    `;
  }

  return `
    (
      ${tables
        .map(
          (t) => `
        SELECT
          TRIM(CAST(employee_id AS CHAR)) AS employee_id,
          TRIM(CAST(card_id AS CHAR)) AS card_id,
          \`date\` AS date_val
        FROM \`${t}\`
        WHERE \`date\` >= '${RANGE_START}'
          AND \`date\` <= '${RANGE_END}'
          AND (
            (
              employee_id IS NOT NULL
              AND TRIM(CAST(employee_id AS CHAR)) <> ''
              AND TRIM(CAST(employee_id AS CHAR)) <> '----'
            )
            OR
            (
              card_id IS NOT NULL
              AND TRIM(CAST(card_id AS CHAR)) <> ''
              AND TRIM(CAST(card_id AS CHAR)) <> '0'
            )
          )
      `
        )
        .join(" UNION ALL ")}
    )
  `;
}

function buildEmployeeHasIdentifierCondition(alias = "e") {
  return `
    (
      (${alias}.employee_code IS NOT NULL AND TRIM(CAST(${alias}.employee_code AS CHAR)) <> '')
      OR
      (${alias}.biometric_user_id IS NOT NULL AND TRIM(CAST(${alias}.biometric_user_id AS CHAR)) <> '')
      OR
      (${alias}.card_id IS NOT NULL AND TRIM(CAST(${alias}.card_id AS CHAR)) <> '')
    )
  `;
}

function buildAttendanceMatchCondition(employeeAlias = "e", attendanceAlias = "a") {
  return `
    (
      (
        ${employeeAlias}.employee_code IS NOT NULL
        AND TRIM(CAST(${employeeAlias}.employee_code AS CHAR)) <> ''
        AND ${attendanceAlias}.employee_id = TRIM(CAST(${employeeAlias}.employee_code AS CHAR))
      )
      OR
      (
        ${employeeAlias}.biometric_user_id IS NOT NULL
        AND TRIM(CAST(${employeeAlias}.biometric_user_id AS CHAR)) <> ''
        AND ${attendanceAlias}.card_id = TRIM(CAST(${employeeAlias}.biometric_user_id AS CHAR))
      )
      OR
      (
        ${employeeAlias}.card_id IS NOT NULL
        AND TRIM(CAST(${employeeAlias}.card_id AS CHAR)) <> ''
        AND ${attendanceAlias}.card_id = TRIM(CAST(${employeeAlias}.card_id AS CHAR))
      )
    )
  `;
}

// ======================================
// LISTAR
// ======================================
router.get("/", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim();
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 200)));

    let sql = `
      SELECT
        id,
        employee_code,
        biometric_user_id,
        card_id,
        full_name,
        department,
        position,
        status
      FROM employees
      WHERE 1=1
    `;

    const params = [];

    if (q) {
      sql += `
        AND (
          employee_code LIKE ?
          OR biometric_user_id LIKE ?
          OR card_id LIKE ?
          OR full_name LIKE ?
          OR department LIKE ?
        )
      `;
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }

    if (status) {
      sql += ` AND status = ? `;
      params.push(status);
    }

    sql += ` ORDER BY full_name ASC LIMIT ${limit}`;

    const [rows] = await db.query(sql, params);
    res.json({ ok: true, items: rows || [] });
  } catch (e) {
    console.error("biometricUsers list error:", e);
    res.status(500).json({
      error: "Error listando usuarios biométricos",
      detail: String(e?.message || e),
    });
  }
});

// ======================================
// ACTUALIZAR
// ======================================
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const employee_code =
      req.body.employee_code == null ? null : String(req.body.employee_code).trim() || null;

    const biometric_user_id =
      req.body.biometric_user_id == null
        ? null
        : String(req.body.biometric_user_id).trim() || null;

    const card_id =
      req.body.card_id == null ? null : String(req.body.card_id).trim() || null;

    const full_name =
      req.body.full_name == null ? null : String(req.body.full_name).trim() || null;

    const department =
      req.body.department == null ? null : String(req.body.department).trim() || null;

    const position =
      req.body.position == null ? null : String(req.body.position).trim() || null;

    const status =
      req.body.status == null ? "active" : String(req.body.status).trim().toLowerCase();

    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ error: "status inválido. Usa active o inactive" });
    }

    await db.query(
      `
      UPDATE employees
      SET
        employee_code = ?,
        biometric_user_id = ?,
        card_id = ?,
        full_name = ?,
        department = ?,
        position = ?,
        status = ?
      WHERE id = ?
      `,
      [
        employee_code,
        biometric_user_id,
        card_id,
        full_name,
        department,
        position,
        status,
        id,
      ]
    );

    const [rows] = await db.query(
      `
      SELECT
        id,
        employee_code,
        biometric_user_id,
        card_id,
        full_name,
        department,
        position,
        status
      FROM employees
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    res.json({
      ok: true,
      item: rows?.[0] || null,
    });
  } catch (e) {
    console.error("biometricUsers update error:", e);
    res.status(500).json({
      error: "Error actualizando usuario biométrico",
      detail: String(e?.message || e),
    });
  }
});

// ======================================
// PREVIEW AUTO-INACTIVE
// ======================================
router.get("/preview/auto-inactive", async (req, res) => {
  try {
    const tables = await getExistingAttendanceTables();
    const attendanceSQL = buildAttendanceSubquery(tables);

    if (!tables.length) {
      return res.json({
        ok: true,
        range: { start: RANGE_START, end: RANGE_END },
        tablesUsed: [],
        total: 0,
        items: [],
        note: "No existen las tablas configuradas. No se evaluó ningún usuario.",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        e.id,
        e.employee_code,
        e.biometric_user_id,
        e.card_id,
        e.full_name,
        e.department,
        e.position,
        e.status
      FROM employees e
      WHERE e.status = 'active'
        AND ${buildEmployeeHasIdentifierCondition("e")}
        AND NOT EXISTS (
          SELECT 1
          FROM ${attendanceSQL} a
          WHERE ${buildAttendanceMatchCondition("e", "a")}
        )
      ORDER BY e.full_name ASC, e.employee_code ASC
      `
    );

    res.json({
      ok: true,
      range: { start: RANGE_START, end: RANGE_END },
      tablesUsed: tables,
      total: rows.length,
      items: rows || [],
    });
  } catch (e) {
    console.error("biometricUsers preview inactive error:", e);
    res.status(500).json({
      error: "Error generando preview de inactivos",
      detail: String(e?.message || e),
    });
  }
});

// ======================================
// EJECUTAR AUTO-INACTIVE MANUAL
// ======================================
router.post("/run/auto-inactive", async (req, res) => {
  try {
    const tables = await getExistingAttendanceTables();
    const attendanceSQL = buildAttendanceSubquery(tables);

    if (!tables.length) {
      return res.json({
        ok: false,
        range: { start: RANGE_START, end: RANGE_END },
        tablesUsed: [],
        updated: 0,
        detail: "No existen las tablas configuradas. No se realizó ningún cambio.",
      });
    }

    const [result] = await db.query(
      `
      UPDATE employees e
      SET e.status = 'inactive'
      WHERE e.status = 'active'
        AND ${buildEmployeeHasIdentifierCondition("e")}
        AND NOT EXISTS (
          SELECT 1
          FROM ${attendanceSQL} a
          WHERE ${buildAttendanceMatchCondition("e", "a")}
        )
      `
    );

    res.json({
      ok: true,
      range: { start: RANGE_START, end: RANGE_END },
      tablesUsed: tables,
      updated: Number(result?.affectedRows || 0),
    });
  } catch (e) {
    console.error("biometricUsers run inactive error:", e);
    res.status(500).json({
      error: "Error ejecutando auto-inactive",
      detail: String(e?.message || e),
    });
  }
});


// =====================================================
// SINCRONIZAR USUARIOS BIOMÉTRICOS CHIYU EN TIEMPO REAL
// Utiliza el importador oficial existente; no duplica su lógica.
// =====================================================
router.post(
  "/sync/chiyu/stream",
  verifyToken,
  checkPermission("biometric_users_enabled"),
  (req, res) => {
    if (chiyuSyncRunning) {
      return res.status(409).json({
        ok: false,
        message: "Ya existe una sincronización biométrica en ejecución.",
      });
    }

    chiyuSyncRunning = true;

    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Connection", "keep-alive");

    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    let child;
    let finalized = false;

    const finish = (message) => {
      if (finalized) return;
      finalized = true;
      chiyuSyncRunning = false;

      if (message && !res.destroyed && !res.writableEnded) {
        res.write(message);
      }

      if (!res.destroyed && !res.writableEnded) {
        res.end();
      }
    };

    try {
      const backendDirectory = path.resolve(__dirname, "..");
      const scriptPath = path.join(
        backendDirectory,
        "scripts",
        "import-chiyu-users.js"
      );

      res.write(
        "====================================================\n" +
        "BIOSYS 1.0 - SINCRONIZACIÓN DE USUARIOS CHIYU\n" +
        "====================================================\n" +
        "Iniciando el importador oficial...\n\n"
      );

      child = spawn(
        process.execPath,
        [scriptPath, "--apply"],
        {
          cwd: backendDirectory,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        }
      );

      child.stdout.on("data", (chunk) => {
        if (!res.destroyed && !res.writableEnded) {
          res.write(chunk);
        }
      });

      child.stderr.on("data", (chunk) => {
        if (!res.destroyed && !res.writableEnded) {
          res.write(chunk);
        }
      });

      child.on("error", (error) => {
        finish(
          "\n[ERROR AL INICIAR EL IMPORTADOR] " +
          String(error.message || error) +
          "\n"
        );
      });

      child.on("close", (code, signal) => {
        const result =
          code === 0
            ? "EXITOSO"
            : "FALLIDO";

        finish(
          `\n[RESULTADO: ${result}]` +
          `\n[CÓDIGO DE SALIDA: ${code}]` +
          (signal ? `\n[SEÑAL: ${signal}]` : "") +
          "\n"
        );
      });
    } catch (error) {
      finish(
        "\n[ERROR DEL SERVIDOR] " +
        String(error.message || error) +
        "\n"
      );
    }
  }
);


module.exports = router;