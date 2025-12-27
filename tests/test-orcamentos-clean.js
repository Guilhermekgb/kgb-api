// Teste de limpeza: remove orçamentos e leads criados pelo teste anterior (prefixo 'test-' no id)
(async ()=>{
  const base = process.env.BASE || 'http://127.0.0.1:3333';
  try{
    const r = await fetch(base + '/leads');
    if (!r.ok) { console.error('GET /leads falhou', r.status); process.exit(2); }
    const list = await r.json().catch(()=>null);
    const arr = Array.isArray(list) ? list : (list?.data||[]);
    const toRemove = arr.filter(x => String(x.id||'').startsWith('test-'));
    for(const it of toRemove){
      try{
        await fetch(base + '/leads/' + encodeURIComponent(it.id), { method: 'DELETE' });
        console.log('removido lead', it.id);
      }catch(e){ console.warn('falha remover', it.id, e); }
    }
    console.log('limpeza finalizada');
    process.exit(0);
  }catch(e){ console.error('erro limpeza', e); process.exit(99); }
})();
