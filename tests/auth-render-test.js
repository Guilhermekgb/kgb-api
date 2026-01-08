(async function(){
  try{
    const base = 'https://kgb-api-v2.onrender.com';
    console.log('GET /health ->', base + '/health');
    let r = await fetch(base + '/health');
    console.log('status=', r.status);
    console.log('body=', await r.text());

    console.log('\nPOST /auth/login ->', base + '/auth/login');
    r = await fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@kgb.com', senha: '1234' })
    });
    const txt = await r.text();
    console.log('status=', r.status);
    console.log('body=', txt);

    if (r.status !== 200) {
      console.error('LOGIN failed on Render with status', r.status); process.exit(1);
    }

    let token = null;
    try{ token = JSON.parse(txt).token; }catch(e){ console.error('failed parsing login body', e); process.exit(1);} 

    console.log('\nGET /auth/me with token ->', base + '/auth/me');
    r = await fetch(base + '/auth/me', { headers: { Authorization: 'Bearer ' + token } });
    console.log('status=', r.status);
    console.log('body=', await r.text());
    if (r.status !== 200) {
      console.error('/auth/me failed on Render with status', r.status); process.exit(1);
    }

    console.log('\nRender smoke test OK');
    process.exit(0);
  } catch(e) {
    console.error('TEST ERROR', e);
    process.exit(1);
  }
})();
