// Teste automático: cria lead, cria orçamento, arquiva lead e valida via API
// Teste automático: cria lead, cria orçamento, arquiva lead e valida via API
(async ()=>{
  // wrapper portal-safe para substituir uso direto de fetch
  function apiRequest(url, options){
    try{ if (typeof window !== 'undefined' && typeof window.apiFetch === 'function') return window.apiFetch(url, options); }catch(e){}
    return fetch(url, options);
  }
  const base = process.env.BASE || 'http://127.0.0.1:3333';
  const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
  const probe = async () => {
    for(let i=0;i<15;i++){
      try{ const r = await apiRequest(base + '/'); if (r.ok || r.status===404) return true; }catch(e){}
      await sleep(500);
    }
    return false;
  };

  if (!await probe()){ console.error('Servidor não respondeu em', base); process.exit(2); }

  try{
    const lead = { id: 'test-'+Date.now(), nome: 'Teste automatizado', telefone: '11999990000', email: 'test@local' };
    console.log('POST /leads ->', lead.id);
    let r = await apiRequest(base + '/leads', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(lead) });
    if (!r.ok) { console.error('POST /leads falhou', r.status); process.exit(3); }
    const jr = await r.json().catch(()=>null);
    const created = (jr && (jr.data||jr.lead||jr)) || lead;
    const leadId = created.id || lead.id;
    console.log('leadId =', leadId);

    // cria orçamento
    const orcPayload = { leadId: String(leadId), dados: { valor: 150 } };
    r = await apiRequest(base + '/orcamentos', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(orcPayload) });
    if (!r.ok) { console.error('POST /orcamentos falhou', r.status); process.exit(4); }
    const jr2 = await r.json().catch(()=>null);
    const orcId = (jr2 && (jr2.orcamento?.id || jr2.data?.id || jr2.id)) || 'unknown';
    console.log('orcamento criado', orcId);

    // arquiva o lead via PUT /leads/:id
    r = await apiRequest(base + '/leads/' + encodeURIComponent(leadId), { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: 'arquivado' }) });
    if (!r.ok) { console.error('PUT /leads/:id falhou', r.status); process.exit(5); }
    console.log('lead arquivado');

    // obtém leads e valida status
    r = await apiRequest(base + '/leads');
    if (!r.ok) { console.error('GET /leads falhou', r.status); process.exit(6); }
    const list = await r.json().catch(()=>null);
    const arr = Array.isArray(list) ? list : (list?.data || []);
    const found = arr.find(x => String(x.id) === String(leadId));
    if (!found) { console.error('Lead não apareceu na lista'); process.exit(7); }
    console.log('lead status after archive =', found.status);
    if (!String(found.status || '').toLowerCase().includes('arquiv')) { console.error('Status não é arquivado'); process.exit(8); }

    console.log('TEST OK');
    process.exit(0);
  }catch(e){ console.error('Erro no teste', e); process.exit(99); }

})();
