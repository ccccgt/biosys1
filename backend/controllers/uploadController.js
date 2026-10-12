const fs = require("fs");
const csv = require("csv-parser");
const db = require("../config/db");

exports.uploadCSV = (req, res) => {
  const results = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (data) => {
      results.push(data);
    })
    .on("end", () => {
      results.forEach((row) => {
        const query = `
          INSERT INTO attendance_records 
          (employee_id, date, check_in, check_out, status, source_file)
          VALUES (?, ?, ?, ?, ?, ?)
        `;

        db.query(query, [
          row.employee_id,
          row.date,
          row.check_in,
          row.check_out,
          row.status,
          req.file.originalname,
        ]);
      });

      res.json({ message: "Archivo procesado correctamente" });
    });
};
