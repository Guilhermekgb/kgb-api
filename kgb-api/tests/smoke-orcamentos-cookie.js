#!/usr/bin/env node
/* Smoke test para o módulo ORÇAMENTOS usando cookie auth
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
const RETRY_BASE_MS = 500; // backoff base
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
    // headers.get('set-cookie') may contain one or more cookies; take the name=value part(s)
    const sc = headers.get && headers.get('set-cookie');
    if (!sc) return null;
    // split cookies conservatively: split on comma followed by space and a word= (simple heuristic)
    const parts = sc.split(/, (?=[^,]+=)/g);
    const cookies = parts.map(p => (p||'').split(';')[0]).filter(Boolean);
    return cookies.join('; ');
  } catch (e) { return null; }
}

async function run(){
  console.log('SMOKE TEST ORÇAMENTOS — BASE =', BASE);
  const report = [];

  // 1) login
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
    if (VERBOSE && loginRes.headers && typeof loginRes.headers.forEach === 'function'){
      console.log('--- Response headers ---');
      loginRes.headers.forEach((v,k) => console.log(k+':', v));
      console.log('------------------------');
    }
    return exit(4);
  }

  if (VERBOSE && loginRes.headers && typeof loginRes.headers.forEach === 'function'){
    console.log('--- Login response headers ---');
    loginRes.headers.forEach((v,k) => console.log(k+':', v));
    console.log('-------------------------------');
  }

  const cookie = extractCookieFromResHeaders(loginRes.headers);
  if (!cookie) {
    console.error('Não foi possível capturar cookie de sessão (Set-Cookie ausente)');
    if (VERBOSE) console.error('Resposta completa:', loginRes.text);
    return exit(5);
  }
  console.log('Cookie capturado:', cookie.split(';')[0]);

  // helper to run GET endpoints that must return 200
  async function checkGet(path, name){
    process.stdout.write(`- GET ${path} ... `);
    const r = await doRequest('GET', path, null, cookie);
    const ok = r && (r.status === 200 || r.status === 201);
    console.log(ok ? `OK (${r.status})` : `FAIL (${r.status})`);
    report.push({ step: name, path, status: r.status, ok: !!ok, body: brief(r.text) });
    if (!ok) console.warn('  resposta:', brief(r.text));
    return r;
  }

  // 2-4 catalog endpoints
  await checkGet('/catalogo/cardapios', 'cardapios');
  await checkGet('/catalogo/adicionais', 'adicionais');
  await checkGet('/catalogo/servicos', 'servicos');

  // 5 GET /orcamentos
  const orcGet = await checkGet('/orcamentos', 'lista-orcamentos');

  // 6 POST /orcamentos (payload mínimo)
  console.log('\n6) POST /orcamentos — criando órçamento mínimo...');
  const sampleOrc = {
    leadId: `smoke-${Date.now()}`,
    dados: {
      nomeCliente: 'SMOKE Teste',
      dataEvento: new Date().toISOString().slice(0,10),
      local: 'Local de Teste',
      qtd: 10,
      valorTotal: 10000
    }
  };
  const postOrc = await doRequest('POST', '/orcamentos', sampleOrc, cookie);
  console.log('POST /orcamentos =>', postOrc.status);
  report.push({ step: 'post-orcamento', status: postOrc.status, ok: postOrc.status===200 || postOrc.status===201, body: brief(postOrc.text) });

  let createdId = null;
  try {
    const j = postOrc.json || JSON.parse(postOrc.text || '{}');
    createdId = (j?.orcamento?.id) || j?.data?.id || j?.id || null;
  } catch(e){}
  if (!createdId) console.warn('Não foi possível extrair id do orçamento criado. Resposta:', brief(postOrc.text));

  // 7) PUT /orcamentos/:id
  if (createdId) {
    console.log('\n7) PUT /orcamentos/:id — atualizando observacao...');
    const upd = { observacao: 'Atualização smoke test' };
    const put = await doRequest('PUT', `/orcamentos/${encodeURIComponent(createdId)}`, upd, cookie);
    console.log('PUT /orcamentos/:id =>', put.status);
    report.push({ step: 'put-orcamento', id: createdId, status: put.status, ok: put.status===200 || put.status===201, body: brief(put.text) });
  }

  // 8) POST /leads/historico — obter leadId válido e enviar payload mínimo requerido
  console.log('\n8) POST /leads/historico — preparando payload válido...');
  // tentar extrair leadId a partir da resposta do POST /orcamentos
  let targetLeadId = null;
  try {
    const j = postOrc.json || JSON.parse(postOrc.text || '{}');
    targetLeadId = j?.orcamento?.leadId || j?.data?.leadId || j?.leadId || null;
  } catch(e){}

  // se não encontrou, buscar via GET /leads e usar o primeiro lead disponível
  if (!targetLeadId) {
    console.log('leadId não encontrado na resposta de /orcamentos — consultando /leads');
    const leadsRes = await doRequest('GET', '/leads', null, cookie);
    if (leadsRes && (leadsRes.status === 200 || leadsRes.status === 201)) {
      let arr = leadsRes.json || null;
      try { if (!arr) arr = JSON.parse(leadsRes.text || '[]'); } catch {}
      // suportar { ok:true, data: [...] }
      if (arr && arr.data && Array.isArray(arr.data)) arr = arr.data;
      if (Array.isArray(arr) && arr.length > 0) {
        const first = arr[0];
        targetLeadId = first?.id || first?.leadId || first?._id || null;
      }
    }
  }

  if (!targetLeadId) {
    console.log('SKIP /leads/historico (sem leads disponíveis)');
    report.push({ step: 'post-lead-historico', status: 'skipped', ok: true, body: 'sem leads disponíveis' });
  } else {
    const histPayload = {
      leadId: String(targetLeadId),
      item: {
        tipo: 'teste-smoke',
        titulo: 'Smoke Test - Histórico',
        descricao: 'Registro automático do teste',
        data: new Date().toISOString()
      }
    };
    console.log('Enviando histórico para leadId =', targetLeadId);
    const hist = await doRequest('POST', '/leads/historico', histPayload, cookie);
    const histOk = hist && (hist.status === 200 || hist.status === 201);
    console.log('POST /leads/historico =>', hist.status);
    report.push({ step: 'post-lead-historico', status: hist.status, ok: !!histOk, body: brief(hist.text) });
    if (!histOk) console.warn('Resposta /leads/historico:', brief(hist.text));
  }

  // Relatório final
  console.log('\n==== RELATÓRIO SMOKE ORÇAMENTOS ====');
  let fails = 0;
  report.forEach(r => {
    const okMark = r.ok ? 'OK' : 'FAIL';
    console.log(`- ${r.step.padEnd(20)} ${okMark}  status=${r.status}  body=${(r.body||'').slice(0,200)}`);
    if (!r.ok) fails++;
  });
  console.log('==================================');
  if (fails) {
    console.error('SMOKE TEST: FALHAS DETECTADAS:', fails);
    process.exit(20);
  } else {
    console.log('SMOKE TEST: TODOS OS PASSOS OK');
    process.exit(0);
  }
}

run().catch(e => { console.error('Erro no teste:', e); process.exit(99); });
