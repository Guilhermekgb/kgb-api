# Filter: eventos

Matches: 280

First 50 entries:

- agenda-equipe.html:232 — try { xs = JSON.parse(localStorage.getItem('m30.eventos')||'[]') || []; } catch {}
- agenda-equipe.html:235 — const legado = JSON.parse(localStorage.getItem('eventos')||'[]') || [];
- api/eventos-api.js:6 — const load  = () => JSON.parse(localStorage.getItem(KEY) || '[]');
- api/eventos-api.js:7 — const save  = (arr) => localStorage.setItem(KEY, JSON.stringify(arr));
- area-cliente.js:156 — const eidFromLS    = localStorage.getItem('eventoSelecionado') || '';
- area-cliente.js:161 — eventos = JSON.parse(localStorage.getItem('eventos') || '[]');
- area-cliente.js:300 — try{ eventos=JSON.parse(localStorage.getItem('eventos')||'[]'); }catch{}
- area-cliente.js:596 — const eid = qs.get('id') || localStorage.getItem('eventoSelecionado') || '';
- area-cliente.js:779 — const eid = new URLSearchParams(location.search).get('id') || localStorage.getItem('eventoSelecionado') || '';
- area-cliente.js:1093 — let arr=[]; try{ arr=JSON.parse(localStorage.getItem('eventos')||'[]'); }catch{}
- area-cliente.js:1098 — localStorage.setItem('eventos', JSON.stringify(arr));
- area-cliente.js:1135 — let eventos=[]; try{ eventos=JSON.parse(localStorage.getItem('eventos')||'[]'); }catch{}
- assinatura.html:506 — const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
- assinatura.html:537 — localStorage.setItem("eventos", JSON.stringify(eventos));
- cadastro-evento.js:241 — // Salva o array de eventos no localStorage com proteção
- cadastro-evento.js:244 — localStorage.setItem('eventos', JSON.stringify(eventos || []));
- cadastro-evento.js:246 — console.error('Erro ao salvar eventos no localStorage:', err);
- cadastro-evento.js:502 — eventos = (JSON.parse(localStorage.getItem('eventos') || '[]') || [])
- cadastro-evento.js:815 — const eventos = JSON.parse(localStorage.getItem('eventos') || '[]') || [];
- cadastro-evento.js:819 — localStorage.setItem('eventos', JSON.stringify(eventos));
- cadastro-evento.js:915 — const eventosLocais = JSON.parse(localStorage.getItem('eventos') || '[]');
- cadastro-evento.js:926 — localStorage.setItem('eventos', JSON.stringify(eventosLocais));
- cadastro-evento.js:956 — const eventos = JSON.parse(localStorage.getItem('eventos') || '[]');
- cadastro-evento.js:967 — // salva lista de eventos no localStorage
- cadastro-evento.js:972 — localStorage.setItem('eventos', JSON.stringify(eventos));
- cadastro-evento.js:975 — console.warn('[KGB] Falha ao salvar eventos no localStorage', e);
- cadastro-evento.js:1526 — const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
- cadastro-evento.js:1540 — const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
- cadastro-evento.js:1560 — const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
- cadastro-evento.js:1781 — || localStorage.getItem("eventoSelecionado")
- cadastro-evento.js:1792 — localStorage.setItem("eventoSelecionado", String(id));
- cadastro-evento.js:1855 — return localStorage.getItem("eventoSelecionado") || "";
- checklist-execucao.js:324 — const raw = localStorage.getItem('eventos');
- checklist-execucao.js:331 — localStorage.setItem('eventos', JSON.stringify(eventos));
- checklist-materiais.html:652 — const getNomeIndex = ()=> { try{ return JSON.parse(localStorage.getItem('eventos:nomeIndex')||'[]'); }catch{return [];} };
- checklist.html:210 — return new URLSearchParams(location.search).get('id') || localStorage.getItem('eventoSelecionado') || '';
- checklist.html:213 — try{ return JSON.parse(localStorage.getItem('eventos')||'[]'); }catch(e){ return []; }
- checklist.html:241 — try{ localStorage.setItem('eventoSelecionado', String(id||'')); }catch(e){}
- checklist.js:32 — // Carrega um evento do backend (com fallback para o localStorage "eventos")
- clientes-lista.js:180 — // 2) Procura no localStorage "eventos"
- clientes-lista.js:182 — const eventos = JSON.parse(localStorage.getItem('eventos') || '[]');
- contrato.js:9 — // === Limpa PDFs antigos guardados dentro de eventos/clientes (para evitar lotar localStorage) ===
- contrato.js:281 — const eid = new URLSearchParams(location.search).get("id") || localStorage.getItem("eventoSelecionado") || "";
- contrato.js:284 — const eventos = JSON.parse(localStorage.getItem("eventos") || "[]");
- custos-fixo.js:503 — let eventoId = params.get('id') || localStorage.getItem('eventoSelecionado') || '';
- custos-fixo.js:505 — localStorage.setItem('eventoSelecionado', String(eventoId));
- custos-fixo.js:517 — const eventos = JSON.parse(localStorage.getItem('eventos') || '[]');
- custos-fixo.js:522 — localStorage.setItem('eventos', JSON.stringify(eventos));
- dashboard.js:708 — try{ return JSON.parse(localStorage.getItem("eventos")||"[]")||[]; }catch{ return []; }
- dashboard.js:1679 — try { return JSON.parse(localStorage.getItem("eventos") || "[]") || []; }