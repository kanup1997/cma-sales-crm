import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  //   const [email, setEmail] = useState('admin@chocomanualart.com');
  // const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(email, password); navigate('/'); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <div className="login-page">
    <div className="login-card">
      <div className="login-brand"><div className="brand-mark large">CMA</div><div><h1>ChocoManualART</h1><p>Sales CRM</p></div></div>
      <h2>Sign in</h2><p className="muted">Track every lead and every follow-up from one place.</p>
      {error && <div className="alert error">{error}</div>}
      <form onSubmit={submit} className="form-stack">
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        <button className="btn btn-primary full" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
      </form>
      {/* <div className="demo-box"><strong>Demo accounts</strong><span>Admin: admin@chocomanualart.com / Admin@123</span><span>Sales: sales@chocomanualart.com / Sales@123</span></div> */}
    </div>
  </div>;
}
