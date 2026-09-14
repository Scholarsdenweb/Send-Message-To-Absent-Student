import { useEffect, useState } from 'react';
import api from '../api';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api.get('/auth/users');
    setUsers(r.data.users);
  }
  useEffect(() => { load().catch(() => {}); }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function create(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await api.post('/auth/users', form);
      setForm({ name: '', email: '', password: '', role: 'member' });
      setMsg({ type: 'success', text: 'User created.' });
      await load();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Failed to create user' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Users</h2>
      <div className="card">
        <h3>Create user</h3>
        <form className="form-grid" onSubmit={create}>
          <div className="field"><label>Name</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required /></div>
          <div className="field"><label>Email</label>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required /></div>
          <div className="field"><label>Password</label>
            <input type="text" value={form.password} onChange={(e) => set('password', e.target.value)} required /></div>
          <div className="field"><label>Role</label>
            <select value={form.role} onChange={(e) => set('role', e.target.value)}>
              <option value="member">member (send SMS, view)</option>
              <option value="admin">admin (full access)</option>
            </select>
          </div>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Create'}</button>
        </form>
        {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      </div>

      <div className="card">
        <h3>All users</h3>
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td><td>{u.email}</td>
                <td><span className="badge">{u.role}</span></td>
                <td className="muted">{u.lastLogin ? new Date(u.lastLogin).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
