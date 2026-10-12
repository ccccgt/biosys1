const cron = require("node-cron");
const { extractManual } = require("../service/chiyu.service");

const TIMEZONE = "America/Guatemala";

function formatYmd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getCurrentMonthToTodayRange(now = new Date()) {
  const startDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

  return {
    start: formatYmd(startDate),
    end: formatYmd(now),
  };
}

function startChiyuMonthlyBackupCron() {
  /*
   * Todos los días a las 23:50.
   *
   * Descarga desde el primer día del mes hasta hoy,
   * guarda una instantánea XLS y acumula los registros
   * en registros_MM_YYYY.
   */
  cron.schedule(
    "50 23 * * *",
    async () => {
      const { start, end } =
        getCurrentMonthToTodayRange(new Date());

      console.log("📦 Respaldo mensual acumulativo CHIYU");
      console.log(`➡️ Rango: ${start} → ${end}`);

      try {
        const result = await extractManual(
          start,
          end,
          "PERIOD",
          {
            saveXls: true,
            archiveType: "snapshot",
          }
        );

        console.log(
          "✅ Respaldo acumulativo completado:",
          JSON.stringify(result, null, 2)
        );
      } catch (error) {
        console.error(
          "❌ Error en respaldo acumulativo CHIYU:",
          error
        );
      }
    },
    {
      timezone: TIMEZONE,
    }
  );

  console.log(
    "⏰ Respaldo acumulativo CHIYU activado (diario 23:50)"
  );
}

module.exports = startChiyuMonthlyBackupCron;
