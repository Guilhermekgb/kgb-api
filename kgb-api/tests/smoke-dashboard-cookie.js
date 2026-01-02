#!/usr/bin/env node
/* Smoke test para o DASHBOARD — cookie auth
   Variáveis de ambiente: BASE_URL (default http://localhost:3333), KGB_EMAIL, KGB_SENHA
*/

const { env, exit } = process;
const BASE = String(env.BASE_URL || 'http://localhost:3333').replace(/\/$/, '');
const EMAIL = env.KGB_EMAIL;
const SENHA = env.KGB_SENHA;

if (!EMAIL || !SENHA) {
  console.error('Erro: defina KGB_EMAIL e KGB_SENHA');
  process.exit(2);
}

const VERBOSE = !!process.env.SMOKE_VERBOSE;
function brief(obj){ try { const s = typeof obj === 'string' ? obj : JSON.stringify(obj); return s.slice(0, 800).replace(/\n/g,' '); } catch { return String(obj); } }

async function doRequest(method, path, body=null, cookie=null){
  const url = BASE + path;
  const headers = {};
  const opts = { method, headers };
  if (cookie) headers['Cookie'] = cookie;
  if (body != null) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  try {
    const res = await fetch(url, opts);
    const txt = await res.text().catch(()=>'');
    let json = null; try { json = JSON.parse(txt); } catch {}
    return { ok: res.ok, status: res.status, headers: res.headers, text: txt, json };
  } catch (e) { return { ok: false, error: String(e) }; }
}

function extractCookie(headers){
  try {
    const sc = headers.get && headers.get('set-cookie');
    if (!sc) return null;
    const parts = sc.split(/, (?=[^,]+=)/g);
    const cookies = parts.map(p => (p||'').split(';')[0]).filter(Boolean);
    return cookies.join('; ');
  } catch (e) { return null; }
}

async function check(path, cookie, allow404=true){
  const r = await doRequest('GET', path, null, cookie);
  if (!r || !r.status) return { status: r.status || 0, ok:false, body: r.error || r.text };
  if (r.status === 200 || r.status === 201) return { status: r.status, ok:true, body: brief(r.text) };
  if (r.status === 404 && allow404) return { status:404, ok:'skip', body: brief(r.text) };
  if (r.status === 401 || r.status === 403) return { status:r.status, ok:false, body: brief(r.text) };
  return { status:r.status, ok:false, body: brief(r.text) };
}

async function run(){
  console.log('SMOKE DASHBOARD — BASE =', BASE);
  const report = [];

  console.log('\n1) POST /auth/login — autenticando...');
  const login = await doRequest('POST', '/auth/login', { email: EMAIL, senha: SENHA });
  if (!login || !login.status) { console.error('Falha login:', login && login.error); return exit(3); }
  report.push({ step: 'login', status: login.status, ok: login.status===200, body: brief(login.text) });
  if (login.status !== 200) { console.error('Login falhou:', login.status, login.text); return exit(4); }
  const cookie = extractCookie(login.headers);
  if (!cookie) { console.error('Cookie não encontrado nas headers'); return exit(5); }
  console.log('Cookie capturado:', cookie.split(';')[0]);

  const endpoints = [
    { path: '/leads', name: 'GET /leads', allow404:false },
    { path: '/leads/metrics?range=mes', name: 'GET /leads/metrics', allow404:true },
    { path: '/funil/metrics?range=mes', name: 'GET /funil/metrics', allow404:true },
    { path: '/eventos', name: 'GET /eventos', allow404:false },
    { path: '/eventos/metrics?range=mes', name: 'GET /eventos/metrics', allow404:true },
    { path: '/orcamentos', name: 'GET /orcamentos', allow404:false },
    { path: '/fin/metrics?range=mes', name: 'GET /fin/metrics', allow404:true },
    { path: '/catalogo/cardapios', name: 'GET /catalogo/cardapios', allow404:true },
    { path: '/catalogo/adicionais', name: 'GET /catalogo/adicionais', allow404:true }
  ];

  for (const e of endpoints){
    process.stdout.write(`- ${e.name} ... `);
    const res = await check(e.path, cookie, e.allow404);
    if (res.ok === true) { console.log(`OK (${res.status})`); report.push({ step: e.name, status: res.status, ok:true, body: res.body }); }
    else if (res.ok === 'skip') { console.log('SKIP (404)'); report.push({ step: e.name, status:404, ok:'skip', body: res.body }); }
    else { console.log(`FAIL (${res.status})`); report.push({ step: e.name, status: res.status, ok:false, body: res.body }); }
  }

  console.log('\n==== RELATÓRIO SMOKE DASHBOARD ====');
  let fails = 0;
  report.forEach(r => {
    const okMark = r.ok === true ? 'OK' : (r.ok === 'skip' ? 'SKIP' : 'FAIL');
    console.log(`- ${r.step.padEnd(30)} ${okMark}  status=${r.status}  body=${(r.body||'').slice(0,200)}`);
    if (r.ok !== true && r.ok !== 'skip') fails++;
  });

  if (fails) {
    console.error('SMOKE DASHBOARD: FALHAS DETECTADAS:', fails);
    return exit(20);
  }
  console.log('SMOKE DASHBOARD: TODOS OS PASSOS OK/OK-SKIP');
  return exit(0);
}

run().catch(e => { console.error('Erro no teste:', e); process.exit(99); });
