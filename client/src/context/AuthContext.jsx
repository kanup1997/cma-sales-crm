import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('cma_crm_token');
    if (!token) { setLoading(false); return; }
    api('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => localStorage.removeItem('cma_crm_token'))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    localStorage.setItem('cma_crm_token', data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('cma_crm_token');
    setUser(null);
  }
  async function updateProfile(values){const data=await api('/auth/profile',{method:'PATCH',body:JSON.stringify(values)});setUser(data.user);return data.user;}

  const legacy={PAGE_NOT_INTERESTED:'PAGE_LEADS',PAGE_DAILY_WORK:'PAGE_REPORTS',PAGE_PURCHASE_ORDERS:'PAGE_ORDERS',PAGE_TAX_INVOICES:'PAGE_ORDERS'};
  const can=permission=>!!user&&(user.role==='ADMIN'||user.permissions?.includes(permission)||(legacy[permission]&&user.permissions?.includes(legacy[permission])));
  const value = useMemo(() => ({ user, loading, login, logout, updateProfile, can }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
