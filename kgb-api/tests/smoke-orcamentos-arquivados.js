const { env, exit } = process;
const BASE = String(env.BASE_URL || 'http://localhost:3333').replace(/\/$/, '');
const EMAIL = env.KGB_EMAIL || 'admin@buffet.com';
const SENHA = env.KGB_SENHA || '123456';

function brief(text){ try { return (typeof text==='string'?text:JSON.stringify(text)).slice(0,200).replace(/\n/g,' '); } catch { return String(text); } }

async function doRequest(method, path, body=null, cookie=null){
  const url = BASE + path;
  const headers = {};
  const opts = { method, headers };
  if (cookie) headers['Cookie'] = cookie;
  if (body != null) { headers['Content-Type']='application/json'; opts.body = JSON.stringify(body); }
  try {
    const res = await fetch(url, opts);
    const text = await res.text().catch(()=>'');
    return { status: res.status, ok: res.ok, text, headers: res.headers };
  } catch (e) { return { ok: false, error: String(e) }; }
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
  console.log('SMOKE orcamentos arquivados — BASE =', BASE);
  console.log('Login como', EMAIL);

  const login = await doRequest('POST', '/auth/login', { email: EMAIL, senha: SENHA });
  console.log('POST /auth/login =>', login.status);
  if (login.status !== 200) { console.error('Login não retornou 200; resposta:', brief(login.text)); return exit(3); }

  const cookie = extractCookieFromResHeaders(login.headers);
  if (!cookie) { console.error('Não foi possível extrair cookie da resposta de login'); return exit(4); }
  console.log('Cookie de sessão obtido');

  process.stdout.write('GET /orcamentos?status=arquivado ... ');
  let r = await doRequest('GET', '/orcamentos?status=arquivado', null, cookie);
  console.log(r.status);
  console.log('  body:', brief(r.text));

  let needCreate = true;
  try {
    const parsed = JSON.parse(r.text);
    const items = parsed?.items || (Array.isArray(parsed) ? parsed : []);
    if (items.length) needCreate = false;
  } catch(e){ /* ignore */ }

  let createdId = null;
  if (needCreate) {
    console.log('Nenhum arquivado encontrado -> criando um orçamento de teste via POST /orcamentos');
    const novo = await doRequest('POST', '/orcamentos', { dados: { nome: 'SMOKE ORCAMENTO ARQUIVADO' } }, cookie);
    console.log('POST /orcamentos =>', novo.status);
    console.log('  body:', brief(novo.text));
    try { const j = JSON.parse(novo.text); createdId = j?.orcamento?.id || j?.id || null; } catch(e){}
    if (!createdId) {
      // tentar extrair id do objeto retornado
      try { const j = JSON.parse(novo.text); if (Array.isArray(j)) createdId = j[0]?.id; } catch(e){}
    }
    if (!createdId) { console.warn('Não foi possível obter id do novo orçamento; abortando smoke'); return exit(5); }

    // arquivar via PUT
    const put = await doRequest('PUT', `/orcamentos/${encodeURIComponent(createdId)}`, { status: 'arquivado', motivoArquivamento: 'smoke-test' }, cookie);
    console.log(`PUT /orcamentos/${createdId} =>`, put.status);
    console.log('  body:', brief(put.text));
  } else {
    // se já existe, pega o primeiro id para testar o PUT
    try {
      const parsed = JSON.parse(r.text);
      const items = parsed?.items || (Array.isArray(parsed) ? parsed : []);
      createdId = items[0]?.id || (items[0]?._raw?.id);
    } catch(e){}
  }

  if (!createdId) { console.error('id para teste não encontrado'); return exit(6); }

  // agora desarquivar via PUT
  const up = await doRequest('PUT', `/orcamentos/${encodeURIComponent(createdId)}`, { status: 'ativo' }, cookie);
  console.log(`PUT /orcamentos/${createdId} =>`, up.status);
  console.log('  body:', brief(up.text));

  // verificar /orcamentos?status=ativo
  const r2 = await doRequest('GET', '/orcamentos?status=ativo', null, cookie);
  console.log('GET /orcamentos?status=ativo =>', r2.status);
  console.log('  body:', brief(r2.text));

  console.log('Fim do teste.');
  return exit(0);
}

run().catch(e=>{ console.error('Erro no teste:', e); process.exit(99); });
