#!/usr/bin/env node
/* Smoke test para o módulo FINANCEIRO usando cookie auth
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
  console.log('SMOKE TEST FINANCEIRO — BASE =', BASE);
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

  async function postThenMaybePutDelete(){
    console.log('\n2) GET /fin/metrics -> espera 200');
    const m = await expect200orSkipGet('/fin/metrics','fin-metrics');
    if (!m.ok) return exit(11);

    console.log('\n3) GET /fin/lancamentos -> 200 OU SKIP(404)');
    const gl = await expect200orSkipGet('/fin/lancamentos','fin-list');
    if (gl.ok === false) return exit(12);

    console.log('\n4) POST /fin/lancamentos -> 200/201 OU SKIP(404)');
    // 4.0) obter ou criar um evento válido para associar ao lançamento
    let eventoId = null;
    try {
      const evRes = await doRequest('GET', '/eventos', null, cookie);
      if (evRes && (evRes.status === 200 || evRes.status === 201)) {
        let arr = evRes.json || null;
        try { if (!arr) arr = JSON.parse(evRes.text || '[]'); } catch{}
        if (arr && arr.data && Array.isArray(arr.data)) arr = arr.data;
        if (Array.isArray(arr) && arr.length>0) eventoId = arr[0]?.id || arr[0]?._id || null;
      }
    } catch(e){}

    // se não encontrou eventos, cria um evento mínimo
    let createdEventId = null;
    if (!eventoId) {
      console.log('Nenhum evento encontrado — criando evento mínimo via POST /eventos');
      const newEv = { nome: 'SMOKE EVENT', data: '2026-01-01', local: 'Local Smoke' };
      const cre = await doRequest('POST', '/eventos', newEv, cookie);
      if (cre && (cre.status === 200 || cre.status === 201)) {
        try {
          const j = cre.json || JSON.parse(cre.text || '{}');
          createdEventId = j?.data?.id || j?.id || j?.evento?.id || null;
          if (!createdEventId) createdEventId = j?.eventoId || null;
        } catch(e){}
        if (!createdEventId) {
          // tentar extrair de payload retornado
          try { const j = cre.json || JSON.parse(cre.text || '{}'); createdEventId = j?.data?.id || j?.id || null; } catch(e){}
        }
        if (createdEventId) eventoId = createdEventId;
      } else {
        console.warn('Falha ao criar evento de teste — POST /eventos retornou', cre && cre.status);
      }
    }

    if (!eventoId) {
      console.error('Não foi possível obter ou criar um evento para associar ao lançamento — abortando POST /fin/lancamentos');
      return exit(13);
    }

    const payload = { eventoId: String(eventoId), tipo: 'entrada', valor: 10, data: '2026-01-01', descricao: 'SMOKE FIN' };
    const post = await doRequest('POST', '/fin/lancamentos', payload, cookie);
    if (post.status === 404) { console.log('POST /fin/lancamentos => SKIP (404)'); report.push({ step:'post-lanc', status:'skipped', ok:true, body: brief(post.text) }); return report; }
    if (!(post.status === 200 || post.status === 201)) { console.error('POST /fin/lancamentos => FAIL', post.status); console.error('body:', brief(post.text)); return exit(13); }
    console.log('POST /fin/lancamentos =>', post.status); report.push({ step:'post-lanc', status:post.status, ok:true, body: brief(post.text) });

    // tentar extrair id
    let createdId = null;
    try { const j = post.json || JSON.parse(post.text || '{}'); createdId = j?.data?.id || j?.id || j?.lancamento?.id || null; } catch(e){}
    if (!createdId) {
      try { const j = post.json || JSON.parse(post.text || '{}'); createdId = j?.id || null; } catch(e){}
    }

    if (createdId) {
      console.log('\n5) PUT /fin/lancamentos/:id -> atualizar descricao');
      const put = await doRequest('PUT', `/fin/lancamentos/${encodeURIComponent(createdId)}`, { descricao: 'SMOKE FIN UPDATE' }, cookie);
      if (!(put.status === 200 || put.status === 201)) { console.error('PUT failed:', put.status, brief(put.text)); return exit(14); }
      console.log('PUT =>', put.status); report.push({ step:'put-lanc', id: createdId, status: put.status, ok:true, body: brief(put.text) });

      console.log('\n6) DELETE /fin/lancamentos/:id -> apagar');
      const del = await doRequest('DELETE', `/fin/lancamentos/${encodeURIComponent(createdId)}`, null, cookie);
      if (!(del.status === 200 || del.status === 204)) { console.error('DELETE failed:', del.status, brief(del.text)); return exit(15); }
      console.log('DELETE =>', del.status); report.push({ step:'delete-lanc', id: createdId, status: del.status, ok:true, body: brief(del.text) });
    } else {
      console.warn('POST não retornou id do recurso (não executando PUT/DELETE)');
    }

    // cleanup: remover evento criado se necessário
    if (createdEventId) {
      try {
        const d = await doRequest('DELETE', `/eventos/${encodeURIComponent(createdEventId)}`, null, cookie);
        console.log('Cleanup: DELETE /eventos/:id =>', d.status);
      } catch(e){}
    }

    return report;
  }

  await postThenMaybePutDelete();

  console.log('\n==== RELATÓRIO SMOKE FINANCEIRO ====');
  let fails = 0;
  for (const r of report){ const okMark = r.ok ? 'OK' : 'FAIL'; console.log(`- ${String(r.step).padEnd(20)} ${okMark}  status=${r.status}  body=${(r.body||'').slice(0,200)}`); if (!r.ok) fails++; }
  if (fails){ console.error('SMOKE TEST: FALHAS DETECTADAS:', fails); process.exit(20); }
  console.log('SMOKE TEST: TODOS OS PASSOS OK'); process.exit(0);
}

run().catch(e => { console.error('Erro no smoke test:', e); process.exit(99); });
