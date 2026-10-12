const cron = require("node-cron");
const db = require("../config/db");

module.exports = function startCacheCleanupCron() {
  // cada hora al minuto 10
  cron.schedule("10 * * * *", async () => {
    try {
      const [r] = await db.query(
        "DELETE FROM attendance_cache WHERE expires_at <= NOW()"
      );
      const affected = r?.affectedRows ?? 0;
      if (affected > 0) {
        console.log(`🧹 Cache cleanup: eliminados ${affected} registros vencidos`);
      }
    } catch (e) {
      console.error("❌ Cache cleanup error:", e);
    }
  });

  console.log("✅ cache.cleanup.cron iniciado (cada hora)");
};