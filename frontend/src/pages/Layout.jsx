import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SD</span>
          <span className="brand-text">
            <strong>Scholars Den</strong>
            <small>Attendance Portal</small>
          </span>
        </div>
        <nav className="nav">
          <NavLink to="/" end>Attendance</NavLink>
          {isAdmin && <NavLink to="/batches">Batches</NavLink>}
          {isAdmin && <NavLink to="/assign">Assign Batch</NavLink>}
          {isAdmin && <NavLink to="/users">Users</NavLink>}
          <NavLink to="/sms-history">SMS History</NavLink>
        </nav>
        <div className="user-box">
          <span className="badge">{user?.role}</span>
          <span className="user-name">{user?.name}</span>
          <button className="btn ghost" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
