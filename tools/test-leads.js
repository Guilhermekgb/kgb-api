(async()=>{
  const base = process.env.API_BASE || 'http://127.0.0.1:3333';
  console.log('API_BASE=', base);
  try {
    let r = await fetch(base + '/leads');
    console.log('\nGET /leads', r.status);
    const listText = await r.text().catch(()=>null);
    console.log(listText && listText.slice ? listText.slice(0,2000) : listText);

    const lead = { id: 'tmp-' + Date.now(), nome: 'Teste Auto', telefone: '11900000000', email: 'auto@test.local' };
    r = await fetch(base + '/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) });
    console.log('\nPOST /leads', r.status);
    const postBody = await r.json().catch(()=>null);
    console.log(postBody);

    const newId = (postBody && (postBody.id || postBody._id || postBody.lead?.id || postBody.leadId)) || lead.id;
    const update = { nome: lead.nome + ' (atualizado)', telefone: lead.telefone };
    r = await fetch(base + '/leads/' + encodeURIComponent(newId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
    console.log('\nPUT /leads/' + newId, r.status);
    console.log(await r.text().catch(()=>''));

    r = await fetch(base + '/leads');
    console.log('\nGET /leads (final)', r.status);
    const final = await r.text().catch(()=>null);
    console.log(final && final.slice ? final.slice(0,2000) : final);
    process.exit(0);
  } catch(e) {
    console.error('Erro no teste:', e);
    process.exit(2);
  }
})();
