const db = require("../config/db");

exports.list = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        m.id,
        m.ad_group_name,
        m.role_id,
        m.created_at,
        m.updated_at,
        r.name AS role_name,
        r.description AS role_description
      FROM ad_group_role_map m
      LEFT JOIN roles r ON r.id = m.role_id
      ORDER BY m.ad_group_name ASC
      `
    );

    return res.json(rows || []);
  } catch (error) {
    console.error("❌ Error listando mapeos AD:", error);
    return res.status(500).json({
      message: "Error listando mapeos AD",
      detail: String(error?.message || error),
    });
  }
};

exports.listDetectedGroups = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    let sql = `
      SELECT
        ug.group_name,
        COUNT(DISTINCT ug.user_id) AS users_count,
        MIN(ug.group_dn) AS sample_group_dn
      FROM user_ad_groups ug
    `;
    const params = [];

    if (q) {
      sql += ` WHERE ug.group_name LIKE ? `;
      params.push(`%${q}%`);
    }

    sql += `
      GROUP BY ug.group_name
      ORDER BY ug.group_name ASC
    `;

    const [rows] = await db.query(sql, params);
    return res.json(rows || []);
  } catch (error) {
    console.error("❌ Error listando grupos detectados:", error);
    return res.status(500).json({
      message: "Error listando grupos detectados",
      detail: String(error?.message || error),
    });
  }
};

exports.create = async (req, res) => {
  try {
    const { ad_group_name, role_id } = req.body || {};

    if (!ad_group_name || !role_id) {
      return res.status(400).json({
        message: "ad_group_name y role_id son requeridos",
      });
    }

    await db.query(
      `
      INSERT INTO ad_group_role_map (
        ad_group_name,
        role_id,
        created_at,
        updated_at
      ) VALUES (?, ?, NOW(), NOW())
      `,
      [String(ad_group_name).trim(), Number(role_id)]
    );

    return res.json({ message: "Mapeo AD creado" });
  } catch (error) {
    console.error("❌ Error creando mapeo AD:", error);
    return res.status(500).json({
      message: "Error creando mapeo AD",
      detail: String(error?.message || error),
    });
  }
};

exports.update = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { ad_group_name, role_id } = req.body || {};

    if (!ad_group_name || !role_id) {
      return res.status(400).json({
        message: "ad_group_name y role_id son requeridos",
      });
    }

    await db.query(
      `
      UPDATE ad_group_role_map
      SET
        ad_group_name = ?,
        role_id = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [String(ad_group_name).trim(), Number(role_id), id]
    );

    return res.json({ message: "Mapeo AD actualizado" });
  } catch (error) {
    console.error("❌ Error actualizando mapeo AD:", error);
    return res.status(500).json({
      message: "Error actualizando mapeo AD",
      detail: String(error?.message || error),
    });
  }
};

exports.remove = async (req, res) => {
  try {
    const id = Number(req.params.id);

    await db.query(`DELETE FROM ad_group_role_map WHERE id = ?`, [id]);

    return res.json({ message: "Mapeo AD eliminado" });
  } catch (error) {
    console.error("❌ Error eliminando mapeo AD:", error);
    return res.status(500).json({
      message: "Error eliminando mapeo AD",
      detail: String(error?.message || error),
    });
  }
};