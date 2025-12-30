// tests/delete-local-file-test.js
// Verifica que PATCH /fotos-clientes com value=null remove arquivo local em public/uploads
// Usage: node tests/delete-local-file-test.js

const fs = require('fs');
const path = require('path');
const base = process.env.API_BASE || 'http://localhost:3333';

async function fetchJson(method, pathUrl, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(base + pathUrl, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
  return { status: res.status, body: json };
}

function assert(cond, msg){ if(!cond) throw new Error(msg || 'Assertion failed'); }

(async function main(){
  try {
    console.log('Using API base:', base);
    const tenant = 'default';
    const key = 'delete-local-' + Date.now();
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', tenant);
    try{ fs.mkdirSync(uploadsDir, { recursive: true }); } catch(e){}

    const filename = `${key}.png`;
    const fp = path.join(uploadsDir, filename);
    fs.writeFileSync(fp, 'TEST-BINARY', 'utf8');
    const publicUrl = `/uploads/${tenant}/${filename}`;

    console.log('Created local file:', fp);
    assert(fs.existsSync(fp), 'file not created');

    // write mapping
    console.log('PATCH -> set mapping to local file');
    let r = await fetchJson('PATCH', '/fotos-clientes', { key, value: publicUrl });
    console.log('PATCH resp:', r.status, JSON.stringify(r.body));
    assert(r.status >= 200 && r.status < 300, 'PATCH failed');

    await new Promise(res=>setTimeout(res, 200));

    console.log('GET -> verify mapping');
    r = await fetchJson('GET', '/fotos-clientes');
    const map = (r.body && r.body.data) || r.body;
    assert(map && map[key] === publicUrl, 'mapping not set');

    console.log('PATCH -> set value null (should remove file)');
    r = await fetchJson('PATCH', '/fotos-clientes', { key, value: null });
    console.log('PATCH delete resp:', r.status, JSON.stringify(r.body));
    assert(r.status >= 200 && r.status < 300, 'PATCH delete failed');

    await new Promise(res=>setTimeout(res, 400));

    console.log('Check file removed from disk');
    const exists = fs.existsSync(fp);
    assert(!exists, 'file still exists after delete');

    console.log('GET -> verify mapping is null');
    r = await fetchJson('GET', '/fotos-clientes');
    const map2 = (r.body && r.body.data) || r.body;
    assert(map2 && Object.prototype.hasOwnProperty.call(map2, key), 'key missing after delete');
    assert(map2[key] === null, 'mapping not null after delete');

    console.log('DELETE-LOCAL-FILE TEST PASSED');
    process.exit(0);
  } catch (err) {
    console.error('TEST FAILED:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();
