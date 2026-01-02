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
  console.log('SMOKE endpoints montagem-cardapio — BASE =', BASE);
  console.log('Login como', EMAIL);

  const login = await doRequest('POST', '/auth/login', { email: EMAIL, senha: SENHA });
  if (!login || !login.status) { console.error('Login falhou (sem resposta)'); return exit(2); }
  console.log('POST /auth/login =>', login.status);
  if (login.status !== 200) { console.error('Login não retornou 200; resposta:', brief(login.text)); return exit(3); }

  const cookie = extractCookieFromResHeaders(login.headers);
  if (!cookie) { console.error('Não foi possível extrair cookie da resposta de login'); return exit(4); }
  console.log('Cookie de sessão obtido');

  const paths = [
    '/catalogo/cardapios',
    '/catalogo/produtos',
    '/catalogo/adicionais',
    '/catalogo/custos-fixos',
    '/catalogo/tipos-cardapio',
    '/fichas-tecnicas'
  ];

  for (const p of paths) {
    process.stdout.write(`GET ${p} ... `);
    const r = await doRequest('GET', p, null, cookie);
    if (!r || !r.status) {
      console.log('FAIL (no response)');
      console.log('  error:', r && r.error);
    } else {
      console.log(`${r.status}`);
      console.log('  body:', brief(r.text));
    }
  }

  console.log('Fim do teste.');
}

run().catch(e=>{ console.error('Erro no teste:', e); process.exit(99); });

