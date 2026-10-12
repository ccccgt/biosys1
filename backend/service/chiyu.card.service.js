const axios = require("axios");
const cheerio = require("cheerio");
const iconv = require("iconv-lite");
const db = require("../config/db");

function normalizeCardId(value) {
  const raw = String(value ?? "")
    .trim()
    .replace(/[^\d]/g, "");

  if (!raw) return "";

  const withoutLeadingZeros = raw.replace(/^0+/, "");
  return withoutLeadingZeros || "0";
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function imageFileName(src) {
  const value = String(src || "")
    .trim()
    .toLowerCase();

  return value.split("/").pop()?.split("?")[0] || "";
}

async function getActiveDevices(deviceIds = []) {
  const normalizedIds = Array.isArray(deviceIds)
    ? deviceIds
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0)
    : [];

  let sql = `
    SELECT
      id,
      name,
      ip_address,
      username,
      password,
      active
    FROM devices
    WHERE active = 1
  `;

  const params = [];

  if (normalizedIds.length) {
    sql += ` AND id IN (${normalizedIds.map(() => "?").join(",")})`;
    params.push(...normalizedIds);
  }

  sql += ` ORDER BY id ASC`;

  const [rows] = await db.query(sql, params);
  return rows || [];
}

async function requestSearchPage(device, cardId) {
  const normalizedCardId = normalizeCardId(cardId);

  if (!normalizedCardId) {
    throw new Error("Número de tarjeta inválido");
  }

  const response = await axios.get(
    `http://${device.ip_address}/if.cgi`,
    {
      params: {
        redirect: "database.htm",
        failure: "fail.htm",
        type: "search_emp",
        UserID: normalizedCardId,
        search: "id",
        "Go.x": 1,
        "Go.y": 1,
      },
      auth: {
        username: device.username,
        password: device.password,
      },
      responseType: "arraybuffer",
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "BioSys-CHIYU/1.0",
      },
    }
  );

  /*
   * El dispositivo anuncia ISO-8859-1 por HTTP, pero la página
   * incluye meta charset=big5. Para nombres latinos normalmente
   * ISO-8859-1 evita caracteres de reemplazo.
   */
  const buffer = Buffer.from(response.data);

  let html = iconv.decode(buffer, "latin1");

  if (!html.includes("EMPLOYEE") && !html.includes("Employee")) {
    html = iconv.decode(buffer, "big5");
  }

  return {
    html,
    finalUrl: response.request?.res?.responseUrl || null,
    httpStatus: response.status,
  };
}

function parseSearchResult(html, requestedCardId) {
  const $ = cheerio.load(html, {
    decodeEntities: false,
  });

  const checkbox = $("input[name='SELECT']").first();

  if (!checkbox.length) {
    return {
      exists: false,
      status: "not_found",
      requested_card_id: normalizeCardId(requestedCardId),
      internal_id: null,
      displayed_card_id: null,
      biometric_employee_id: null,
      biometric_name: null,
      authentication: null,
    };
  }

  const row = checkbox.closest("tr");
  const cells = row.children("td");

  const internalId = normalizeCardId(checkbox.attr("value"));
  const displayedCardId = cleanText($(cells[1]).text());
  const employeeId = cleanText($(cells[2]).text());
  const biometricName = cleanText($(cells[3]).text());

  const activeImage = imageFileName(
    $(cells[4]).find("img").first().attr("src")
  );

  let status = "unknown";

  if (activeImage === "v.gif") {
    status = "active";
  } else if (activeImage === "no.gif") {
    status = "inactive";
  }

  /*
   * Columnas según la tabla CHIYU:
   * 5 F&P
   * 6 F
   * 7 P
   * 8 F/P
   * 9 C
   * 10 F&C
   * 11 F/C
   */
  const authColumns = {
    fingerprint_and_password:
      imageFileName($(cells[5]).find("img").attr("src")) === "v.gif",
    fingerprint:
      imageFileName($(cells[6]).find("img").attr("src")) === "v.gif",
    password:
      imageFileName($(cells[7]).find("img").attr("src")) === "v.gif",
    fingerprint_or_password:
      imageFileName($(cells[8]).find("img").attr("src")) === "v.gif",
    card:
      imageFileName($(cells[9]).find("img").attr("src")) === "v.gif",
    fingerprint_and_card:
      imageFileName($(cells[10]).find("img").attr("src")) === "v.gif",
    fingerprint_or_card:
      imageFileName($(cells[11]).find("img").attr("src")) === "v.gif",
  };

  const registrationType = cleanText($(cells[14]).text());

  return {
    exists: true,
    status,
    requested_card_id: normalizeCardId(requestedCardId),
    internal_id: internalId,
    displayed_card_id: displayedCardId,
    biometric_employee_id: employeeId,
    biometric_name: biometricName,
    registration_type: registrationType || null,
    authentication: authColumns,
  };
}

async function searchCardOnDevice(device, cardId) {
  const startedAt = Date.now();

  try {
    const response = await requestSearchPage(device, cardId);
    const parsed = parseSearchResult(response.html, cardId);

    return {
      device_id: device.id,
      device_name: device.name,
      ip_address: device.ip_address,
      connection: "ok",
      http_status: response.httpStatus,
      elapsed_ms: Date.now() - startedAt,
      ...parsed,
    };
  } catch (error) {
    return {
      device_id: device.id,
      device_name: device.name,
      ip_address: device.ip_address,
      connection: "error",
      exists: false,
      status: "connection_error",
      requested_card_id: normalizeCardId(cardId),
      elapsed_ms: Date.now() - startedAt,
      error: String(error?.message || error),
    };
  }
}

async function searchCardOnDevices(cardId, deviceIds = []) {
  const devices = await getActiveDevices(deviceIds);

  if (!devices.length) {
    throw new Error("No hay dispositivos CHIYU activos para consultar");
  }

  return Promise.all(
    devices.map((device) => searchCardOnDevice(device, cardId))
  );
}

async function sendCardAction(device, internalId, action) {
  const normalizedInternalId = normalizeCardId(internalId);

  if (!normalizedInternalId) {
    throw new Error("Identificador interno CHIYU inválido");
  }

  if (!["activate", "deactivate"].includes(action)) {
    throw new Error("Acción CHIYU inválida");
  }

  const coordinatePrefix =
    action === "activate" ? "activate" : "deactivate";

  const response = await axios.get(
    `http://${device.ip_address}/if.cgi`,
    {
      params: {
        redirect: "UserSet.htm",
        failure: "fail.htm",
        type: action,
        SELECT: normalizedInternalId,
        [`${coordinatePrefix}.x`]: 1,
        [`${coordinatePrefix}.y`]: 1,
      },
      auth: {
        username: device.username,
        password: device.password,
      },
      responseType: "arraybuffer",
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "BioSys-CHIYU/1.0",
      },
    }
  );

  return {
    http_status: response.status,
    final_url: response.request?.res?.responseUrl || null,
  };
}

async function changeCardStatusOnDevice(device, cardId, action) {
  const desiredStatus =
    action === "activate" ? "active" : "inactive";

  const before = await searchCardOnDevice(device, cardId);

  if (before.connection !== "ok") {
    return {
      device_id: device.id,
      device_name: device.name,
      ip_address: device.ip_address,
      success: false,
      action,
      before,
      after: null,
      error: "No fue posible conectar con el dispositivo",
    };
  }

  if (!before.exists) {
    return {
      device_id: device.id,
      device_name: device.name,
      ip_address: device.ip_address,
      success: false,
      action,
      before,
      after: null,
      error: "La tarjeta no existe en el dispositivo",
    };
  }

  if (before.status === desiredStatus) {
    return {
      device_id: device.id,
      device_name: device.name,
      ip_address: device.ip_address,
      success: true,
      action,
      changed: false,
      message: `La tarjeta ya se encontraba ${desiredStatus}`,
      before,
      after: before,
    };
  }

  const actionResponse = await sendCardAction(
    device,
    before.internal_id,
    action
  );

  /*
   * Damos un pequeño margen al CHIYU para completar el cambio
   * antes de consultar nuevamente.
   */
  await new Promise((resolve) => setTimeout(resolve, 800));

  const after = await searchCardOnDevice(device, cardId);

  const success =
    after.connection === "ok" &&
    after.exists === true &&
    after.status === desiredStatus;

  return {
    device_id: device.id,
    device_name: device.name,
    ip_address: device.ip_address,
    success,
    action,
    changed: success,
    action_http_status: actionResponse.http_status,
    before,
    after,
    error: success
      ? null
      : `CHIYU no confirmó el estado ${desiredStatus}`,
  };
}

async function changeCardStatusOnDevices(
  cardId,
  action,
  deviceIds = []
) {
  if (!["activate", "deactivate"].includes(action)) {
    throw new Error("La acción debe ser activate o deactivate");
  }

  const devices = await getActiveDevices(deviceIds);

  if (!devices.length) {
    throw new Error("No hay dispositivos CHIYU seleccionados");
  }

  /*
   * Ejecutamos de forma secuencial para no enviar múltiples
   * solicitudes simultáneas a equipos CHIYU antiguos.
   */
  const results = [];

  for (const device of devices) {
    try {
      const result = await changeCardStatusOnDevice(
        device,
        cardId,
        action
      );

      results.push(result);
    } catch (error) {
      results.push({
        device_id: device.id,
        device_name: device.name,
        ip_address: device.ip_address,
        success: false,
        action,
        error: String(error?.message || error),
      });
    }
  }

  return results;
}

module.exports = {
  normalizeCardId,
  getActiveDevices,
  parseSearchResult,
  searchCardOnDevice,
  searchCardOnDevices,
  sendCardAction,
  changeCardStatusOnDevice,
  changeCardStatusOnDevices,
};
