/* ===== helpers ===== */
window.$  = window.$  || ((s, el=document)=> el.querySelector(s));
window.$$ = window.$$ || ((s, el=document)=> Array.from(el.querySelectorAll(s)));
window.readLS  = window.readLS  || ((k,fb)=>{ try{ return JSON.parse(localStorage.getItem(k)) ?? fb; }catch{return fb;} });
window.writeLS = window.writeLS || ((k,v)=> localStorage.setItem(k, JSON.stringify(v)));
window.fmtBRL  = window.fmtBRL  || new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});

window.toNum = window.toNum || (raw => {
  if (raw == null) return 0;
  let s = String(raw).trim().replace(/[\sR$\u00A0]/gi, '');
  if (s.includes(',')) s = s.replace(/\./g,'').replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? 0 : Math.round(n * 100);
});
window.toCentsSafe = window.toCentsSafe || (x => {
  const n = Number(x ?? 0);
  if (!isNaN(n) && n > 0 && n < 100) return Math.round(n * 100); // valores em reais
  return Math.round(isNaN(n) ? 0 : n); // já em centavos
});

window.K_KEYS = window.K_KEYS || {
  EVENTOS:'eventos', INGRESSO_TIPOS:'ingresso_tipos', INGRESSOS:'ingressos', ITENS:'itens', VENDAS:'vendas'
};
// alias de compat (código legado pode usar TICKETS)
if (!window.K_KEYS.TICKETS) window.K_KEYS.TICKETS = window.K_KEYS.INGRESSOS;

function getEventos(){
  try{ if (typeof window.listEventos==='function') return window.listEventos()||[]; }catch(e){}
  return readLS(K_KEYS.EVENTOS,[])||[];
}
function getTipos(evtId){
  try{ if (typeof window.listTipos==='function') return window.listTipos(evtId)||[]; }catch(e){}
  const all = readLS(K_KEYS.INGRESSO_TIPOS,[])||[];
  return all.filter(t => String(t.eventoId) === String(evtId));
}
function getTickets(evtId){
  // lê ingressos da chave nova + fallback para legado m30.tickets
  const a = readLS(K_KEYS.INGRESSOS,[])||[];
  const b = readLS('m30.tickets',[])||[];
  const arr = a.concat(b);
  return evtId ? arr.filter(t => t && String(t.eventoId) === String(evtId)) : arr;
}

/* ===== toast ===== */
function showToast(text='Pronto!', type='ok'){
  const t=$("#toast"); if(!t) return;
  t.textContent=text;
  t.classList.remove('warn','bad');
  if(type==='warn') t.classList.add('warn');
  if(type==='bad') t.classList.add('bad');
  t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'), 1600);
}

/* ===== estado ===== */
let currentEventoId = null;

/* ===== selects ===== */
function renderEventosSelect(){
  const sel = $("#selEvento"); if (!sel) return;
  sel.innerHTML='';
  const xs = (getEventos()||[]).filter(e=> String(e.modulo)==='eventos-pagos');
  if(!xs.length){ sel.innerHTML = '<option value="">— Nenhum evento pago —</option>'; return; }
  xs.forEach(e=>{
    const o=document.createElement('option');
    o.value=e.id; o.textContent=`${e.nome||'(sem nome)'} — ${e.data||''}`;
    sel.appendChild(o);
  });
  if(currentEventoId && xs.some(e=> String(e.id)===String(currentEventoId))) sel.value=String(currentEventoId);
  else { currentEventoId = xs[0].id; sel.value=String(currentEventoId); }
  renderTiposSelect();
}
function renderTiposSelect(){
  const sel = $("#selTipo"); if (!sel) return;
  sel.innerHTML='<option value="">(todos)</option>';
  if(!currentEventoId) return;
  getTipos(currentEventoId).forEach(t=>{
    const o=document.createElement('option'); o.value=t.id; o.textContent=t.nome; sel.appendChild(o);
  });
}

/* ===== filtros ===== */
function parseFaixa(s){
  if(!s) return null;
  const m = String(s).trim().match(/^0*(\d+)\s*[-–]\s*0*(\d+)$/);
  if(!m) return null;
  const a = parseInt(m[1],10), b = parseInt(m[2],10);
  if(isNaN(a)||isNaN(b)) return null;
  return {from: Math.min(a,b), to: Math.max(a,b)};
}
function toInt(numStr){
  if(!numStr) return NaN;
  return parseInt(String(numStr).replace(/\D/g,''),10);
}
function badgeForStatus(st){
  const s = String(st||'').toLowerCase();
  if(s==='vendido') return `<span class="badge green">vendido</span>`;
  if(s==='pendente')return `<span class="badge red">pendente</span>`;
  if(s==='cancelado')return `<span class="badge gray">cancelado</span>`;
  if(s==='checkin') return `<span class="badge gray">checkin</span>`;
  return `<span class="badge gray">${s||'-'}</span>`;
}

/* ===== helpers de tipos (nome/preço por ticket) ===== */
function resolveTipoInfo(evId, t){
  const tipos = getTipos(evId);
  const tipo  = tipos.find(x => String(x.id) === String(t.tipoId));
  const nome  = (tipo?.nome || t.tipoNome || t.tipo || '—');
  const preco = Number(t.precoUnit ?? tipo?.preco ?? 0); // prioriza preço do ticket
  return { nome, preco };
}

/* ===== listagem ===== */
function buscar(){
  const selEv = $("#selEvento");
  const evId = selEv ? selEv.value : null;
  if(!evId){ showToast('Escolha um evento','warn'); return; }

  const tipoId = ($("#selTipo")?.value || '').trim();
  const num = toInt($("#fNum")?.value);
  const faixa = parseFaixa($("#fFaixa")?.value);
  const status = ($("#selStatus")?.value || '').trim().toLowerCase();

  let rows = getTickets(evId);
  if(tipoId) rows = rows.filter(r=> String(r.tipoId) === String(tipoId));
  if(!isNaN(num)) rows = rows.filter(r=> toInt(r.numero)===num);
  if(faixa) rows = rows.filter(r=>{ const n = toInt(r.numero); return n>=faixa.from && n<=faixa.to; });
  if(status) rows = rows.filter(r=> String(r.status||'').toLowerCase()===status);

  const tb = $("#tabConvites tbody"); if (!tb) return;
  tb.innerHTML='';

  if(!rows.length){
    const tr=document.createElement('tr');
    tr.innerHTML = `<td colspan="6" class="small" style="text-align:center">Nenhum convite encontrado.</td>`;
    tb.appendChild(tr);
    return;
  }

  rows.sort((a,b)=> toInt(a.numero)-toInt(b.numero));

 rows.forEach(r=>{
  const { nome, preco } = resolveTipoInfo(evId, r); // pega nome/preço corretos
  const cents = Number(preco || 0);
  const tr = document.createElement('tr');
  tr.dataset.id = r.id;
  tr.innerHTML =
    `<td><input type="checkbox" class="ckRow"/></td>`+
    `<td>${r.numero}</td>`+
    `<td>${nome}</td>`+
    `<td class="k-right">${fmtBRL.format((cents||0)/100)}</td>`+
    `<td>${badgeForStatus(r.status)}</td>`+
    `<td>${r.id}</td>`;
  tb.appendChild(tr);
});


  const ckAll = document.getElementById('ckAll');
  if (ckAll) ckAll.checked = false;
}

/* ===== seleção ===== */
function getSelectedRows(){
  return $$('#tabConvites tbody tr').filter(tr => tr.querySelector('.ckRow')?.checked);
}
function getSelectedTickets(){
  const ids = getSelectedRows().map(tr=> tr.dataset.id);
  const all = getTickets(currentEventoId);
  return all.filter(t => ids.includes(t.id));
}
document.getElementById('ckAll')?.addEventListener('change', (e)=>{
  const flag = e.target.checked;
  $$('#tabConvites tbody .ckRow').forEach(ck=> ck.checked = flag);
});

/* =========================================================================
   IMPRESSÃO USANDO O LAYOUT DO EDITOR
   ========================================================================= */
const LKEY_EVT = 'layoutsByEvent';
const LKEY_DEF = 'layoutsDefault';

// ---------- helpers ----------
function keyFor(evtId, tipo){ return `${evtId}:${tipo}`; }
function isArr(x){ return Array.isArray(x) && x.length > 0; }
function read(obj, k){ return obj && Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : undefined; }

// Deduz tamanho (em cm) a partir do sufixo do tipo, ex.: "ingresso-20x7" -> {w:20,h:7}
function canvasFromType(tipo){
  const m = /-(\d+)\s*x\s*(\d+)/i.exec(String(tipo||''));
  if (m) return { w: Number(m[1]) || 20, h: Number(m[2]) || 7 };
  return { w: 20, h: 7 }; // padrão
}

// Normaliza um layout que veio como array legado OU como objeto {canvas,elements}
function normalizeLayout(payload, tipo){
  if (!payload) return null;
  if (isArr(payload)) return { canvas: canvasFromType(tipo), elements: payload };
  if (payload.elements) {
    const c = payload.canvas || canvasFromType(tipo);
    return { canvas: { w: Number(c.w)||20, h: Number(c.h)||7 }, elements: payload.elements };
  }
  return null;
}

// ---------- storage-aware loader ----------
function loadLayoutForEvent(evtId){
  try{
    if (typeof listLayouts === 'function'){
      const tries = ['ingresso', 'ingresso-20x7', 'ingresso-21x7'];
      for (const t of tries){
        const xs = listLayouts(String(evtId), t) || [];
        if (xs.length){
          const norm = normalizeLayout(xs[0], t);
          if (norm) return norm;
        }
      }
    }
  }catch(e){}

  const by = readLS(LKEY_EVT, {});
  const def = readLS(LKEY_DEF, {});

  const prefix = `${String(evtId)}:`;
  const eventKeys = Object.keys(by).filter(k => k.startsWith(prefix));

  const score = k => {
    const tipo = k.slice(prefix.length);
    if (/^ingresso-\d+x\d+$/i.test(tipo)) return 0;
    if (tipo === 'ingresso') return 1;
    return 2;
  };
  eventKeys.sort((a,b)=> score(a)-score(b));

  for (const k of eventKeys){
    const tipo = k.slice(prefix.length);
    const norm = normalizeLayout(read(by, k), tipo);
    if (norm) return norm;
  }

  const defaultCandidates = ['ingresso-20x7', 'ingresso'];
  for (const t of defaultCandidates){
    const norm = normalizeLayout(read(def, t), t);
    if (norm) return norm;
  }

  return null;
}

// ---------- placeholders ----------
function fillPlaceholders(tpl, ticket, ev, tipos){
  if (!tpl) return '';
  const typeName = (id)=> (Array.isArray(tipos) ? (tipos.find(t=> String(t.id)===String(id))?.nome) : null) || '-';
  const { preco } = resolveTipoInfo(currentEventoId, ticket);
  const priceStr = fmtBRL.format((toCentsSafe(preco) || 0) / 100);

  return String(tpl)
    .replace(/\{\{NUMERO\}\}/g, ticket?.numero || '')
    .replace(/\{\{TIPO\}\}/g, typeName(ticket?.tipoId))
    .replace(/\{\{PRECO\}\}/g, priceStr)
    .replace(/\{\{EVENTO_NOME\}\}/g, ev?.nome || '')
    .replace(/\{\{EVENTO_DATA\}\}/g, ev?.data || '')
    .replace(/\{\{EVENTO_LOCAL\}\}/g, ev?.local || '');
  // ({{QR}} é tratado pelo elemento "qr")
}

function elementHTML(el, data){
  const base = 'position:absolute;left:'+el.x+'mm;top:'+el.y+'mm;width:'+el.w+'mm;height:'+el.h+'mm;';
  if (el.type === 'img'){
    const src = el.src || '';
    return '<div style="'+base+'overflow:hidden;border-radius:2mm;">'
         + '<img src="'+src+'" style="width:100%;height:100%;object-fit:contain;border-radius:2mm;" />'
         + '</div>';
  }
  if (el.type === 'qr'){
    const qrText = data.qrTextEscaped;
    return '<div class="qr-el" data-qr=\''+qrText+'\' style="'+base+'"></div>';
  }
  const style = base + 'display:flex;align-items:center;justify-content:'+
                (el.align==='center'?'center':(el.align==='right'?'flex-end':'flex-start'))+
                ';text-align:'+ (el.align||'left') +';' +
                'font-size:'+ (el.fs||18) + 'px;font-weight:'+ (el.fw||'600') + ';';
  return '<div style="'+style+'">'+ data.textContent +'</div>';
}

function ticketFromLayoutHTML(ticket, ev, layout, tipos){
  const qrPayload = ticket.qrPayload || { ticketId: ticket.id, eventoId: currentEventoId };
  const qrTextEscaped = JSON.stringify(qrPayload).replace(/'/g, '&#39;');

  let html = '<div class="ticket-canvas" style="position:relative;width:200mm;height:70mm;border:1px dashed #999;border-radius:6mm;margin:8mm 0;overflow:hidden;background:#fff;">';

  for (let i=0;i<layout.length;i++){
    const el = layout[i];
    if (el.type === 'text'){
      const txt = fillPlaceholders(el.text || '', ticket, ev, tipos);
      html += elementHTML(el, { textContent: txt });
    }else if (el.type === 'img'){
      html += elementHTML(el, {});
    }else if (el.type === 'qr'){
      html += elementHTML(el, { qrTextEscaped });
    }
  }

  html += '</div>';
  return html;
}

function htmlPrintSkeleton(ev, blocksHtml){
  const st = document.querySelector('style');
  const baseStyle = st ? st.textContent : '';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"/>' +
    '<title>Convites — '+(ev.nome||'')+'</title>' +
    '<style>'+ baseStyle +
    '.print-wrap{padding:18px;background:#fff;color:#111;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}' +
    '.header-print{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}' +
    '.header-print .btn{padding:6px 10px;border-radius:8px;background:#111;color:#fff;text-decoration:none}' +
    '.ticket-canvas{page-break-inside:avoid}' +
    '.qr-el > img, .qr-el > canvas{width:100%;height:100%}' +
    '@media print{.header-print{display:none}.print-wrap{padding:0}}' +
    '</style></head><body>' +
    '<div class="print-wrap">' +
      '<div class="header-print">' +
        '<div><b>'+(ev.nome||'Evento')+'</b> — '+(ev.data||'')+' • '+(ev.local||'')+'</div>' +
        '<div><a href="#" onclick="window.print();return false;" class="btn">Imprimir</a></div>' +
      '</div>' +
      blocksHtml +
    '</div>' +
    '</body></html>';
}

function openPrintWindow(tickets){
  if(!tickets.length){ showToast('Selecione pelo menos 1 convite','warn'); return; }

  const ev = (getEventos()||[]).find(e=> String(e.id)===String(currentEventoId)) || {};
  const tipos = getTipos(currentEventoId);
  const layObj = loadLayoutForEvent(currentEventoId); // {canvas,elements} ou null
  const layout = layObj?.elements || [];

  let blocks = '';
  if (Array.isArray(layout) && layout.length){
    // usa layout salvo
    for (let i=0;i<tickets.length;i++){
      blocks += ticketFromLayoutHTML(tickets[i], ev, layout, tipos);
    }
  }else{
    // fallback: bloco simples
    for (let i=0;i<tickets.length;i++){
      const t = tickets[i];
      const { nome, preco } = resolveTipoInfo(currentEventoId, t);
      const price = fmtBRL.format(toCentsSafe(preco)/100);
      const qrPayload = t.qrPayload || { ticketId: t.id, eventoId: currentEventoId };
      const qrText = JSON.stringify(qrPayload).replace(/'/g,'&#39;');

      blocks +=
        '<div class="ticket-canvas" style="width:200mm;height:auto;border:1px dashed #999;border-radius:6mm;margin:8mm 0;padding:10mm;box-sizing:border-box;">' +
          '<div style="display:grid;grid-template-columns:1fr auto;gap:10mm;align-items:center">' +
            '<div>' +
              '<h2 style="margin:0 0 4mm 0;font-size:18px">'+(ev.nome||'Evento')+' — <span style="color:#555">Nº '+(t.numero||'')+'</span></h2>' +
              '<div style="font-size:12px"><div><b>Tipo:</b> '+nome+'</div><div><b>Preço:</b> '+price+'</div>' +
              '<div style="color:#555">'+(ev.data||'')+' • '+(ev.local||'')+'</div></div>' +
            '</div>' +
            '<div>' +
              '<div class="qr-el" data-qr=\''+qrText+'\' style="width:30mm;height:30mm;border:1px solid #bbb;border-radius:4mm"></div>' +
              '<div style="text-align:center;color:#555;margin-top:3mm;font-size:12px">'+t.id+'</div>' +
            '</div>' +
          '</div>' +
        '</div>';
    }
  }

  const html = htmlPrintSkeleton(ev, blocks);
  const w = window.open('', '_blank');
  if (!w){ showToast('Permita pop-ups para imprimir/enviar','warn'); return; }
  w.document.open(); w.document.write(html); w.document.close();

  const lib = w.document.createElement('script');
  lib.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  lib.onload = function(){
    const runner = w.document.createElement('script');
    runner.text =
      '(function(){' +
        'var nodes=document.querySelectorAll(".qr-el");' +
        'for(var i=0;i<nodes.length;i++){' +
          'var el=nodes[i]; var txt=el.getAttribute("data-qr")||"";' +
          'try{new QRCode(el,{text:txt,width:el.clientWidth,height:el.clientHeight,correctLevel:QRCode.CorrectLevel.M});}' +
          'catch(e){el.innerHTML="<small>QR inválido</small>";}' +
        '}' +
      '})();';
    w.document.body.appendChild(runner);
  };
  w.document.body.appendChild(lib);
  try{ w.focus(); }catch(e){}
}
function logEnvioConvites(ticketIds, canal, destino){
  try{
    const arr = JSON.parse(localStorage.getItem('convitesEnvios') || '[]');
    const eventoId = (window.currentEventoId || null);
    const now = new Date().toISOString();
    (ticketIds || []).forEach(id=>{
      arr.push({ id, eventoId, canal, destino, ts: now });
    });
    localStorage.setItem('convitesEnvios', JSON.stringify(arr));
  }catch(e){}
}

/* ===== WhatsApp ===== */
function openWAModal(){
  if(!getSelectedTickets().length){ showToast('Selecione pelo menos 1 convite','warn'); return; }
  $('#waModal')?.classList.add('show');
  $('#waPhone')?.focus();
}
function closeWAModal(){ $('#waModal')?.classList.remove('show'); }
function sendWhatsApp(){
  const raw = ($('#waPhone')?.value||'').replace(/\D/g,'');
  if(!raw){ showToast('Informe o número com DDI+DDD+NÚMERO','warn'); return; }
  openPrintWindow(getSelectedTickets()); // usuário salva PDF e anexa no Whats
  const url = 'https://wa.me/'+raw+'?text='+encodeURIComponent('Olá! Seguem os convites em anexo.');
  window.open(url, '_blank');
   logEnvioConvites(sel.map(t=>t.id), 'whatsapp', raw);
  showToast('Ação registrada no log de envios');
  closeWAModal();
}
/* ===== E-mail ===== */
function openEmailModal(){
  if(!getSelectedTickets().length){ showToast('Selecione pelo menos 1 convite','warn'); return; }
  $('#emailModal')?.showModal();
  $('#emailTo')?.focus();
}
function closeEmailModal(){ $('#emailModal')?.close(); }

function sendEmail(){
  const to = ($('#emailTo')?.value||'').trim();
  if(!to || !/.+@.+\..+/.test(to)){ showToast('Informe um e-mail válido','warn'); return; }

  const sel = getSelectedTickets();
  // Abre janela de impressão p/ salvar PDF (que será anexado no e-mail)
  openPrintWindow(sel);

  const assunto = 'Convites do evento';
  const corpo   = 'Olá! Seguem os convites em anexo.';
  const url = 'mailto:'+encodeURIComponent(to)
    +'?subject='+encodeURIComponent(assunto)
    +'&body='+encodeURIComponent(corpo);
  window.location.href = url;

  // log
  logEnvioConvites(sel.map(t=>t.id), 'email', to);
  showToast('Ação registrada no log de envios');

  closeEmailModal();
}

/* ===== hash vindo de Eventos Pagos ===== */
function readHashEvento(){ const m=(window.location.hash||'').match(/evento=([^&]+)/i); return m?decodeURIComponent(m[1]):null; }

/* ===== listeners ===== */
$('#selEvento')?.addEventListener('change', ()=>{
  currentEventoId = $('#selEvento').value || null;
  renderTiposSelect();
  buscar();
});
$('#btnBuscar')?.addEventListener('click', buscar);
$('#btnPrintSel')?.addEventListener('click', ()=> openPrintWindow(getSelectedTickets()));
$('#btnSendWA')?.addEventListener('click', openWAModal);
$('#waCancel')?.addEventListener('click', closeWAModal);
$('#waGo')?.addEventListener('click', sendWhatsApp);
$('#btnSendEmail')?.addEventListener('click', openEmailModal);
$('#emailCancel')?.addEventListener('click', closeEmailModal);
$('#emailGo')?.addEventListener('click', sendEmail);

/* ===== init ===== */
(function(){
  const fromHash = readHashEvento(); if (fromHash) currentEventoId = fromHash;
  renderEventosSelect(); if(currentEventoId && $('#selEvento')) $('#selEvento').value = String(currentEventoId);
  renderTiposSelect(); if(currentEventoId) buscar();
})();
/* ==== ENVIO REAL: WhatsApp / E-mail (seleção) + LOG por convite ==== */
(function setupConviteSenders(){
  // Helpers locais
  const esc = (s)=>String(s||'').trim();
  const BRL = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});

  // Pega itens selecionados na tabela (checkbox por linha)
  function getSelecionados(){
    // aceita .ckRow ou qualquer input[type=checkbox][data-id]
    const checks = Array.from(document.querySelectorAll('tbody input[type=checkbox].ckRow, tbody input[type=checkbox][data-id]'));
    const ids = checks.filter(ch=>ch.checked).map(ch=> ch.dataset.id || ch.value).filter(Boolean);
    return ids;
  }

  // Lê tickets/convites do storage unificado já usado no módulo (kgb-common)
  function allTickets(){
    try{
      const a = JSON.parse(localStorage.getItem('m30.tickets')||'[]');
      const b = JSON.parse(localStorage.getItem('ingressos')||'[]');
      const byId = new Map();
      [...a, ...b].forEach(t=>{ const id=String(t.id||t.ticketId||''); if(id) byId.set(id, t); });
      return [...byId.values()];
    }catch{ return []; }
  }

  function findTickets(ids){
    const all = allTickets();
    const byId = new Map(all.map(t => [String(t.id||t.ticketId||''), t]));
    return ids.map(id => byId.get(String(id))).filter(Boolean);
  }

  // Link “público”/mensagem: se não houver página pública específica, enviamos os dados essenciais
  function montarMensagemBase(t){
    const numero = esc(t.seqStr || t.numero || t.id);
    const evNome = esc(t.eventoNome || t.evento || t.nomeEvento || 'Evento');
    const tipo   = esc(t.tipoNome || t.tipo || 'Ingresso');
    const precoCents = Number(t.precoUnit||0);
    const precoBRL = precoCents>0 ? BRL.format(precoCents/100) : '—';

    // Se você tiver uma rota pública do QR, coloque aqui:
    // const link = new URL('convite.html', location.href); link.searchParams.set('id', String(t.id));
    // const linkPublico = link.toString();
    const linkPublico = ''; // mantendo vazio por padrão (WhatsApp não anexa imagem via URL)

    // Mensagem sucinta (ajuste livre — mantém placeholders simples)
    return [
      `*${evNome}*`,
      `Ingresso: *${tipo}*`,
      `Número: *${numero}*`,
      precoCents ? `Valor: *${precoBRL}*` : null,
      linkPublico && `Acesse: ${linkPublico}`,
      ``,
      `Apresente o *QR Code* do convite na entrada.`
    ].filter(Boolean).join('\n');
  }

  // LOG por convite
  function logEnvio({ticketId, canal, destino}){
    try{
      const arr = JSON.parse(localStorage.getItem('conviteLogs')||'[]');
      arr.push({
        id: (crypto.randomUUID?.() || (Date.now().toString(36)+Math.random().toString(36).slice(2))),
        ts: Date.now(),
        ticketId: String(ticketId||''),
        canal: String(canal||'').toLowerCase(), // 'whats' | 'email'
        destino: String(destino||''),
      });
      localStorage.setItem('conviteLogs', JSON.stringify(arr));
    }catch{}
  }

  // WhatsApp (seleção)
  const btnWA = document.getElementById('btnSendWA');
  if (btnWA){
    btnWA.addEventListener('click', ()=>{
      const ids = getSelecionados();
      if (!ids.length){ alert('Selecione ao menos 1 convite.'); return; }

      const tel = prompt('Informe o WhatsApp (somente números, com DDD — ex.: 11999999999). Para DDI, inclua o país (ex.: 5511999999999).');
      if (!tel){ return; }
      const phone = tel.replace(/\D/g,'');

      // Monta 1 única mensagem com todos os convites selecionados
      const tks = findTickets(ids);
      if (!tks.length){ alert('Não encontrei os convites no armazenamento.'); return; }

      const partes = [];
      tks.forEach(t => {
        partes.push(montarMensagemBase(t));
        // registra log por convite
        logEnvio({ ticketId: (t.id||t.ticketId), canal: 'whats', destino: phone });
      });
      const msg = partes.join('\n————————————\n');

      // abre o WhatsApp (Web ou App)
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    });
  }

  // E-mail (seleção)
  const btnMail = document.getElementById('btnSendEmail');
  if (btnMail){
    btnMail.addEventListener('click', ()=>{
      const ids = getSelecionados();
      if (!ids.length){ alert('Selecione ao menos 1 convite.'); return; }

      const email = prompt('Informe o e-mail do destinatário:');
      if (!email){ return; }

      const tks = findTickets(ids);
      if (!tks.length){ alert('Não encontrei os convites no armazenamento.'); return; }

      const assunto = 'Convites do evento';
      const corpo = tks.map(montarMensagemBase).join('\n————————————\n');

      // mailto com subject/body (o cliente de e-mail abre preenchido)
      const href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
      // registra log por convite (um por item)
      tks.forEach(t => logEnvio({ ticketId: (t.id||t.ticketId), canal: 'email', destino: email }));

      window.location.href = href;
    });
  }
})();
