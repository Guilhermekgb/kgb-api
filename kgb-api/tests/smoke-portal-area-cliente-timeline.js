const http = require('http');

function req(method, path, body, cookie){
  return new Promise((resolve, reject)=>{
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: process.env.PORT || 3333,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? {'Content-Length': Buffer.byteLength(data)} : {}),
        ...(cookie ? {'Cookie': cookie} : {}),
      }
    };
    const r = http.request(opts, (res)=>{
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', ()=>{
        let json = null;
        try { json = JSON.parse(raw); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, raw, json });
      });
    });
    r.on('error', reject);
    if(data) r.write(data);
    r.end();
  });
}

function fail(msg, r){
  console.error('\nFAIL:', msg);
  if(r){
    console.error('status:', r.status);
    console.error('raw:', (r.raw||'').slice(0,400));
  }
  process.exit(1);
}

(async ()=>{
  const email = process.env.KGB_EMAIL || 'admin@buffet.com';
  const senha = process.env.KGB_SENHA || '123456';

  const login = await req('POST','/auth/login',{ email, senha });
  if(login.status !== 200) fail('login', login);
  const setCookie = login.headers['set-cookie'] || [];
  const cookie = Array.isArray(setCookie) ? setCookie.map(x=>x.split(';')[0]).join('; ') : String(setCookie).split(';')[0];
  if(!cookie) fail('cookie vazio', login);
  console.log('OK login, cookie obtido');

  const r = await req('GET','/portal/eventos/TEST/timeline', null, cookie);
  if(r.status !== 200) fail('GET /portal/eventos/TEST/timeline status != 200', r);
  if(!r.json || r.json.ok !== true || !Array.isArray(r.json.items)) fail('Resposta inválida /portal/eventos/TEST/timeline', r);
  console.log('GET /portal/eventos/TEST/timeline -> OK, items length =', r.json.items.length);

  // opcional: verificar finance/parcelas continuam ok
  const f = await req('GET','/portal/eventos/TEST/financeiro', null, cookie);
  if(f.status !== 200) console.log('WARN: /financeiro status', f.status);
  const p = await req('GET','/portal/eventos/TEST/parcelas', null, cookie);
  if(p.status !== 200) console.log('WARN: /parcelas status', p.status);

  console.log('\nSMOKE TIMELINE OK');
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
