import { useEffect, useState } from 'react';
import api from '../api';

export default function SmsHistory() {
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.get('/sms/history').then((r) => setLogs(r.data.logs)).catch(() => {});
  }, []);

  return (
    <div>
      <h2>SMS History</h2>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>When</th><th>Batch</th><th>Date</th><th>Sent</th><th>Already sent</th><th>Failed</th><th>No phone</th><th>By</th><th></th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l._id}>
                <td>{new Date(l.createdAt).toLocaleString()}</td>
                <td>{l.batchName}</td>
                <td>{l.date}</td>
                <td>{l.sent}</td>
                <td>{l.skippedAlreadySent ?? 0}</td>
                <td>{l.failed}</td>
                <td>{l.skippedNoPhone}</td>
                <td className="muted">{l.sentByName}</td>
                <td><button className="btn ghost" onClick={() => setOpen(open === l._id ? null : l._id)}>
                  {open === l._id ? 'Hide' : 'Details'}
                </button></td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan="9" className="muted center">No SMS sent yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (() => {
        const l = logs.find((x) => x._id === open);
        return (
          <div className="card">
            <h3>{l.batchName} — {l.date}</h3>
            <table className="table">
              <thead><tr><th>Code</th><th>Name</th><th>Phone</th><th>Status</th><th>Provider response</th></tr></thead>
              <tbody>
                {l.recipients.map((r, i) => (
                  <tr key={i}>
                    <td>{r.employeeCode}</td><td>{r.name}</td><td>{r.phone}</td>
                    <td><span className={`pill ${r.status === 'sent' ? 'present' : 'absent'}`}>{r.status}</span></td>
                    <td className="muted">{r.providerResponse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}
