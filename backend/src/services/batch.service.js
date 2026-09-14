const { sql, getPool, query } = require('../config/sqlserver');

// eTimeTrackLite stores "batches" as Departments. A student's batch is
// Employees.DepartmentId (with EmployeeDepartments kept in sync for the app UI).

const identityCache = {};
async function isIdentity(table, column) {
  const key = `${table}.${column}`;
  if (key in identityCache) return identityCache[key];
  const r = await query(
    `SELECT c.is_identity AS isId
       FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id
      WHERE t.name = @t AND c.name = @c`,
    { t: table, c: column }
  );
  const val = !!(r.recordset[0] && r.recordset[0].isId);
  identityCache[key] = val;
  return val;
}

// List all batches (departments) with their current student count.
async function listBatches() {
  const r = await query(`
    SELECT d.DepartmentId   AS batchId,
           d.DepartmentFName AS name,
           d.DepartmentSName AS code,
           d.Description     AS description,
           COUNT(e.EmployeeId) AS studentCount
      FROM Departments d
      LEFT JOIN Employees e ON e.DepartmentId = d.DepartmentId
     GROUP BY d.DepartmentId, d.DepartmentFName, d.DepartmentSName, d.Description
     ORDER BY d.DepartmentFName
  `);
  return r.recordset;
}

// Create a new batch (department). Admin only. Writes to SQL Server.
async function createBatch({ name, code, description }) {
  if (!name || !code) throw new Error('name and code are required');

  const dup = await query(
    `SELECT DepartmentId FROM Departments WHERE DepartmentSName = @code OR DepartmentFName = @name`,
    { code, name }
  );
  if (dup.recordset.length) throw new Error(`A batch with this name or code already exists`);

  const identity = await isIdentity('Departments', 'DepartmentId');
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const req = new sql.Request(tx);
    req.input('fn', sql.NVarChar(50), name);
    req.input('sn', sql.NVarChar(50), code);
    req.input('desc', sql.NVarChar(50), (description || '').slice(0, 50));

    let newId;
    if (identity) {
      const r = await req.query(`
        INSERT INTO Departments (DepartmentFName, DepartmentSName, Description, RecordStatus)
        OUTPUT INSERTED.DepartmentId AS id
        VALUES (@fn, @sn, @desc, 1)
      `);
      newId = r.recordset[0].id;
    } else {
      const nx = await req.query(`SELECT ISNULL(MAX(DepartmentId), 0) + 1 AS nextId FROM Departments`);
      newId = nx.recordset[0].nextId;
      req.input('id', sql.Int, newId);
      await req.query(`
        INSERT INTO Departments (DepartmentId, DepartmentFName, DepartmentSName, Description, RecordStatus)
        VALUES (@id, @fn, @sn, @desc, 1)
      `);
    }
    await tx.commit();
    return { batchId: newId, name, code, description: description || '' };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// Resolve a batch by code or name -> { batchId, name }.
async function resolveBatch({ code, name }) {
  const r = await query(
    `SELECT TOP 1 DepartmentId AS batchId, DepartmentFName AS name, DepartmentSName AS code
       FROM Departments
      WHERE (@code IS NOT NULL AND DepartmentSName = @code)
         OR (@name IS NOT NULL AND DepartmentFName = @name)`,
    { code: code || null, name: name || null }
  );
  return r.recordset[0] || null;
}

// Assign one student (by EmployeeCode) to a batch (DepartmentId).
// Updates Employees.DepartmentId and keeps EmployeeDepartments in sync.
async function assignOne(tx, employeeCode, deptId) {
  const req = new sql.Request(tx);
  req.input('code', sql.NVarChar(50), String(employeeCode));
  req.input('dept', sql.Int, deptId);

  const emp = await req.query(`SELECT EmployeeId FROM Employees WHERE EmployeeCode = @code`);
  if (!emp.recordset.length) return { status: 'notFound' };
  const employeeId = emp.recordset[0].EmployeeId;

  await req.query(`UPDATE Employees SET DepartmentId = @dept WHERE EmployeeCode = @code`);

  // Best-effort sync of EmployeeDepartments (mapping table used by some app screens).
  const req2 = new sql.Request(tx);
  req2.input('empId', sql.Int, employeeId);
  req2.input('dept', sql.Int, deptId);
  const existing = await req2.query(`SELECT TOP 1 EmployeeDepartmentId FROM EmployeeDepartments WHERE EmployeeId = @empId`);
  if (existing.recordset.length) {
    await req2.query(`UPDATE EmployeeDepartments SET DepartmentId = @dept WHERE EmployeeId = @empId`);
  } else {
    const edIdentity = await isIdentity('EmployeeDepartments', 'EmployeeDepartmentId');
    if (edIdentity) {
      await req2.query(`INSERT INTO EmployeeDepartments (EmployeeId, DepartmentId) VALUES (@empId, @dept)`);
    } else {
      const nx = await req2.query(`SELECT ISNULL(MAX(EmployeeDepartmentId), 0) + 1 AS nextId FROM EmployeeDepartments`);
      req2.input('edId', sql.Int, nx.recordset[0].nextId);
      await req2.query(`INSERT INTO EmployeeDepartments (EmployeeDepartmentId, EmployeeId, DepartmentId) VALUES (@edId, @empId, @dept)`);
    }
  }
  return { status: 'updated' };
}

// Delete a batch (department). Admin only. Refuses if any student is assigned,
// and never deletes the Default department. Writes to SQL Server.
async function deleteBatch(batchId) {
  const bid = Number(batchId);
  if (!bid) throw new Error('Invalid batch id');

  const dep = await query(
    `SELECT DepartmentId, DepartmentFName FROM Departments WHERE DepartmentId = @bid`,
    { bid: { type: sql.Int, value: bid } }
  );
  if (!dep.recordset.length) throw new Error('Batch not found');
  const name = dep.recordset[0].DepartmentFName;
  if (String(name).trim().toLowerCase() === 'default') {
    throw new Error('The Default department cannot be deleted');
  }

  const cnt = await query(
    `SELECT COUNT(*) AS c FROM Employees WHERE DepartmentId = @bid`,
    { bid: { type: sql.Int, value: bid } }
  );
  const studentCount = cnt.recordset[0].c;
  if (studentCount > 0) {
    const err = new Error(`Cannot delete "${name}": ${studentCount} student(s) are still assigned. Reassign them to another batch first.`);
    err.status = 409;
    throw err;
  }

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const req = new sql.Request(tx);
    req.input('bid', sql.Int, bid);
    // No students reference it; clear any stray mapping rows, then delete the department.
    await req.query(`DELETE FROM EmployeeDepartments WHERE DepartmentId = @bid`);
    await req.query(`DELETE FROM Departments WHERE DepartmentId = @bid`);
    await tx.commit();
    return { deleted: true, batchId: bid, name };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// Bulk assign from parsed rows: [{ employeeCode, batchCode?, batchName? }, ...]
// Admin only. Returns a per-row report.
async function assignBatchBulk(rows) {
  const pool = await getPool();
  const batchCache = {};
  const results = { updated: 0, notFound: 0, unknownBatch: 0, errors: 0, details: [] };

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const raw of rows) {
      const employeeCode = String(raw.employeeCode || '').trim();
      const batchCode = raw.batchCode ? String(raw.batchCode).trim() : null;
      const batchName = raw.batchName ? String(raw.batchName).trim() : null;

      if (!employeeCode || (!batchCode && !batchName)) {
        results.errors++;
        results.details.push({ employeeCode, batch: batchCode || batchName, status: 'error', reason: 'Missing employeeCode or batch' });
        continue;
      }

      const cacheKey = batchCode || batchName;
      if (!(cacheKey in batchCache)) {
        batchCache[cacheKey] = await resolveBatch({ code: batchCode, name: batchName });
      }
      const batch = batchCache[cacheKey];
      if (!batch) {
        results.unknownBatch++;
        results.details.push({ employeeCode, batch: cacheKey, status: 'unknownBatch', reason: 'Batch/department does not exist' });
        continue;
      }

      const r = await assignOne(tx, employeeCode, batch.batchId);
      if (r.status === 'updated') {
        results.updated++;
        results.details.push({ employeeCode, batch: batch.name, status: 'updated' });
      } else {
        results.notFound++;
        results.details.push({ employeeCode, batch: batch.name, status: 'notFound', reason: 'EmployeeCode not found in eTimeTrackLite' });
      }
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
  return results;
}

module.exports = { listBatches, createBatch, deleteBatch, resolveBatch, assignBatchBulk };
