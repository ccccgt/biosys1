const db = require("../config/db");
const {
  normalizeCardId,
  searchCardOnDevices,
  changeCardStatusOnDevices,
  deleteCardOnDevices,
} = require("../service/chiyu.card.service");

exports.searchEmployees = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();

    const requestedLimit = Number.parseInt(
      req.query.limit,
      10
    );

    const limit = Number.isInteger(requestedLimit)
      ? Math.max(1, Math.min(50, requestedLimit))
      : 20;

    if (q.length < 2) {
      return res.status(400).json({
        message: "Escribe al menos 2 caracteres para buscar",
      });
    }

    const isNumeric = /^\d+$/.test(q);

    let rows;

    if (isNumeric) {
      /*
       * Búsqueda segura para identificadores numéricos.
       *
       * No se utiliza LIKE para impedir que, por ejemplo,
       * la tarjeta 2015028 coincida con el NIP 20150282.
       *
       * Prioridad:
       * 1. Número de tarjeta
       * 2. ID biométrico
       * 3. NIP/código de empleado
       */
      [rows] = await db.query(
        `
        SELECT
          id,
          employee_code,
          biometric_user_id,
          card_id,
          full_name,
          department,
          position,
          status,
          source_name,
          last_seen_at
        FROM employees
        WHERE
          card_id = ?
          OR biometric_user_id = ?
          OR employee_code = ?
        ORDER BY
          CASE
            WHEN card_id = ? THEN 0
            WHEN biometric_user_id = ? THEN 1
            WHEN employee_code = ? THEN 2
            ELSE 3
          END,
          full_name ASC
        LIMIT ${limit}
        `,
        [
          q,
          q,
          q,
          q,
          q,
          q,
        ]
      );
    } else {
      /*
       * Las búsquedas parciales solo se permiten para
       * campos descriptivos de texto.
       */
      const like = `%${q}%`;

      [rows] = await db.query(
        `
        SELECT
          id,
          employee_code,
          biometric_user_id,
          card_id,
          full_name,
          department,
          position,
          status,
          source_name,
          last_seen_at
        FROM employees
        WHERE
          full_name LIKE ?
          OR department LIKE ?
          OR position LIKE ?
        ORDER BY
          CASE
            WHEN full_name = ? THEN 0
            WHEN full_name LIKE ? THEN 1
            ELSE 2
          END,
          full_name ASC
        LIMIT ${limit}
        `,
        [
          like,
          like,
          like,
          q,
          `${q}%`,
        ]
      );
    }

    return res.json({
      ok: true,
      query: q,
      search_type: isNumeric ? "exact_identifier" : "text",
      items: rows || [],
    });
  } catch (error) {
    console.error("❌ searchEmployees:", error);

    return res.status(500).json({
      message: "Error buscando empleados",
      detail: String(error?.message || error),
    });
  }
};


exports.deleteCard = async (req, res) => {
  try {
    const cardId = normalizeCardId(req.body?.card_id);

    if (!cardId) {
      return res.status(400).json({
        ok: false,
        message: "card_id es requerido.",
      });
    }

    const devices = await deleteCardOnDevices(cardId);
    const successful = devices.filter(
      (device) => device.success
    ).length;

    return res.json({
      ok: successful === devices.length,
      partial_success:
        successful > 0 && successful < devices.length,
      card_id: cardId,
      successful_devices: successful,
      total_devices: devices.length,
      devices,
    });
  } catch (error) {
    console.error("Error eliminando usuario CHIYU:", error);

    return res.status(500).json({
      ok: false,
      message: "Error eliminando el usuario en los dispositivos CHIYU.",
      detail: String(error?.message || error),
    });
  }
};

exports.changeCardStatus = async (req, res) => {
  try {
    const cardId = normalizeCardId(req.body?.card_id);
    const action = String(req.body?.action || "")
      .trim()
      .toLowerCase();

    const deviceIds = Array.isArray(req.body?.device_ids)
      ? req.body.device_ids
          .map(Number)
          .filter((id) => Number.isInteger(id) && id > 0)
      : [];

    if (!cardId) {
      return res.status(400).json({
        message: "card_id es requerido",
      });
    }

    if (!["activate", "deactivate"].includes(action)) {
      return res.status(400).json({
        message: "action debe ser activate o deactivate",
      });
    }

    if (!deviceIds.length) {
      return res.status(400).json({
        message: "Selecciona al menos un dispositivo",
      });
    }

    const devices = await changeCardStatusOnDevices(
      cardId,
      action,
      deviceIds
    );

    const successful = devices.filter(
      (device) => device.success
    ).length;

    return res.json({
      ok: successful === devices.length,
      partial_success:
        successful > 0 && successful < devices.length,
      card_id: cardId,
      action,
      requested_devices: deviceIds,
      successful_devices: successful,
      total_devices: devices.length,
      devices,
    });
  } catch (error) {
    console.error("❌ changeCardStatus:", error);

    return res.status(500).json({
      message: "Error modificando tarjeta en CHIYU",
      detail: String(error?.message || error),
    });
  }
};

exports.checkCardStatus = async (req, res) => {
  try {
    const cardId = normalizeCardId(req.body?.card_id);

    const deviceIds = Array.isArray(req.body?.device_ids)
      ? req.body.device_ids
          .map(Number)
          .filter((id) => Number.isInteger(id) && id > 0)
      : [];

    if (!cardId) {
      return res.status(400).json({
        message: "card_id es requerido",
      });
    }

    const devices = await searchCardOnDevices(
      cardId,
      deviceIds
    );

    return res.json({
      ok: true,
      card_id: cardId,
      devices,
    });
  } catch (error) {
    console.error("❌ checkCardStatus:", error);

    return res.status(500).json({
      message: "Error consultando tarjeta en CHIYU",
      detail: String(error?.message || error),
    });
  }
};
