(async ()=>{
  const base = process.env.BASE_URL || 'http://localhost:3333';
  const email = process.env.KGB_EMAIL || 'admin@buffet.com';
  const senha = process.env.KGB_SENHA || '123456';
  const log = (...a)=>console.log('[smoke]',...a);

  function fail(msg, resBody){
    console.error('[smoke][FAIL]', msg);
    if(resBody) console.error('[smoke][BODY]', typeof resBody==='string'?resBody:JSON.stringify(resBody,null,2));
    process.exit(1);
  }

  async function normResponse(res){
    const ct = res.headers.get('content-type') || '';
    const txt = await res.text();
    if(!ct.includes('application/json')){
      // try parse anyway
      try{ const j = JSON.parse(txt); return { json: j, raw: txt }; }catch(e){ fail('Resposta não-JSON recebida', txt); }
    }
    try{ return { json: JSON.parse(txt), raw: txt }; }catch(e){ fail('Falha ao parsear JSON', txt); }
  }

  async function req(method, path, opts={}){
    const url = base + path;
    const h = opts.headers || {};
    const body = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
    if(body) h['content-type'] = 'application/json';
    if(opts.cookie) h['Cookie'] = opts.cookie;
    const res = await fetch(url, { method, headers: h, body });
    const norm = await normResponse(res);
    return { status: res.status, headers: res.headers, body: norm.json, raw: norm.raw };
  }

  try{
    log('1) POST /auth/login');
    const loginRes = await req('POST','/auth/login',{ body:{ email, senha } });
    log('-> status', loginRes.status);
    if(loginRes.status >= 400) fail('/auth/login retornou erro', loginRes.body);

    const setCookie = loginRes.headers.get('set-cookie') || loginRes.headers.get('Set-Cookie');
    if(!setCookie){ fail('Cookie de sessão não encontrado em /auth/login', loginRes.body); }
    const cookie = setCookie.split(';')[0];

    // helper para chamadas autenticadas
    const auth = (m,p,b)=> req(m,p,{ body:b, cookie });

    log('2) GET /feiras');
    const gFeiras = await auth('GET','/feiras');
    if(gFeiras.status !== 200) fail('GET /feiras retornou status != 200', gFeiras.body);
    log('-> body:', Array.isArray(gFeiras.body.data)?`items=${gFeiras.body.data.length}`:JSON.stringify(gFeiras.body));

    log('3) POST /feiras (criar)');
    const feiraPayload = { nome: 'FEIRA_SMOKE_TEST_'+Date.now(), dataFeira: '2030-01-01' };
    const pFeira = await auth('POST','/feiras', feiraPayload);
    if(pFeira.status !== 200 && pFeira.status !== 201) fail('POST /feiras falhou', pFeira.body);
    const feira = pFeira.body.data || pFeira.body.item || pFeira.body;
    if(!feira || !feira.id) fail('POST /feiras não retornou id', pFeira.body);
    log('-> created id', feira.id);

    log('4) PUT /feiras/:id (atualizar)');
    const upd = await auth('PUT',`/feiras/${feira.id}`, { nome: feira.nome + ' (edit)' });
    if(upd.status !== 200) fail('PUT /feiras/:id falhou', upd.body);

    log('5) GET /feiraLeads');
    const gFL = await auth('GET','/feiraLeads');
    if(gFL.status !== 200) fail('GET /feiraLeads falhou', gFL.body);

    log('6) POST /leads (criar lead)');
    const leadPayload = { nome:'Lead SMOKE', telefone:'11999990000', origemTipo:'feira', feiraId:feira.id, feiraNome:feira.nome };
    const pLead = await auth('POST','/leads', leadPayload);
    if(pLead.status !== 200 && pLead.status !== 201) fail('POST /leads falhou', pLead.body);
    const lead = pLead.body.data || pLead.body.item || pLead.body;
    if(!lead || !lead.id) fail('POST /leads não retornou id', pLead.body);
    log('-> lead id', lead.id);

    log('7) PUT /leads/:id (atualizar)');
    const updLead = await auth('PUT',`/leads/${lead.id}`, { observacoes: 'smoke test update' });
    if(updLead.status !== 200) fail('PUT /leads/:id falhou', updLead.body);

    log('8) POST /feiraLeads (criar relação)');
    const flPayload = { feiraId: feira.id, feiraNome: feira.nome, nome: lead.nome, telefone: lead.telefone, leadIdNoFunil: lead.id };
    const pFL = await auth('POST','/feiraLeads', flPayload);
    if(pFL.status !== 200 && pFL.status !== 201) fail('POST /feiraLeads falhou', pFL.body);
    const fl = pFL.body.data || pFL.body.item || pFL.body;
    if(!fl || !fl.id) fail('POST /feiraLeads não retornou id', pFL.body);
    log('-> feiraLead id', fl.id);

    log('9) PUT /feiraLeads/:id (atualizar)');
    const updFL = await auth('PUT',`/feiraLeads/${fl.id}`, { observacoes: 'smoke' });
    if(updFL.status !== 200) fail('PUT /feiraLeads/:id falhou', updFL.body);

    log('10) GET /feiraLeads (confirma relação)');
    const gFL2 = await auth('GET','/feiraLeads');
    if(gFL2.status !== 200) fail('GET /feiraLeads segunda falhou', gFL2.body);
    const list = gFL2.body.data || gFL2.body.items || gFL2.body;
    const found = Array.isArray(list) && list.some(x => String(x.id) === String(fl.id));
    if(!found) fail('Registro criado não encontrado em GET /feiraLeads', gFL2.body);

    log('SMOKE OK — todas as rotas passam');
    process.exit(0);
  }catch(e){
    console.error('[smoke][ERROR]', e && e.stack ? e.stack : e);
    process.exit(1);
  }
})();
