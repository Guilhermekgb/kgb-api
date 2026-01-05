(async function(){
  try{
    const base = 'http://localhost:3333';
    console.log('GET /health');
    let r = await fetch(base + '/health');
    console.log(r.status, await r.text());

    console.log('\nPOST /auth/login');
    r = await fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@kgb.com', senha: '1234' })
    });
    const txt = await r.text();
    console.log('status=', r.status);
    console.log('body=', txt);

    let token = null;
    try{ token = JSON.parse(txt).token; }catch(e){ }

    if (token) {
      console.log('\nGET /auth/me with token');
      r = await fetch(base + '/auth/me', { headers: { Authorization: 'Bearer ' + token } });
      console.log('status=', r.status);
      console.log('body=', await r.text());
    } else {
      console.log('\nNo token received; skipping /auth/me');
    }
  } catch(e) {
    console.error('TEST ERROR', e);
    process.exit(1);
  }
})();
