const fetch = global.fetch || require('node-fetch');

async function run() {
  const base = 'http://localhost:3333';
  const email = process.env.KGB_EMAIL || 'admin@buffet.com';
  const senha = process.env.KGB_SENHA || '123456';

  function fail(msg) { console.error(msg); process.exitCode = 1; throw new Error(msg); }

  console.log('Login:', email);
  const loginRes = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });

  if (!loginRes.ok) fail('Login falhou: ' + loginRes.status);

  const setCookie = loginRes.headers.get('set-cookie') || (loginRes.headers.raw && loginRes.headers.raw()['set-cookie'] && loginRes.headers.raw()['set-cookie'][0]);
  if (!setCookie) fail('Não recebeu Set-Cookie no login');
  const cookie = setCookie.split(';')[0];
  console.log('Cookie recebido:', cookie);

  async function api(path, opts = {}){
    opts.headers = opts.headers || {};
    opts.headers.Cookie = cookie;
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers['content-type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const r = await fetch(base + path, opts);
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch(e){ console.error('Resposta não-JSON em', path, text); }
    return { ok: r.ok, status: r.status, body: json, raw: text };
  }

  console.log('GET /fotosClientes (espera 200)');
  let res = await api('/fotosClientes', { method: 'GET' });
  if (!res.ok) fail('GET /fotosClientes falhou: ' + res.status);
  console.log('GET ok:', JSON.stringify(res.body));

  console.log('PUT /fotosClientes -> criar cli_test_1');
  res = await api('/fotosClientes', { method: 'PUT', body: { cli_test_1: 'https://example.com/a.jpg' } });
  if (!res.ok) fail('PUT /fotosClientes falhou: ' + res.status);
  console.log('PUT ok:', JSON.stringify(res.body));

  res = await api('/fotosClientes', { method: 'GET' });
  if (!res.ok) fail('GET /fotosClientes pós-PUT falhou: ' + res.status);
  if (!res.body || !res.body.data || !res.body.data.cli_test_1) fail('cli_test_1 não encontrado após PUT');
  console.log('Encontrado cli_test_1');

  console.log('POST /fotosClientes -> adicionar cli_test_2');
  res = await api('/fotosClientes', { method: 'POST', body: { cli_test_2: 'https://example.com/b.jpg' } });
  if (!res.ok) fail('POST /fotosClientes falhou: ' + res.status);
  console.log('POST ok:', JSON.stringify(res.body));

  res = await api('/fotosClientes', { method: 'GET' });
  if (!res.ok) fail('GET /fotosClientes final falhou: ' + res.status);
  if (!res.body || !res.body.data || !res.body.data.cli_test_1 || !res.body.data.cli_test_2) fail('cli_test_1 ou cli_test_2 ausentes: ' + JSON.stringify(res.body));
  console.log('Ambos os itens presentes. Teste OK.');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exitCode = 1; });
