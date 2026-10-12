const db = require("../config/db");
const { syncAdGroupsCatalog } = require("../service/adGroupsCatalog.service");

exports.list = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    let sql = `
      SELECT
        id,
        group_name,
        group_dn,
        description,
        is_active,
        last_sync_at,
        created_at,
        updated_at
      FROM ad_groups_catalog
    `;
    const params = [];

    if (q) {
      sql += `
        WHERE
          group_name LIKE ?
          OR group_dn LIKE ?
          OR description LIKE ?
      `;
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    sql += ` ORDER BY group_name ASC`;

    const [rows] = await db.query(sql, params);
    return res.json(rows || []);
  } catch (error) {
    console.error("❌ Error listando catálogo AD:", error);
    return res.status(500).json({
      message: "Error listando catálogo AD",
      detail: String(error?.message || error),
    });
  }
};

exports.sync = async (req, res) => {
  try {
    const result = await syncAdGroupsCatalog();

    return res.json({
      message: "Catálogo AD sincronizado",
      ...result,
    });
  } catch (error) {
    console.error("❌ Error sincronizando catálogo AD:", error);
    return res.status(500).json({
      message: "Error sincronizando catálogo AD",
      detail: String(error?.message || error),
    });
  }
};