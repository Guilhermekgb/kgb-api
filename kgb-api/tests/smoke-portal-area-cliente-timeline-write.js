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

  const item = { id: 'smoke-' + Date.now(), ts: Date.now(), tipo: 'smoke', texto: 'Teste smoke' };

  const post = await req('POST', '/portal/eventos/TEST/timeline', item, cookie);
  if(post.status !== 200) fail('POST timeline status != 200', post);
  if(!post.json || post.json.ok !== true || !Array.isArray(post.json.items)) fail('POST timeline resposta inválida', post);
  console.log('POST /portal/eventos/TEST/timeline ->', post.status, 'items=', post.json.items.length);

  const get = await req('GET', '/portal/eventos/TEST/timeline', null, cookie);
  if(get.status !== 200) fail('GET timeline after POST status != 200', get);
  if(!get.json || get.json.ok !== true || !Array.isArray(get.json.items)) fail('GET timeline resposta inválida', get);

  const found = get.json.items.find(i=>String(i.id)===String(item.id));
  if(!found) fail('item não encontrado após POST', get);
  console.log('GET /portal/eventos/TEST/timeline -> OK, item encontrado');

  console.log('\nSMOKE TIMELINE WRITE OK');
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
