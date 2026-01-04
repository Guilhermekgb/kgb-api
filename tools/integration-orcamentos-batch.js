(async()=>{
  const base = process.env.API_BASE || 'http://127.0.0.1:3333';
  function requireApiFetch(){ if (typeof globalThis === 'undefined' || typeof globalThis['apiFetch'] !== 'function') throw new Error('api_unavailable'); return globalThis['apiFetch']; }
  const results = { created:0, updated:0, errors:[] };
  const wait = ms => new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<10;i++){
    try{
      const lead = { nome: `BatchTest ${Date.now()}_${i}`, telefone: `119000${Math.floor(Math.random()*9000)}`, email: `batch${Date.now()}_${i}@example.com`, id: `tmp-${Date.now()}-${i}` };
      const apiFetch = requireApiFetch();
      let _raw = await apiFetch(base + '/leads', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(lead)});
      // normalize
      let r = (_raw && typeof _raw === 'object' && 'status' in _raw) ? _raw : { status: (_raw && _raw.ok) ? 200 : 500, text: async ()=> JSON.stringify(_raw) };
      if (r.status !== 200) { results.errors.push({step:'post_lead',status:r.status,body: await (r.text ? r.text().catch(()=>'' ) : Promise.resolve(''))}); continue; }
      results.created += 0.5; // counting half for lead
      // create orcamento
      const orc = { leadId: lead.id, dados: { valor_cents: 1000 + i, descricao: `Batch ${i}` } };
      _raw = await apiFetch(base + '/orcamentos', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(orc)});
      r = (_raw && typeof _raw === 'object' && 'status' in _raw) ? _raw : { status: (_raw && _raw.ok) ? 200 : 500, json: async ()=> _raw };
      if (r.status !== 200) { results.errors.push({step:'post_orc',status:r.status,body: await (r.text ? r.text().catch(()=>'' ) : Promise.resolve(''))}); continue; }
      const orcBody = await (r.json ? r.json().catch(()=>null) : Promise.resolve(null));
      const id = orcBody?.orcamento?.id || orcBody?.data?.id || orcBody?.id;
      if (!id) { results.errors.push({step:'no_id',body: orcBody}); continue; }
      results.created += 0.5; // complete created count
      // upsert update
      const upd = { id, leadId: lead.id, dados: { valor_cents: 2000 + i, descricao: `Batch updated ${i}` } };
      _raw = await apiFetch(base + '/orcamentos', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(upd)});
      r = (_raw && typeof _raw === 'object' && 'status' in _raw) ? _raw : { status: (_raw && _raw.ok) ? 200 : 500, text: async ()=> JSON.stringify(_raw) };
      if (r.status !== 200) { results.errors.push({step:'upsert_orc',status:r.status,body: await (r.text ? r.text().catch(()=>'' ) : Promise.resolve(''))}); continue; }
      results.updated += 1;
      // small pause
      await wait(200);
    }catch(e){ results.errors.push({step:'exception', error: String(e)}); }
  }
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
})();
