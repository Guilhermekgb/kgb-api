(async()=>{
  const base = 'https://kgb-api-v2.onrender.com';
  const results = { created:0, updated:0, errors:[] };
  const wait = ms => new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<10;i++){
    try{
      const lead = { nome: `BatchTest ${Date.now()}_${i}`, telefone: `119000${Math.floor(Math.random()*9000)}`, email: `batch${Date.now()}_${i}@example.com`, id: `tmp-${Date.now()}-${i}` };
      let r = await fetch(base + '/leads', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(lead)});
      if (r.status !== 200) { results.errors.push({step:'post_lead',status:r.status,body: await r.text().catch(()=>'')}); continue; }
      results.created += 0.5; // counting half for lead
      // create orcamento
      const orc = { leadId: lead.id, dados: { valor_cents: 1000 + i, descricao: `Batch ${i}` } };
      r = await fetch(base + '/orcamentos', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(orc)});
      if (r.status !== 200) { results.errors.push({step:'post_orc',status:r.status,body: await r.text().catch(()=>'')}); continue; }
      const orcBody = await r.json().catch(()=>null);
      const id = orcBody?.orcamento?.id || orcBody?.data?.id || orcBody?.id;
      if (!id) { results.errors.push({step:'no_id',body: orcBody}); continue; }
      results.created += 0.5; // complete created count
      // upsert update
      const upd = { id, leadId: lead.id, dados: { valor_cents: 2000 + i, descricao: `Batch updated ${i}` } };
      r = await fetch(base + '/orcamentos', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(upd)});
      if (r.status !== 200) { results.errors.push({step:'upsert_orc',status:r.status,body: await r.text().catch(()=>'')}); continue; }
      results.updated += 1;
      // small pause
      await wait(200);
    }catch(e){ results.errors.push({step:'exception', error: String(e)}); }
  }
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
})();
