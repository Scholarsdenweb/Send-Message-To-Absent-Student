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
  const [batchIds, setBatchIds] = useState([]); // multiple selected batch ids (as strings)
  const [date, setDate] = useState(today());
  const [data, setData] = useState(null);
  const [sentCodes, setSentCodes] = useState(new Set());
  const [filter, setFilter] = useState('all'); // all | present | absent
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // silent background reload
  const [error, setError] = useState('');
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsResult, setSmsResult] = useState(null);
  const [overrideBusy, setOverrideBusy] = useState('');

  useEffect(() => {
    api.get('/batches').then((r) => setBatches(r.data.batches)).catch(() => {});
  }, []);

  function toggleBatch(id) {
    setBatchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function selectAllBatches() { setBatchIds(batches.map((b) => String(b.batchId))); }
  function clearBatches() { setBatchIds([]); }

  // Merge the "already notified today" codes across all selected batches.
  async function loadSentStatus() {
    if (!batchIds.length) return;
    try {
      const lists = await Promise.all(
        batchIds.map((id) => api.get(`/sms/${id}/sent`, { params: { date } }).then((r) => r.data.sentCodes))
      );
      const merged = new Set();
      for (const codes of lists) codes.forEach((c) => merged.add(String(c)));
      setSentCodes(merged);
    } catch { setSentCodes(new Set()); }
  }

  // Load attendance for every selected batch and merge into one combined report.
  // silent = keep the current list on screen and refresh in the background
  // (used after marking present, so the table never blanks out).
  async function load({ silent = false } = {}) {
    if (!batchIds.length) return;
    setError('');
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true); setData(null); setSmsResult(null);
    }
    try {
      // Fetch attendance and the "already notified" status in parallel — they
      // don't depend on each other, so no need to wait for one before the other.
      const sentPromise = loadSentStatus();
      const results = await Promise.all(
        batchIds.map((id) => api.get(`/attendance/${id}`, { params: { date } }).then((r) => r.data))
      );
      const batchesMeta = [];
      const students = [];
      for (const r of results) {
        batchesMeta.push(r.batch);
        for (const s of r.students) {
          students.push({ ...s, batchId: r.batch.batchId, batchName: r.batch.name });
        }
      }
      // Absentees first, then by batch, then by name.
      students.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'absent' ? -1 : 1;
        if (a.batchName !== b.batchName) return String(a.batchName).localeCompare(String(b.batchName));
        return String(a.name).localeCompare(String(b.name));
      });
      const present = students.filter((s) => s.status === 'present').length;
      setData({
        date,
        batches: batchesMeta,
        students,
        summary: { total: students.length, present, absent: students.length - present },
      });
      await sentPromise;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Absentees who have NOT yet been sent an SMS today.
  const pendingCount = data
    ? data.students.filter((s) => s.status === 'absent' && !sentCodes.has(String(s.employeeCode))).length
    : 0;

  // Send absent SMS for every selected batch and combine the summaries.
  async function sendSms() {
    if (!data || pendingCount === 0) return;
    if (!confirm(`Send absent SMS to ${pendingCount} student(s) across ${batchIds.length} batch(es) for ${date}?\n(Students already notified today will be skipped.)`)) return;
    setSmsBusy(true); setSmsResult(null); setError('');
    try {
      const summaries = await Promise.all(
        batchIds.map((id) => api.post(`/sms/${id}/absent`, { date }).then((r) => r.data.summary))
      );
      const summary = summaries.reduce((acc, s) => ({
        sent: acc.sent + (s.sent || 0),
        failed: acc.failed + (s.failed || 0),
        skippedNoPhone: acc.skippedNoPhone + (s.skippedNoPhone || 0),
        alreadySent: acc.alreadySent + (s.alreadySent || 0),
      }), { sent: 0, failed: 0, skippedNoPhone: 0, alreadySent: 0 });
      setSmsResult(summary);
      await loadSentStatus();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send SMS');
    } finally {
      setSmsBusy(false);
    }
  }

  // Mark a no-punch student present (status 'present') or revert to automatic
  // punch-based status (status 'auto'). Present students are excluded from SMS.
  async function setPresence(employeeCode, batchId, status) {
    setOverrideBusy(String(employeeCode));
    setError('');

    // Optimistic update: change the row immediately so there is no flicker or
    // blank list while the request is in flight. ('auto' reverts to the
    // punch-based status, which only the server knows, so reload silently.)
    if (status === 'present' || status === 'absent') {
      setData((prev) => {
        if (!prev) return prev;
        const students = prev.students.map((s) =>
          String(s.employeeCode) === String(employeeCode) && s.batchId === batchId
            ? {
                ...s,
                status,
                manualPresent: status === 'present',
                manualAbsent: status === 'absent',
                overridden: true,
              }
            : s
        );
        const present = students.filter((s) => s.status === 'present').length;
        return {
          ...prev,
          students,
          summary: { total: students.length, present, absent: students.length - present },
        };
      });
    }

    try {
      await api.post(`/attendance/${batchId}/override`, { employeeCode, date, status });
      await load({ silent: true }); // reconcile with server, list stays on screen
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update attendance');
      await load({ silent: true }); // roll back the optimistic change from server truth
    } finally {
      setOverrideBusy('');
    }
  }

  // Download the combined report as an .xlsx file.
  // Columns: Batch, Enrollment No, Name, Father Contact Number, Status.
  function downloadExcel() {
    if (!data) return;
    const exportRows = data.students.map((s) => ({
      'Batch': s.batchName,
      'Enrollment No': s.employeeCode,
      'Name': s.name,
      'Father Contact Number': s.phone || '',
      'Status': s.status === 'present' ? 'Present' : 'Absent',
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 26 }, { wch: 22 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    const label = data.batches.length === 1
      ? String(data.batches[0].name).replace(/[^\w-]+/g, '_')
      : `${data.batches.length}_batches`;
    XLSX.writeFile(wb, `Attendance_${label}_${date}.xlsx`);
  }

  const rows = data ? data.students.filter((s) => filter === 'all' || s.status === filter) : [];
  const alreadySentToday = data
    ? data.students.filter((s) => s.status === 'absent' && sentCodes.has(String(s.employeeCode))).length
    : 0;

  // Per-batch breakdown so each selected batch's own numbers are visible
  // alongside the combined totals in the stats box.
  const perBatch = data
    ? data.batches.map((b) => {
        const st = data.students.filter((s) => s.batchId === b.batchId);
        const present = st.filter((s) => s.status === 'present').length;
        const smsToday = st.filter(
          (s) => s.status === 'absent' && sentCodes.has(String(s.employeeCode))
        ).length;
        return {
          batchId: b.batchId,
          name: b.name,
          code: b.code,
          total: st.length,
          present,
          absent: st.length - present,
          smsToday,
        };
      })
    : [];

  return (
    <div>
      <h2>Batch Attendance</h2>

      <div className="card toolbar">
        <div className="field grow">
          <label>Batches ({batchIds.length} selected)</label>
          <div className="batch-picker">
            <div className="batch-picker-actions">
              <button type="button" className="btn small" onClick={selectAllBatches}>Select all</button>
              <button type="button" className="btn small" onClick={clearBatches}>Clear</button>
            </div>
            <div className="batch-list">
              {batches.map((b) => (
                <label key={b.batchId} className="batch-item">
                  <input
                    type="checkbox"
                    checked={batchIds.includes(String(b.batchId))}
                    onChange={() => toggleBatch(String(b.batchId))}
                  />
                  <span>{b.name} ({b.code}) — {b.studentCount}</span>
                </label>
              ))}
              {batches.length === 0 && <span className="muted">No batches.</span>}
            </div>
          </div>
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button className="btn primary" onClick={load} disabled={!batchIds.length || loading}>
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {data && (
        <>
          <div className="stats">
            <div className="stat"><span>{data.batches.length}</span>Batches</div>
            <div className="stat"><span>{data.summary.total}</span>Total</div>
            <div className="stat present"><span>{data.summary.present}</span>Present</div>
            <div className="stat absent"><span>{data.summary.absent}</span>Absent</div>
            <div className="stat"><span>{alreadySentToday}</span>SMS sent today</div>
          </div>

          {perBatch.length > 1 && (
            <div className="card">
              <div className="card-title">Selected batches</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Batch</th><th>Code</th><th>Total</th>
                    <th>Present</th><th>Absent</th><th>SMS Today</th>
                  </tr>
                </thead>
                <tbody>
                  {perBatch.map((b) => (
                    <tr key={b.batchId}>
                      <td>{b.name}</td>
                      <td>{b.code}</td>
                      <td>{b.total}</td>
                      <td><span className="pill present">{b.present}</span></td>
                      <td><span className="pill absent">{b.absent}</span></td>
                      <td>{b.smsToday}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card toolbar">
            <div className="tabs">
              {['all', 'absent', 'present'].map((f) => (
                <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <div className="spacer" />
            <button className="btn" onClick={downloadExcel} title="Download the combined attendance as Excel">
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

          <div className={`card table-wrap${refreshing ? ' is-refreshing' : ''}`}>
            <table className="table">
              <thead>
                <tr>
                  <th>Batch</th><th>Code</th><th>Name</th><th>Status</th>
                  <th>First In</th><th>Last Out</th><th>Punches</th><th>Phone</th><th>SMS Today</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const notified = s.status === 'absent' && sentCodes.has(String(s.employeeCode));
                  const busy = overrideBusy === String(s.employeeCode);
                  return (
                    <tr key={`${s.batchId}-${s.employeeCode}`} className={s.status === 'absent' ? 'row-absent' : ''}>
                      <td>{s.batchName}</td>
                      <td>{s.employeeCode}</td>
                      <td>{s.name}</td>
                      <td>
                        <span className={`pill ${s.status}`}>{s.status}</span>
                        {s.overridden && <span className="muted" style={{ marginLeft: 6 }}>(manual)</span>}
                      </td>
                      <td>{s.firstIn || '—'}</td>
                      <td>{s.lastOut || '—'}</td>
                      <td>{s.punchCount}</td>
                      <td>{s.phone || '—'}</td>
                      <td>{s.status === 'absent' ? (notified ? <span className="pill sent">✓ sent</span> : <span className="muted">—</span>) : ''}</td>
                      <td>
                        {s.overridden ? (
                          <button type="button" className="btn small" disabled={busy}
                            onClick={() => setPresence(s.employeeCode, s.batchId, 'auto')}
                            title="Undo manual mark — revert to punch-based status">
                            {busy ? 'Saving…' : 'Undo'}
                          </button>
                        ) : s.status === 'absent' ? (
                          <button type="button" className="btn small" disabled={busy}
                            onClick={() => setPresence(s.employeeCode, s.batchId, 'present')}
                            title="Student was present but did not punch — mark present so no absent SMS is sent">
                            {busy ? 'Saving…' : 'Mark Present'}
                          </button>
                        ) : (
                          <button type="button" className="btn small danger" disabled={busy}
                            onClick={() => setPresence(s.employeeCode, s.batchId, 'absent')}
                            title="Student has a punch but was actually absent — mark absent (counts as absent, may get SMS)">
                            {busy ? 'Saving…' : 'Mark Absent'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan="10" className="muted center">No students.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
