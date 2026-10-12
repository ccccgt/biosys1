require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const chiyuRoutes = require("./routes/chiyuRoutes");
const reportsRoutes = require("./routes/reportsRoutes");
const devicesRoutes = require("./routes/devicesRoutes");
const biometricUsersRoutes = require("./routes/biometricUsersRoutes");
const biometricCardsRoutes = require("./routes/biometricCardsRoutes");
const systemUsersRoutes = require("./routes/systemUsersRoutes");
const adGroupRoleMapRoutes = require("./routes/adGroupRoleMapRoutes");
const adGroupsCatalogRoutes = require("./routes/adGroupsCatalogRoutes");
const permissionsDiagnosticRoutes = require("./routes/permissionsDiagnosticRoutes");
const rolesRoutes = require("./routes/rolesRoutes");
const markRequestsRoutes = require("./routes/markRequestsRoutes");
const startChiyuMonthlyBackupCron = require("./jobs/chiyu.monthly.backup.cron");
const startChiyuCron = require("./jobs/chiyu.cron");
const startChiyuLiveCron = require("./jobs/chiyu.live.cron");
const startCacheCleanupCron = require("./jobs/cache.cleanup.cron");
const startDashboardCacheCron = require("./jobs/dashboard.cache.cron");
const startBiometricUsersStatusCron = require("./jobs/biometric.users.status.cron");

const db = require("./config/db");

const app = express();

console.log("🔥 SERVER REAL EJECUTÁNDOSE:", __filename);

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use((req, res, next) => {
  const startedAt = Date.now();

  console.log("====================================");
  console.log("Request recibido:", req.method, req.originalUrl);
  console.log("Query:", req.query || {});
  console.log("Body keys:", req.body ? Object.keys(req.body) : []);

  res.on("finish", () => {
    console.log(
      "Response:",
      req.method,
      req.originalUrl,
      "->",
      res.statusCode,
      "-",
      Date.now() - startedAt,
      "ms"
    );
    console.log("====================================");
  });

  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/chiyu", chiyuRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/devices", devicesRoutes);
app.use("/api/biometric-users", biometricUsersRoutes);
app.use("/api/biometric-cards", biometricCardsRoutes);
app.use("/api/system-users", systemUsersRoutes);
app.use("/api/ad-group-role-map", adGroupRoleMapRoutes);
app.use("/api/ad-groups-catalog", adGroupsCatalogRoutes);
app.use("/api/permissions-diagnostic", permissionsDiagnosticRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/mark-requests", markRequestsRoutes);

app.get("/", (req, res) => {
  res.send("API Biométrico funcionando");
});

app.get("/api/ping", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT NOW() AS now_time");
    return res.json({
      ok: true,
      server: __filename,
      db: "ok",
      now: rows?.[0]?.now_time || null,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      server: __filename,
      db: "error",
      error: err.message,
    });
  }
});

const PORT = process.env.PORT || 5000;

db.query("SELECT 1 AS ok")
  .then(() => {
    console.log("🔥 Conexión a MySQL OK");

    if (typeof startChiyuCron === "function") startChiyuCron();
    if (typeof startChiyuLiveCron === "function") startChiyuLiveCron();
    if (typeof startCacheCleanupCron === "function") startCacheCleanupCron();
    if (typeof startDashboardCacheCron === "function") startDashboardCacheCron();
    if (typeof startBiometricUsersStatusCron === "function") {startBiometricUsersStatusCron();
    if (typeof startChiyuMonthlyBackupCron === "function") {startChiyuMonthlyBackupCron();
}
    }
  })
  .catch((err) => {
    console.error("❌ Error conectando a MySQL:", err);
  });

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
