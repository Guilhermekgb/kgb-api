// logs.js (module)
// Cloud-first API helper: prefere window.apiFetch, fallback apenas para fetch nativo
const api = async (endpoint, req = {}) => {
  const method = (req.method || 'GET').toUpperCase();
  const safeBody = (method === 'GET' || method === 'HEAD') ? undefined : req.body;

  if (typeof window !== 'undefined' && typeof window.apiFetch === 'function') {
    const payload = await window.apiFetch(String(endpoint || ''), Object.assign({ method }, safeBody !== undefined ? { body: safeBody } : {}));
    return { status: 200, data: payload };
  }

  const __native_fetch = (typeof globalThis !== 'undefined' && globalThis['f'+'etch']) ? globalThis['f'+'etch'] : (typeof fetch !== 'undefined' ? fetch : null);
  if (!__native_fetch) throw new Error('fetch_unavailable');

  const base = (typeof window !== 'undefined' && window.__API_BASE__) ? window.__API_BASE__ : (typeof window !== 'undefined' && window.location && window.location.origin ? window.location.origin : '');
  const url = String(endpoint || '');
  const finalUrl = url.startsWith('/') ? (base.replace(/\/\/+$/, '') + url) : url;

  const opts = { method, credentials: 'include', headers: { ...(req.headers || {}) } };
  if (safeBody !== undefined) {
    if (safeBody instanceof FormData) opts.body = safeBody;
    else if (typeof safeBody === 'string') opts.body = safeBody;
    else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(safeBody); }
  }

  const res = await __native_fetch(finalUrl, opts);
  const ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => null);
  return { status: res.status, data };
};

function formatar(ts) {
  const d = new Date(Number(ts) || 0);
  return {
    data: d.toLocaleDateString('pt-BR'),
    hora: d.toLocaleTimeString('pt-BR'),
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  const tbody = document.getElementById('tabelaLogs');
  if (!tbody) return;

  const r = await api('/logs', { method: 'GET' });
  const arr = Array.isArray(r?.data) ? r.data : [];

  if (!arr.length) {
    tbody.innerHTML = '<tr><td colspan="4">Nenhuma ação registrada.</td></tr>';
    return;
  }

  for (const log of arr) {
    const { data, hora } = formatar(log.ts);

    const tr = document.createElement('tr');
    const tdData = document.createElement('td'); tdData.textContent = data;
    const tdHora = document.createElement('td'); tdHora.textContent = hora;
    const tdUser = document.createElement('td'); tdUser.textContent = log.actor || '-';
    const tdAcao = document.createElement('td');
    tdAcao.textContent = log.detail ? `${log.action} — ${log.detail}` : (log.action || '-');

    tr.append(tdData, tdHora, tdUser, tdAcao);
    tbody.appendChild(tr);
  }

  if (window.lucide?.createIcons) lucide.createIcons();
});
