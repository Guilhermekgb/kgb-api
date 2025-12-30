// headless-shim-test.js
// Executa o conteúdo de `fotos-shim.js` num vm simulando `window` e `localStorage`
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const shimPath = path.resolve(__dirname, '..', 'public', 'js', 'fotos-shim.js');
const shimSrc = fs.readFileSync(shimPath, 'utf8');

function runTest(){
  const logs = [];
  const calls = [];

  // Simula um ambiente mínimo de browser
  const sandbox = {
    console: { log: (...a)=> logs.push(['log', ...a]), error: (...a)=> logs.push(['err', ...a]) },
    window: {},
  };

  // localStorage simples
  const storage = {};
  sandbox.window.localStorage = {
    setItem: (k,v)=> { storage[k]=String(v); },
    getItem: (k)=> storage[k] || null,
  };

  // storageAdapter com patchFotos que registra chamadas
  sandbox.window.storageAdapter = {
    patchFotos: (k,v)=> { calls.push([k,v]); return Promise.resolve({ok:true}); }
  };

  // Avalia o shim no contexto
  vm.createContext(sandbox);
  try{
    vm.runInContext(shimSrc, sandbox, {filename: shimPath});
  } catch(e){
    console.error('Erro ao avaliar shim:', e);
    process.exit(2);
  }

  // Agora chama setItem com fotosClientes
  const sample = { 'auto-test-key': 'data:image/png;base64,TEST' };
  sandbox.window.(() => { try{ if(window.storageAdapter && typeof window.storageAdapter.setJSON === 'function'){ window.storageAdapter.setJSON('fotosClientes', sample); } else if(window.storageAdapter && typeof window.storageAdapter.setRaw === 'function'){ try{ window.storageAdapter.setRaw('fotosClientes', JSON.stringify(sample)); }catch(e){} } else { try{ (typeof window.setFotosMap==='function' ? window.setFotosMap(sample) : localStorage.setItem('fotosClientes', JSON.stringify(sample))); }catch(e){} } }catch(e){} })()

  // Aguarda 200ms para qualquer chamada assíncrona (o shim chama patchFotos direto)
  setTimeout(()=>{
    console.log('CALLS:', JSON.stringify(calls));
    if (calls.length>0 && calls[0][0] === 'auto-test-key'){
      console.log('HEADLESS SHIM TEST: PASSED');
      process.exit(0);
    } else {
      console.error('HEADLESS SHIM TEST: FAILED');
      process.exit(3);
    }
  }, 200);
}

runTest();
