// smoke-write-eventos-pagos.js
(async()=>{
  const base = process.env.KGB_BASE || 'http://localhost:3333';
  const email = process.env.KGB_EMAIL || 'admin@buffet.com';
  const senha = process.env.KGB_SENHA || '123456';
  const fetchOpts = { headers: { 'content-type':'application/json' }, redirect: 'manual' };

  const loginRes = await fetch(base + '/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }), headers: fetchOpts.headers });
  console.log('POST /auth/login =>', loginRes.status);
  const setCookie = loginRes.headers.get('set-cookie');
  if (!setCookie) {
    console.error('Login não retornou cookie. Saindo.'); process.exit(1);
  }
  const cookie = setCookie.split(';')[0];

  // Create ingresso-tipo
  const tipoBody = { eventoId: '1', nome: 'Tipo Teste', preco_cents: 1000 };
  const tipoRes = await fetch(base + '/ingresso-tipos', { method: 'POST', body: JSON.stringify(tipoBody), headers: { ...fetchOpts.headers, cookie } });
  console.log('POST /ingresso-tipos =>', tipoRes.status);
  const tipoJson = await tipoRes.json().catch(()=>null);
  console.log('tipo result:', tipoJson && tipoJson.data ? tipoJson.data : tipoJson);
  const tipoId = tipoJson && tipoJson.data && tipoJson.data.id ? tipoJson.data.id : (tipoJson && tipoJson.items && tipoJson.items[0] && tipoJson.items[0].id ? tipoJson.items[0].id : null);
  if (!tipoId) { console.error('Falha ao criar tipo. Saindo.'); process.exit(1); }

  // Bulk tickets
  const bulkBody = { eventoId: '1', tipoId, qtd: 5, digits: 4 };
  const bulkRes = await fetch(base + '/tickets/bulk', { method: 'POST', body: JSON.stringify(bulkBody), headers: { ...fetchOpts.headers, cookie } });
  console.log('POST /tickets/bulk =>', bulkRes.status);
  const bulkJson = await bulkRes.json().catch(()=>null);
  console.log('bulk result count:', bulkJson && bulkJson.tickets ? bulkJson.tickets.length : (bulkJson && bulkJson.items ? bulkJson.items.length : 0));

  // Verify GET tickets
  const getRes = await fetch(base + '/tickets?eventoId=1', { headers: { cookie } });
  console.log('GET /tickets?eventoId=1 =>', getRes.status);
  const getJson = await getRes.json().catch(()=>null);
  console.log('total tickets for evento 1:', (getJson && (getJson.tickets || getJson.items)) ? (getJson.tickets || getJson.items).length : 0);

  process.exit(0);
})();
