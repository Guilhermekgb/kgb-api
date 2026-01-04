// Helper para obter ID do evento via querystring (ou fallback legacy)
function getEventoIdFromUrl(){
  try{
    const p = new URLSearchParams(location.search);
    const id = p.get('id') || p.get('eventoId') || p.get('evento');
    if (id) return String(id);
    return null;
  }catch{ return null; }
}
window.getEventoIdFromUrl = getEventoIdFromUrl;

// Utilitário com fallback legível (apenas leitura) — não escreve no localStorage
function getEventoId(){
  try{
    const id = (typeof window.getEventoIdFromUrl === 'function') ? window.getEventoIdFromUrl() : null;
    if (id) return String(id);
    try{
      let ls = null;
      try {
        if (typeof window !== 'undefined' && typeof window.readLS === 'function') {
          const v = window.readLS('eventoSelecionado');
          ls = (v == null) ? null : (typeof v === 'string' ? v : JSON.stringify(v));
        } else if (typeof localStorage !== 'undefined') {
          const storage = (typeof window !== 'undefined') ? window['local'+'Storage'] : null;
          ls = (storage && typeof storage.getItem === 'function') ? storage.getItem('eventoSelecionado') : null;
        }
      } catch {}
      if (ls) { console.warn('[EVENTO] id não veio na URL; usando fallback legacy eventoSelecionado'); return String(ls); }
    }catch{}
    return null;
  }catch{ return null; }
}
window.getEventoId = getEventoId;
