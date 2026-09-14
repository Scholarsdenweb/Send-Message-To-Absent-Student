import { useState } from 'react';
import api from '../api';

export default function Assign() {
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setError(''); setReport(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api.post('/batches/assign', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setReport(r.data.report);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Assign Batch (CSV / Excel)</h2>
      <div className="card">
        <p>Upload a <b>.csv</b>, <b>.xlsx</b> or <b>.xls</b> file. Every row needs:</p>
        <ul>
          <li><code>EmployeeCode</code> — the student's biometric code (also accepts <code>Code</code>, <code>RollNo</code>, <code>UserId</code>)</li>
          <li>and <b>one</b> of: <code>BatchCode</code> (matches the batch code) <b>or</b> <code>BatchName</code> (matches the batch name)</li>
        </ul>

        <div className="sample-block">
          <div>
            <b>Assign by batch code</b>
            <div className="dl-row">
              <a className="btn" href="/sample-assign.csv" download>⬇ CSV</a>
              <a className="btn" href="/sample-assign.xlsx" download>⬇ Excel</a>
            </div>
          </div>
          <div>
            <b>Assign by batch name</b>
            <div className="dl-row">
              <a className="btn" href="/sample-assign-byname.csv" download>⬇ CSV</a>
              <a className="btn" href="/sample-assign-byname.xlsx" download>⬇ Excel</a>
            </div>
          </div>
        </div>
        <p className="muted">Download a sample, replace the rows with your students, then upload it below. The batch must already exist (create it on the Batches page).</p>
        <form onSubmit={upload}>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} />
          <button className="btn primary" disabled={!file || busy}>{busy ? 'Uploading…' : 'Upload & Assign'}</button>
        </form>
        {error && <div className="alert error">{error}</div>}
      </div>

      {report && (
        <div className="card">
          <h3>Result</h3>
          <div className="stats">
            <div className="stat present"><span>{report.updated}</span>Updated</div>
            <div className="stat"><span>{report.notFound}</span>Code not found</div>
            <div className="stat"><span>{report.unknownBatch}</span>Unknown batch</div>
            <div className="stat absent"><span>{report.errors}</span>Errors</div>
          </div>
          <table className="table">
            <thead><tr><th>Employee Code</th><th>Batch</th><th>Status</th><th>Reason</th></tr></thead>
            <tbody>
              {report.details.map((d, i) => (
                <tr key={i}>
                  <td>{d.employeeCode}</td><td>{d.batch}</td>
                  <td><span className={`pill ${d.status === 'updated' ? 'present' : 'absent'}`}>{d.status}</span></td>
                  <td className="muted">{d.reason || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
