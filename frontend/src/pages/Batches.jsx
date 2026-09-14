import { useEffect, useState } from 'react';
import api from '../api';

export default function Batches() {
  const [batches, setBatches] = useState([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  async function load() {
    const r = await api.get('/batches');
    setBatches(r.data.batches);
  }
  useEffect(() => { load().catch(() => {}); }, []);

  async function remove(b) {
    if (!confirm(`Delete batch "${b.name}" (${b.code})? This cannot be undone.`)) return;
    setDeletingId(b.batchId); setMsg(null);
    try {
      await api.delete(`/batches/${b.batchId}`);
      setMsg({ type: 'success', text: `Batch "${b.name}" deleted.` });
      await load();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Failed to delete batch' });
    } finally {
      setDeletingId(null);
    }
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api.post('/batches', { name, code, description });
      setName(''); setCode(''); setDescription('');
      setMsg({ type: 'success', text: 'Batch created.' });
      await load();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Failed to create batch' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Batches</h2>
      <p className="muted">A batch is stored as a Department in eTimeTrackLite.</p>

      <div className="card">
        <h3>Create batch</h3>
        <form className="form-grid" onSubmit={create}>
          <div className="field">
            <label>Batch name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Class 11 Science Morning" required />
          </div>
          <div className="field">
            <label>Batch code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="C11-SCI-M" required />
          </div>
          <div className="field">
            <label>Description (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
        </form>
        {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      </div>

      <div className="card">
        <h3>Existing batches</h3>
        <p className="muted">A batch can be deleted only when no student is assigned to it.</p>
        <table className="table">
          <thead><tr><th>ID</th><th>Name</th><th>Code</th><th>Students</th><th></th></tr></thead>
          <tbody>
            {batches.map((b) => {
              const isDefault = String(b.name).trim().toLowerCase() === 'default';
              const canDelete = b.studentCount === 0 && !isDefault;
              return (
                <tr key={b.batchId}>
                  <td>{b.batchId}</td><td>{b.name}</td><td>{b.code}</td><td>{b.studentCount}</td>
                  <td>
                    <button
                      className="btn danger"
                      disabled={!canDelete || deletingId === b.batchId}
                      title={isDefault ? 'The Default department cannot be deleted' : (b.studentCount > 0 ? 'Reassign its students first' : 'Delete this batch')}
                      onClick={() => remove(b)}
                    >
                      {deletingId === b.batchId ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {batches.length === 0 && <tr><td colSpan="5" className="muted center">No batches yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
