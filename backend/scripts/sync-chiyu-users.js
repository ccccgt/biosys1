require("dotenv").config();

const axios = require("axios");
const iconv = require("iconv-lite");
const db = require("../config/db");

const USERLIST_PATH = "/userlist.txt";
const TIMEOUT_MS = 20000;

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeId(value) {
  const text = cleanText(value);

  if (!text || text === "----") {
    return null;
  }

  return /^\d+$/.test(text) ? text : null;
}

function normalizeEmployeeCode(value) {
  const text = cleanText(value);

  if (!text || text === "----") {
    return null;
  }

  return text;
}

function normalizeName(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseUserList(buffer) {
  let content = iconv.decode(buffer, "utf8");

  // Algunos dispositivos pueden entregar el archivo en Latin-1.
  if (content.includes("\uFFFD")) {
    content = iconv.decode(buffer, "latin1");
  }

  content = content.replace(/^\uFEFF/, "");

  const users = [];
  const invalidRows = [];

  for (let index = 0; index < content.split(/\r?\n/).length; index++) {
    const line = content.split(/\r?\n/)[index].trim();

    if (!line) {
      continue;
    }

    const fields = line.split(",").map(cleanText);

    if (fields.length < 5) {
      invalidRows.push({
        line: index + 1,
        reason: "Menos de cinco campos",
        content: line,
      });
      continue;
    }

    const biometricUserId = normalizeId(fields[0]);

    if (!biometricUserId) {
      // Ignorar encabezados, líneas informativas y registros sin ID válido.
      if (/^\d/.test(fields[0])) {
        invalidRows.push({
          line: index + 1,
          reason: "ID biométrico inválido",
          content: line,
        });
      }
      continue;
    }

    const employeeCode = normalizeEmployeeCode(fields[1]);
    const firstName = cleanText(fields[2]);
    const lastName = cleanText(fields[3]);
    const fullName = cleanText(`${firstName} ${lastName}`);

    const problems = [];

    if (!firstName || !lastName) {
      problems.push("Nombre o apellido vacío");
    }

    if (firstName === "----" || lastName === "----") {
      problems.push("Nombre o apellido contiene ----");
    }

    if (
      fields[1] &&
      fields[1] !== "----" &&
      !/^\d+$/.test(fields[1])
    ) {
      problems.push("Código de empleado no numérico");
    }

    users.push({
      biometric_user_id: biometricUserId,
      employee_code: employeeCode,
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      device_field5: fields[4],
      line: index + 1,
      raw_line: line,
      problems,
    });
  }

  return { users, invalidRows };
}

async function downloadUserList(device) {
  const url = `http://${device.ip_address}${USERLIST_PATH}`;

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: TIMEOUT_MS,
    maxRedirects: 3,
    validateStatus: (status) => status >= 200 && status < 300,
    auth: device.username
      ? {
          username: device.username,
          password: device.password || "",
        }
      : undefined,
    headers: {
      Accept: "text/plain,*/*",
      "User-Agent": "BioSYS-User-Sync/1.0",
    },
  });

  return parseUserList(Buffer.from(response.data));
}

function groupBy(items, keyFunction) {
  const result = new Map();

  for (const item of items) {
    const key = keyFunction(item);

    if (!key) {
      continue;
    }

    if (!result.has(key)) {
      result.set(key, []);
    }

    result.get(key).push(item);
  }

  return result;
}

async function main() {
  let connection;

  try {
    console.log("");
    console.log("==========================================================");
    console.log(" BioSYS 1.0 - DIAGNOSTICO DE SINCRONIZACION CHIYU");
    console.log(" MODO: SOLO LECTURA; NO SE MODIFICARA LA BASE DE DATOS");
    console.log("==========================================================");
    console.log("");

    const [devices] = await db.query(`
      SELECT id, name, ip_address, username, password, active
      FROM devices
      WHERE active = 1
      ORDER BY id ASC
    `);

    if (!devices.length) {
      throw new Error("No hay dispositivos activos en la tabla devices.");
    }

    const allUsers = [];
    const invalidRows = [];
    const deviceErrors = [];

    for (const device of devices) {
      console.log(
        `[DISPOSITIVO] ${device.name} (${device.ip_address})`
      );

      try {
        const result = await downloadUserList(device);

        console.log(
          `  Registros leídos: ${result.users.length}`
        );
        console.log(
          `  Líneas inválidas: ${result.invalidRows.length}`
        );

        for (const user of result.users) {
          allUsers.push({
            ...user,
            device_id: device.id,
            device_name: device.name,
            source_url: `http://${device.ip_address}${USERLIST_PATH}`,
          });
        }

        for (const row of result.invalidRows) {
          invalidRows.push({
            ...row,
            device_name: device.name,
          });
        }
      } catch (error) {
        const message =
          error.response
            ? `HTTP ${error.response.status}`
            : error.code || error.message;

        deviceErrors.push({
          device: device.name,
          ip: device.ip_address,
          error: message,
        });

        console.error(`  ERROR: ${message}`);
      }

      console.log("");
    }

    if (!allUsers.length) {
      console.log("No se obtuvieron usuarios de los dispositivos.");
      console.log(
        "Revise conectividad, autenticación y la ruta /userlist.txt."
      );
      process.exitCode = 1;
      return;
    }

    const [employees] = await db.query(`
      SELECT
        id,
        employee_code,
        biometric_user_id,
        full_name,
        department,
        position,
        status,
        source_name,
        source_url
      FROM employees
    `);

    const employeesByBiometricId = groupBy(
      employees,
      (employee) => normalizeId(employee.biometric_user_id)
    );

    const employeesByCode = groupBy(
      employees,
      (employee) => normalizeEmployeeCode(employee.employee_code)
    );

    const usersByBiometricId = groupBy(
      allUsers,
      (user) => user.biometric_user_id
    );

    const candidates = [];
    const alreadyPresent = [];
    const conflicts = [];
    const duplicateDeviceRecords = [];
    const invalidUsers = [];

    for (const [biometricId, records] of usersByBiometricId.entries()) {
      const uniqueDevices = [
        ...new Set(records.map((record) => record.device_name)),
      ];

      const preferredRecord =
        records.find((record) =>
          /fiscalia/i.test(record.device_name)
        ) || records[0];

      if (records.length > 1) {
        duplicateDeviceRecords.push({
          biometric_user_id: biometricId,
          employee_code: preferredRecord.employee_code,
          full_name: preferredRecord.full_name,
          devices: uniqueDevices.join(", "),
        });
      }

      const problems = [
        ...new Set(records.flatMap((record) => record.problems)),
      ];

      const existingById =
        employeesByBiometricId.get(biometricId) || [];

      const codeMatches = preferredRecord.employee_code
        ? employeesByCode.get(preferredRecord.employee_code) || []
        : [];

      if (existingById.length > 1) {
        conflicts.push({
          biometric_user_id: biometricId,
          reason: "Más de un empleado existente con el mismo ID biométrico",
          full_name: preferredRecord.full_name,
          employee_code: preferredRecord.employee_code,
        });
        continue;
      }

      if (existingById.length === 1) {
        const existing = existingById[0];

        if (
          preferredRecord.employee_code &&
          existing.employee_code &&
          preferredRecord.employee_code !== existing.employee_code
        ) {
          conflicts.push({
            biometric_user_id: biometricId,
            reason: "El ID biométrico existe, pero el código no coincide",
            device_name: preferredRecord.full_name,
            existing_name: existing.full_name,
            device_employee_code: preferredRecord.employee_code,
            existing_employee_code: existing.employee_code,
            existing_status: existing.status,
          });
        } else {
          alreadyPresent.push({
            biometric_user_id: biometricId,
            full_name: preferredRecord.full_name,
            employee_code: preferredRecord.employee_code,
            existing_name: existing.full_name,
            existing_status: existing.status,
          });
        }

        continue;
      }

      if (codeMatches.length > 0) {
        conflicts.push({
          biometric_user_id: biometricId,
          reason: "El código de empleado ya pertenece a otro registro",
          full_name: preferredRecord.full_name,
          employee_code: preferredRecord.employee_code,
          existing_biometric_user_ids: codeMatches
            .map((employee) => employee.biometric_user_id)
            .join(", "),
          existing_names: codeMatches
            .map((employee) => employee.full_name)
            .join(" | "),
        });
        continue;
      }

      if (problems.length > 0) {
        invalidUsers.push({
          biometric_user_id: biometricId,
          employee_code: preferredRecord.employee_code,
          full_name: preferredRecord.full_name,
          devices: uniqueDevices.join(", "),
          problems: problems.join("; "),
        });
        continue;
      }

      const normalizedDeviceName = /sala/i.test(preferredRecord.device_name)
        ? "Chiyu Salas"
        : "Chiyu Fiscalia";

      candidates.push({
        biometric_user_id: biometricId,
        employee_code: preferredRecord.employee_code,
        full_name: preferredRecord.full_name,
        source_name: normalizedDeviceName,
        source_url: preferredRecord.source_url,
        devices: uniqueDevices.join(", "),
        device_field5: preferredRecord.device_field5,
      });
    }

    console.log("");
    console.log("==========================================================");
    console.log(" RESULTADO DE LA COMPARACION");
    console.log("==========================================================");
    console.log(`Registros leídos de dispositivos: ${allUsers.length}`);
    console.log(`Empleados actuales en la base:   ${employees.length}`);
    console.log(`Usuarios ya existentes:          ${alreadyPresent.length}`);
    console.log(`Posibles usuarios nuevos:        ${candidates.length}`);
    console.log(`Conflictos que requieren revisión: ${conflicts.length}`);
    console.log(`Usuarios con datos dudosos:      ${invalidUsers.length}`);
    console.log(`IDs repetidos entre dispositivos: ${duplicateDeviceRecords.length}`);
    console.log(`Líneas inválidas:                 ${invalidRows.length}`);
    console.log(`Dispositivos con error:           ${deviceErrors.length}`);
    console.log("");

    if (candidates.length) {
      console.log("========== POSIBLES USUARIOS NUEVOS ==========");
      console.table(candidates);
    }

    if (conflicts.length) {
      console.log("");
      console.log("========== CONFLICTOS ==========");
      console.table(conflicts);
    }

    if (invalidUsers.length) {
      console.log("");
      console.log("========== USUARIOS CON DATOS DUDOSOS ==========");
      console.table(invalidUsers);
    }

    if (duplicateDeviceRecords.length) {
      console.log("");
      console.log("========== USUARIOS PRESENTES EN VARIOS DISPOSITIVOS ==========");
      console.table(duplicateDeviceRecords);
    }

    if (deviceErrors.length) {
      console.log("");
      console.log("========== ERRORES DE DISPOSITIVOS ==========");
      console.table(deviceErrors);
    }

    if (invalidRows.length) {
      console.log("");
      console.log("========== PRIMERAS 20 LINEAS INVALIDAS ==========");
      console.table(invalidRows.slice(0, 20));
    }

    console.log("");
    console.log("DIAGNOSTICO FINALIZADO.");
    console.log("No se insertaron ni actualizaron empleados.");
    console.log("No se modificaron estados, departamentos ni asistencias.");
    console.log("");

    if (deviceErrors.length) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("");
    console.error("ERROR EN EL DIAGNOSTICO:", error.message);
    process.exitCode = 1;
  } finally {
    if (connection) {
      connection.release();
    }

    await db.end();
  }
}

main();
