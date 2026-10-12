const cron = require("node-cron");
const db = require("../config/db");

function getCurrentMonthRange() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const firstDay = `${year}-${month}-01`;

  const lastDayDate = new Date(year, now.getMonth() + 1, 0);
  const lastDay = `${year}-${month}-${String(lastDayDate.getDate()).padStart(2, "0")}`;

  return {
    year,
    month,
    tableName: `registros_${month}_${year}`,
    rangeStart: firstDay,
    rangeEnd: lastDay,
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

async function runBiometricUsersAutoInactive() {
  const {
    year,
    month,
    tableName,
    rangeStart,
    rangeEnd,
  } = getCurrentMonthRange();

  console.log("");
  console.log("============================================================");
  console.log("[biometric-users] AUTO-INACTIVE - DRY RUN");
  console.log("============================================================");
  console.log(`[biometric-users] Mes evaluado: ${month}/${year}`);
  console.log(`[biometric-users] Tabla: ${tableName}`);
  console.log(`[biometric-users] Rango: ${rangeStart} -> ${rangeEnd}`);
  console.log("[biometric-users] IMPORTANTE: NO se realizará ningún UPDATE.");
  console.log("============================================================");

  const exists = await tableExists(tableName);

  if (!exists) {
    console.log(
      `[biometric-users] La tabla ${tableName} no existe.`
    );
    console.log(
      "[biometric-users] No se realizará ninguna acción."
    );
    return;
  }

  /*
   * DRY RUN:
   *
   * Identificamos únicamente empleados actualmente activos que:
   *
   *   - tienen biometric_user_id o card_id
   *   - NO tienen ningún registro en el mes actual
   *
   * NO modificamos employees.
   */

  const [rows] = await db.query(
    `
    SELECT
      e.id,
      e.employee_code,
      e.biometric_user_id,
      e.card_id,
      e.full_name,
      e.status
    FROM employees e
    LEFT JOIN (
      SELECT DISTINCT
        employee_id,
        card_id
      FROM \`${tableName}\`
      WHERE \`date\` >= ?
        AND \`date\` <= ?
        AND (
          (
            employee_id IS NOT NULL
            AND TRIM(employee_id) <> ''
            AND employee_id <> '----'
          )
          OR
          (
            card_id IS NOT NULL
            AND TRIM(card_id) <> ''
            AND card_id <> '0'
          )
        )
    ) r
      ON (
        e.biometric_user_id IS NOT NULL
        AND TRIM(e.biometric_user_id) <> ''
        AND CAST(r.employee_id AS CHAR) = CAST(e.biometric_user_id AS CHAR)
      )
      OR (
        e.card_id IS NOT NULL
        AND TRIM(e.card_id) <> ''
        AND CAST(r.card_id AS CHAR) = CAST(e.card_id AS CHAR)
      )
    WHERE e.status = 'active'
      AND (
        (e.biometric_user_id IS NOT NULL AND TRIM(e.biometric_user_id) <> '')
        OR
        (e.card_id IS NOT NULL AND TRIM(e.card_id) <> '')
      )
      AND r.employee_id IS NULL
      AND r.card_id IS NULL
    ORDER BY
      e.full_name ASC,
      e.employee_code ASC
    `,
    [rangeStart, rangeEnd]
  );

  console.log("");
  console.log(
    `[biometric-users] Candidatos a inactive: ${rows.length}`
  );
  console.log("");

  if (!rows.length) {
    console.log(
      "[biometric-users] No hay usuarios activos sin asistencia en el mes actual."
    );
    console.log("");
    return;
  }

  console.log(
    "ID | EMPLOYEE_CODE | BIOMETRIC_USER_ID | CARD_ID | STATUS | FULL_NAME"
  );
  console.log(
    "------------------------------------------------------------------------------------------"
  );

  for (const row of rows) {
    console.log(
      `${row.id ?? ""} | ` +
      `${row.employee_code ?? ""} | ` +
      `${row.biometric_user_id ?? ""} | ` +
      `${row.card_id ?? ""} | ` +
      `${row.status ?? ""} | ` +
      `${row.full_name ?? ""}`
    );
  }

  console.log("");
  console.log(
    "[biometric-users] DRY RUN finalizado."
  );
  console.log(
    "[biometric-users] Ningún registro de employees fue modificado."
  );
  console.log("");
}

function startBiometricUsersStatusCron() {
  // IMPORTANTE:
  // No ejecutar al arrancar.
  // El proceso solamente se ejecutará mediante el cron diario.
  cron.schedule("20 1 * * *", async () => {
    try {
      await runBiometricUsersAutoInactive();
    } catch (e) {
      console.error(
        "[biometric-users] Error en cron:",
        e
      );
    }
  });

  console.log(
    "[biometric-users] Cron auto-inactive DRY RUN programado diariamente a las 01:20."
  );
}

module.exports = {
  startBiometricUsersStatusCron,
  runBiometricUsersAutoInactive,
};
