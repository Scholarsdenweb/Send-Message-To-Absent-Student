const { sql, query } = require('../config/sqlserver');
const { prisma } = require('../config/prisma');

// eTimeTrackLite keeps raw punches in monthly tables: DeviceLogs_<month>_<year>.
function logTableFor(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return `DeviceLogs_${m}_${y}`;
}

async function tableExists(table) {
  const r = await query(`SELECT OBJECT_ID(@t, 'U') AS id`, { t: table });
  return r.recordset[0].id != null;
}

// The per-user punch aggregate for a (table, date) is the same no matter which
// batch asks for it, so cache it briefly. This collapses the N parallel batch
// loads the UI fires into a SINGLE table scan, and de-dupes concurrent callers
// by caching the in-flight promise (not just the resolved value).
const PUNCH_TTL_MS = Number(process.env.PUNCH_CACHE_TTL_MS) || 15000;
const punchCache = new Map(); // key: `${table}|${dateStr}` -> { at, promise }

function loadPunchesByUser(table, dateStr) {
  const key = `${table}|${dateStr}`;
  const hit = punchCache.get(key);
  if (hit && Date.now() - hit.at < PUNCH_TTL_MS) return hit.promise;

  const promise = (async () => {
    const byUser = {};
    if (await tableExists(table)) {
      // Table name can't be parameterised; validate its shape first.
      if (!/^DeviceLogs_\d+_\d+$/.test(table)) throw new Error('Bad log table');
      // Sargable range (LogDate >= day AND < next day) so an index on LogDate
      // can be used — no CAST wrapping the column.
      const punches = await query(
        `SELECT UserId AS userId,
                MIN(LogDate) AS firstIn,
                MAX(LogDate) AS lastOut,
                COUNT(*) AS punchCount
           FROM ${table}
          WHERE LogDate >= @d AND LogDate < DATEADD(DAY, 1, @d)
          GROUP BY UserId`,
        { d: { type: sql.Date, value: dateStr } }
      );
      for (const row of punches.recordset) byUser[String(row.userId)] = row;
    }
    return byUser;
  })();

  punchCache.set(key, { at: Date.now(), promise });
  // On failure, drop the entry so the next request retries instead of caching the error.
  promise.catch(() => {
    if (punchCache.get(key)?.promise === promise) punchCache.delete(key);
  });
  return promise;
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

  // Punches for the date (aggregated per user), cached + shared across batches.
  const table = logTableFor(dateStr);
  const punchesByUser = await loadPunchesByUser(table, dateStr);

  // Manual overrides for this date (app DB). A teacher can force a no-punch
  // student to "present" (no absent SMS), or force a punched student to
  // "absent" (e.g. proxy punch) — which then counts as absent / gets an SMS.
  let overrideByCode = {};
  try {
    const codes = roster.recordset.map((s) => String(s.employeeCode));
    const overrides = await prisma.attendanceOverride.findMany({
      where: { date: dateStr, status: { in: ['present', 'absent'] }, employeeCode: { in: codes } },
      select: { employeeCode: true, status: true },
    });
    for (const o of overrides) overrideByCode[String(o.employeeCode)] = o.status;
  } catch (e) {
    console.warn('[attendance] could not load overrides:', e.message);
  }

  const students = roster.recordset.map((s) => {
    const punch = punchesByUser[String(s.employeeCode)];
    const hasPunch = !!punch;
    const override = overrideByCode[String(s.employeeCode)]; // 'present' | 'absent' | undefined

    // Override wins over the punch-based status; otherwise punch decides.
    const status = override ? override : hasPunch ? 'present' : 'absent';

    return {
      employeeCode: s.employeeCode,
      name: s.name,
      phone: s.phone || '',
      empStatus: s.status || '',
      status,
      manualPresent: override === 'present', // present because a teacher marked it
      manualAbsent: override === 'absent',   // absent because a teacher marked it
      overridden: !!override,                // any manual override is active
      // Always expose punch details when they exist, even if overridden to absent.
      firstIn: hasPunch ? formatTime(punch.firstIn) : null,
      lastOut: hasPunch ? formatTime(punch.lastOut) : null,
      punchCount: hasPunch ? punch.punchCount : 0,
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
