const { extractManual } = require("../service/chiyu.service");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ymd(dateObj) {
  const d = new Date(dateObj);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startChiyuLiveCron() {
  let running = false;

  const runSync = async (type) => {
    if (running) {
      console.log(
        `[chiyu-live] ${type} omitido: ya existe una sincronización CHIYU en ejecución.`
      );
      return;
    }

    running = true;

    try {
      const now = new Date();

      if (type === "BACKFILL") {
        const monthStart = startOfCurrentMonth();

        const start = new Date(now);
        start.setDate(now.getDate() - 4);

        if (start < monthStart) {
          start.setTime(monthStart.getTime());
        }

        const startStr = ymd(start);
        const endStr = ymd(now);

        console.log(
          `[chiyu-live] Backfill mes actual ${startStr} -> ${endStr}...`
        );

        const result = await extractManual(
          startStr,
          endStr,
          "CACHE"
        );

        console.log(
          "[chiyu-live] Resultado BACKFILL:",
          JSON.stringify(result, null, 2)
        );
      } else {
        const today = ymd(now);

        console.log(`[chiyu-live] Sync HOY ${today}...`);

        const result = await extractManual(
          today,
          today,
          "CACHE"
        );

        console.log(
          "[chiyu-live] Resultado HOY:",
          JSON.stringify(result, null, 2)
        );
      }
    } catch (e) {
      console.error(`[chiyu-live] Error ${type}:`, e);
    } finally {
      running = false;
    }
  };

  // Al arrancar: un solo backfill.
  // Este backfill ya incluye HOY, por lo que NO ejecutamos
  // inmediatamente un segundo extractManual().
  runSync("BACKFILL");

  // Después: solamente HOY cada 5 minutos.
  setInterval(() => {
    runSync("HOY");
  }, 5 * 60 * 1000);

  console.log(
    "[chiyu-live] Programado cada 5 minutos con bloqueo de ejecución simultánea."
  );
}

module.exports = startChiyuLiveCron;
