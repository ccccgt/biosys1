const express = require("express");
const router = express.Router();
const db = require("../config/db");

// helpers
function pad2(n) { return String(n).padStart(2, "0"); }
function toYMD_UTC(dateObj) {
  const y = dateObj.getUTCFullYear();
  const m = pad2(dateObj.getUTCMonth() + 1);
  const d = pad2(dateObj.getUTCDate());
  return `${y}-${m}-${d}`;
}
function getPeriodTableNameFromDate(dateObj) {
  const y = dateObj.getUTCFullYear();
  const m = dateObj.getUTCMonth() + 1;
  const d = dateObj.getUTCDate();
  let yy = y, mm = m;
  if (d <= 4) {
    mm = m - 1;
    if (mm === 0) { mm = 12; yy = y - 1; }
  }
  return `registros_${pad2(mm)}_${yy}`;
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
  const inValue = Number(process.env.DASH_IN_VALUE ?? 1); // 1=IN por defecto

  const dObj = new Date(`${dateYMD}T00:00:00Z`);
  const table = getPeriodTableNameFromDate(dObj);

  if (!(await tableExists(table))) {
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
      MIN(CASE WHEN r.in_out = ? THEN r.\`time\` ELSE NULL END) AS first_in,
      CASE
        WHEN MIN(CASE WHEN r.in_out = ? THEN r.\`time\` ELSE NULL END) IS NULL THEN 0
        WHEN MIN(CASE WHEN r.in_out = ? THEN r.\`time\` ELSE NULL END) > ? THEN 1
        ELSE 0
      END AS late,
      COUNT(*) AS punches
    FROM \`${table}\` r
    WHERE r.\`date\` = ?
    GROUP BY r.\`date\`, r.employee_id
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      first_in = VALUES(first_in),
      late = VALUES(late),
      punches = VALUES(punches)
    `,
    [inValue, inValue, inValue, startTime, dateYMD]
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
      AND r.in_out = ?
    GROUP BY r.\`date\`, HOUR(r.\`time\`)
    ON DUPLICATE KEY UPDATE \`count\` = VALUES(\`count\`)
    `,
    [dateYMD, inValue]
  );

  // device/day (all punches)
  await db.query(
    `
    INSERT INTO dashboard_device_day (\`date\`, terminal, \`count\`)
    SELECT
      r.\`date\`,
      COALESCE(r.terminal, 'N/A') AS terminal,
      COUNT(*) AS \`count\`
    FROM \`${table}\` r
    WHERE r.\`date\` = ?
    GROUP BY r.\`date\`, COALESCE(r.terminal, 'N/A')
    ON DUPLICATE KEY UPDATE \`count\` = VALUES(\`count\`)
    `,
    [dateYMD]
  );

  return { ok: true, date: dateYMD, table };
}

// Ejecuta backfill de los últimos N días (por defecto 7)
router.post("/run", async (req, res) => {
  try {
    const days = Math.max(1, Math.min(60, Number(req.body?.days || 7)));

    const now = new Date();
    // usamos AYER como último día completo
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    end.setUTCDate(end.getUTCDate() - 1);

    const results = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setUTCDate(d.getUTCDate() - i);
      const ymd = toYMD_UTC(d);
      results.push(await processDay(ymd));
    }

    res.json({ ok: true, days, results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

module.exports = router;