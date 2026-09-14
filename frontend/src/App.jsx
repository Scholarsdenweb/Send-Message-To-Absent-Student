import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './pages/Layout';
import Login from './pages/Login';
import Attendance from './pages/Attendance';
import Batches from './pages/Batches';
import Assign from './pages/Assign';
import Users from './pages/Users';
import SmsHistory from './pages/SmsHistory';

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Attendance />} />
        <Route path="batches" element={<Protected roles={['admin']}><Batches /></Protected>} />
        <Route path="assign" element={<Protected roles={['admin']}><Assign /></Protected>} />
        <Route path="users" element={<Protected roles={['admin']}><Users /></Protected>} />
        <Route path="sms-history" element={<SmsHistory />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
