const attendanceService = require('../services/attendance.service');

function validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function batchAttendance(req, res) {
  const { batchId } = req.params;
  const date = req.query.date;
  if (!validDate(date)) return res.status(400).json({ message: 'date query param required as YYYY-MM-DD' });

  const data = await attendanceService.getBatchAttendance(batchId, date);
  return res.json(data);
}

async function batchAbsentees(req, res) {
  const { batchId } = req.params;
  const date = req.query.date;
  if (!validDate(date)) return res.status(400).json({ message: 'date query param required as YYYY-MM-DD' });

  const data = await attendanceService.getAbsentStudents(batchId, date);
  return res.json(data);
}

module.exports = { batchAttendance, batchAbsentees };
