const xlsx = require('xlsx');
const batchService = require('../services/batch.service');

async function list(req, res) {
  const batches = await batchService.listBatches();
  return res.json({ batches });
}

async function create(req, res) {
  const { name, code, description } = req.body || {};
  const batch = await batchService.createBatch({ name, code, description });
  return res.status(201).json({ batch });
}

async function remove(req, res) {
  const result = await batchService.deleteBatch(req.params.batchId);
  return res.json(result);
}

// Normalises header keys so the CSV/Excel can use friendly column names.
function pickRow(row) {
  const map = {};
  for (const [k, v] of Object.entries(row)) map[k.toLowerCase().replace(/[\s_]+/g, '')] = v;
  return {
    employeeCode: map.employeecode ?? map.code ?? map.rollno ?? map.rollnumber ?? map.userid ?? map.empcode,
    batchCode: map.batchcode ?? map.departmentcode ?? map.batchsname,
    batchName: map.batchname ?? map.batch ?? map.department ?? map.departmentname,
  };
}

// Admin: assign students to batches from an uploaded CSV/XLSX file.
// Expected columns (case/space-insensitive): EmployeeCode + (BatchCode or BatchName).
async function assignUpload(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded (field name: file)' });

  let rows;
  try {
    const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  } catch (err) {
    return res.status(400).json({ message: `Could not parse file: ${err.message}` });
  }
  if (!rows.length) return res.status(400).json({ message: 'File has no rows' });

  const parsed = rows.map(pickRow).filter((r) => r.employeeCode);
  if (!parsed.length) {
    return res.status(400).json({ message: 'No usable rows. Need an EmployeeCode column plus BatchCode or BatchName.' });
  }

  const report = await batchService.assignBatchBulk(parsed);
  return res.json({ report });
}

module.exports = { list, create, remove, assignUpload };
