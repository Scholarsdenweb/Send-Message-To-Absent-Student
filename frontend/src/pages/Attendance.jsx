import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import api from '../api';

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function Attendance() {
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState('');
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [sentCodes, setSentCodes] = useState(new Set());
  const [filter, setFilter] = useState('all'); // all | present | absent
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsResult, setSmsResult] = useState(null);

  useEffect(() => {
    api.get('/batches').then((r) => setBatches(r.data.batches)).catch(() => {});
  }, []);

  async function loadSentStatus() {
    if (!batchId) return;
    try {
      const r = await api.get(`/sms/${batchId}/sent`, { params: { date } });
      setSentCodes(new Set(r.data.sentCodes.map(String)));
    } catch { setSentCodes(new Set()); }
  }

  async function load() {
    if (!batchId) return;
    setLoading(true); setError(''); setData(null); setSmsResult(null);
    try {
      const r = await api.get(`/attendance/${batchId}`, { params: { date } });
      setData(r.data);
      await loadSentStatus();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }

  // Absentees who have NOT yet been sent an SMS today.
  const pendingCount = data
    ? data.students.filter((s) => s.status === 'absent' && !sentCodes.has(String(s.employeeCode))).length
    : 0;

  async function sendSms() {
    if (!data || pendingCount === 0) return;
    if (!confirm(`Send absent SMS to ${pendingCount} student(s) of ${data.batch.name} for ${date}?\n(Students already notified today will be skipped.)`)) return;
    setSmsBusy(true); setSmsResult(null); setError('');
    try {
      const r = await api.post(`/sms/${batchId}/absent`, { date });
      setSmsResult(r.data.summary);
      await loadSentStatus();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send SMS');
    } finally {
      setSmsBusy(false);
    }
  }

  // Download the current batch/date register as an .xlsx file.
  // Columns: Enrollment No, Name, Father Contact Number, Status.
  function downloadExcel() {
    if (!data) return;
    const exportRows = data.students.map((s) => ({
      'Enrollment No': s.employeeCode,
      'Name': s.name,
      'Father Contact Number': s.phone || '',
      'Status': s.status === 'present' ? 'Present' : 'Absent',
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws['!cols'] = [{ wch: 16 }, { wch: 26 }, { wch: 22 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    const safeBatch = String(data.batch?.name || 'batch').replace(/[^\w-]+/g, '_');
    XLSX.writeFile(wb, `Attendance_${safeBatch}_${date}.xlsx`);
  }

  const rows = data ? data.students.filter((s) => filter === 'all' || s.status === filter) : [];
  const alreadySentToday = data
    ? data.students.filter((s) => s.status === 'absent' && sentCodes.has(String(s.employeeCode))).length
    : 0;

  return (
    <div>
      <h2>Batch Attendance</h2>

      <div className="card toolbar">
        <div className="field">
          <label>Batch</label>
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">Select a batch…</option>
            {batches.map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {b.name} ({b.code}) — {b.studentCount} students
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button className="btn primary" onClick={load} disabled={!batchId || loading}>
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {data && (
        <>
          <div className="stats">
            <div className="stat"><span>{data.summary.total}</span>Total</div>
            <div className="stat present"><span>{data.summary.present}</span>Present</div>
            <div className="stat absent"><span>{data.summary.absent}</span>Absent</div>
            <div className="stat"><span>{alreadySentToday}</span>SMS sent today</div>
          </div>

          <div className="card toolbar">
            <div className="tabs">
              {['all', 'absent', 'present'].map((f) => (
                <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div className="spacer" />
            <button className="btn" onClick={downloadExcel} title="Download this batch's attendance as Excel">
              ⬇ Download Excel
            </button>
            {data.summary.absent > 0 && pendingCount === 0 ? (
              <span className="pill sent" title="Every absentee has already been notified today">
                ✓ All absentees already notified today
              </span>
            ) : (
              <button className="btn danger" onClick={sendSms} disabled={smsBusy || pendingCount === 0}>
                {smsBusy ? 'Sending…' : `Send Absent SMS (${pendingCount})`}
              </button>
            )}
          </div>

          {smsResult && (
            <div className="alert success">
              SMS done — sent: {smsResult.sent}, already sent (skipped): {smsResult.alreadySent},
              failed: {smsResult.failed}, no phone: {smsResult.skippedNoPhone}
            </div>
          )}

          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th><th>Name</th><th>Status</th>
                  <th>First In</th><th>Last Out</th><th>Punches</th><th>Phone</th><th>SMS Today</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const notified = s.status === 'absent' && sentCodes.has(String(s.employeeCode));
                  return (
                    <tr key={s.employeeCode} className={s.status === 'absent' ? 'row-absent' : ''}>
                      <td>{s.employeeCode}</td>
                      <td>{s.name}</td>
                      <td><span className={`pill ${s.status}`}>{s.status}</span></td>
                      <td>{s.firstIn || '—'}</td>
                      <td>{s.lastOut || '—'}</td>
                      <td>{s.punchCount}</td>
                      <td>{s.phone || '—'}</td>
                      <td>{s.status === 'absent' ? (notified ? <span className="pill sent">✓ sent</span> : <span className="muted">—</span>) : ''}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan="8" className="muted center">No students.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
