const cron = require("node-cron");
const db = require("../config/db");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function getPeriodTableNameFromDate(dateObj) {
  const y = dateObj.getUTCFullYear();
  const m = dateObj.getUTCMonth() + 1;
  const d = dateObj.getUTCDate();

  let yy = y;
  let mm = m;

  if (d <= 4) {
    mm = m - 1;
    if (mm === 0) {
      mm = 12;
      yy = y - 1;
    }
  }

  return `registros_${pad2(mm)}_${yy}`;
}

function toYMD_UTC(dateObj) {
  const y = dateObj.getUTCFullYear();
  const m = pad2(dateObj.getUTCMonth() + 1);
  const d = pad2(dateObj.getUTCDate());
  return `${y}-${m}-${d}`;
}

const VALID_WHERE = `
  employee_id IS NOT NULL
  AND TRIM(employee_id) <> ''
  AND employee_id <> '----'
  AND name <> '---- ----'
  AND in_out <> 127
`;

function parseInValues() {
  const raw = process.env.DASH_IN_VALUES;
  if (!raw) return [1];
  return raw
    .split(",")
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isFinite(n));
}

async function ensureStateTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS dashboard_sync_state (
      \`k\` VARCHAR(120) PRIMARY KEY,
      \`v\` VARCHAR(255) NOT NULL,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

async function getState(key) {
  await ensureStateTable();
  const [rows] = await db.query(
    `SELECT \`v\` FROM dashboard_sync_state WHERE \`k\` = ? LIMIT 1`,
    [key]
  );
  return rows?.[0]?.v || null;
}

async function setState(key, value) {
  await ensureStateTable();
  await db.query(
    `
    INSERT INTO dashboard_sync_state (\`k\`, \`v\`)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE \`v\` = VALUES(\`v\`)
    `,
    [key, value]
  );
}

async function tableExists(tableName) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function processDay(dateYMD) {
  const startTime = process.env.DASH_START_TIME || "08:00:00";
  const IN_VALUES = parseInValues();
  const inPlaceholders = IN_VALUES.map(() => "?").join(",");

  const dObj = new Date(`${dateYMD}T00:00:00Z`);
  const table = getPeriodTableNameFromDate(dObj);

  const exists = await tableExists(table);
  if (!exists) {
    console.log(`[dashboard-cache] Tabla no existe (${table}) para ${dateYMD}.`);
    return { ok: false, date: dateYMD, table, reason: "table_missing" };
  }

  // employee/day
  await db.query(
    `
    INSERT INTO dashboard_employee_day (\`date\`, employee_id, name, first_in, late, punches)
    SELECT
      r.\`date\`,
      r.employee_id,
      MAX(r.name) AS name,
      MIN(CASE WHEN r.in_out IN (${inPlaceholders}) THEN r.\`time\` ELSE NULL END) AS first_in,
      CASE
        WHEN MIN(CASE WHEN r.in_out IN (${inPlaceholders}) THEN r.\`time\` ELSE NULL END) IS NULL THEN 0
        WHEN MIN(CASE WHEN r.in_out IN (${inPlaceholders}) THEN r.\`time\` ELSE NULL END) > ? THEN 1
        ELSE 0
      END AS late,
      COUNT(*) AS punches
    FROM \`${table}\` r
    WHERE r.\`date\` = ?
      AND ${VALID_WHERE}
    GROUP BY r.\`date\`, r.employee_id
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      first_in = VALUES(first_in),
      late = VALUES(late),
      punches = VALUES(punches)
    `,
    [...IN_VALUES, ...IN_VALUES, ...IN_VALUES, startTime, dateYMD]
  );

  // hour/day (IN only)
  await db.query(
    `
    INSERT INTO dashboard_hour_day (\`date\`, \`hour\`, \`count\`)
    SELECT
      r.\`date\`,
      HOUR(r.\`time\`) AS \`hour\`,
      COUNT(*) AS \`count\`
    FROM \`${table}\` r
    WHERE r.\`date\` = ?
      AND r.in_out IN (${inPlaceholders})
      AND ${VALID_WHERE}
    GROUP BY r.\`date\`, HOUR(r.\`time\`)
    ON DUPLICATE KEY UPDATE \`count\` = VALUES(\`count\`)
    `,
    [dateYMD, ...IN_VALUES]
  );

  // device/day (all valid punches)
  await db.query(
    `
    INSERT INTO dashboard_device_day (\`date\`, terminal, \`count\`)
    SELECT
      r.\`date\`,
      COALESCE(r.terminal, 'N/A') AS terminal,
      COUNT(*) AS \`count\`
    FROM \`${table}\` r
    WHERE r.\`date\` = ?
      AND ${VALID_WHERE}
    GROUP BY r.\`date\`, COALESCE(r.terminal, 'N/A')
    ON DUPLICATE KEY UPDATE \`count\` = VALUES(\`count\`)
    `,
    [dateYMD]
  );

  console.log(`[dashboard-cache] OK ${dateYMD} (${table})`);
  return { ok: true, date: dateYMD, table };
}

async function runBackfill(days) {
  const n = Math.max(1, Math.min(60, Number(days || 7)));

  const now = new Date();
  // ayer
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - 1);

  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const ymd = toYMD_UTC(d);

    await processDay(ymd);
    await setState("dashboard_last_processed_date", ymd);
  }
}

function startDashboardCacheCron() {
  // Backfill inicial si no hay estado
  (async () => {
    try {
      const last = await getState("dashboard_last_processed_date");
      if (!last) {
        console.log("[dashboard-cache] Primer arranque: backfill últimos 7 días...");
        await runBackfill(7);
      } else {
        console.log(`[dashboard-cache] Estado existente: dashboard_last_processed_date=${last}`);
      }
    } catch (e) {
      console.error("[dashboard-cache] Error backfill inicial:", e);
    }
  })();

  // Cron diario 00:10
  cron.schedule("10 0 * * *", async () => {
    try {
      console.log("[dashboard-cache] Cron diario iniciado...");

      const now = new Date();
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      end.setUTCDate(end.getUTCDate() - 1);
      const endYMD = toYMD_UTC(end);

      let last = await getState("dashboard_last_processed_date");
      if (!last) {
        await runBackfill(7);
        return;
      }

      let cur = new Date(`${last}T00:00:00Z`);
      cur.setUTCDate(cur.getUTCDate() + 1);

      const endObj = new Date(`${endYMD}T00:00:00Z`);

      while (cur <= endObj) {
        const ymd = toYMD_UTC(cur);
        await processDay(ymd);
        await setState("dashboard_last_processed_date", ymd);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      console.log("[dashboard-cache] Cron diario finalizado.");
    } catch (e) {
      console.error("[dashboard-cache] Error cron diario:", e);
    }
  });

  console.log("[dashboard-cache] Cron programado (00:10 diario).");
}

module.exports = startDashboardCacheCron;