const { sql, query } = require('../config/sqlserver');

// eTimeTrackLite keeps raw punches in monthly tables: DeviceLogs_<month>_<year>.
function logTableFor(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return `DeviceLogs_${m}_${y}`;
}

async function tableExists(table) {
  const r = await query(`SELECT OBJECT_ID(@t, 'U') AS id`, { t: table });
  return r.recordset[0].id != null;
}

// LogDate is stored as IST wall-clock; the driver returns a Date whose UTC
// fields hold that value, so read it back with UTC getters (no tz shift).
function formatTime(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

// Full roster of a batch for a date, each student marked present/absent with punch details.
async function getBatchAttendance(batchId, dateStr) {
  const bid = Number(batchId);

  const batchRow = await query(
    `SELECT DepartmentId AS batchId, DepartmentFName AS name, DepartmentSName AS code
       FROM Departments WHERE DepartmentId = @bid`,
    { bid: { type: sql.Int, value: bid } }
  );
  if (!batchRow.recordset.length) throw new Error('Batch not found');
  const batch = batchRow.recordset[0];

  // Roster: everyone currently assigned to this department.
  const roster = await query(
    `SELECT EmployeeCode AS employeeCode, EmployeeName AS name, ContactNo AS phone, Status AS status
       FROM Employees WHERE DepartmentId = @bid`,
    { bid: { type: sql.Int, value: bid } }
  );

  // Punches for the date (aggregated per user). Empty if that month's table is absent.
  const table = logTableFor(dateStr);
  const punchesByUser = {};
  if (await tableExists(table)) {
    // Table name can't be parameterised; it's validated by the regex shape below.
    if (!/^DeviceLogs_\d+_\d+$/.test(table)) throw new Error('Bad log table');
    const punches = await query(
      `SELECT UserId AS userId,
              MIN(LogDate) AS firstIn,
              MAX(LogDate) AS lastOut,
              COUNT(*) AS punchCount
         FROM ${table}
        WHERE CAST(LogDate AS DATE) = @d
        GROUP BY UserId`,
      { d: { type: sql.Date, value: dateStr } }
    );
    for (const row of punches.recordset) punchesByUser[String(row.userId)] = row;
  }

  const students = roster.recordset.map((s) => {
    const punch = punchesByUser[String(s.employeeCode)];
    const present = !!punch;
    return {
      employeeCode: s.employeeCode,
      name: s.name,
      phone: s.phone || '',
      empStatus: s.status || '',
      status: present ? 'present' : 'absent',
      firstIn: present ? formatTime(punch.firstIn) : null,
      lastOut: present ? formatTime(punch.lastOut) : null,
      punchCount: present ? punch.punchCount : 0,
    };
  });

  students.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'absent' ? -1 : 1; // absentees first
    return String(a.name).localeCompare(String(b.name));
  });

  const present = students.filter((s) => s.status === 'present').length;
  return {
    batch,
    date: dateStr,
    summary: { total: students.length, present, absent: students.length - present },
    students,
  };
}

// Just the absentees of a batch on a date (used before sending SMS).
async function getAbsentStudents(batchId, dateStr) {
  const data = await getBatchAttendance(batchId, dateStr);
  return { batch: data.batch, date: dateStr, absent: data.students.filter((s) => s.status === 'absent') };
}

module.exports = { getBatchAttendance, getAbsentStudents };
