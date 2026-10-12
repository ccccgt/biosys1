const axios = require("axios");
const xlsx = require("xlsx");
const db = require("../config/db");

async function fetchDeviceData(device, startDate, endDate) {
  const url = `http://${device.ip_address}/if.cgi`;

  const params = {
    redirect: "setting.htm",
    failure: "fail.htm",
    type: "xls_data",
    UID: "",
    TID: "",
    dep: 0,
    Fkey: 255,
    num: 0,
    start_month: startDate.getMonth() + 1,
    start_date: startDate.getDate(),
    start_year: startDate.getFullYear().toString().slice(-2),
    end_month: endDate.getMonth() + 1,
    end_date: endDate.getDate(),
    end_year: endDate.getFullYear().toString().slice(-2),
    sel_all: 1,
    head: 1,
    event: 1
  };

  const response = await axios.get(url, {
    params,
    auth: {
      username: device.username,
      password: device.password
    },
    responseType: "arraybuffer",
    timeout: 60000
  });

  return response.data;
}

async function processDevice(device, startDate, endDate) {
  const fileBuffer = await fetchDeviceData(device, startDate, endDate);

  const workbook = xlsx.read(fileBuffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);

  for (const row of data) {
    try {
      await db.query(
        `INSERT IGNORE INTO attendance_records
        (device_id, card_id, employee_id, name, date, time, terminal, in_out, door_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          device.id,
          row["Card ID"],
          row["Employee ID"],
          row["Name"],
          row["Date"],
          row["Time"],
          row["Terminal"],
          row["In/Out"],
          row["Door"]
        ]
      );
    } catch (err) {
      console.error("Error insertando:", err.message);
    }
  }
}

module.exports = { processDevice };
