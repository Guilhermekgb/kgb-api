// headless-shim-e2e.js
// Executa `fotos-shim.js` num VM, provendo um storageAdapter.patchFotos
// que faz PATCH real ao servidor em http://localhost:3333/fotos-clientes
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const shimPath = path.resolve(__dirname, '..', 'public', 'js', 'fotos-shim.js');
const shimSrc = fs.readFileSync(shimPath, 'utf8');
const fetch = global.fetch || require('node:undici').fetch;

async function run(){
  const logs = [];
  const sandbox = {
    console: { log: (...a)=> logs.push(['log', ...a]), error: (...a)=> logs.push(['err', ...a]) },
    fetch,
    window: {}
  };

  // minimal localStorage
  const storage = {};
  sandbox.window.localStorage = {
    setItem: (k,v)=> { storage[k]=String(v); },
    getItem: (k)=> storage[k] || null
  };

  // storageAdapter that forwards to server
  sandbox.window.storageAdapter = {
    patchFotos: async (key, value) => {
      try{
        await fetch('http://localhost:3333/fotos-clientes', {
          method: 'PATCH',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ key, value })
        });
      }catch(e){ console.error('patchFotos failed', e); }
    }
  };

  vm.createContext(sandbox);
  try{
    vm.runInContext(shimSrc, sandbox, { filename: shimPath });
  }catch(e){ console.error('Error evaluating shim:', e); process.exit(2); }

  // trigger setItem
  const sample = { 'headless-e2e-test':'data:image/png;base64,E2E' };
  sandbox.window.(() => { try{ if(window.storageAdapter && typeof window.storageAdapter.setJSON === 'function'){ window.storageAdapter.setJSON('fotosClientes', sample); } else if(window.storageAdapter && typeof window.storageAdapter.setRaw === 'function'){ try{ window.storageAdapter.setRaw('fotosClientes', JSON.stringify(sample)); }catch(e){} } else { try{ localStorage.setItem('fotosClientes', JSON.stringify(sample)); }catch(e){} } }catch(e){} })()

  // wait for async patch to finish
  await new Promise(res=>setTimeout(res, 500));

  // verify via server
  const r = await fetch('http://localhost:3333/fotos-clientes');
  const body = await r.json();
  console.log('GET status', r.status, 'contains key?', body && body.data && Object.prototype.hasOwnProperty.call(body.data, 'headless-e2e-test'));
  if (body && body.data && body.data['headless-e2e-test'] === 'data:image/png;base64,E2E'){
    console.log('HEADLESS SHIM E2E: PASSED');
    process.exit(0);
  } else {
    console.error('HEADLESS SHIM E2E: FAILED', JSON.stringify(body));
    process.exit(3);
  }
}

run();
