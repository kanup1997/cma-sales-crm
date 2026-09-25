const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';
const pendingReads = new Map();

export function api(path, options = {}) {
  const token = localStorage.getItem('cma_crm_token');
  const method = String(options.method || 'GET').toUpperCase();
  // Share only identical in-flight reads. Completed responses are never cached,
  // so manual refreshes still fetch fresh data. Abortable requests stay independent.
  const share = method === 'GET' && !options.signal && !options.body;
  const {headers: suppliedHeaders, silent, ...requestOptions} = options;
  const key = share ? JSON.stringify([path, token, [...new Headers(suppliedHeaders).entries()], requestOptions]) : null;
  if (share && pendingReads.has(key)) return pendingReads.get(key);
  if (method !== 'GET') pendingReads.clear();
  const request = sendRequest(path, options, token, method).finally(() => {
    if (share && pendingReads.get(key) === request) pendingReads.delete(key);
  });
  if (share) pendingReads.set(key, request);
  return request;
}

async function sendRequest(path, options, token, method) {
  window.dispatchEvent(new Event('api:start'));
  const headers = new Headers(options.headers);
  if (options.body != null && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
  if (token) headers.set('Authorization',`Bearer ${token}`);

  let response;
  try { response = await fetch(`${API_BASE}${path}`, { ...options, headers }); }
  catch(error){ window.dispatchEvent(new Event('api:end')); throw error; }
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  window.dispatchEvent(new Event('api:end'));
  if (method !== 'GET') pendingReads.clear();
  if (!response.ok) throw new Error(data.message || 'Request failed');
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
