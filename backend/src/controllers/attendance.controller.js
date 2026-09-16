const attendanceService = require('../services/attendance.service');
const { prisma } = require('../config/prisma');

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

// Manually override a student's status for a date:
//   'present' — force a no-punch student present (stops the absent SMS)
//   'absent'  — force a punched student absent (e.g. proxy punch; counts as
//               absent and becomes eligible for the absent SMS)
//   'auto'    — remove the override, revert to automatic punch-based status
async function setOverride(req, res) {
  const { batchId } = req.params;
  const { employeeCode, date, status } = req.body || {};
  if (!validDate(date)) return res.status(400).json({ message: 'date required as YYYY-MM-DD' });
  if (!employeeCode) return res.status(400).json({ message: 'employeeCode required' });

  const code = String(employeeCode);

  if (status === 'auto') {
    await prisma.attendanceOverride.deleteMany({ where: { employeeCode: code, date } });
    return res.json({ ok: true, employeeCode: code, date, status: 'auto' });
  }

  if (status !== 'present' && status !== 'absent') {
    return res.status(400).json({ message: "status must be 'present', 'absent' or 'auto'" });
  }

  const data = {
    status,
    batchId: Number(batchId) || null,
    markedById: req.user.id,
    markedByName: req.user.name,
  };
  const row = await prisma.attendanceOverride.upsert({
    where: { employeeCode_date: { employeeCode: code, date } },
    update: data,
    create: { employeeCode: code, date, ...data },
  });
  return res.json({ ok: true, override: row });
}

module.exports = { batchAttendance, batchAbsentees, setOverride };
