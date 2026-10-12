const cron = require("node-cron");
const db = require("../config/db");
const { extractManual } = require("../service/chiyu.service");

const TIMEZONE = "America/Guatemala";

function formatYmd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Si hoy es 2026-08-01 devuelve:
 *
 * start = 2026-07-01
 * end   = 2026-07-31
 */
function getPreviousCalendarMonthRange(now = new Date()) {
  const startDate = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1
  );

  const endDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    0
  );

  return {
    start: formatYmd(startDate),
    end: formatYmd(endDate),
  };
}

async function updateSyncStateForActiveDevices(endDate) {
  const [devices] = await db.query(
    "SELECT id FROM devices WHERE active = 1"
  );

  for (const device of devices) {
    await db.query(
      `INSERT INTO sync_state
        (device_id, last_synced_date)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE
         last_synced_date = VALUES(last_synced_date)`,
      [device.id, endDate]
    );
  }
}

function startChiyuCron() {
  /*
   * Día 1 de cada mes a las 00:20.
   *
   * Descarga y consolida el mes calendario anterior.
   */
  cron.schedule(
    "20 0 1 * *",
    async () => {
      const { start, end } =
        getPreviousCalendarMonthRange(new Date());

      console.log("📅 CIERRE MENSUAL CHIYU iniciado");
      console.log(`➡️ Período calendario: ${start} → ${end}`);

      try {
        const result = await extractManual(
          start,
          end,
          "PERIOD",
          {
            saveXls: true,
            archiveType: "final",
          }
        );

        await updateSyncStateForActiveDevices(end);

        console.log(
          "✅ Cierre mensual CHIYU completado:",
          JSON.stringify(result, null, 2)
        );

        console.log(
          `✅ sync_state actualizado a ${end}`
        );
      } catch (error) {
        console.error(
          "❌ Error en cierre mensual CHIYU:",
          error
        );
      }
    },
    {
      timezone: TIMEZONE,
    }
  );

  console.log(
    "⏰ Cierre mensual CHIYU activado (día 1, 00:20)"
  );
}

module.exports = startChiyuCron;
