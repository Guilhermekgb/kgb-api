#!/usr/bin/env node
/* Smoke test para o módulo EVENTOS usando cookie auth
   Requisitos: NODE >= 18 (fetch disponível)
   Variáveis de ambiente: KGB_EMAIL, KGB_SENHA, BASE_URL (opcional)
*/

const { env, exit } = process;
const BASE = String(env.BASE_URL || 'http://localhost:3333').replace(/\/$/, '');
const EMAIL = env.KGB_EMAIL;
const SENHA = env.KGB_SENHA;

if (!EMAIL || !SENHA) {
  console.error('Erro: defina KGB_EMAIL e KGB_SENHA como variáveis de ambiente');
  process.exit(2);
}

function brief(obj){ try { const s = typeof obj === 'string' ? obj : JSON.stringify(obj); return s.slice(0, 600).replace(/\n/g,' '); } catch { return String(obj); } }

const MAX_LOGIN_RETRIES = 5;
const RETRY_BASE_MS = 500;
const VERBOSE = !!process.env.SMOKE_VERBOSE;

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function doRequest(method, path, body=null, cookie=null){
  const url = BASE + path;
  const headers = {};
  let opts = { method, headers };
  if (cookie) headers['Cookie'] = cookie;
  if (body != null) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
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
  } catch (e) { return null; }
}

async function run(){
  console.log('SMOKE TEST EVENTOS — BASE =', BASE);
  const report = [];

  console.log('\n1) POST /auth/login — autenticando...');
  let loginRes = null;
  for (let attempt=1; attempt<=MAX_LOGIN_RETRIES; attempt++){
    if (attempt>1) console.log(`Tentativa ${attempt}/${MAX_LOGIN_RETRIES}...`);
    loginRes = await doRequest('POST', '/auth/login', { email: EMAIL, senha: SENHA });
    if (VERBOSE) console.log('loginRes:', loginRes.status || 'no-status', loginRes.error || '');
    if (loginRes && loginRes.status === 200) break;
    if (!loginRes || !loginRes.status) {
      console.warn('Login request failed:', loginRes && loginRes.error ? loginRes.error : 'sem status');
    } else {
      console.warn('Login retornou status', loginRes.status);
    }
    if (attempt < MAX_LOGIN_RETRIES) await sleep(RETRY_BASE_MS * attempt);
  }

  if (!loginRes || !loginRes.status) {
    console.error('Falha na requisição de login:', loginRes && loginRes.error ? loginRes.error : loginRes);
    return exit(3);
  }
  report.push({ step: 'login', status: loginRes.status, ok: loginRes.ok, body: brief(loginRes.text) });
  if (loginRes.status !== 200) {
    console.error('Login falhou — status:', loginRes.status, '\nResposta:', loginRes.text);
    return exit(4);
  }

  const cookie = extractCookieFromResHeaders(loginRes.headers);
  if (!cookie) {
    console.error('Não foi possível capturar cookie de sessão (Set-Cookie ausente)');
    if (VERBOSE) console.error('Resposta completa:', loginRes.text);
    return exit(5);
  }
  console.log('Cookie capturado:', cookie.split(';')[0]);

  async function checkGet(path, name){
    process.stdout.write(`- GET ${path} ... `);
    const r = await doRequest('GET', path, null, cookie);
    const ok = r && (r.status === 200 || r.status === 201);
    console.log(ok ? `OK (${r.status})` : `FAIL (${r.status})`);
    report.push({ step: name, path, status: r.status, ok: !!ok, body: brief(r.text) });
    if (!ok) console.warn('  resposta:', brief(r.text));
    return r;
  }

  await checkGet('/catalogo/cardapios', 'cardapios');
  await checkGet('/catalogo/adicionais', 'adicionais');

  const list = await checkGet('/eventos', 'lista-eventos');

  console.log('\nPOST /eventos — criando evento mínimo...');
  const sample = {
    nome: `SMOKE Evento ${Date.now()}`,
    dataEvento: new Date().toISOString().slice(0,10),
    local: 'Local Smoke',
  };
  const post = await doRequest('POST', '/eventos', sample, cookie);
  console.log('POST /eventos =>', post.status);
  report.push({ step: 'post-evento', status: post.status, ok: post.status===200 || post.status===201, body: brief(post.text) });

  let createdId = null;
  try {
    const j = post.json || JSON.parse(post.text || '{}');
    createdId = (j?.data?.id) || j?.id || null;
  } catch(e){}
  if (!createdId) console.warn('Não foi possível extrair id do evento criado. Resposta:', brief(post.text));

  if (createdId) {
    console.log('\nGET /eventos/:id — verificando criação...');
    const getOne = await doRequest('GET', `/eventos/${encodeURIComponent(createdId)}`, null, cookie);
    console.log('GET /eventos/:id =>', getOne.status);
    report.push({ step: 'get-evento', id: createdId, status: getOne.status, ok: getOne.status===200 || getOne.status===201, body: brief(getOne.text) });

    console.log('\nPUT /eventos/:id — atualizando nome...');
    const put = await doRequest('PUT', `/eventos/${encodeURIComponent(createdId)}`, { nome: 'SMOKE Atualizado' }, cookie);
    console.log('PUT /eventos/:id =>', put.status);
    report.push({ step: 'put-evento', id: createdId, status: put.status, ok: put.status===200 || put.status===201, body: brief(put.text) });

    console.log('\nDELETE /eventos/:id — removendo...');
    const del = await doRequest('DELETE', `/eventos/${encodeURIComponent(createdId)}`, null, cookie);
    console.log('DELETE /eventos/:id =>', del.status);
    report.push({ step: 'delete-evento', id: createdId, status: del.status, ok: del.status===200 || del.status===201, body: brief(del.text) });
  }

  console.log('\n==== RELATÓRIO SMOKE EVENTOS ====');
  let fails = 0;
  report.forEach(r => {
    const okMark = r.ok ? 'OK' : 'FAIL';
    console.log(`- ${r.step.padEnd(20)} ${okMark}  status=${r.status}  body=${(r.body||'').slice(0,200)}`);
    if (!r.ok) fails++;
  });
  console.log('================================');
  if (fails) {
    console.error('SMOKE TEST: FALHAS DETECTADAS:', fails);
    process.exit(20);
  } else {
    console.log('SMOKE TEST: TODOS OS PASSOS OK');
    process.exit(0);
  }
}

run().catch(e => { console.error('Erro no teste:', e); process.exit(99); });
