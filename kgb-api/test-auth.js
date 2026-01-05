const http = require('http');

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = http.request(options, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, headers: res.headers, body: raw });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(path, headers={}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method: 'GET',
      headers
    };
    const req = http.request(options, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode, headers: res.headers, body: raw });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async ()=>{
  try {
    console.log('POST /auth/login -> admin@kgb.com');
    const login = await postJson('/auth/login', { email: 'admin@kgb.com', senha: '123' });
    console.log('STATUS', login.status);
    console.log('HEADERS', login.headers);
    console.log('BODY', login.body);

    const parsed = JSON.parse(login.body || '{}');
    const token = parsed.token || login.headers['kgb_token'] || login.headers['KGB_TOKEN'] || login.headers['kgb-token'];
    console.log('EXTRAIDO token:', token);

    console.log('\nGET /auth/me with Authorization Bearer');
    const me1 = await getJson('/auth/me', { Authorization: 'Bearer ' + token });
    console.log('STATUS', me1.status);
    console.log('BODY', me1.body);

    console.log('\nGET /auth/me with KGB_TOKEN header');
    const me2 = await getJson('/auth/me', { 'kgb_token': token });
    console.log('STATUS', me2.status);
    console.log('BODY', me2.body);
  } catch (e) {
    console.error('ERR', e && e.stack);
  }
})();
