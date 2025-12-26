// api-config.js
// Em produção, defina ANTES de carregar as páginas:
// <script>window.__API_BASE__ = "https://SEU-DOMINIO.com";</script>

const API_BASE_URL = (() => {
  const base =
    (typeof window !== 'undefined' && window.__API_BASE__)
      ? String(window.__API_BASE__)
      : '/api';
  return base.replace(/\/+$/, ''); // sem barra final
})();

// --- Auth (para rotas internas do seu sistema) ---
function getAuthToken() {
  try {
    // Procuramos em chaves comuns e também aceitamos JSON {token:"..."}
    const keys = [
      'auth:token', 'token', 'authToken', 'session.token', 'jwt', 'api:token'
    ];
    for (const k of keys) {
      let raw = localStorage.getItem(k);
      if (!raw) raw = sessionStorage.getItem(k);
      if (!raw) continue;

      // Se for JSON, tenta extrair .token
      try {
        const maybe = JSON.parse(raw);
        if (maybe && typeof maybe === 'object' && maybe.token) {
          return String(maybe.token);
        }
      } catch {}
      return String(raw);
    }
    return null;
  } catch {
    return null;
  }
}

function getAuthHeaders(extra = {}) {
  const token = getAuthToken();
  const base = { 'Content-Type': 'application/json', ...extra };
  // Só adiciona Authorization se houver token (evita preflight desnecessário)
  return token ? { ...base, 'Authorization': `Bearer ${token}` } : base;
}

// --- Helper de QS ---
function toQS(obj) {
  if (!obj) return '';
  const params = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v == null || v === '') return;
    params.append(k, String(v));
  });
  const s = params.toString();
  return s ? `?${s}` : '';
}

// --- Monta URLs da API (aceita path absoluto ou relativo) ---
function apiUrl(path = '', qs) {
  const p = String(path || '');
  const isAbs = /^https?:\/\//i.test(p);
  const url = isAbs ? p : `${API_BASE_URL}/${p.replace(/^\/+/, '')}`;
  return url + (qs ? toQS(qs) : '');
}

// Base getter (útil para outros módulos)
function apiBase() {
  return API_BASE_URL;
}
// === GET /leads/:id — helper para buscar um lead específico ===
export async function getLeadById(id) {
  if (!id) return null;
  try {
    const url = apiUrl(`/leads/${id}`);
    const resp = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!resp.ok) {
      console.warn('[API] Falha ao buscar lead por id:', resp.status);
      return null;
    }

    let data = await resp.json().catch(() => null);
    if (!data) return null;

    // Aceita tanto { data: {..} } quanto objeto direto
    return data.data || data.lead || data;
  } catch (e) {
    console.warn('[API] Erro inesperado em getLeadById()', e);
    return null;
  }
}

// === GET /leads — usado pelo funil (funil-leads.js) ===
export async function getLeadsAll(filtros = {}) {
  try {
    // Monta a URL: base da API + /leads + filtros na querystring (se tiver)
    const url = apiUrl('/leads', filtros);

    const resp = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!resp.ok) {
      console.warn('[API] Falha ao listar leads:', resp.status);
      return [];
    }

    let data = await resp.json().catch(() => null);

    // Aceita tanto { data: [...] } quanto { items: [...] } quanto array direto
    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.data)) {
      return data.data;
    }
    if (data && Array.isArray(data.items)) {
      return data.items;
    }

    return [];
  } catch (e) {
    console.warn('[API] Erro inesperado em getLeadsAll()', e);
    return [];
  }
}

// === POST /leads/historico — registra item na timeline do lead ===
export async function postLeadHistorico(leadId, item = {}) {
  try {
    if (!leadId) return;

    const payload = {
      leadId: String(leadId),
      item: item || {},
    };

    const url = apiUrl('/leads/historico');

    const resp = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      console.warn('[API] Falha ao registrar histórico do lead:', resp.status);
    }
  } catch (e) {
    console.warn('[API] Erro inesperado em postLeadHistorico()', e);
  }
}

if (typeof window !== 'undefined') {
  window.getLeadsAll      = getLeadsAll;
  window.postLeadHistorico = postLeadHistorico;
  window.getLeadById      = getLeadById;
}


// Exporte para uso no remote-adapter e demais módulos
export { apiBase, apiUrl, getAuthHeaders, getAuthToken };
