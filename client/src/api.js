const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

export async function api(path, options = {}) {
  window.dispatchEvent(new Event('api:start'));
  const token = localStorage.getItem('cma_crm_token');
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try { response = await fetch(`${API_BASE}${path}`, { ...options, headers }); }
  catch(error){ window.dispatchEvent(new Event('api:end')); throw error; }
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  window.dispatchEvent(new Event('api:end'));
  if (!response.ok) throw new Error(data.message || 'Request failed');
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET' && path !== '/auth/login' && !options.silent) {
    const message = data.message || (path.includes('/import') ? `${data.imported || 0} leads imported successfully` : 'Changes saved successfully');
    window.dispatchEvent(new CustomEvent('app:success', { detail: { message } }));
    if(path.startsWith('/masters')) window.dispatchEvent(new Event('masters:changed'));
  }
  return data;
}

export async function downloadApi(path, fallbackName='export.csv'){
  const token=localStorage.getItem('cma_crm_token');
  const response=await fetch(`${API_BASE}${path}`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
  if(!response.ok){let data={};try{data=await response.json();}catch{}throw new Error(data.message||'Export failed');}
  const blob=await response.blob();const disposition=response.headers.get('Content-Disposition')||'';const match=disposition.match(/filename="?([^";]+)"?/);const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=match?.[1]||fallbackName;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
}

export async function getApiFile(path, fallbackName='document.pdf'){
  const token=localStorage.getItem('cma_crm_token');
  const response=await fetch(`${API_BASE}${path}`,{headers:token?{Authorization:`Bearer ${token}`}:{}});
  if(!response.ok){let data={};try{data=await response.json();}catch{}throw new Error(data.message||'Unable to prepare the document');}
  const blob=await response.blob();const disposition=response.headers.get('Content-Disposition')||'';const match=disposition.match(/filename="?([^";]+)"?/);
  return{blob,name:match?.[1]||fallbackName};
}
