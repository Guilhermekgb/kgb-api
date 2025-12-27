// auditoria.js
(() => {
  'use strict';

  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

  // ----------------- Helpers gerais -----------------
  function toISODate(d){
    try { return new Date(d).toISOString().slice(0,10); } catch { return ''; }
  }
  function fmtDate(ts){
    const d = new Date(Number(ts||0));
    if (isNaN(d)) return '';
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,'0');
    const min = String(d.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }
  function readFilters(){
    const from = $('#f-from')?.value ? new Date($('#f-from').value) : null;
    const to   = $('#f-to')?.value   ? new Date($('#f-to').value)   : null;
    return {
      from: from ? toISODate(from) : undefined,
      // inclui o dia todo no "to"
      to:   to   ? toISODate(new Date(to.getTime()+24*60*60*1000-1)) : undefined,
      entity:   ($('#f-entity')?.value || undefined),
      actor:    ($('#f-actor')?.value  || undefined),
     tenantId: ($('#f-tenant')?.value || localStorage.getItem('tenantId') || 'default'),

    };
  }
  function objToQuery(obj){
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k,v]) => {
      if (v === undefined || v === null || v === '') return;
      p.set(k, String(v));
    });
    return p.toString();
  }

  // ----------------- Camada de API -----------------
  /**
   * Tenta: (1) API remota via fetch GET com querystring, se __API_BASE__ estiver definido;
   *        (2) handler híbrido window.handleRequest (que decide entre remoto/local);
   *        (3) handler local window.handleRequestLocal.
   * Sempre retorna {status, data?, error?}.
   */
  async function api(path, { method='GET', body=null } = {}) {
    const base = (typeof window !== 'undefined' && window.__API_BASE__) ? String(window.__API_BASE__) : '';
// headers/identidade padrão
const __tenant = (localStorage.getItem('tenantId') || 'default');
const __token  = (localStorage.getItem('auth.token') || '');
const baseHeaders = { 'Accept': 'application/json', 'x-tenant-id': __tenant };
if (__token) baseHeaders['authorization'] = 'Bearer ' + __token;

    // 1) Se há API base remota → usar fetch como primeira tentativa
    if (base && typeof fetch === 'function') {
      try {
        if (method.toUpperCase() === 'GET') {
        // garante tenantId na query
const qs = objToQuery({ ...(body||{}), tenantId: (body?.tenantId || __tenant) });
const url = base.replace(/\/+$/,'') + path + (qs ? ('?' + qs) : '');
const r = await fetch(url, { method: 'GET', headers: baseHeaders });

          if (!r.ok) throw new Error('HTTP ' + r.status);
          const json = await r.json().catch(()=>null);
          // Normaliza formato
          return { status: 200, data: Array.isArray(json) ? json : (json?.data ?? json ?? []) };
        } else {
          // Para outras rotas futuras, se precisar POST
   const url = base.replace(/\/+$/,'') + path;
const r = await fetch(url, {
  method,
  headers: { ...baseHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...(body||{}), tenantId: (body?.tenantId || __tenant) })
});

          const json = await r.json().catch(()=>null);
          return { status: r.status, data: json?.data ?? json, error: json?.error };
        }
      } catch (e) {
        console.warn('[Auditoria] fetch remoto falhou, tentando handlers locais →', e?.message || e);
        // cai para handlers abaixo
      }
    }

    // 2) Tenta o dispatcher híbrido exposto (se existir)
    const hybrid = (typeof window !== 'undefined' && typeof window.handleRequest === 'function')
      ? window.handleRequest : null;

    if (hybrid) {
      try {
        const resp = await new Promise((resolve) => {
          hybrid(path, { method, body }, (r) => resolve(r));
        });
        if (resp) return resp;
      } catch (e) {
        console.warn('[Auditoria] handleRequest falhou, tentando handleRequestLocal →', e?.message || e);
      }
    }

    // 3) Fallback: handler local puro
    const local = (typeof window !== 'undefined' && typeof window.handleRequestLocal === 'function')
      ? window.handleRequestLocal : null;

    if (local) {
      try {
        const resp = await new Promise((resolve) => {
          local(path, { method, body }, (r) => resolve(r));
        });
        if (resp) return resp;
      } catch (e) {
        console.error('[Auditoria] handleRequestLocal falhou:', e);
      }
    }

    // 4) Sem opções
    console.warn('[Auditoria] Nenhum handler de API disponível (remoto/local).');
    return { status: 500, error: 'no_api_handler' };
  }

  // ----------------- Estado + Render -----------------
  let rows = [];
  let page = 1;
  const refs = {
    tbody:   $('#tbodyLogs'),
    qtd:     $('#qtdRows'),
    curPage: $('#curPage'),
    totPage: $('#totPage'),
    pageSize: $('#pageSize'),
    emptyStateRow: null
  };

  function ensureEmptyStateRow(){
    if (refs.emptyStateRow) return refs.emptyStateRow;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="6" class="muted" style="padding:14px 10px">Nenhum registro encontrado para os filtros selecionados.</td>`;
    refs.emptyStateRow = tr;
    return tr;
  }

  function render(){
    const ps  = Number(refs.pageSize?.value || 50);
    const tot = Math.max(1, Math.ceil((rows.length || 0) / ps));
    page = Math.min(Math.max(1, page), tot);

    if (refs.qtd)     refs.qtd.textContent = rows.length;
    if (refs.curPage) refs.curPage.textContent = String(page);
    if (refs.totPage) refs.totPage.textContent = String(tot);

    if (!refs.tbody) return;

    const ini = (page-1)*ps;
    const fim = Math.min(ini+ps, rows.length);

    if (!rows.length) {
      refs.tbody.replaceChildren(ensureEmptyStateRow());
      return;
    }

    const frag = document.createDocumentFragment();
    for (let i=ini; i<fim; i++){
      const r = rows[i] || {};
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono">${fmtDate(r.ts)}<div class="muted mono">${r.id||''}</div></td>
        <td><b>${(r.action||'').toUpperCase()}</b></td>
        <td>${r.target||''}</td>
        <td class="mono" style="word-break:break-word">${r.detail||''}</td>
        <td>${r.actor||''}</td>
        <td>${r.tenantId||''}</td>
      `;
      frag.appendChild(tr);
    }
    refs.tbody.replaceChildren(frag);
  }

  // ----------------- Fluxo -----------------
  async function buscar(){
    page = 1;
    const body = readFilters();

    // Chama o endpoint padronizado do backend local: GET /audit/log (com body em rotas locais)
    // e no remoto usamos querystring (implementado acima).
    const resp = await api('/audit/log', { method:'GET', body });

  if (resp?.status === 200) {
  const payload = resp?.data;
  const list = Array.isArray(payload) ? payload
             : (Array.isArray(payload?.items) ? payload.items : []);
  rows = (list || []).slice().sort((a,b)=>Number(b.ts||0)-Number(a.ts||0));
} else {
  rows = [];
  console.warn('[Auditoria] Falha ao carregar registros', {
    status: resp?.status, error: resp?.error,
    preview: Array.isArray(resp?.data?.items) ? resp.data.items.slice(0,2)
           : (Array.isArray(resp?.data) ? resp.data.slice(0,2) : resp?.data)
  });
}

    render();
  }

  // ----------------- Binds -----------------
  $('#btnBuscar')?.addEventListener('click', buscar);
  $('#btnLimpar')?.addEventListener('click', ()=>{
    ['#f-from','#f-to','#f-entity','#f-actor','#f-tenant'].forEach(sel => {
      const el = $(sel); if (el) el.value = '';
    });
    buscar();
  });
  $('#prevPage')?.addEventListener('click', ()=>{ page--; render(); });
  $('#nextPage')?.addEventListener('click', ()=>{ page++; render(); });
  refs.pageSize?.addEventListener('change', ()=>{ page=1; render(); });

  // Auto-carrega últimos 7 dias na entrada
  (function prefillDefaultRange(){
    const to = new Date();
    const from = new Date(to.getTime() - 7*24*60*60*1000);
    if ($('#f-from')) $('#f-from').value = toISODate(from);
    if ($('#f-to'))   $('#f-to').value   = toISODate(to);
  })();

  buscar();
})();

 // === INÍCIO PATCH FF-2 (Auditoria UI) =====================================
(async function(){
  if (typeof apiFetch !== 'function') return;
  const box = document.getElementById('auditLista');
  const btnR = document.getElementById('btnAuditReload');

  async function carregar(){
    try{
      const data = await apiFetch('/audit/log?limit=500', { headers:{'x-tenant-id':'default'} });
      const rows = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
      if (!rows.length){ box.innerHTML = '<div style="color:#6b7280">Sem logs…</div>'; return; }
      box.innerHTML = `
        <table style="width:100%; border-collapse:collapse">
          <thead>
            <tr style="text-align:left; color:#5a3e2b">
              <th style="border-bottom:1px solid #e8dcc9; padding:8px">Data/Hora</th>
              <th style="border-bottom:1px solid #e8dcc9; padding:8px">Ação</th>
              <th style="border-bottom:1px solid #e8dcc9; padding:8px">Entidade</th>
              <th style="border-bottom:1px solid #e8dcc9; padding:8px">Actor</th>
              <th style="border-bottom:1px solid #e8dcc9; padding:8px">Payload</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r=>`
              <tr>
                <td style="border-bottom:1px solid #f0e8da; padding:8px">${(r.ts||r.ts_iso||'').toString().replace('T',' ').slice(0,19)}</td>
                <td style="border-bottom:1px solid #f0e8da; padding:8px">${r.action||'-'}</td>
                <td style="border-bottom:1px solid #f0e8da; padding:8px">${r.entity||'-'}</td>
                <td style="border-bottom:1px solid #f0e8da; padding:8px">${r.actor||'-'}</td>
                <td style="border-bottom:1px solid #f0e8da; padding:8px; font-family:ui-monospace,Menlo,Consolas">${(() => {
                  try{ return esc(JSON.stringify(r.payload ?? r, null, 0)); }catch{ return '-'; }
                })()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    }catch(e){
      console.warn('[Auditoria] falhou:', e);
      box.innerHTML = '<div style="color:#dc2626">Erro ao carregar logs.</div>';
    }
  }

  btnR?.addEventListener('click', carregar);
  carregar();
})();
// === FIM PATCH FF-2 ========================================================
// === INÍCIO PATCH FF-2 (Auditoria UI — Exportar CSV CLIENT-SIDE) ===
(function auditoriaExportCSVClient(){
  const btn = document.getElementById('btnExportarCsv') 
            || document.querySelector('[data-audit-export]');
  if (!btn) return;
  if (btn.__bound) return; btn.__bound = true;

  // Utiliza a mesma camada de API já usada pela página
  btn.addEventListener('click', async () => {
    try{
      // 1) Busca os logs (limit alto para exportar bastante)
      // Se você quiser, ajuste o limit
      const base = (typeof window.__API_BASE__ === 'string') ? window.__API_BASE__ : '';
      let rows = [];
      try{
        if (typeof apiFetch === 'function') {
          const data = await apiFetch('/audit/log?limit=10000', { headers:{'x-tenant-id':'default'} });
          rows = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
        }
      }catch(e){
        console.warn('[Audit] fallback via fetch GET /audit/log', e);
        const qs = new URLSearchParams({ limit:'10000', tenantId: (localStorage.getItem('tenantId')||'default') });
        const r = await fetch((base||'') + '/audit/log?' + qs.toString(), { headers:{'x-tenant-id':'default'} });
        if (r.ok) rows = await r.json();
      }

      if (!Array.isArray(rows) || rows.length===0){
        alert('Não há registros para exportar.');
        return;
      }

      // 2) Converte para CSV (com escaping simples de aspas)
      const esc = (v) => {
        const s = (v==null) ? '' : String(v);
        return `"${s.replace(/"/g,'""')}"`;
      };
      const header = ['ts','action','entity','actor','tenant','detail'];
      const lines = [header.join(',')];

      for (const r of rows){
        const ts     = (r.ts || r.ts_iso || '').toString().replace('T',' ').slice(0,19);
        const action = r.action || r.type || '';
        const entity = r.entity || (r.meta?.entity) || r.target || '';
        const actor  = r.actor  || (r.meta?.actor || r.meta?.user || r.meta?.email) || '';
        const tenant = r.tenantId || r.tenant || (r.meta?.tenant) || '';
        let detail   = r.detail || r.msg || r.message || '';
        try{
          if (!detail && r.payload) detail = JSON.stringify(r.payload);
        }catch{}

        lines.push([
          esc(ts),
          esc(action),
          esc(entity),
          esc(actor),
          esc(tenant),
          esc(detail)
        ].join(','));
      }

      const csv = lines.join('\r\n');

      // 3) Dispara o download
      const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `auditoria-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }catch(e){
      console.warn('Export CSV auditoria (client) falhou:', e);
      alert('Não foi possível exportar agora.');
    }
  });
})();
// === FIM PATCH FF-2 (CLIENT-SIDE) ===

