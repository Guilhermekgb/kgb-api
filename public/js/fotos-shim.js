/*
  fotos-shim.js
  Shim leve para espelhar alterações em `localStorage.fotosClientes`
  para `window.storageAdapter.patchFotos` (quando disponível).
  - Não bloqueante: erros são silenciados.
  - Inserir este script nas páginas públicas para migração incremental.
*/
(function(){
  try{
    if (typeof window === 'undefined') return;
    // Tentar preload para evitar flash-of-empty-state quando possível
    try{ if (window.storageAdapter && typeof window.storageAdapter.preload === 'function'){ window.storageAdapter.preload().catch(()=>{}); } }catch(e){}
    // espera que a aplicação carregue window.storageAdapter (se existir)
    const maybe = () => (window.storageAdapter && typeof window.storageAdapter.patchFotos === 'function') ? window.storageAdapter : null;
    const nativeSet = window.localStorage && window.localStorage.setItem ? window.localStorage.setItem.bind(window.localStorage) : null;
    if (!nativeSet) return;

    // Substitui setItem de forma segura
    window.localStorage.setItem = function(k, v){
      try{
        if (String(k) === 'fotosClientes'){
          try{
            const obj = JSON.parse(String(v || '{}')) || {};
            const sa = maybe();
            if (sa){
              // enviar patch por chave (não bloqueante)
              for (const kk of Object.keys(obj)){
                try{ sa.patchFotos(kk, obj[kk]); } catch(e){ /* ignore */ }
              }
            }
          } catch(e){ /* malformed payload, ignore */ }
        }
      } catch(e){ /* ignore shim-level errors */ }
      return nativeSet(k, v);
    };
  } catch(e){ /* ignore global */ }
})();
