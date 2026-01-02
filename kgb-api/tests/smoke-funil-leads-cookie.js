#!/usr/bin/env node
/* Smoke test para o módulo FUNIL DE LEADS usando cookie auth
   Variáveis de ambiente: BASE_URL, KGB_EMAIL, KGB_SENHA
   Regras: 404 = SKIP, 401/403 = FAIL
*/

const { env, exit } = process;
const BASE = String(env.BASE_URL || 'http://localhost:3333').replace(/\/$/, '');
const EMAIL = env.KGB_EMAIL;
const SENHA = env.KGB_SENHA;

if (!EMAIL || !SENHA) {
  console.error('Erro: defina KGB_EMAIL e KGB_SENHA como variáveis de ambiente');
  process.exit(2);
}

function brief(obj){ try { const s = typeof obj === 'string' ? obj : JSON.stringify(obj); return s.slice(0, 800).replace(/\n/g,' '); } catch { return String(obj); } }

const MAX_LOGIN_RETRIES = 5;
const RETRY_BASE_MS = 500;
const VERBOSE = !!process.env.SMOKE_VERBOSE;
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function doRequest(method, path, body=null, cookie=null){
  const url = BASE + path;
  const headers = {};
  const opts = { method, headers };
  if (cookie) headers['Cookie'] = cookie;
  if (body != null) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  try {
    const res = await fetch(url, opts);
    let text = '';
    try { text = await res.text(); } catch(e){}
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, headers: res.headers, text, json };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function extractCookieFromResHeaders(headers){
  try {
    const sc = headers.get && headers.get('set-cookie');
    if (!sc) return null;
    const parts = sc.split(/, (?=[^,]+=)/g);
    const cookies = parts.map(p => (p||'').split(';')[0]).filter(Boolean);
    return cookies.join('; ');
  } catch(e){ return null; }
}

async function run(){
  console.log('SMOKE TEST FUNIL DE LEADS — BASE =', BASE);
  const report = [];

  console.log('\n1) POST /auth/login — autenticando...');
  let loginRes=null;
  for (let attempt=1; attempt<=MAX_LOGIN_RETRIES; attempt++){
    if (attempt>1) console.log(`Tentativa ${attempt}/${MAX_LOGIN_RETRIES}...`);
    loginRes = await doRequest('POST', '/auth/login', { email: EMAIL, senha: SENHA });
    if (VERBOSE) console.log('loginRes:', loginRes.status || 'no-status', loginRes.error || '');
    if (loginRes && loginRes.status === 200) break;
    if (!loginRes || !loginRes.status) console.warn('Login request failed:', loginRes && loginRes.error ? loginRes.error : 'sem status');
    else console.warn('Login retornou status', loginRes.status);
    if (attempt < MAX_LOGIN_RETRIES) await sleep(RETRY_BASE_MS * attempt);
  }

  if (!loginRes || !loginRes.status) { console.error('Falha na requisição de login:', loginRes && loginRes.error ? loginRes.error : loginRes); return exit(3); }
  report.push({ step:'login', status: loginRes.status, ok: loginRes.ok, body: brief(loginRes.text) });
  if (loginRes.status !== 200) { console.error('Login falhou — status:', loginRes.status, '\nResposta:', loginRes.text); return exit(4); }

  const cookie = extractCookieFromResHeaders(loginRes.headers);
  if (!cookie) { console.error('Não foi possível capturar cookie de sessão (Set-Cookie ausente)'); return exit(5); }
  console.log('Cookie capturado:', cookie.split(';')[0]);

  async function expect200orSkipGet(path, name){
    process.stdout.write(`- GET ${path} ... `);
    const r = await doRequest('GET', path, null, cookie);
    if (r.status === 200) { console.log(`OK (${r.status})`); report.push({ step:name, path, status:r.status, ok:true, body: brief(r.text)}); return { ok:true, res:r }; }
    if (r.status === 404) { console.log('SKIP (404)'); report.push({ step:name, path, status:'skipped', ok:true, body: brief(r.text)}); return { ok:'skipped' }; }
    console.log(`FAIL (${r.status})`); report.push({ step:name, path, status:r.status, ok:false, body: brief(r.text)}); return { ok:false, res:r };
  }

  console.log('\n2) GET /leads -> espera 200 ou SKIP(404)');
  const g = await expect200orSkipGet('/leads','leads-list');
  if (g.ok === false) return exit(11);

  console.log('\n3) POST /leads -> 201/200 OU SKIP(404)');
  const payload = { nome: 'SMOKE LEAD', whatsapp: '5511999999999', status: 'Novo Lead' };
  const post = await doRequest('POST', '/leads', payload, cookie);
  if (post.status === 404) { console.log('POST /leads => SKIP (404)'); report.push({ step:'post-lead', status:'skipped', ok:true, body: brief(post.text) }); return report; }
  if (!(post.status === 200 || post.status === 201)) { console.error('POST /leads => FAIL', post.status); console.error('body:', brief(post.text)); return exit(13); }
  console.log('POST /leads =>', post.status); report.push({ step:'post-lead', status:post.status, ok:true, body: brief(post.text) });

  // tentar extrair id
  let createdId = null;
  try { const j = post.json || JSON.parse(post.text || '{}'); createdId = j?.data?.id || j?.id || j?.lead?.id || null; } catch(e){}
  if (!createdId) {
    try { const j = post.json || JSON.parse(post.text || '{}'); createdId = j?.id || null; } catch(e){}
  }

  if (createdId) {
    console.log('\n4) PUT /leads/:id -> atualizar status');
    const put = await doRequest('PUT', `/leads/${encodeURIComponent(createdId)}`, { status: 'Fechados' }, cookie);
    if (!(put.status === 200 || put.status === 201)) { console.error('PUT failed:', put.status, brief(put.text)); return exit(14); }
    console.log('PUT =>', put.status); report.push({ step:'put-lead', id: createdId, status: put.status, ok:true, body: brief(put.text) });

    console.log('\n5) DELETE /leads/:id -> apagar');
    const del = await doRequest('DELETE', `/leads/${encodeURIComponent(createdId)}`, null, cookie);
    if (!(del.status === 200 || del.status === 204)) { console.error('DELETE failed:', del.status, brief(del.text)); return exit(15); }
    console.log('DELETE =>', del.status); report.push({ step:'delete-lead', id: createdId, status: del.status, ok:true, body: brief(del.text) });
  } else {
    console.warn('POST não retornou id do recurso (não executando PUT/DELETE)');
  }

  console.log('\n==== RELATÓRIO SMOKE FUNIL ====');
  let fails = 0;
  for (const r of report){ const okMark = r.ok ? 'OK' : 'FAIL'; console.log(`- ${String(r.step).padEnd(20)} ${okMark}  status=${r.status}  body=${(r.body||'').slice(0,200)}`); if (!r.ok) fails++; }
  if (fails){ console.error('SMOKE TEST: FALHAS DETECTADAS:', fails); process.exit(20); }
  console.log('SMOKE TEST: TODOS OS PASSOS OK'); process.exit(0);
}

run().catch(e => { console.error('Erro no smoke test:', e); process.exit(99); });
