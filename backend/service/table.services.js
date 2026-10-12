const db = require("../config/db");

/**
 * Crea la tabla de período si no existe
 */
async function ensurePeriodTable(tableName) {
  const sql = `
    CREATE TABLE IF NOT EXISTS \`${tableName}\` (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      device_id INT,
      card_id VARCHAR(50),
      employee_id VARCHAR(50),
      name VARCHAR(150),
      date DATE,
      time TIME,
      terminal VARCHAR(100),
      in_out TINYINT,
      door_number INT,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,

      UNIQUE KEY unique_event (device_id, card_id, date, time, door_number),

      INDEX idx_date_time (date, time),
      INDEX idx_emp_date_time (employee_id, date, time),
      INDEX idx_card_date_time (card_id, date, time),
      INDEX idx_device_date_time (device_id, date, time),
      INDEX idx_device_door_date (device_id, door_number, date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `;

  await db.query(sql);
}

/**
 * Crea la tabla live si no existe
 */
async function ensureLiveTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS registros_live (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,

      device_id INT NULL,
      card_id VARCHAR(100) NULL,
      employee_id VARCHAR(50) NULL,
      name VARCHAR(150) NULL,

      date DATE NOT NULL,
      time TIME NOT NULL,

      terminal VARCHAR(255) NULL,
      in_out INT NULL,
      door_number INT NULL,

      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      date_tmp DATE NULL,

      UNIQUE KEY uk_live_unique (device_id, card_id, employee_id, date, time, terminal, in_out, door_number),

      INDEX idx_live_date (date),
      INDEX idx_live_employee (employee_id),
      INDEX idx_live_terminal (terminal),
      INDEX idx_live_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `;

  await db.query(sql);
}

module.exports = {
  ensurePeriodTable,
  ensureLiveTable,
};