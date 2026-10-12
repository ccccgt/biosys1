const cron = require("node-cron");

function startLiveSyncCron() {
  console.log("[live-sync] DESHABILITADO: registros_live ahora se alimenta solo desde chiyu.live.cron.js");

  cron.schedule("*/30 * * * *", async () => {
    console.log("[live-sync] Sigue deshabilitado.");
  });
}

module.exports = startLiveSyncCron;