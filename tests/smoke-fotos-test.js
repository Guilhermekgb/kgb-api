// smoke-fotos-test.js
// Simple Node smoke test: PATCH + GET /fotos-clientes
// Usage: node tests/smoke-fotos-test.js

const base = process.env.API_BASE || 'http://localhost:3333';

async function fetchJson(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(base + path, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
  return { status: res.status, body: json };
}

function assert(cond, message) {
  if (!cond) throw new Error(message || 'Assertion failed');
}

(async function main(){
  try {
    console.log('Using API base:', base);

    const key = 'auto-smoke-' + Date.now();
    const value = 'data:image/png;base64,TESTDATA';

    console.log('PATCH -> add key:', key);
    let r = await fetchJson('PATCH', '/fotos-clientes', { key, value });
    console.log('PATCH response:', r.status, JSON.stringify(r.body));
    assert(r.status >= 200 && r.status < 300, 'PATCH failed');

    // small pause
    await new Promise(res=>setTimeout(res, 200));

    console.log('GET -> verify key exists');
    r = await fetchJson('GET', '/fotos-clientes');
    console.log('GET response:', r.status, JSON.stringify(r.body));
    assert(r.status >= 200 && r.status < 300, 'GET failed');
    const map = (r.body && r.body.data) || r.body;
    assert(map && Object.prototype.hasOwnProperty.call(map, key), 'Key not found after PATCH');
    assert(map[key] === value, 'Value mismatch');

    console.log('PATCH -> delete key (null)');
    r = await fetchJson('PATCH', '/fotos-clientes', { key, value: null });
    console.log('PATCH delete response:', r.status, JSON.stringify(r.body));
    assert(r.status >= 200 && r.status < 300, 'PATCH delete failed');

    await new Promise(res=>setTimeout(res, 200));

    console.log('GET -> verify key is null (deletion signaled)');
    r = await fetchJson('GET', '/fotos-clientes');
    console.log('GET after delete response:', r.status, JSON.stringify(r.body));
    const map2 = (r.body && r.body.data) || r.body;
    assert(map2 && Object.prototype.hasOwnProperty.call(map2, key), 'Key missing after delete');
    assert(map2[key] === null, 'Key should be null after delete');

    console.log('SMOKE TEST PASSED');
    process.exit(0);
  } catch (err) {
    console.error('SMOKE TEST FAILED:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();
