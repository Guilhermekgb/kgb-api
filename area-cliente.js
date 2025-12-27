"use strict";
(async function(){

  /* ===================== Helpers base ===================== */
  const $id = (id)=>document.getElementById(id);
  const toBRL = (n)=>(Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const parseBR = (v)=>{
    if (typeof v==='number') return v;
    let s=String(v??'').trim();
    if(!s) return 0;
    s=s.replace(/[R$\s]/gi,'').replace(/\./g,'').replace(',','.');
    const n=Number(s);
    return Number.isFinite(n)?n:0;
  };
  const toBRDate=(iso)=>{
    if(!iso) return '-';
    const d=new Date(iso);
    if(!isFinite(d)) return String(iso);
    return String(d.getDate()).padStart(2,'0')+'/'
         + String(d.getMonth()+1).padStart(2,'0')+'/'
         + d.getFullYear();
  };
  const has = (v)=>v!==undefined && v!==null && String(v).trim()!=='';
  const isImg = (url)=>/\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url||'') || String(url||'').startsWith('data:image/');
  const isPdf = (url)=>/\.pdf(\?|$)/i.test(url||'');
  const ensureDataUrl = (s)=>{
    if(!s) return '';
    const t=String(s).trim();
    if (/^data:|^blob:|^https?:|^\//i.test(t)) return t;
    const b=t.replace(/\s+/g,'');
    if (b.startsWith('JVBERi0')) return 'data:application/pdf;base64,'+b;
    if (b.startsWith('/9j/'))    return 'data:image/jpeg;base64,'+b;
    if (b.startsWith('iVBORw0K'))return 'data:image/png;base64,'+b;
    if (b.startsWith('R0lGOD'))  return 'data:image/gif;base64,'+b;
    return 'data:application/octet-stream;base64,'+b;
  };

  /* ===================== Branding ===================== */
  let app={}; try{ app=JSON.parse(localStorage.getItem('app_config')||'{}'); }catch{}
  const setVar=(k,v)=>{ if(v) document.documentElement.style.setProperty(k,v); };
  setVar('--brand',  app.brand  ||'#5a3e2b');
  setVar('--brand-2',app.brand2 ||'#c29a5d');
  setVar('--bg',     app.bg     ||'#e2d1bd');
  const logoBall = $id('logoBall');
  const logoImg  = $id('logoEmpresa');
  if (app.logo && logoImg){ logoImg.src=app.logo; if(logoBall) logoBall.style.display='grid'; }
  const nomeEmp  = $id('nomeEmpresa');
  if (nomeEmp) nomeEmp.textContent = app.nome || 'Seu Buffet';

   /* ===================== Evento corrente / Portal do Cliente ===================== */
  const qs = new URLSearchParams(location.search);

  // token que vem no link que o cliente recebe
  const portalToken = qs.get('token') || qs.get('t') || '';

  const API_BASE =
    (typeof window.__API_BASE__ === 'string' && window.__API_BASE__) ||
    localStorage.getItem('API_BASE') ||
    '';

  let ev  = {};   // evento atual (preenchido pela API ou pelo localStorage)
  let eid = '';   // id do evento (vem do backend ou do localStorage)

  // 4.2 – buffers com dados financeiros vindos da API do portal
  let portalFinanceiro = null;
  let portalParcelas   = [];

  async function carregarEventoDoPortal() {
    // 1) modo portal online: usa token
    if (portalToken) {
      if (!API_BASE) {
        document.body.innerHTML =
          '<div style="display:grid;place-items:center;height:100vh;font-family:system-ui">' +
          '<div style="background:#fff;border:1px solid #ead9c8;padding:24px;border-radius:12px;max-width:520px;text-align:center">' +
          '<h2>Erro de configuração</h2><p>API_BASE não está definida. Fale com o buffet.</p></div></div>';
        throw new Error('API_BASE vazia no portal do cliente');
      }

      try {
        const url = API_BASE.replace(/\/+$/,'') + '/portal/me?token=' + encodeURIComponent(portalToken);
        const resp = await fetch(url, {
          method: 'GET',
          headers: {
            'accept': 'application/json'
          }
        });

        if (!resp.ok) {
          document.body.innerHTML =
            '<div style="display:grid;place-items:center;height:100vh;font-family:system-ui">' +
            '<div style="background:#fff;border:1px solid #ead9c8;padding:24px;border-radius:12px;max-width:520px;text-align:center">' +
            '<h2>Link inválido ou expirado</h2><p>Solicite um novo link ao buffet.</p></div></div>';
          throw new Error('GET /portal/me falhou: ' + resp.status);
        }

        const data = await resp.json();

        // aqui você ajusta conforme o backend devolver:
        // pode ser { evento: {...} } ou já o objeto do evento
        ev  = data.evento || data;
        eid = String(ev.id || ev.eventoId || '');
       // 4.2 – depois de saber o id do evento, busca financeiro + parcelas direto na API do portal
        portalFinanceiro = null;
        portalParcelas   = [];

        try {
          const base = API_BASE.replace(/\/+$/,'');

          const [finResp, parcResp] = await Promise.all([
            fetch(`${base}/portal/eventos/${encodeURIComponent(eid)}/financeiro`, {
              method: 'GET',
              headers: {
                'accept': 'application/json'
              }
            }),
            fetch(`${base}/portal/eventos/${encodeURIComponent(eid)}/parcelas`, {
              method: 'GET',
              headers: {
                'accept': 'application/json'
              }
            })
          ]);

          if (finResp.ok) {
            portalFinanceiro = await finResp.json();
          } else {
            console.warn('GET /portal/eventos/:id/financeiro falhou:', finResp.status);
          }

          if (parcResp.ok) {
            portalParcelas = await parcResp.json();
          } else {
            console.warn('GET /portal/eventos/:id/parcelas falhou:', parcResp.status);
          }
        } catch (e) {
          console.warn('[Portal] Erro ao carregar financeiro/parcelas do portal', e);
        }
        // cache leve só para esta aba/sessão (opcional)
        try { sessionStorage.setItem('portal_me', JSON.stringify(ev)); } catch {}

      } catch (err) {
        console.error('[Portal] Erro ao carregar evento do portal', err);
        if (!document.body.innerHTML.includes('Link inválido')) {
          document.body.innerHTML =
            '<div style="display:grid;place-items:center;height:100vh;font-family:system-ui">' +
            '<div style="background:#fff;border:1px solid #ead9c8;padding:24px;border-radius:12px;max-width:520px;text-align:center">' +
            '<h2>Ops...</h2><p>Não consegui carregar seu evento. Tente novamente mais tarde ou fale com o buffet.</p></div></div>';
        }
        throw err;
      }
      return;
    }

    // 2) modo antigo (interno): usa id + localStorage
    const eidFromQuery = qs.get('id') || '';
    const eidFromLS    = localStorage.getItem('eventoSelecionado') || '';
    eid = eidFromQuery || eidFromLS || '';

    let eventos = [];
    try {
      eventos = JSON.parse(localStorage.getItem('eventos') || '[]');
    } catch {
      eventos = [];
    }
    ev = eventos.find(e => String(e.id) === String(eid)) || {};
  }

  // carrega o evento assim que o script inicia (portal online ou modo antigo)
  await carregarEventoDoPortal();

  /* ===================== Cabeçalho / Hero ===================== */
  function __resolverFotoCliente(ev){
    if (!ev) return '';
    try{
      const key = ev.fotoClienteKey || '';
      if (key){
        const map = (function(){
          try{
            if (typeof getFotosClientesSync === 'function') return getFotosClientesSync();
            if (window.__FOTOS_CLIENTES_PRELOAD__ && typeof window.__FOTOS_CLIENTES_PRELOAD__ === 'object') return window.__FOTOS_CLIENTES_PRELOAD__;
            if (window.storageAdapter && typeof window.storageAdapter.getRaw === 'function'){
              const r = window.storageAdapter.getRaw('fotosClientes');
              return r ? (typeof r === 'string' ? JSON.parse(r) : r) : {};
            }
          }catch(e){ /* ignore */ }
          return {};
        })();
        const fromMap = map[key];
        if (fromMap && typeof fromMap === 'string' && fromMap.trim()){
          return fromMap;
        }
      }
    }catch{}
    const tries = [
      ev.fotoClienteURL, ev.avatarClienteURL, ev.fotoClienteUrl, ev.fotoCliente,
      ev.imagemCliente, ev.imageCliente, ev.avatar, ev.avatarUrl,
      (ev.cliente && (ev.cliente.foto || ev.cliente.imagem || ev.cliente.avatar))
    ].filter(Boolean);
    for (const v of tries){
      const s = String(v || '').trim();
      if (!s) continue;
      if (/^data:image\//i.test(s))   return s;
      if (/^blob:/i.test(s))          return s;
      if (/^(https?:|\/)/i.test(s))   return s;
    }
    return '';
  }
  (function hero(){
    const nome = $id('nomeEvento');
    const data = $id('dataEvento');
    const loc  = $id('localEvento');
    const qtd  = $id('qtdConvidados');
    const foto = $id('fotoCliente');

    if (nome) nome.textContent = ev.nomeEvento || ev.titulo || ev.nome || 'Seu evento';
    if (data) data.textContent = toBRDate(ev.dataISO || ev.dataEvento || ev.data || ev.quando);
    if (loc)  loc.textContent  = ev.local || ev.endereco || ev.salao || ev.onde || '-';
    if (qtd)  qtd.textContent  = ev.qtdConvidados || ev.quantidadeConvidados || ev.convidados || ev.pessoas || '-';

    if (foto){
      const url = __resolverFotoCliente(ev);
      if (url){ foto.src = url; foto.style.display = 'block'; }
      else {
        const svg='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="#eee"/>'+
          '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="16" fill="#999">Cliente</text></svg>'
        );
        foto.src=svg;
      }
    }
  })();

  /* ===================== KPIs ===================== */
  function totalItensComDesconto(evObj){
    const itens = Array.isArray(evObj?.itensSelecionados) ? evObj.itensSelecionados : [];
    const qtd   = parseInt(evObj?.quantidadeConvidados ?? evObj?.qtdConvidados ?? 0,10) || 0;
    const pct = (x)=>Number(String(x??'').replace('%','').replace(',','.'))||0;
    return itens.reduce((acc,it)=>{
      const base = parseBR(it.valor ?? it.preco ?? it.preço ?? 0);
      const tipo = String(it.tipoCobranca || it.cobranca || 'fixo').toLowerCase();
      const bruto = tipo.includes('pessoa') ? base*qtd : base;
      const descRS = parseBR(it.desconto ?? it.descontoValor ?? 0);
      const descPC = pct(it.descontoPorcentagem ?? it.percentualDesconto ?? it.descontoPercentual ?? 0);
      const valDesc = descRS ? Math.max(0, bruto - descRS) : (descPC ? Math.max(0, bruto * (1 - (descPC/100))) : bruto);
      return acc + valDesc;
    }, 0);
  }
  function lerSnapshotFinanceiro(eventoId){
    try{ return JSON.parse(localStorage.getItem(`financeiroEvento:${eventoId}`)||'null'); }catch{ return null; }
  }
  function valorRecebidoPorParcelas(eventoId){
    try{
      const parcelas = JSON.parse(localStorage.getItem(`parcelas:${eventoId}`)||'[]');
      return parcelas.reduce((acc,p)=>{
        const st=String(p.status||'').toLowerCase();
        const pago=(st==='pago'||st==='recebido');
        let v=0;
        if (p?.valor!=null) v=parseBR(p.valor);
        else if (p?.valorParcela!=null) v=parseBR(p.valorParcela);
        else if (p?.totalPago!=null) v=parseBR(p.totalPago);
        else {
          const raw = p?.total ?? p?.totalPrevisto ?? null;
          if (raw!=null){
            if (typeof raw==='string'){
              const s=raw.trim();
              v = (/^\d+$/.test(s) && s.length>=3) ? Number(s)/100 : parseBR(s);
            } else {
              const n=Number(raw); v=(n>=10000?n/100:n);
            }
          }
        }
        return acc + (pago ? (isFinite(v)?v:0) : 0);
      },0);
    }catch{ return 0; }
  }
  function renderKpis(){
    let contrato = 0;
    let pago     = 0;
    let falta    = 0;

    // 1) MODO PORTAL (online) → usa dados da API
    if (portalToken && portalFinanceiro) {
      const f = portalFinanceiro;

      contrato = Number(
        f.contratoTotal ??
        f.totalContrato ??
        f.total ??
        0
      );

      pago = Number(
        f.pago ??
        f.totalPago ??
        f.recebido ??
        0
      );

      let pend = (
        f.pendente ??
        f.saldoDevedor ??
        f.falta
      );

      if (pend == null) pend = contrato - pago;
      falta = Math.max(0, Number(pend || 0));
    }
    // 2) MODO ANTIGO (interno) → usa localStorage / M14
    else {
      try{ eventos=JSON.parse(localStorage.getItem('eventos')||'[]'); }catch{}
      ev = eventos.find(e=>String(e.id)===String(eid)) || ev || {};

      contrato = totalItensComDesconto(ev);
      let snap = lerSnapshotFinanceiro(eid);

      if (snap && typeof snap.falta==='number') {
        falta = Math.max(0, snap.falta);
      } else {
        const recebidoParcelas = valorRecebidoPorParcelas(eid);
        falta = Math.max(0, contrato - recebidoParcelas);
      }

      pago = Math.max(0, contrato - falta);
    }

    // Atualiza a UI
    $id('vContrato').textContent = toBRL(contrato);
    $id('vPago').textContent     = toBRL(pago);
    $id('vPendente').textContent = toBRL(falta);

    const bar = $id('pg');
    const pct = contrato>0 ? Math.min(100, Math.round((pago/contrato)*100)) : 0;
    if (bar) bar.style.width = pct+'%';
  }


  /* ===================== Contratos / Adendos ===================== */
  (function contratos(){
    const rows=[];
    const c = ev.contrato || ev.contract || {};
    if (c && (c.url||c.link||c.arquivo)){
      const s = c.assinaturas||{};
      const ok = (s.cliente===true && s.empresa===true) || String(c.status||'').toLowerCase()==='assinado';
      rows.push({
        data: toBRDate(c.dataISO||c.createdAt||c.data),
        conteudo: 'Contrato',
        assin: ok?'Assinado':'Pendente',
        cls: ok?'ok':'warn',
        link: c.url||c.link||c.arquivo||''
      });
    }
    const ads = ev.addendos || ev.adendos || [];
    if (Array.isArray(ads)){
      ads.forEach((x)=>{
        const s = x.assinaturas||{};
        const ok = (s.cliente===true && s.empresa===true) || String(x.status||'').toLowerCase()==='assinado';
        const motivo = x.motivo||x.reason||'';
        rows.push({
          data: toBRDate(x.dataISO||x.createdAt||x.data),
          conteudo: 'Adendo'+(motivo?' ('+motivo+')':''),
          assin: ok?'Assinado':'Pendente',
          cls: ok?'ok':'warn',
          link: x.url||x.link||x.arquivo||''
        });
      });
    }

    const tb=$id('tbodyContratos'); if (!tb) return;
    tb.innerHTML = rows.length
      ? rows.map(r=>{
          const a = r.link
          ? `<button class="btn ghost icon js-ver-anexo" data-url="${ensureDataUrl(r.link)}" title="Visualizar"><i data-lucide="paperclip"></i></button>
             <a class="btn icon" href="${ensureDataUrl(r.link)}" download title="Baixar"><i data-lucide="download"></i></a>`
          : '<span class="muted">-</span>';
          return `<tr><td>${r.data}</td><td>${r.conteudo}</td><td class="num"><span class="badge ${r.cls}">${r.assin}</span></td><td class="num">${a}</td></tr>`;
        }).join('')
      : '<tr><td colspan="4" class="muted">Sem documentos.</td></tr>';

    // Visualização em modal
    tb.querySelectorAll('.js-ver-anexo').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const url = btn.getAttribute('data-url') || '';
        const modal = document.getElementById('modal');
        const box   = document.getElementById('boxMedia');
        let html = '';
        if (isImg(url)) html = `<img src="${url}" alt="Comprovante" style="max-width:100%;height:auto;border-radius:10px">`;
        else if (isPdf(url)) html = `<iframe src="${url}" style="width:90vw;height:70vh;border:0"></iframe>`;
        else html = `<iframe src="${url}" style="width:90vw;height:70vh;border:0"></iframe>`;
        box.innerHTML = html;
        modal.classList.add('open');
        try{ lucide.createIcons(); }catch{}
      });
    });
  })();

  /* ===================== Cardápio contratado (capa + chips + modal) ===================== */
  (function cardapio(){
    const DB_NAME='buffetDB', DB_STORE='imagens';
    function openDB(){return new Promise(res=>{try{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);};r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);}catch{res(null);}});}
    async function getBlobById(id){
      try{
        const db=await openDB(); if(!db) return null;
        return await new Promise(resolve=>{
          try{
            const tx=db.transaction(DB_STORE,'readonly'); const st=tx.objectStore(DB_STORE);
            const rq=st.get(String(id));
            rq.onsuccess=()=>{const v=rq.result; resolve(v?.blob instanceof Blob ? v.blob : (v instanceof Blob ? v : null));};
            rq.onerror = ()=>resolve(null);
          }catch{ resolve(null); }
        });
      }catch{ return null; }
    }
    const stripSlug=(s)=>String(s||'').replace(/^cardapio\s+/i,'').replace(/[-_]+/g,' ').trim();
    const normCard =(s)=>String(stripSlug(s)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');

    function pickCardapio(){
      let c=null;
      if (ev.cardapio) c=(typeof ev.cardapio==='string')?{nome:ev.cardapio}:ev.cardapio;
      if (!c && ev.cardapioNome) c={nome:ev.cardapioNome};
      if (!c && ev.cardapioOficial) c=(typeof ev.cardapioOficial==='string')?{nome:ev.cardapioOficial}:ev.cardapioOficial;
      if (!c && ev.cardapioPrincipal) c=(typeof ev.cardapioPrincipal==='string')?{nome:ev.cardapioPrincipal}:ev.cardapioPrincipal;
      if (!c && Array.isArray(ev.cardapios_enviados)){
        c = ev.cardapios_enviados.find(x=>x.escolhido||x.contratado||x.selecionado) || ev.cardapios_enviados[0] || null;
      }
      if (!c && Array.isArray(ev.itensSelecionados)){
        const it = ev.itensSelecionados.find(i=>String(i.categoria||i.tipo||'').toLowerCase().includes('card'));
        if (it) c={nome:it.nome||it.titulo||it.descricao, imagens:it.imagens||it.images||[]};
      }
      if (!c && ev.cardapioContratado) c=(typeof ev.cardapioContratado==='string')?{nome:ev.cardapioContratado,id:ev.cardapioContratado}:ev.cardapioContratado;
      if (!c && ev.menuContracted) c=(typeof ev.menuContracted==='string')?{nome:ev.menuContracted}:ev.menuContracted;
      if (!c && ev.menu) c=(typeof ev.menu==='string')?{nome:ev.menu}:ev.menu;
      if (!c && ev.cardapioId) c={id:ev.cardapioId};
      return c||{};
    }
    function bestFromEnviados(card){
      const arr = Array.isArray(ev.cardapios_enviados)?ev.cardapios_enviados:[];
      if(!arr.length) return null;
      const id=String(card.id||'').toLowerCase();
      const n1=normCard(card.nome||card.titulo||'');
      let hit = arr.find(it=>id && String(it.id||'').toLowerCase()===id);
      if(!hit && n1){
        hit = arr.find(it=>normCard(it.nome||'')===n1) ||
              arr.find(it=>{const p=normCard(it.nome||''); return p.includes(n1)||n1.includes(p);});
      }
      return hit||null;
    }
    function getArrLS(key){ try{ const v=JSON.parse(localStorage.getItem(key)||'[]'); return Array.isArray(v)?v:[]; }catch{ return []; } }
    function fromPropostas(eid, preferName){
      try{
        let best=null, bestStrict=null;
        for(let i=0;i<localStorage.length;i++){
          const k=localStorage.key(i)||'';
          if(!/^proposta_visualizacoes/i.test(k)) continue;
          const arr=getArrLS(k).filter(x=>String(x?.tipo||'').toLowerCase()==='cardapio');
          if(!arr.length) continue;
          const preferKey = eid && k.indexOf(String(eid))>-1;
          if(preferName){
            const n1=normCard(preferName);
            const ex = arr.find(c=>normCard(c.nome||'')===n1) ||
                       arr.find(c=>{const p=normCard(c.nome||''); return p.includes(n1)||n1.includes(p);});
            if(ex){ bestStrict=ex; if(preferKey) return ex; }
          }
          if(!best || preferKey) best=arr[0];
        }
        return bestStrict||best||null;
      }catch{ return null; }
    }
    const CATALOG_KEYS=['produtosBuffet','cardapios','cardapiosBuffet','itensBuffet','pratosBuffet'];
    const takeName=(o)=> (o && (o.nome||o.titulo||o.name)) || '';
    const takeImgs=(o)=> (o && (o.imagens||o.images||o.fotos)) || [];

    async function resolveSources(card){
      const out=[];
      const add=(u)=>{ if(u && typeof u==='string' && !out.includes(u)) out.push(u); };
      async function pushImgs(list){
        (list||[]).forEach(async x=>{
          if(!x) return;
          if(typeof x==='string'){ add(x); return; }
          const s=x.src||x.url||x.dataUrl||x.base64||x.link; if(s){ add(s); return; }
          const k=x.dbId||x.id||x.key;
          if(k){ const b=await getBlobById(k); if(b) add(URL.createObjectURL(b)); }
        });
      }
      await pushImgs(takeImgs(card));
      add(card.capa); add(card.thumb);
      add(card.imagem||card.image||card.urlImagem);
      add(card.arquivo||card.file); add(card.url); add(card.downloadUrl);

      if(!out.length){
        const ref=bestFromEnviados(card);
        if(ref){
          await pushImgs(takeImgs(ref));
          add(ref.arquivo||ref.url||ref.link);
          if(!card.nome && ref.nome) card.nome=ref.nome;
        }
      }
      if(!out.length){
        const prefer = card.nome || '';
        const p = fromPropostas(eid, prefer);
        if(p){
          await pushImgs(takeImgs(p));
          add(p.arquivo||p.url||p.link);
          if(!card.nome && p.nome) card.nome=p.nome;
        }
      }
      if(!out.length){
        const nm = stripSlug(card.nome||''); const n1=normCard(nm);
        for(const k of CATALOG_KEYS){
          const arr=getArrLS(k); if(!arr.length) continue;
          let hit=null;
          if(card.id){ hit=arr.find(p=>String(p.id)===String(card.id)); }
          if(!hit && n1){
            hit = arr.find(p=>normCard(takeName(p))===n1) ||
                  arr.find(p=>{const np=normCard(takeName(p)); return np.includes(n1)||n1.includes(np);});
          }
          if(hit){
            await pushImgs(takeImgs(hit));
            add(hit.arquivo||hit.url||hit.link);
            if(!card.nome) card.nome=takeName(hit);
            if(out.length) break;
          }
        }
      }
      return out.filter(Boolean);
    }

    function renderItensContratados(){
      const destino=$id('listaItensContratados'); if(!destino) return;
      const fontes=[]
        .concat(Array.isArray(ev.itensSelecionados)?ev.itensSelecionados:[])
        .concat(Array.isArray(ev.adicionaisContratados)?ev.adicionaisContratados:[])
        .concat(Array.isArray(ev.servicosContratados)?ev.servicosContratados:[])
        .concat(Array.isArray(ev.adicionais)?ev.adicionais:[])
        .concat(Array.isArray(ev.servicos)?ev.servicos:[])
        .concat(Array.isArray(ev.itens)?ev.itens:[]);
      const nomes=[];
      fontes.forEach(it=>{
        const cat=String(it.categoria||it.tipo||'').toLowerCase();
        if(cat.includes('card')) return;
        const nome=it.nome||it.titulo||it.descricao||it.item;
        if(nome && !nomes.includes(nome)) nomes.push(nome);
      });
      destino.innerHTML = nomes.map(n=>`<span class="chip">${n}</span>`).join('');
    }

    (async function init(){
      const nomeEl=$id('nomeCardapio');
      const descEl=$id('descCardapio');
      const imgEl =$id('imgCardapio');
      const iconBox=$id('iconFallback');
      const btnVer=$id('btnVerCardapio');
      const btnDown=$id('btnBaixarCardapio');
      const modal=$id('modal'), box=$id('boxMedia'), fechar=$id('fecharModal');

      const openModalWith=(html)=>{ box.innerHTML=html; modal.classList.add('open'); try{ lucide.createIcons(); }catch{} };
      if (fechar) fechar.addEventListener('click', ()=>modal.classList.remove('open'));
      if (modal)  modal.addEventListener('click',(e)=>{ if(e.target===modal) modal.classList.remove('open'); });

      const card=pickCardapio();
      if(card.nome) card.nome=stripSlug(card.nome);
      if (nomeEl) nomeEl.textContent = card.nome||card.titulo||'Cardápio';
      if (descEl) descEl.textContent = card.descricao||card.description||'-';

      const sources = await resolveSources(card);
      const firstImg = sources.find(isImg);
      const firstPdf = sources.find(isPdf);

      if(firstImg && imgEl){ imgEl.src=firstImg; imgEl.style.display='block'; if(iconBox) iconBox.style.display='none'; }
      else if(iconBox){
        iconBox.innerHTML='';
        iconBox.style.display='grid';
        if(app.logo){ const lg=new Image(); lg.src=app.logo; lg.alt='Logo'; iconBox.appendChild(lg); }
        else iconBox.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18v4H3z"/><path d="M8 7v14"/><path d="M16 7v14"/><path d="M3 11h18"/><path d="M3 16h18"/></svg>';
      }

      if (btnDown){
        if (sources[0]){ btnDown.href=sources[0]; btnDown.removeAttribute('disabled'); }
        else { btnDown.href='#'; btnDown.setAttribute('disabled',''); }
      }
      if (btnVer){
        btnVer.addEventListener('click', ()=>{
          let html='';
          const imgs = sources.filter(isImg);
          const pdf  = sources.find(isPdf);
          if (imgs.length){ html = imgs.map(u=>`<img src="${u}" alt="Imagem do cardápio">`).join(''); }
          else if (pdf){ html = `<iframe src="${pdf}" style="width:90vw;height:70vh;border:0"></iframe>`; }
          else html = '<div class="muted">Sem conteúdo para visualizar.</div>';
          openModalWith(html);
        });
      }

      renderItensContratados();
      console.debug('[AreaCliente][Cardapio]', {card, fontes:sources.length});
    })();
  })();

   /* ===================== Pagamentos / Comprovantes ===================== */
  (function pagamentos(){
    const $ = (id)=>document.getElementById(id);
    const toBRL = (n)=>(Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const parseBR = (v)=>{ if(typeof v==='number') return v; const s=String(v??'').trim().replace(/[R$\s]/gi,'').replace(/\./g,'').replace(',','.'); const n=Number(s||0); return Number.isFinite(n)?n:0; };
    const toBRDate=(iso)=>{ if(!iso) return '-'; const d=new Date(iso); return isFinite(d)?`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`:String(iso); };
    const has=(v)=>v!==undefined && v!==null && String(v).trim()!=='';    

    const qs  = new URLSearchParams(location.search);
    const eid = qs.get('id') || localStorage.getItem('eventoSelecionado') || '';

    const readFG = ()=>{ try{ return JSON.parse(localStorage.getItem('financeiroGlobal')||'{}')||{}; }catch{ return {}; } };
    const getCompLanc = (lancId)=>{ try{ return localStorage.getItem(`fg.comp:${lancId}`)||null; }catch{ return null; } };
    const getCompParc = (parcId)=>{ try{ return localStorage.getItem(`fg.comp.parc:${parcId}`)||null; }catch{ return null; } };

    function montarLinhas(){
      const linhas=[]; const seen=new Set();
      const dedupKey=(o)=>[
        o.id||o.parcelaId||'',
        o.dataPagamentoISO||o.dataISO||o.data||'',
        parseBR(o.valor||o.valorPago||o.valorParcela||0),
        o.descricao||o.titulo||o.nome||o.parcela||''
      ].join('|');

      const push=(r)=>{
        const k=dedupKey(r); if(seen.has(k)) return; seen.add(k);
        const dataRaw = r.dataPagamentoISO || r.dataISO || r.data || r.vencimentoISO || r.vencimento || r.dataVenc || r.dataPrevista || null;
        const valor   = parseBR(r.valor || r.valorParcela || r.valorPago || r.total || r.totalPrevisto || 0);
        const stRaw   = String(r.status||r.situacao||'').toLowerCase();
        const pago    = stRaw==='pago' || stRaw==='recebido' || has(r.dataPagamentoISO);
        const badge   = pago ? 'ok' : 'warn';
        linhas.push({
          dataOrd: new Date(dataRaw && isFinite(new Date(dataRaw)) ? dataRaw : 0),
          dataTxt: toBRDate(dataRaw),
          desc: r.descricao || r.titulo || r.nome || r.parcela || r.tipo || 'Recebimento',
          val: valor,
          st: pago ? 'Pago' : 'Pendente',
          badge,
          link: r._anexo || r.comprovanteUrl || r.reciboUrl || r.arquivo || r.url || ''
        });
      };

      // ==== MODO PORTAL (online) — usa dados da API (/portal/eventos/:id/parcelas) ====
      if (portalToken && Array.isArray(portalParcelas) && portalParcelas.length){
        portalParcelas.forEach(p=>{
          const dataPg  = p.dataPagamentoISO || p.dataPagamento || null;
          const dataRaw = dataPg || p.dataISO || p.vencimentoISO || p.vencimento || p.data || null;
          const valor   = parseBR(p.valor ?? p.valorParcela ?? p.total ?? p.totalPrevisto ?? 0);
          const stRaw   = String(p.status || p.situacao || '').toLowerCase();
          const pago    = stRaw==='pago' || stRaw==='recebido' || stRaw==='quitado' || !!dataPg;
          const anexo   = p.comprovanteUrl || p.reciboUrl || p.anexoUrl || '';

          push({
            id: p.id,
            dataPagamentoISO: dataPg,
            dataISO: p.dataISO || null,
            vencimentoISO: p.vencimentoISO || p.vencimento || null,
            descricao: p.descricao || p.titulo || p.nome || p.parcela || 'Parcela',
            valor: valor,
            status: pago ? 'pago' : (p.status || 'pendente'),
            _anexo: anexo
          });
        });

        linhas.sort((a,b)=> b.dataOrd - a.dataOrd);
        return linhas;
      }

      // ==== MODO ANTIGO (interno) — usa localStorage / M14 ====
      try{
        const arr = JSON.parse(localStorage.getItem(`parcelas:${eid}`)||'[]');
        arr.forEach(p=>{
          const anexo = p.comprovanteUrl || p.comprovante || p.reciboUrl || p.url || p.arquivo || getCompParc(p.id);
          push({...p, _anexo: anexo});
        });
      }catch{}

      const fg = readFG();
      const lancs = Array.isArray(fg.lancamentos)?fg.lancamentos:[];
      const parcs = Array.isArray(fg.parcelas)?fg.parcelas:[];

      const parcsByLanc = new Map();
      (parcs||[]).forEach(p=>{
        if(String(p.eventoId)===String(eid)){
          const arr = parcsByLanc.get(p.lancamentoId)||[];
          arr.push(p); parcsByLanc.set(p.lancamentoId, arr);
        }
      });

      (lancs||[])
        .filter(l => String(l.eventoId)===String(eid))
        .forEach(l=>{
          const ps = parcsByLanc.get(l.id) || [];
          const pPago = ps.find(p => String(p.status||'').toLowerCase()==='pago' || has(p.dataPagamentoISO));
          const dataPg = (pPago && (pPago.dataPagamentoISO||pPago.dataISO)) || l.dataPagamentoISO || null;
          const stRaw = String(l.status||'').toLowerCase();
          const pago  = stRaw==='pago' || stRaw==='recebido' || !!dataPg;
          const anexo = (pPago && (pPago.comprovanteUrl || getCompParc(pPago.id))) ||
                        l.comprovanteUrl || getCompLanc(l.id) || l.url || l.arquivo || '';
          push({
            id: l.id,
            dataPagamentoISO: dataPg || l.dataPagamentoISO || null,
            dataISO: l.dataISO || l.dataCompetencia || null,
            descricao: l.descricao || 'Recebimento',
            valor: l.valor || l.valorTotal || 0,
            status: pago ? 'pago' : (l.status||'pendente'),
            _anexo: anexo
          });
        });

      (parcs||[])
        .filter(p => String(p.eventoId)===String(eid))
        .forEach(p=>{
          const anexo = p.comprovanteUrl || getCompParc(p.id) || '';
          push({
            id: p.id, parcela: p.numero?`Parcela ${p.numero}/${p.de||p.numero}`: 'Parcela',
            dataPagamentoISO: p.dataPagamentoISO || null,
            vencimentoISO: p.vencimentoISO || p.vencimento || null,
            descricao: p.descricao || 'Parcela',
            valor: p.valor || p.valorParcela || 0,
            status: p.status || 'pendente',
            _anexo: anexo
          });
        });

      linhas.sort((a,b)=> b.dataOrd - a.dataOrd);
      return linhas;
    }

    function render(){
      const tbody = $('tbodyPagamentos'); if(!tbody) return;
      const rows = montarLinhas();
      tbody.innerHTML = rows.length
        ? rows.map(r=>`
            <tr>
              <td>${r.dataTxt}</td>
              <td>${r.desc}</td>
              <td class="num">${toBRL(r.val)}</td>
              <td class="num"><span class="badge ${r.badge}">${r.st}</span></td>
              <td class="num">${
                r.link
                  ? `<button class="btn ghost icon js-ver-comp" data-url="${ensureDataUrl(r.link)}" title="Visualizar"><i data-lucide="paperclip"></i></button>
                      <a class="btn icon" href="${ensureDataUrl(r.link)}" download title="Baixar"><i data-lucide="download"></i></a>`
                  : '<span class="muted">-</span>'
              }</td>
            </tr>
            `).join('')
  : '<tr><td colspan="5" class="muted">Sem registros.</td></tr>';

      // abrir anexos em modal
      tbody.querySelectorAll('.js-ver-comp').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const url = btn.getAttribute('data-url') || '';
          const modal = document.getElementById('modal');
          const box   = document.getElementById('boxMedia');
          let html = '';
          if (isImg(url)) html = `<img src="${url}" alt="Comprovante" style="max-width:100%;height:auto;border-radius:10px">`;
          else if (isPdf(url)) html = `<iframe src="${url}" style="width:90vw;height:70vh;border:0"></iframe>`;
          else html = `<iframe src="${url}" style="width:90vw;height:70vh;border:0"></iframe>`;
          box.innerHTML = html;
          modal.classList.add('open');
          try{ lucide.createIcons(); }catch{}
        });
      });
      try{ lucide.createIcons(); }catch{}
    }

    render();

    // no modo interno ainda escutamos mudanças de LS;
    // no modo portal, isso basicamente não mexe em nada.
    window.addEventListener('storage', (e)=>{
      const k = String(e.key||'');
      if (k==='financeiroGlobal' || k.startsWith('parcelas:') || k.startsWith('fg.comp:') || k.startsWith('fg.comp.parc:')){
        render();
      }
    });
  })();


  /* ===================== Definições (Cardápio A4 e Layout) ===================== */
  (function definicoes(){
    const modal=$id('modal'), box=$id('boxMedia'), fechar=$id('fecharModal');
    const openModalWith=(html)=>{ box.innerHTML=html; modal.classList.add('open'); try{ lucide.createIcons(); }catch{} };
    if (fechar) fechar.addEventListener('click', ()=>modal.classList.remove('open'));
    if (modal)  modal.addEventListener('click',(e)=>{ if(e.target===modal) modal.classList.remove('open'); });

    const loadDefsFromLS=(eid)=>{ try{ return JSON.parse(localStorage.getItem('definicoes_evento_'+eid)||'{}')||{}; }catch{ return {}; } };
    const possuiArquivos=(arr)=>Array.isArray(arr)&&arr.filter(Boolean).length>0;

    function renderDefCardapioBox(){
      const el=$id('defCardapioInfo'); if(!el) return;
      const eid = new URLSearchParams(location.search).get('id') || localStorage.getItem('eventoSelecionado') || '';
      const s = loadDefsFromLS(eid);
      if(!s || !s.a4Html){
        el.innerHTML='<span class="badge warn">Pendente</span>'; return;
      }
      el.innerHTML =
        '<span class="badge ok">Definido</span>'+
        '<div class="row" style="margin-top:8px">'+
          '<button id="verA4Cardapio" class="btn ghost" type="button"><i data-lucide="eye"></i> Visualizar</button>'+
          '<a id="baixarA4Cardapio" class="btn" download="cardapio-definido.html"><i data-lucide="download"></i> Baixar</a>'+
        '</div>';
        const btnVer=$id('verA4Cardapio'); const aDown=$id('baixarA4Cardapio');
        // event listeners para visualizar/baixar o A4 gerado
        if (btnVer) {
          btnVer.addEventListener('click', () => {
            try {
              const html = s.a4Html || '';
              const modal = $id('modal');
              if (modal) {
                modal.querySelector('.modal-body')?.remove();
                const body = document.createElement('div');
                body.className = 'modal-body';
                body.innerHTML = html;
                modal.appendChild(body);
                modal.classList.add('open');
                try { lucide.createIcons?.(); } catch {}
              } else {
                const w = window.open('', '_blank');
                if (w) {
                  w.document.write(html);
                  w.document.close();
                }
              }
            } catch (e) { console.warn('Falha ao visualizar A4', e); }
          });
        }
        if (aDown) {
          try {
            const html = s.a4Html || '';
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            aDown.href = url;
            aDown.download = `cardapio-${eid || 'evento'}.html`;
          } catch (e) { console.warn('Falha ao preparar download do A4', e); }
        }
      }

    async function getLayoutBlobByKey(key){
      try{
        const db=await openLayoutDB(); if(!db) return null;
        return await new Promise(resolve=>{
          try{
            const tx=db.transaction('layouts','readonly');
            const st=tx.objectStore('layouts');
            const rq=st.get(String(key));
            rq.onsuccess=()=>{
              const v=rq.result;
              if (!v) return resolve(null);
              if (v instanceof Blob) return resolve(v);
              if (v?.blob instanceof Blob) return resolve(v.blob);
              resolve(null);
            };
            rq.onerror=()=>resolve(null);
          }catch{ resolve(null); }
        });
      }catch{ return null; }
    }

    async function renderDefLayoutBox(){
      const el=$id('defLayoutInfo'); if(!el) return;
      const d = (ev.definicoes && ev.definicoes.layout) || ev.layout || {};
      const idbKey = d.idbKey || d.dbKey || d.key;
      let urls=[]; if(Array.isArray(d.arquivos)) urls=urls.concat(d.arquivos); if(d.arquivo) urls.push(d.arquivo); if(d.url) urls.push(d.url);

      if(!idbKey && !urls.length){
        el.innerHTML='<span class="badge warn">Pendente</span>'; return;
      }
      el.innerHTML =
        '<span class="badge ok">Definido</span>'+
        '<div class="row" style="margin-top:8px">'+
          '<button id="verLayout" class="btn ghost" type="button"><i data-lucide="eye"></i> Visualizar</button>'+
          '<a id="baixarLayout" class="btn" download="layout-a4.png"><i data-lucide="download"></i> Baixar</a>'+
        '</div>';
      const btnVer=$id('verLayout'); const aDown=$id('baixarLayout');

      if (idbKey){
        (async ()=>{
          const blob=await getLayoutBlobByKey(idbKey);
          if (blob){ aDown.href=URL.createObjectURL(blob); aDown.download='layout-a4.png'; }
          else { aDown.removeAttribute('href'); aDown.setAttribute('disabled',''); }
        })();
        if (btnVer){
          btnVer.addEventListener('click', async ()=>{
            const blob=await getLayoutBlobByKey(idbKey);
            if(!blob){ openModalWith('<div class="muted">Não foi possível carregar o layout.</div>'); return; }
            openModalWith(`<img src="${URL.createObjectURL(blob)}" alt="Layout A4" style="max-width:100%;height:auto;border-radius:8px">`);
          });
        }
      } else {
        const first=urls[0]||'';
        if(btnVer){
          btnVer.addEventListener('click', ()=>{
            if(/\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(first)){
              openModalWith(`<img src="${first}" alt="Layout" style="max-width:100%;height:auto;border-radius:8px">`);
            } else if (/\.pdf(\?|$)/i.test(first)){
              openModalWith(`<iframe src="${first}" style="width:90vw;height:70vh;border:0"></iframe>`);
            } else openModalWith('<div class="muted">Sem conteúdo para visualizar.</div>');
          });
        }
        if(aDown){ aDown.href=first||'#'; if(!first) aDown.setAttribute('disabled',''); }
      }
    }

    renderDefCardapioBox();
    renderDefLayoutBox();
  })();

  /* ===================== Etapas do Evento ===================== */
  (function etapas(){
    const toISOdate=(v)=>{ if(!v) return null; const d=new Date(v); return isFinite(d)?d:null; };
    const loadDefsFromLS=(eid)=>{ try{ return JSON.parse(localStorage.getItem('definicoes_evento_'+eid)||'{}')||{}; }catch{ return {}; } };
    const possuiArquivos=(arr)=>Array.isArray(arr)&&arr.filter(Boolean).length>0;

    const contratoAssinado=(_ev)=>{
      const c=_ev.contrato||_ev.contract||{};
      const s=c.assinaturas||{};
      const okFlag=String(c.status||'').toLowerCase()==='assinado';
      return okFlag || (s.cliente===true && s.empresa===true);
    };
    const temCardapioContratado=(_ev,_eid)=>{
      if (_ev.cardapioContratado || _ev.menu || _ev.menuContracted) return true;
      if (has(_ev.cardapioId) || has(_ev.cardapioNome) || has(_ev.nomeCardapio)) return true;
      try{
        const c=JSON.parse(localStorage.getItem('cardapioSelecionado')||'null');
        if (c && (String(c.eventoId||_eid)===String(_eid)) && (has(c.id)||has(c.nome))) return true;
      }catch{}
      if (Array.isArray(_ev.itensSelecionados)){
        return _ev.itensSelecionados.some(it => String(it.tipo||it.categoria||'').toLowerCase().includes('card'));
      }
      return false;
    };
    function defCardapioOK(_ev,_eid){
      const d = (_ev.definicoes && _ev.definicoes.cardapio) || _ev.cardapioDefinido || {};
      if (possuiArquivos(d.arquivos) || has(d.arquivo) || has(d.url)) return true;
      const ls  = loadDefsFromLS(_eid) || {};
      if (ls.a4Html) return true;
      const lsc = ls.cardapio || {};
      return possuiArquivos(lsc.arquivos) || has(lsc.arquivo) || has(lsc.url);
    }
   function defLayoutOK(_ev,_eid){
  const d = (_ev.definicoes && _ev.definicoes.layout) || _ev.layout || {};
  if (
    possuiArquivos(d.arquivos) ||
    has(d.arquivo) || has(d.url) ||
    has(d.idbKey) || has(d.dbKey) || has(d.key)
  ) return true;

  const ls  = loadDefsFromLS(_eid) || {};
  const lsl = ls.layout || {};
  return (
    possuiArquivos(lsl.arquivos) ||
    has(lsl.arquivo) || has(lsl.url) ||
    has(lsl.idbKey) || has(lsl.dbKey) || has(lsl.key)
  );
}
const financeiroEmDia = (_ev) => {
  const pars = (_ev.financeiro && Array.isArray(_ev.financeiro.parcelas))
    ? _ev.financeiro.parcelas
    : [];
  if (!pars.length) return true;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  return !pars.some(p => {
    const st   = String(p.status || p.situacao || '').toLowerCase();
    const pago = (st === 'pago' || st === 'quitado' || st === 'liquidado'
                  || p.pago === true
                  || (p.dataPagamentoISO && p.dataPagamentoISO !== ''));
    const venc = toISOdate(p.vencimentoISO || p.vencimento || p.dataVenc || p.data);
    return (!pago && venc && venc < hoje);
  });
};

    const linhas = [
      { t: 'Assinatura do contrato', ok: contratoAssinado(ev) },
      { t: 'Cardápio contratado',    ok: temCardapioContratado(ev, eid) },
      { t: 'Definição de cardápio',  ok: defCardapioOK(ev, eid) },
      { t: 'Definição de layout',    ok: defLayoutOK(ev, eid) },
      { t: 'Pagamentos',             ok: financeiroEmDia(ev), err: !financeiroEmDia(ev) }
    ];

    const tb = $id('tbodyEtapas'); 
    if (!tb) return;

    tb.innerHTML = linhas.map(L => {
      const cls = L.ok ? 'ok' : (L.err ? 'err' : 'warn');
      const txt = L.ok ? 'OK' : (L.err ? 'Atrasado' : 'Pendente');
      return `<tr><td>${L.t}</td><td class="num"><span class="badge ${cls}">${txt}</span></td></tr>`;
    }).join('');
  })(); // <— fecha o IIFE de etapas

  /* ===================== Contagem regressiva ===================== */
  (function countdown(){
    const card=$id('cardContagem'); if(!card) return;
    const num=$id('countNum'); const label=$id('countLabel'); const sub=$id('countSub');
        const dataEv = ev.dataISO || ev.dataEvento || ev.data || ev.quando;

    function atualizar(){
      const d=new Date(dataEv);
      if(!isFinite(d)){ card.style.display='none'; return; }
      const agora=new Date();
      const diffMs=d-agora;
      const dias=Math.floor(diffMs/86400000);

      if (dias>0){
        num.textContent=dias;
        label.textContent=(dias===1?'dia':'dias');
        sub.textContent=`Faltam ${dias} ${dias===1?'dia':'dias'} para o grande dia!`;
      } else if (dias===0){
        const horas=Math.floor((diffMs%86400000)/3600000);
        const minutos=Math.floor((diffMs%3600000)/60000);
        if (horas>0){
          num.textContent=horas;
          label.textContent=(horas===1?'hora':'horas');
          sub.textContent=`É hoje! (${horas}h ${minutos}min)`;
        } else if (minutos>0){
          num.textContent=minutos;
          label.textContent=(minutos===1?'minuto':'minutos');
          sub.textContent='É hoje! Falta muito pouco!';
        } else {
          num.textContent='🎉';
          label.textContent='';
          sub.textContent='É hoje! Aproveite cada momento!';
        }
      } else {
        num.textContent='✔';
        label.textContent='';
        sub.textContent='Evento realizado. Obrigada por nos escolher!';
      }
    }

    atualizar();
    setInterval(atualizar, 60000);
  })();
  /* ===================== Timeline do Evento (4.4, só visualização) ===================== */
  (function timelinePortal(){
    // Só faz sentido no modo portal (cliente acessando com token)
    if (!portalToken || !API_BASE || !eid) return;

    const base          = API_BASE.replace(/\/+$/,'');
    const listaTimeline = $id('listaTimeline');
    if (!listaTimeline) return;

    async function carregarTimeline(){
      try {
        const url = `${base}/portal/eventos/${encodeURIComponent(eid)}/timeline`;
        const resp = await fetch(url, {
          method:'GET',
          headers:{
            'x-tenant-id':'default',
            'accept':'application/json'
          }
        });

        if (!resp.ok) {
          console.warn('GET /portal/eventos/:id/timeline falhou:', resp.status);
          listaTimeline.innerHTML = '<li class="muted">Não foi possível carregar a linha do tempo.</li>';
          return;
        }

        const data = await resp.json();
        const eventosTL = Array.isArray(data)
          ? data
          : (data.eventos || data.timeline || []);

        if (!eventosTL || !eventosTL.length) {
          listaTimeline.innerHTML = '<li class="muted">Ainda não há eventos registrados na linha do tempo.</li>';
          return;
        }

        // ordena do mais antigo para o mais recente
        eventosTL.sort((a,b)=>{
          const da = new Date(a.dataISO || a.data || 0).getTime();
          const db = new Date(b.dataISO || b.data || 0).getTime();
          return da - db;
        });

        listaTimeline.innerHTML = eventosTL.map(evTL => {
          const titulo = evTL.titulo || evTL.tipo || evTL.acao || 'Atualização';
          const desc   = evTL.descricao || evTL.descricaoPublica || evTL.mensagem || '';
          const data   = toBRDate(evTL.dataISO || evTL.data || evTL.quando);
          const destaque = !!(evTL.importante || evTL.highlight);

          const clsItem = destaque ? 'tl-item destaque' : 'tl-item';

          return `
            <li class="${clsItem}">
              <div class="tl-data">${data}</div>
              <div class="tl-conteudo">
                <strong>${titulo}</strong>
                ${desc ? `<p>${desc}</p>` : ''}
              </div>
            </li>
          `;
        }).join('');
      } catch (err) {
        console.error('[Portal] Erro ao carregar timeline', err);
        listaTimeline.innerHTML = '<li class="muted">Erro ao carregar a linha do tempo.</li>';
      }
    }

    carregarTimeline();
  })();

  /* ===================== Notas / WhatsApp / Saudação ===================== */
  (function notasWhats(){
    const txt=$id('notaCardapio');
    const txi=$id('duvidasIdeias');
    const hn=$id('hintNotas');
    const hi=$id('hintIdeias');

    if (ev.clientNotes?.menu && txt) txt.value=ev.clientNotes.menu;
    if (ev.clientNotes?.ideias && txi) txi.value=ev.clientNotes.ideias;

    const save = (key, val, hintEl)=>{
      let arr=[]; try{ arr=JSON.parse(localStorage.getItem('eventos')||'[]'); }catch{}
      const i = arr.findIndex(x=>String(x.id)===String(eid));
      if (i>-1){
        arr[i].clientNotes = arr[i].clientNotes || {};
        arr[i].clientNotes[key] = val;
        localStorage.setItem('eventos', JSON.stringify(arr));
        if (hintEl){ hintEl.textContent='Salvo!'; setTimeout(()=>{hintEl.textContent='';}, 1200); }
      }
    };

    const btnNotas=$id('salvarNotas');
    if(btnNotas && txt) btnNotas.addEventListener('click', ()=>save('menu', txt.value, hn));

    const btnIdeias=$id('salvarIdeias');
    if(btnIdeias && txi) btnIdeias.addEventListener('click', ()=>save('ideias', txi.value, hi));

    const n = String((app.whats||app.whatsapp||'')).replace(/\D+/g,'');
    const btn = $id('btnWhats');
    if (btn){
      const link = n ? 'https://wa.me/'+n+'?text='+encodeURIComponent('Olá!') : '#';
      btn.href=link;
      if(!n) btn.setAttribute('disabled','');
    }

    const elMsg=$id('saudacaoMensagem');
    const nomeCli=(ev.cliente && (ev.cliente.nome||ev.cliente.nomeCompleto)) || '';
    if (elMsg && nomeCli) elMsg.textContent = 'Obrigada pela confiança, '+nomeCli+' — é um prazer fazer parte desse sonho!';
  })();

    // Mantém o listener de storage, se quiser que outras abas atualizem KPIs
  window.addEventListener('storage', (e)=>{
    const k=String(e.key||'');
    if (
      k.startsWith('financeiroEvento:') ||
      k.startsWith('parcelas:') ||
      k==='eventos' ||
      k==='fotosClientes' ||
      k.startsWith('evt:update:')
    ){
      try{
        // se ainda estivermos no modo antigo, recarrega de LS
        if (!portalToken) {
          let eventos=[]; try{ eventos=JSON.parse(localStorage.getItem('eventos')||'[]'); }catch{}
          ev = eventos.find(e=>String(e.id)===String(eid)) || ev || {};
        }
        renderKpis();
      }catch{}
    }
  });
})();


