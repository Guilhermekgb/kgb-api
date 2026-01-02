(async()=>{
  const BASE = process.env.BASE_URL || 'http://localhost:3333';
  const EMAIL = process.env.KGB_EMAIL;
  const SENHA = process.env.KGB_SENHA;
  if(!EMAIL || !SENHA){ console.error('Env vars BASE_URL, KGB_EMAIL, KGB_SENHA required'); process.exit(2); }

  function log(){ console.log.apply(console, arguments); }
  function fail(msg){ console.error('FAIL:', msg); process.exit(1); }

  let cookie = '';
  function captureCookie(res){
    try{
      const sc = res.headers.get('set-cookie') || res.headers.get('Set-Cookie');
      if(sc){ cookie = String(sc).split(';')[0]; }
    }catch(e){}
  }

  async function req(path, opts = {}){
    const url = BASE.replace(/\/$/, '') + path;
    opts.headers = opts.headers || {};
    if(cookie) opts.headers['cookie'] = cookie;
    if(opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)){
      opts.headers['content-type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(url, opts);
  }

  try{
    log('==> Login...');
    const rLogin = await fetch(BASE.replace(/\/$/, '') + '/auth/login', { method: 'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email: EMAIL, senha: SENHA }) });
    if (rLogin.status === 401 || rLogin.status === 403) fail('Auth failed: ' + rLogin.status);
    if (!rLogin.ok) { const b = await rLogin.text(); fail('Login failed: ' + rLogin.status + ' ' + b); }
    captureCookie(rLogin);
    log('Login OK; cookie=', cookie || '<none>');

    // GET /contratos
    log('==> GET /contratos');
    let r = await req('/contratos');
    if (r.status === 404) fail('GET /contratos returned 404');
    if (r.status === 401 || r.status === 403) fail('Auth error GET /contratos ' + r.status);
    if (!r.ok) { const b = await r.text(); fail('GET /contratos failed ' + r.status + ' ' + b); }
    log('GET /contratos OK', r.status);

    // POST /contratos
    log('==> POST /contratos');
    const payload = {
      titulo: 'SMOKE CONTRATO',
      clienteId: 'smoke',
      orcamentoId: null,
      eventoId: 'smoke-event',
      contratoHtml: '<p>Contrato Smoke</p>',
      status: 'rascunho'
    };
    r = await req('/contratos', { method: 'POST', body: payload });
    if (r.status === 401 || r.status === 403) fail('Auth error POST ' + r.status);
    if (r.status >= 500) { const b = await r.text(); fail('Server error POST ' + r.status + ' ' + b); }
    if (!(r.status === 200 || r.status === 201)) { const b = await r.text(); fail('Unexpected POST status ' + r.status + ' ' + b); }
    let body = null;
    try { body = await r.json(); } catch(e){ body = null; }
    log('POST /contratos ->', r.status, body);

    let id = null;
    if (body){ id = body.id || (body.data && body.data.id) || (body.data && body.data.insertId) || body.insertId || body.token || (Array.isArray(body.data) && body.data[0] && body.data[0].id && body.data[0].id);
      if (!id && body.data && Array.isArray(body.data) && body.data[0] && body.data[0].id) id = body.data[0].id;
    }
    if(!id){ // try to find in text
      try{ const txt = JSON.stringify(body); const m = txt.match(/"id"\s*:\s*"?(\w[-\w]*)"?/); if(m) id = m[1]; }catch{}
    }
    if(!id) fail('Não recebeu id do POST /contratos');
    log('Criado id =', id);

    // GET /contratos/:id
    log('==> GET /contratos/' + id);
    r = await req('/contratos/' + encodeURIComponent(String(id)) );
    if (r.status === 401 || r.status === 403) fail('Auth error GET id ' + r.status);
    if (!r.ok) { const b = await r.text(); fail('GET id failed ' + r.status + ' ' + b); }
    log('GET /contratos/:id OK', r.status);

    // PUT /contratos/:id
    log('==> PUT /contratos/' + id);
    r = await req('/contratos/' + encodeURIComponent(String(id)), { method: 'PUT', body: { titulo: 'SMOKE CONTRATO (upd)', status: 'rascunho' } });
    if (r.status >= 500) { const b = await r.text(); fail('Server error PUT ' + r.status + ' ' + b); }
    if (!(r.status === 200 || r.status === 204)) { const b = await r.text(); fail('Unexpected PUT status ' + r.status + ' ' + b); }
    log('PUT OK', r.status);

    // DELETE /contratos/:id
    log('==> DELETE /contratos/' + id);
    r = await req('/contratos/' + encodeURIComponent(String(id)), { method: 'DELETE' });
    if (r.status >= 500) { const b = await r.text(); fail('Server error DELETE ' + r.status + ' ' + b); }
    if (!(r.status === 200 || r.status === 204)) { const b = await r.text(); fail('Unexpected DELETE status ' + r.status + ' ' + b); }
    log('DELETE OK', r.status);

    log('SMOKE TEST: TODOS OS PASSOS OK');
    process.exit(0);
  }catch(e){ console.error('ERROR:', e); process.exit(1); }
})();
