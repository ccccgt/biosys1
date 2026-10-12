function pad2(n) {
  return String(n).padStart(2, "0");
}

/*
 * Fecha de transición:
 *
 * Antes de 2026-07-01 se conserva la lógica histórica 5→4.
 * Desde 2026-07-01 cada tabla corresponde al mes calendario.
 */
const CALENDAR_MONTH_CUTOVER = new Date("2026-07-01T00:00:00");

function isCalendarMonthMode(dateObj) {
  return dateObj.getTime() >= CALENDAR_MONTH_CUTOVER.getTime();
}

/**
 * Devuelve la tabla correspondiente a una fecha.
 *
 * Histórico anterior a julio 2026:
 *   días 1..4 pertenecen al período del mes anterior.
 *
 * Desde julio 2026:
 *   todos los días pertenecen al mes calendario real.
 */
function getPeriodTableNameFromDate(dateObj) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) {
    throw new Error("Fecha inválida en getPeriodTableNameFromDate");
  }

  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();

  if (isCalendarMonthMode(dateObj)) {
    return `registros_${pad2(month)}_${year}`;
  }

  let tableYear = year;
  let tableMonth = month;

  if (day <= 4) {
    tableMonth -= 1;

    if (tableMonth === 0) {
      tableMonth = 12;
      tableYear -= 1;
    }
  }

  return `registros_${pad2(tableMonth)}_${tableYear}`;
}

/**
 * Devuelve las tablas necesarias para consultar un rango.
 *
 * Recorre día por día para soportar correctamente la transición
 * entre la lógica histórica y la lógica de mes calendario.
 */
function getPeriodTablesForRange(start, end) {
  if (
    !(start instanceof Date) ||
    !(end instanceof Date) ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    throw new Error("Rango inválido en getPeriodTablesForRange");
  }

  const tables = new Set();

  const current = new Date(start.getTime());
  current.setHours(0, 0, 0, 0);

  const finalDate = new Date(end.getTime());
  finalDate.setHours(0, 0, 0, 0);

  while (current <= finalDate) {
    tables.add(getPeriodTableNameFromDate(current));
    current.setDate(current.getDate() + 1);
  }

  return Array.from(tables);
}

function sanitizePeriodTableName(tableName) {
  if (!/^registros_\d{2}_\d{4}$/.test(tableName)) {
    throw new Error(`Nombre de tabla inválido: ${tableName}`);
  }

  return tableName;
}

module.exports = {
  CALENDAR_MONTH_CUTOVER,
  getPeriodTableNameFromDate,
  getPeriodTablesForRange,
  sanitizePeriodTableName,
};
