'use strict';

require('dotenv').config();

const axios = require('axios');
const iconv = require('iconv-lite');
const db = require('../config/db');

const APPLY = process.argv.includes('--apply');
const TIMEOUT_MS = 15000;

function normalizeCode(value) {
  const v = String(value || '').trim();
  if (!v || v === '----' || v === '-') return null;
  return v;
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidName(value) {
  const name = normalizeName(value);
  if (!name || name.length > 150) return false;
  const meaningfulParts = name.split(/\s+/)
    .filter(part => part !== '----' && part !== '-');
  return meaningfulParts.length > 0;
}

function parseUserList(buffer) {
  let content = iconv.decode(buffer, 'utf8');

  // Si el archivo no es UTF-8 válido, intenta Windows-1252.
  if (content.includes('\uFFFD')) {
    content = iconv.decode(buffer, 'win1252');
  }

  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/);

  const users = [];
  const invalid = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = line.split(',').map(v => v.trim());

    if (fields.length < 5) {
      invalid.push({ line: i + 1, reason: 'Menos de cinco campos', raw: line });
      continue;
    }

    const biometricId = fields[0];
    const employeeCode = normalizeCode(fields[1]);
    const firstName = fields[2];
    const lastName = fields[3];

    if (!/^\d+$/.test(biometricId)) {
      invalid.push({ line: i + 1, reason: 'ID biométrico inválido', raw: line });
      continue;
    }

    const fullName = normalizeName(`${firstName} ${lastName}`);

    if (!isValidName(fullName)) {
      invalid.push({ line: i + 1, reason: 'Nombre vacío, inválido o demasiado largo', raw: line });
      continue;
    }

    users.push({
      biometric_user_id: biometricId,
      employee_code: employeeCode,
      full_name: fullName,
      field5: fields[4]
    });
  }

  return { users, invalid };
}

async function fetchDevice(device) {
  const url = `http://${device.ip_address}/userlist.txt`;

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: TIMEOUT_MS,
    validateStatus: status => status >= 200 && status < 300,
    auth: device.username
      ? { username: device.username, password: device.password || '' }
      : undefined
  });

  const parsed = parseUserList(Buffer.from(response.data));

  return {
    device,
    url,
    ...parsed
  };
}

async function main() {
  let connection;

  try {
    connection = await db.getConnection();

    const [devices] = await connection.query(`
      SELECT id, name, ip_address, username, password
      FROM devices
      WHERE active = 1
      ORDER BY
        CASE WHEN UPPER(name) LIKE '%FISCALIA%' THEN 0 ELSE 1 END,
        id
    `);

    if (!devices.length) {
      throw new Error('No hay dispositivos activos registrados.');
    }

    const deviceResults = [];
    const errors = [];

    for (const device of devices) {
      try {
        const result = await fetchDevice(device);
        deviceResults.push(result);

        console.log(
          `[OK] ${device.name}: ${result.users.length} registros; ` +
          `${result.invalid.length} líneas inválidas`
        );

        if (result.invalid.length) {
          console.log(`  Se excluirán del proceso automático las líneas inválidas.`);
          console.table(result.invalid);
        }
      } catch (error) {
        errors.push({
          device: device.name,
          error: error.message
        });

        console.error(`[ERROR] ${device.name}: ${error.message}`);
      }
    }

    // No importar parcialmente si falla algún dispositivo.
    if (errors.length || deviceResults.length !== devices.length) {
      console.error('\nIMPORTACIÓN CANCELADA: no se pudo leer cada dispositivo activo.');
      process.exitCode = 1;
      return;
    }

    const [employeeRows] = await connection.query(`
      SELECT id, employee_code, biometric_user_id, source_name, full_name, status
      FROM employees
    `);

    const employeesById = new Map();
    const employeesByCode = new Map();

    for (const employee of employeeRows) {
      if (employee.biometric_user_id !== null) {
        const id = String(employee.biometric_user_id).trim();
        if (!employeesById.has(id)) employeesById.set(id, []);
        employeesById.get(id).push(employee);
      }

      if (employee.employee_code !== null) {
        const code = String(employee.employee_code).trim();
        if (!employeesByCode.has(code)) employeesByCode.set(code, []);
        employeesByCode.get(code).push(employee);
      }
    }

    // Agrupar por ID biométrico. Si los dispositivos discrepan sobre
    // código o nombre, se excluye el grupo para revisión.
    const grouped = new Map();

    for (const result of deviceResults) {
      for (const user of result.users) {
        const id = user.biometric_user_id;

        if (!grouped.has(id)) {
          grouped.set(id, {
            ...user,
            devices: [],
            source: result.device,
            variants: []
          });
        }

        const group = grouped.get(id);
        group.devices.push(result.device.name);
        group.variants.push({
          employee_code: user.employee_code,
          full_name: user.full_name,
          device_name: result.device.name
        });
      }
    }

    const candidates = [];
    const conflicts = [];
    const existing = [];
    const invalidGroups = [];

    for (const group of grouped.values()) {
      const uniqueCodes = [
        ...new Set(group.variants.map(v => v.employee_code || 'NULL'))
      ];
      const uniqueNames = [
        ...new Set(group.variants.map(v => v.full_name))
      ];

      const deviceDiscrepancy =
        uniqueCodes.length > 1 || uniqueNames.length > 1;

      // Primero registrar los IDs que ya existen en MySQL.
      // Una discrepancia entre dispositivos nunca autoriza modificar
      // ni reemplazar la información del empleado existente.
      if (employeesById.has(group.biometric_user_id)) {
        existing.push({
          biometric_user_id: group.biometric_user_id,
          full_name: group.full_name,
          reason: 'ID biométrico ya registrado',
          device_discrepancy: deviceDiscrepancy
        });

        // Reportar la discrepancia por separado, sin perder el conteo
        // del usuario existente ni permitir que se convierta en candidato.
        if (deviceDiscrepancy) {
          conflicts.push({
            biometric_user_id: group.biometric_user_id,
            employee_code: group.employee_code,
            full_name: group.full_name,
            reason: 'Discrepancia entre dispositivos; ID ya registrado',
            variants: group.variants
          });
        }

        continue;
      }

      // Si no existe el ID, cualquier discrepancia requiere revisión.
      if (deviceDiscrepancy) {
        conflicts.push({
          biometric_user_id: group.biometric_user_id,
          employee_code: group.employee_code,
          full_name: group.full_name,
          reason: 'Los dispositivos discrepan sobre código o nombre',
          variants: group.variants
        });
        continue;
      }

      // No reasignar códigos que ya pertenezcan a otro registro.
      if (
        group.employee_code &&
        employeesByCode.has(group.employee_code)
      ) {
        conflicts.push({
          biometric_user_id: group.biometric_user_id,
          employee_code: group.employee_code,
          full_name: group.full_name,
          reason: 'El código de empleado ya está registrado',
          existing: employeesByCode.get(group.employee_code).map(e => ({
            id: e.id,
            biometric_user_id: e.biometric_user_id,
            full_name: e.full_name,
            status: e.status
          }))
        });
        continue;
      }

      // Solo llegan aquí IDs nuevos, sin discrepancias ni códigos
      // ya asignados. Se conserva la inserción protegida existente.
      candidates.push({
        biometric_user_id: group.biometric_user_id,
        employee_code: group.employee_code,
        full_name: group.full_name,
        source_name: group.source.name.replace(/FISCALIA/i, 'Fiscalia'),
        source_url: `http://${group.source.ip_address}/userlist.txt`,
        devices: [...new Set(group.devices)].join(', ')
      });
    }

    // Comprobar que no haya códigos repetidos entre los candidatos.
    const candidateCodes = new Map();

    for (const candidate of candidates) {
      if (!candidate.employee_code) continue;

      if (!candidateCodes.has(candidate.employee_code)) {
        candidateCodes.set(candidate.employee_code, []);
      }

      candidateCodes.get(candidate.employee_code).push(candidate);
    }

    const blockedIds = new Set();

    for (const [code, items] of candidateCodes.entries()) {
      if (items.length > 1) {
        for (const item of items) {
          blockedIds.add(item.biometric_user_id);
          conflicts.push({
            biometric_user_id: item.biometric_user_id,
            employee_code: code,
            full_name: item.full_name,
            reason: 'Código de empleado repetido entre usuarios candidatos'
          });
        }
      }
    }

    const safeCandidates = candidates.filter(
      c => !blockedIds.has(c.biometric_user_id)
    );

    console.log('\n========== RESUMEN DE SINCRONIZACIÓN ==========');
    console.log(`Dispositivos leídos:             ${deviceResults.length}`);
    console.log(`Filas actuales en employees:     ${employeeRows.length}`);
    console.log(`IDs biométricos únicos leídos:   ${grouped.size}`);
    console.log(`Usuarios ya existentes:          ${existing.length}`);
    console.log(`Usuarios candidatos seguros:     ${safeCandidates.length}`);
    console.log(`Conflictos excluidos:             ${conflicts.length}`);
    console.log(`Líneas inválidas excluidas:       ${
      deviceResults.reduce((n, r) => n + r.invalid.length, 0)
    }`);
    console.log(`Modo:                             ${APPLY ? 'APLICAR CAMBIOS' : 'SIMULACIÓN'}`);

    console.log('\n========== CANDIDATOS SEGUROS ==========');
    console.table(safeCandidates.map(c => ({
      biometric_user_id: c.biometric_user_id,
      employee_code: c.employee_code,
      full_name: c.full_name,
      source_name: c.source_name,
      devices: c.devices
    })));

    console.log('\n========== CONFLICTOS (PRIMEROS 20) ==========');
    console.table(conflicts.slice(0, 20).map(c => ({
      biometric_user_id: c.biometric_user_id,
      employee_code: c.employee_code || '',
      full_name: c.full_name || '',
      reason: c.reason
    })));

    if (!APPLY) {
      console.log('\nSIMULACIÓN COMPLETADA. No se insertó ni modificó ningún registro.');
      console.log('Revisa los candidatos antes de aplicar la importación.');
      return;
    }

    if (!safeCandidates.length) {
      console.log('\nNo hay candidatos seguros para importar.');
      return;
    }

    // Revalidación dentro de una transacción para minimizar la posibilidad
    // de insertar un registro que haya aparecido durante el diagnóstico.
    await connection.beginTransaction();

    try {
      let inserted = 0;
      let skipped = 0;

      for (const candidate of safeCandidates) {
        const [idMatches] = await connection.query(
          `SELECT id FROM employees WHERE biometric_user_id = ? LIMIT 1`,
          [candidate.biometric_user_id]
        );

        if (idMatches.length) {
          skipped++;
          continue;
        }

        if (candidate.employee_code) {
          const [codeMatches] = await connection.query(
            `SELECT id FROM employees WHERE employee_code = ? LIMIT 1`,
            [candidate.employee_code]
          );

          if (codeMatches.length) {
            skipped++;
            continue;
          }
        }

        await connection.query(`
          INSERT INTO employees (
            employee_code,
            biometric_user_id,
            source_name,
            source_url,
            full_name
          ) VALUES (?, ?, ?, ?, ?)
        `, [
          candidate.employee_code,
          candidate.biometric_user_id,
          candidate.source_name,
          candidate.source_url,
          candidate.full_name
        ]);

        console.log(
          `[INSERT EJECUTADO - PENDIENTE COMMIT] ID biométrico: ${candidate.biometric_user_id}` +
          ` | Código: ${candidate.employee_code}` +
          ` | Nombre: ${candidate.full_name}`
        );

        inserted++;
      }

      await connection.commit();

      console.log('\n========== IMPORTACIÓN COMPLETADA ==========');
      console.log(`Insertados: ${inserted}`);
      console.log(`Omitidos por existir al revalidar: ${skipped}`);
      console.log('No se actualizaron empleados existentes.');
      console.log('No se modificaron estados ni registros de asistencia.');
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } catch (error) {
    console.error('\nERROR EN SINCRONIZACIÓN:', error.message);
    process.exitCode = 1;
  } finally {
    if (connection) connection.release();
    await db.end();
  }
}

main();
