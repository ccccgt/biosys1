const axios = require("axios");
const xlsx = require("xlsx");
const fs = require("fs/promises");
const path = require("path");
const db = require("../config/db");

const {
  ensurePeriodTable,
  ensureLiveTable,
} = require("../service/table.services");

const {
  getPeriodTableNameFromDate,
  sanitizePeriodTableName,
} = require("../utils/periodTables");

const CHIYU_STORAGE_ROOT =
  process.env.CHIYU_STORAGE_ROOT ||
  path.join(__dirname, "..", "storage", "chiyu");

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const TRANSIENT_DB_ERRORS = new Set([
  "PROTOCOL_CONNECTION_LOST",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "ECONNREFUSED",
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryWithRetry(sql, params = [], options = {}) {
  const maxAttempts = Number(options.maxAttempts || 3);
  const baseDelayMs = Number(options.baseDelayMs || 500);

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await db.query(sql, params);
    } catch (error) {
      lastError = error;

      const isTransient =
        TRANSIENT_DB_ERRORS.has(error?.code) ||
        String(error?.message || "")
          .toLowerCase()
          .includes("connection lost");

      if (!isTransient || attempt === maxAttempts) {
        throw error;
      }

      const delay = baseDelayMs * attempt;

      console.warn(
        `[mysql] Conexión perdida. Reintento ${attempt}/${maxAttempts} en ${delay} ms`,
        {
          code: error?.code,
          message: error?.message,
        }
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

/* ===================================================== */
/* Normalizadores */
/* ===================================================== */

function excelSerialToDate(serial) {
  const parsed = xlsx.SSF.parse_date_code(serial);

  if (!parsed || !parsed.y || !parsed.m || !parsed.d) {
    return null;
  }

  return [
    String(parsed.y).padStart(4, "0"),
    String(parsed.m).padStart(2, "0"),
    String(parsed.d).padStart(2, "0"),
  ].join("-");
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialToDate(value);
  }

  let text = String(value).trim();

  if (text.includes(" ")) {
    text = text.split(" ")[0].trim();
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  /*
   * CHIYU/XLS normalmente entrega MM/DD/YYYY.
   */
  const fourDigitYear = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if (fourDigitYear) {
    const month = String(fourDigitYear[1]).padStart(2, "0");
    const day = String(fourDigitYear[2]).padStart(2, "0");
    const year = fourDigitYear[3];

    return `${year}-${month}-${day}`;
  }

  const twoDigitYear = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/
  );

  if (twoDigitYear) {
    const month = String(twoDigitYear[1]).padStart(2, "0");
    const day = String(twoDigitYear[2]).padStart(2, "0");
    const shortYear = Number(twoDigitYear[3]);
    const year =
      shortYear <= 69
        ? 2000 + shortYear
        : 1900 + shortYear;

    return `${year}-${month}-${day}`;
  }

  return null;
}

/*
 * CHIYU está entregando en el XLS la fecha del registro
 * un día atrás respecto a la fecha real mostrada por el
 * dispositivo.
 *
 * Se corrige solamente la fecha del registro después de
 * normalizarla. La fecha enviada en la consulta al CHIYU
 * NO se modifica.
 */
function addOneDay(dateString) {
  if (!dateString) {
    return null;
  }

  const match = String(dateString).match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(
    date.getUTCDate() + 1
  );

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function normalizeTime(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hour = String(value.getHours()).padStart(2, "0");
    const minute = String(value.getMinutes()).padStart(2, "0");
    const second = String(value.getSeconds()).padStart(2, "0");

    return `${hour}:${minute}:${second}`;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value < 1
  ) {
    const totalSeconds = Math.round(
      value * 24 * 60 * 60
    );

    const hour = String(
      Math.floor(totalSeconds / 3600)
    ).padStart(2, "0");

    const minute = String(
      Math.floor((totalSeconds % 3600) / 60)
    ).padStart(2, "0");

    const second = String(
      totalSeconds % 60
    ).padStart(2, "0");

    return `${hour}:${minute}:${second}`;
  }

  const text = String(value).trim();

  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d:\d{2}:\d{2}$/.test(text)) {
    return `0${text}`;
  }

  return null;
}

function getCacheExpiresAt(dateString) {
  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    const fallback = new Date();

    fallback.setDate(
      fallback.getDate() + 45
    );

    return fallback;
  }

  const expiresAt = new Date(date);

  expiresAt.setDate(
    expiresAt.getDate() + 45
  );

  expiresAt.setHours(23, 59, 59, 0);

  return expiresAt;
}

/* ===================================================== */
/* Helpers de almacenamiento XLS */
/* ===================================================== */

function sanitizeFilePart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getDeviceFileBase(device) {
  const source = String(
    device.name ||
      device.device_name ||
      device.terminal_name ||
      device.ip_address ||
      `device_${device.id}`
  ).toLowerCase();

  if (source.includes("fiscal")) {
    return "fiscalia";
  }

  if (source.includes("sala")) {
    return "salas";
  }

  return sanitizeFilePart(source) || `device_${device.id}`;
}

function getMonthDirectory(dateObj) {
  const year = dateObj.getFullYear();
  const monthNumber = dateObj.getMonth() + 1;

  const monthFolder = `${String(monthNumber).padStart(
    2,
    "0"
  )}-${MONTH_NAMES[monthNumber - 1]}`;

  return path.join(
    CHIYU_STORAGE_ROOT,
    String(year),
    monthFolder
  );
}

async function writeFileAtomically(destination, buffer) {
  await fs.mkdir(
    path.dirname(destination),
    { recursive: true }
  );

  const temporaryFile =
    `${destination}.tmp-${process.pid}-${Date.now()}`;

  await fs.writeFile(
    temporaryFile,
    buffer
  );

  await fs.rename(
    temporaryFile,
    destination
  );
}

async function saveDeviceXls(
  device,
  buffer,
  startDate,
  endDate,
  archiveType
) {
  const monthDirectory =
    getMonthDirectory(startDate);

  const deviceBase =
    getDeviceFileBase(device);

  const endDateText =
    endDate.toISOString().slice(0, 10);

  let destination;

  if (archiveType === "final") {
    destination = path.join(
      monthDirectory,
      `${deviceBase}.xls`
    );
  } else {
    const snapshotsDirectory = path.join(
      monthDirectory,
      "snapshots"
    );

    destination = path.join(
      snapshotsDirectory,
      `${deviceBase}_${endDateText}.xls`
    );
  }

  await writeFileAtomically(
    destination,
    buffer
  );

  /*
   * Además se conserva una copia llamada *_actual.xls,
   * actualizada con la descarga más reciente.
   */
  const currentFile = path.join(
    monthDirectory,
    `${deviceBase}_actual.xls`
  );

  await writeFileAtomically(
    currentFile,
    buffer
  );

  return {
    archive_type: archiveType,
    destination,
    current_file: currentFile,
  };
}

/* ===================================================== */
/* Descarga CHIYU */
/* ===================================================== */

async function fetchDeviceXls(
  device,
  startDate,
  endDate
) {
  const url =
    `http://${device.ip_address}/if.cgi`;

  const params = {
    redirect: "setting.htm",
    failure: "fail.htm",
    type: "xls_data",
    UID: "",
    TID: "",
    dep: 0,
    Fkey: 255,
    num: 0,

    start_month:
      startDate.getMonth() + 1,

    start_date:
      startDate.getDate(),

    start_year:
      startDate
        .getFullYear()
        .toString()
        .slice(-2),

    end_month:
      endDate.getMonth() + 1,

    end_date:
      endDate.getDate(),

    end_year:
      endDate
        .getFullYear()
        .toString()
        .slice(-2),

    sel_all: 1,
    head: 1,
    event: 1,
  };

  const response = await axios.get(
    url,
    {
      params,
      auth: {
        username: device.username,
        password: device.password,
      },
      responseType: "arraybuffer",
      timeout: 90000,
    }
  );

  return response.data;
}

/* ===================================================== */
/* Inserciones */
/* ===================================================== */

async function insertIntoAttendanceCache(payload) {
  const expiresAt =
    getCacheExpiresAt(payload.date);

  const [result] = await queryWithRetry(
    `INSERT IGNORE INTO attendance_cache
      (
        device_id,
        card_id,
        employee_id,
        name,
        date,
        time,
        terminal,
        in_out,
        door_number,
        expires_at
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.device_id,
      payload.card_id,
      payload.employee_id,
      payload.name,
      payload.date,
      payload.time,
      payload.terminal,
      payload.in_out,
      payload.door_number,
      expiresAt,
    ]
  );

  return Number(
    result?.affectedRows || 0
  );
}

async function insertIntoRegistrosLive(payload) {
  const [result] = await queryWithRetry(
    `INSERT IGNORE INTO registros_live
      (
        device_id,
        card_id,
        employee_id,
        name,
        date,
        time,
        terminal,
        in_out,
        door_number,
        date_tmp
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.device_id,
      payload.card_id,
      payload.employee_id,
      payload.name,
      payload.date,
      payload.time,
      payload.terminal,
      payload.in_out,
      payload.door_number,
      payload.date,
    ]
  );

  return Number(
    result?.affectedRows || 0
  );
}

async function insertIntoPeriodTable(payload) {
  const eventDate = new Date(
    `${payload.date}T00:00:00`
  );

  const periodTable =
    sanitizePeriodTableName(
      getPeriodTableNameFromDate(
        eventDate
      )
    );

  await ensurePeriodTable(
    periodTable
  );

  const [result] = await queryWithRetry(
    `INSERT IGNORE INTO \`${periodTable}\`
      (
        device_id,
        card_id,
        employee_id,
        name,
        date,
        time,
        terminal,
        in_out,
        door_number
      )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.device_id,
      payload.card_id,
      payload.employee_id,
      payload.name,
      payload.date,
      payload.time,
      payload.terminal,
      payload.in_out,
      payload.door_number,
    ]
  );

  return Number(
    result?.affectedRows || 0
  );
}

/* ===================================================== */
/* Procesamiento por biométrico */
/* ===================================================== */

async function processDevice(
  device,
  startDate,
  endDate,
  mode = "PERIOD",
  options = {}
) {
  const stats = {
    device_id: device.id,
    device_name: device.name || null,
    ip_address: device.ip_address,
    rows_read: 0,
    valid_rows: 0,
    inserted_cache: 0,
    inserted_live: 0,
    inserted_period: 0,
    skipped: 0,
    xls: null,
  };

  /*
   * IMPORTANTE:
   *
   * El XLS se valida ANTES de guardarse.
   *
   * Anteriormente el flujo era:
   *
   *   descargar -> guardar -> leer XLS
   *
   * Eso permitía que una respuesta de solamente 79 bytes
   * (cabecera sin registros) sobrescribiera snapshots y
   * *_actual.xls válidos.
   *
   * Ahora:
   *
   *   descargar -> validar -> guardar -> procesar
   */

  const maxAttempts =
    Number(options.maxAttempts || 3);

  const retryDelayMs =
    Number(options.retryDelayMs || 3000);

  let buffer = null;
  let workbook = null;
  let sheet = null;
  let rows = null;
  let lastValidationError = null;

  for (
    let attempt = 1;
    attempt <= maxAttempts;
    attempt += 1
  ) {
    try {
      buffer = await fetchDeviceXls(
        device,
        startDate,
        endDate,
        {
          maxAttempts: 1,
          retryDelayMs,
        }
      );

      workbook = xlsx.read(
        buffer,
        {
          type: "buffer",
          cellDates: true,
        }
      );

      if (
        !workbook.SheetNames ||
        workbook.SheetNames.length === 0
      ) {
        throw new Error(
          "El XLS no contiene ninguna hoja"
        );
      }

      sheet =
        workbook.Sheets[
          workbook.SheetNames[0]
        ];

      rows =
        xlsx.utils.sheet_to_json(
          sheet,
          {
            defval: "",
            raw: false,
          }
        );

      const requiredColumns = [
        "No.",
        "Card ID",
        "Employee ID",
        "Name",
        "Date",
        "Time",
        "Terminal",
        "In/Out",
        "Door",
      ];

      const actualColumns =
        Object.keys(
          rows[0] || sheet
            ? (
                rows[0] ||
                xlsx.utils.sheet_to_json(
                  sheet,
                  {
                    header: 1,
                    defval: "",
                    raw: false,
                    range: 0,
                  }
                )[0] ||
                []
              )
            : []
        );

      /*
       * Un XLS de solamente 79 bytes tiene cabecera pero
       * cero filas. Se considera inválido para una extracción.
       */
      if (!rows || rows.length === 0) {
        throw new Error(
          "CHIYU devolvió un XLS sin registros"
        );
      }

      /*
       * Validación de estructura.
       *
       * No exigimos que todas las columnas estén presentes
       * en cada fila; solamente comprobamos que el XLS
       * contenga las columnas esperadas.
       */
      const headerRows =
        xlsx.utils.sheet_to_json(
          sheet,
          {
            header: 1,
            defval: "",
            raw: false,
            range: 0,
          }
        );

      const headers = Array.isArray(headerRows?.[0])
        ? headerRows[0].map((value) =>
            String(value || "").trim()
          )
        : [];

      const missingColumns =
        requiredColumns.filter(
          (column) =>
            !headers.includes(column)
        );

      if (missingColumns.length > 0) {
        throw new Error(
          `Estructura XLS inválida. Faltan columnas: ${missingColumns.join(", ")}`
        );
      }

      /*
       * Comprobamos que existan filas con fecha/hora válidas.
       * Esto evita aceptar un archivo que tenga filas pero no
       * contenga registros utilizables.
       */
      let validDateTimeRows = 0;

      for (const row of rows) {
        const dateNormalized =
          normalizeDate(row["Date"]);

        const timeNormalized =
          normalizeTime(row["Time"]);

        if (
          dateNormalized &&
          timeNormalized
        ) {
          validDateTimeRows += 1;
        }
      }

      if (validDateTimeRows === 0) {
        throw new Error(
          "CHIYU devolvió filas, pero ninguna contiene fecha/hora válida"
        );
      }

      console.log(
        `[chiyu-xls] ${
          device.name || device.ip_address
        }: extracción válida en intento ${attempt}/${maxAttempts} ` +
        `(${buffer.length} bytes, ${rows.length} filas, ` +
        `${validDateTimeRows} con fecha/hora válida)`
      );

      /*
       * SOLO AHORA se permite guardar el XLS.
       */
      if (
        mode === "PERIOD" &&
        options.saveXls === true
      ) {
        stats.xls = await saveDeviceXls(
          device,
          buffer,
          startDate,
          endDate,
          options.archiveType === "final"
            ? "final"
            : "snapshot"
        );

        console.log(
          `[chiyu-xls] ${
            device.name || device.ip_address
          }: ${stats.xls.destination}`
        );
      }

      stats.rows_read =
        rows.length;

      break;
    } catch (error) {
      lastValidationError = error;

      console.warn(
        `[chiyu-xls] ${
          device.name || device.ip_address
        }: extracción inválida en intento ${attempt}/${maxAttempts}: ` +
        `${error?.message || error}`
      );

      buffer = null;
      workbook = null;
      sheet = null;
      rows = null;

      if (attempt < maxAttempts) {
        await sleep(
          retryDelayMs * attempt
        );
      }
    }
  }

  if (!rows || !workbook || !sheet) {
    throw new Error(
      `No se obtuvo un XLS válido de ${
        device.name || device.ip_address
      } después de ${maxAttempts} intentos: ${
        lastValidationError?.message ||
        "error desconocido"
      }`
    );
  }

  /*
   * IMPORTANTE:
   *
   * registros_live se utiliza únicamente en modo CACHE.
   * La tabla se asegura UNA SOLA VEZ antes de comenzar
   * a insertar las filas.
   *
   * Antes se ejecutaba ensureLiveTable() dentro de
   * insertIntoRegistrosLive(), es decir, una vez por
   * cada registro del XLS.
   */
  if (mode === "CACHE") {
    await ensureLiveTable();
  }

  for (const row of rows) {
    const cardId = String(
      row["Card ID"] || ""
    ).trim();

    const employeeId = String(
      row["Employee ID"] || ""
    ).trim();

    let name = String(
      row["Name"] || ""
    ).trim();

    if (employeeId === "20170387") {
      name =
        "Luis Alfredo Sarceno Mendez";
    }

    /*
     * CHIYU/XLS entrega la fecha un día atrás.
     * Primero se normaliza y después se corrige.
     */
    const rawDateNormalized =
      normalizeDate(row["Date"]);

    const dateNormalized =
      addOneDay(rawDateNormalized);

    const timeNormalized =
      normalizeTime(row["Time"]);

    const terminal = String(
      row["Terminal"] || ""
    ).trim();

    const inOut =
      row["In/Out"] === ""
        ? null
        : Number(row["In/Out"]);

    const doorNumber =
      row["Door"] === ""
        ? null
        : Number(row["Door"]);

    if (
      !dateNormalized ||
      !timeNormalized
    ) {
      stats.skipped += 1;
      continue;
    }

    if (!employeeId && !cardId) {
      stats.skipped += 1;
      continue;
    }

    stats.valid_rows += 1;

    const payload = {
      device_id: device.id,
      card_id: cardId || null,
      employee_id:
        employeeId || null,
      name: name || null,
      date: dateNormalized,
      time: timeNormalized,
      terminal:
        terminal || null,
      in_out:
        Number.isFinite(inOut)
          ? inOut
          : null,
      door_number:
        Number.isFinite(doorNumber)
          ? doorNumber
          : null,
    };

    if (mode === "CACHE") {
      stats.inserted_cache +=
        await insertIntoAttendanceCache(
          payload
        );

      stats.inserted_live +=
        await insertIntoRegistrosLive(
          payload
        );
    } else {
      stats.inserted_period +=
        await insertIntoPeriodTable(
          payload
        );
    }
  }

  return stats;
}

/* ===================================================== */
/* Extracción general */
/* ===================================================== */

async function extractManual(
  start,
  end,
  mode = "PERIOD",
  options = {}
) {
  const startDate = new Date(
    `${start}T00:00:00`
  );

  const endDate = new Date(
    `${end}T00:00:00`
  );

  if (
    Number.isNaN(
      startDate.getTime()
    ) ||
    Number.isNaN(
      endDate.getTime()
    )
  ) {
    throw new Error(
      "Fechas inválidas en extractManual"
    );
  }

  if (endDate < startDate) {
    throw new Error(
      "La fecha final no puede ser menor que la inicial"
    );
  }

  const [devices] =
    await queryWithRetry(
      "SELECT * FROM devices WHERE active = 1"
    );

  const result = {
    mode,
    start,
    end,
    save_xls:
      options.saveXls === true,
    archive_type:
      options.archiveType || null,
    devices_found:
      devices.length,
    total_rows_read: 0,
    total_valid_rows: 0,
    total_inserted_cache: 0,
    total_inserted_live: 0,
    total_inserted_period: 0,
    total_skipped: 0,
    devices: [],
  };

  for (const device of devices) {
    try {
      console.log(
        `[chiyu] Extrayendo ${
          device.name ||
          device.ip_address
        }: ${start} → ${end}`
      );

      const stats =
        await processDevice(
          device,
          startDate,
          endDate,
          mode,
          options
        );

      result.devices.push(
        stats
      );

      result.total_rows_read +=
        stats.rows_read;

      result.total_valid_rows +=
        stats.valid_rows;

      result.total_inserted_cache +=
        stats.inserted_cache;

      result.total_inserted_live +=
        stats.inserted_live;

      result.total_inserted_period +=
        stats.inserted_period;

      result.total_skipped +=
        stats.skipped;
    } catch (error) {
      console.error(
        `[chiyu] Error en ${
          device.name ||
          device.ip_address
        }:`,
        error
      );

      result.devices.push({
        device_id: device.id,
        device_name:
          device.name || null,
        ip_address:
          device.ip_address,
        error: String(
          error?.message ||
          error
        ),
      });
    }
  }

  return result;
}

module.exports = {
  extractManual,
};
