require("dotenv").config();
const db = require("../config/db");
const { extractManual } = require("../service/chiyu.service");

function getPreviousPeriodRange(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const endDate = new Date(year, month, 24);
  const startDate = new Date(year, month, 1);

  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
}

async function updateSyncStateForActiveDevices(endDateStr) {
  const [devices] = await db.query("SELECT id FROM devices WHERE active = 1");

  for (const d of devices) {
    await db.query(
      `INSERT INTO sync_state (device_id, last_synced_date)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE last_synced_date = VALUES(last_synced_date)`,
      [d.id, endDateStr]
    );
  }
}

(async () => {
  const { start, end } = getPreviousPeriodRange(new Date());

  console.log("RUN mensual manual");
  console.log(`Extrayendo: ${start} → ${end}`);

  await extractManual(start, end, "PERIOD");
  await updateSyncStateForActiveDevices(end);

  console.log("OK. sync_state actualizado:", end);
  process.exit(0);
})();
