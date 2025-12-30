(() => {
  if (window.__etqLoaded) return;
  window.__etqLoaded = true;

  // === DIAGNÓSTICO RÁPIDO ===
  console.log('[Etiquetas] JS carregou, versão 2025-10-20 11:56');
  window.addEventListener('error', (e)=>{
    console.error('[Etiquetas] Erro JS:', e.message, e.filename, e.lineno);
    alert('Erro em etiquetas.js: ' + e.message);
  });

  /* ===== helpers ===== */
  const rLS = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const wLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const byId = id => document.getElementById(id);

  // Worker (?worker=1): mini-UI para permitir o clique de conexão exigido pelo Web Bluetooth
  const IS_WORKER = new URLSearchParams(location.search).get('worker') === '1';

  document.addEventListener('DOMContentLoaded', ()=>{
    try{ if (window.lucide?.createIcons) window.lucide.createIcons(); }catch(e){}
  });

  /* ===== menu mobile simples para esta tela ===== */
  (function setupHamburguer(){
    const btn = document.getElementById('hamburguer');
    const aside = document.getElementById('menuLateral');
    const backdrop = document.getElementById('menuBackdrop');
    if (!btn || !aside || !backdrop) return;

    function openMenu(){
      aside.classList.add('aberto');
      backdrop.hidden = false;
      document.body.style.overflow = 'hidden';
      const icon = btn.querySelector('i[data-lucide]');
      if (icon){
        icon.setAttribute('data-lucide', 'x');
        try{ window.lucide?.createIcons?.(); }catch(e){}
      }
    }
    function closeMenu(){
      aside.classList.remove('aberto');
      backdrop.hidden = true;
      document.body.style.overflow = '';
      const icon = btn.querySelector('i[data-lucide]');
      if (icon){
        icon.setAttribute('data-lucide', 'menu');
        try{ window.lucide?.createIcons?.(); }catch(e){}
      }
    }

    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      if (aside.classList.contains('aberto')) closeMenu();
      else openMenu();
    });
    backdrop.addEventListener('click', closeMenu);

    document.addEventListener('click', (e)=>{
      if (!aside.classList.contains('aberto')) return;
      if (!aside.contains(e.target) && !btn.contains(e.target)){
        closeMenu();
      }
    });

    function syncVisibility(){
      if (window.innerWidth <= 768){
        btn.style.display = 'inline-flex';
      } else {
        btn.style.display = 'none';
        closeMenu();
      }
    }
    window.addEventListener('resize', syncVisibility);
    syncVisibility();
  })();

  /* ===== chaves ===== */
  const K = {
    EVENTOS: (window.K_KEYS?.EVENTOS || 'm30.eventos'),
    VENDAS:  (window.K_KEYS?.VENDAS  || 'm31.vendas'),
    ITENS:   (window.K_KEYS?.ITENS   || 'm31.itens'),
  };

  // guarda os HTMLs grandes só em RAM para não estourar o localStorage
  const FilaRAM = new Map(); // key = id  

  function filaLoad(){
    const raw = rLS('pdv.etq.fila', []);
    if (!Array.isArray(raw)) return [];
    return raw.filter(x => x && typeof x === 'object' && typeof x.id === 'string');
  }
  function filaSave(arr){
    wLS('pdv.etq.fila', arr);
  }

  const CFG_KEY = 'pdv.etq.cfg';
  function readCfg(){
    return rLS(CFG_KEY, { modo:'browser', w:50, h:50, auto:true, modelo:'tspl' });
  }
  function saveCfg(patch){
    const prev = readCfg();
    const cfg  = { ...prev, ...(patch || {}) };
    wLS(CFG_KEY, cfg);
    return cfg;
  }
  function applyCfgToUI(){
    const c = readCfg();
    if (byId('selModo'))     byId('selModo').value = c.modo;
    if (byId('wMM'))         byId('wMM').value     = c.w;
    if (byId('hMM'))         byId('hMM').value     = c.h;
    if (byId('autoPrint'))   byId('autoPrint').checked = !!c.auto;
    if (byId('selModelo'))   byId('selModelo').value = c.modelo || 'tspl';
    if (byId('btBox'))       byId('btBox').style.display = (c.modo === 'bt') ? 'flex' : 'none';
  }

  /* ===== eventos ===== */
  function listEventos(){
    const a = rLS(K.EVENTOS, []);
    if (!Array.isArray(a) || !a.length) return [];
    return a.filter(e => e && typeof e.id === 'string');
  }

  function popularEventos(){
    const sel = byId('selEvento');
    if (!sel) return;
    sel.innerHTML = '';
    const eventos = listEventos();
    if (!eventos.length){
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Nenhum evento encontrado';
      sel.appendChild(opt);
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    for (const e of eventos){
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.nome || ('Evento ' + e.id);
      sel.appendChild(opt);
    }
    const saved = rLS('pdv.etq.eventoId', null);
    if (saved && eventos.some(e => e.id === saved)){
      sel.value = saved;
    } else {
      sel.value = eventos[0].id;
    }
  }

  function onEventoChange(){
    const sel = byId('selEvento');
    if (!sel) return;
    const id = sel.value || null;
    wLS('pdv.etq.eventoId', id);
    renderFila();
    renderPreview();
  }

  /* ===== Carregar fila interna ===== */
  function getFilaPorEvento(eventoId){
    const arr = filaLoad();
    if (!eventoId) return arr;
    return arr.filter(x => x.eventoId === eventoId);
  }

  function renderFila(){
    const eventoId = byId('selEvento')?.value || null;
    const fila = getFilaPorEvento(eventoId);
    const el = byId('listaFila');
    const debug = byId('debugFila');
    if (debug){
      debug.textContent = JSON.stringify(fila, null, 2);
    }
    if (!el){
      console.warn('renderFila: container não encontrado');
      return;
    }
    el.innerHTML = '';

    if (!fila.length){
      const vazio = document.createElement('div');
      vazio.className = 'muted';
      vazio.textContent = 'Nenhum item aguardando impressão.';
      el.appendChild(vazio);
      return;
    }

    for (const it of fila){
      const row = document.createElement('div');
      row.className = 'item-fila';

      const main = document.createElement('div');
      main.className = 'item-fila-main';

      const titulo = document.createElement('div');
      titulo.className = 'item-fila-titulo';
      titulo.textContent = it.texto || it.id || '(sem título)';
      main.appendChild(titulo);

      const sub = document.createElement('div');
      sub.className = 'item-fila-sub';
      sub.textContent = `Venda: ${it.vendaId || '-'} • Item: ${it.itemId || '-'}`;
      main.appendChild(sub);

      const meta = document.createElement('div');
      meta.className = 'item-fila-sub';
      meta.textContent = `Gerado em: ${it.createdAt || '---'}`;
      main.appendChild(meta);

      row.appendChild(main);

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.flexDirection = 'column';
      right.style.alignItems = 'flex-end';
      right.style.gap = '4px';

      const pill = document.createElement('span');
      pill.className = 'pill-mini';
      pill.innerHTML = `<i data-lucide="clock"></i>Aguardando`;
      right.appendChild(pill);

      const btnRem = document.createElement('button');
      btnRem.type = 'button';
      btnRem.className = 'btn sec no-print';
      btnRem.style.padding = '4px 8px';
      btnRem.style.fontSize = '11px';
      btnRem.innerHTML = '<i data-lucide="x-circle"></i>Remover';
      btnRem.addEventListener('click', ()=>{
        removerItemFila(it.id);
      });
      right.appendChild(btnRem);

      row.appendChild(right);
      el.appendChild(row);
    }

    try{ window.lucide?.createIcons?.(); }catch(e){}
  }

  function removerItemFila(id){
    const arr = filaLoad();
    const novo = arr.filter(x => x.id !== id);
    filaSave(novo);
    FilaRAM.delete(id);
    renderFila();
  }

  /* ===== preview da etiqueta ===== */
  function renderPreview(){
    const eventoId = byId('selEvento')?.value || null;
    const fila = getFilaPorEvento(eventoId);
    const area = byId('previewArea');
    if (!area) return;
    area.innerHTML = '';

    const cfg = readCfg();
    const wMM = Number(cfg.w || 50);
    const hMM = Number(cfg.h || 50);

    const baseWidth = 140;
    const wPX = baseWidth;
    const hPX = Math.max(60, Math.round(baseWidth * (hMM / (wMM || 1))));

    if (!fila.length){
      const info = document.createElement('div');
      info.className = 'muted';
      info.textContent = 'Fila vazia. Assim que novas vendas forem registradas no PDV, as etiquetas aparecerão aqui.';
      area.appendChild(info);
      return;
    }

    const max = Math.min(3, fila.length);
    for (let i=0;i<max;i++){
      const it = fila[i];
      const box = document.createElement('div');
      box.className = 'label-prev';
      box.style.width = wPX + 'px';
      box.style.height = hPX + 'px';

      const inner = document.createElement('div');
      inner.style.display = 'flex';
      inner.style.flexDirection = 'column';
      inner.style.alignItems = 'center';
      inner.style.justifyContent = 'center';
      inner.style.padding = '4px';
      inner.style.fontSize = '11px';
      inner.style.textAlign = 'center';

      const nome = document.createElement('div');
      nome.style.fontWeight = '700';
      nome.style.marginBottom = '4px';
      nome.textContent = (it.texto || '').slice(0, 40) || '(sem nome)';
      inner.appendChild(nome);

      const extra = document.createElement('div');
      extra.style.fontSize = '10px';
      extra.style.color = '#555';
      extra.textContent = `Venda ${it.vendaId || '-'} • Item ${it.itemId || '-'}`;
      inner.appendChild(extra);

      box.appendChild(inner);
      area.appendChild(box);
    }
  }

  /* ===== eventos de UI ===== */
  function setupUI(){
    applyCfgToUI();
    popularEventos();
    renderFila();
    renderPreview();

    const selEvento = byId('selEvento');
    if (selEvento) selEvento.addEventListener('change', onEventoChange);

    const selModo = byId('selModo');
    if (selModo){
      selModo.addEventListener('change', ()=>{
        const val = selModo.value;
        saveCfg({ modo:val });
        applyCfgToUI();
      });
    }

    const wMM = byId('wMM');
    const hMM = byId('hMM');
    if (wMM) wMM.addEventListener('change', ()=>{
      const w = Number(wMM.value||50);
      saveCfg({ w });
      renderPreview();
    });
    if (hMM) hMM.addEventListener('change', ()=>{
      const h = Number(hMM.value||50);
      saveCfg({ h });
      renderPreview();
    });

    const autoPrint = byId('autoPrint');
    if (autoPrint){
      autoPrint.addEventListener('change', ()=>{
        saveCfg({ auto: !!autoPrint.checked });
      });
    }

    const selModelo = byId('selModelo');
    if (selModelo){
      selModelo.addEventListener('change', ()=>{
        const modelo = selModelo.value || 'tspl';
        saveCfg({ modelo });
      });
    }

    const btnImprimirTudo = byId('btnImprimirTudo');
    if (btnImprimirTudo){
      btnImprimirTudo.addEventListener('click', ()=>{
        imprimirFilaAtual();
      });
    }

    const btnLimparFila = byId('btnLimparFila');
    if (btnLimparFila){
      btnLimparFila.addEventListener('click', ()=>{
        if (!confirm('Tem certeza que deseja limpar toda a fila de impressão deste evento?')) return;
        limparFilaAtual();
      });
    }

    const btnDiag = byId('btnDiag');
    if (btnDiag){
      btnDiag.addEventListener('click', runDiag);
    }
  }

  function limparFilaAtual(){
    const eventoId = byId('selEvento')?.value || null;
    const arr = filaLoad();
    const novo = eventoId ? arr.filter(x => x.eventoId !== eventoId) : [];
    filaSave(novo);
    for (const [id, val] of FilaRAM.entries()){
      const item = arr.find(x => x.id === id);
      if (!item || (eventoId && item.eventoId !== eventoId)){
        FilaRAM.delete(id);
      }
    }
    renderFila();
    renderPreview();
  }

  /* ===== integração com PDV: escuta vendas ===== */
  function getVendas(){
    const raw = rLS(K.VENDAS, []);
    if (!Array.isArray(raw)) return [];
    return raw;
  }
  function getItens(){
    const raw = rLS(K.ITENS, []);
    if (!Array.isArray(raw)) return [];
    return raw;
  }

  function montarEtiquetasDeVenda(venda){
    const itens = getItens().filter(it => it.vendaId === venda.id);
    const res = [];
    for (const it of itens){
      const id = 'etq-' + (venda.id || 'v') + '-' + (it.id || 'i') + '-' + (it.seq || Math.random().toString(36).slice(2));
      const texto = it.nome || it.descricao || venda.nomeCliente || 'Etiqueta';
      const eventoId = venda.eventoId || byId('selEvento')?.value || null;
      const ctxMin = { vendaId:venda.id, itemId:it.id, eventoId };

      res.push({ id, texto, eventoId, ctxMin });
    }
    return res;
  }

  function syncFilaComVendas(){
    const eventoId = byId('selEvento')?.value || null;
    if (!eventoId) return;
    const vendas = getVendas().filter(v => v && v.eventoId === eventoId);
    if (!vendas.length) return;

    let fila = filaLoad();
    const conhecidos = new Set(fila.map(x => x.id));

    for (const venda of vendas){
      const etiquetas = montarEtiquetasDeVenda(venda);
      for (const etq of etiquetas){
        if (!conhecidos.has(etq.id)){
          fila.push(etq);
          conhecidos.add(etq.id);
        }
      }
    }

    filaSave(fila);
    renderFila();
    renderPreview();
  }

  /* ===== impressão ===== */
  function removeByIds(ids){
    const set = new Set(ids);
    const arr = filaLoad().filter(x => !set.has(x.id));
    filaSave(arr);
    for (const id of ids){
      FilaRAM.delete(id);
    }
    renderFila();
    renderPreview();
  }

  function gerarHTMLEtiqueta(label, wMM, hMM){
    const text = label.texto || '(sem texto)';
    const venda = label.ctxMin?.vendaId || '-';
    const item  = label.ctxMin?.itemId || '-';

    const wPx = Math.round(wMM * 8);
    const hPx = Math.round(hMM * 8);

    const esc = `width:${wPx}px; height:${hPx}px;`;

    return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Etiqueta</title>
<style>
  *{ box-sizing:border-box; margin:0; padding:0; }
  body{ margin:0; padding:0; font-family:sans-serif; }
  .lab{
    ${esc}
    display:flex; flex-direction:column; align-items:flex-start; justify-content:center;
    border:1px solid #000; padding:4px;
  }
  .t1{ font-size:12px; font-weight:bold; }
  .t2{ font-size:10px; margin-top:2px; }
</style>
</head>
<body>
  <div class="lab">
    <div class="t1">${text}</div>
    <div class="t2">Venda ${venda} • Item ${item}</div>
  </div>
</body>
</html>
`;
  }

  function etiquetasToHTML(labels, wMM, hMM){
    const parts = labels.map(l => gerarHTMLEtiqueta(l, wMM, hMM));
    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Impressão de etiquetas</title>
<style>
  body{ margin:0; padding:16px; font-family:sans-serif; display:flex; flex-wrap:wrap; gap:8px; }
</style>
</head>
<body>
${parts.join('\n')}
</body>
</html>
`;
    return html;
  }

  async function imprimirFilaAtual(){
    const cfg = readCfg();
    const eventoId = byId('selEvento')?.value || null;
    const fila = getFilaPorEvento(eventoId);
    if (!fila.length){
      alert('Nenhuma etiqueta na fila para este evento.');
      return;
    }

    const labels = fila.map(it => ({
      id: it.id, texto: it.texto, eventoId: it.eventoId, ctxMin: it.ctxMin,
      html: (FilaRAM.get(it.id) || null)
    }));

    if (cfg.modo === 'bt'){
      try{
        await imprimirViaBluetooth(labels, cfg.w, cfg.h);
        removeByIds(labels.map(x=>x.id));
        alert('Enviei etiquetas para a impressora Bluetooth.');
      } catch(e){
        console.error('Falha ao imprimir via Bluetooth', e);
        alert('Não consegui imprimir via Bluetooth. Veja o console.');
      }
      return;
    }

    const html = etiquetasToHTML(labels, cfg.w, cfg.h);
    const win = window.open('', 'etq_print', 'width=520,height=600');
    if (!win){
      alert('Não consegui abrir a janela de impressão (popup bloqueado?).');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();

    removeByIds(labels.map(x=>x.id));
  }

  /* ===== impressão bluetooth (worker) ===== */

  async function imprimirViaBluetooth(labels, wMM, hMM){
    if (!navigator.bluetooth){
      alert('Seu navegador não suporta Bluetooth Web. Use o Chrome no Android, por exemplo.');
      return;
    }

    const modelo = readCfg().modelo || 'tspl';
    const enc = new TextEncoder();

    function montarPayloadTSPL(label){
      const text  = label.texto || '(sem texto)';
      const venda = label.ctxMin?.vendaId || '-';
      const item  = label.ctxMin?.itemId || '-';

      const w = wMM;
      const h = hMM;
      return enc.encode(
        `SIZE ${w} mm,${h} mm\r\n` +
        `CLS\r\n` +
        `TEXT 20,40,"TSS24.BF2",0,1,1,"${text}"\r\n` +
        `TEXT 20,80,"TSS16.BF2",0,1,1,"Venda ${venda} Item ${item}"\r\n` +
        `PRINT 1,1\r\n`
      );
    }

    function montarPayloadCPCL(label){
      const text  = label.texto || '(sem texto)';
      const venda = label.ctxMin?.vendaId || '-';
      const item  = label.ctxMin?.itemId || '-';

      return enc.encode(
        `! 0 200 200 300 1\r\n` +
        `CENTER\r\n` +
        `T 4 0 0 40 ${text}\r\n` +
        `T 0 2 0 80 Venda ${venda}\r\n` +
        `T 0 2 0 110 Item ${item}\r\n` +
        `PRINT\r\n`
      );
    }

    const montarPayload = (modelo === 'cpcl') ? montarPayloadCPCL : montarPayloadTSPL;

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix:'Label' }],
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
    const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

    for (const label of labels){
      const payload = montarPayload(label);
      await characteristic.writeValue(payload);
      await new Promise(r => setTimeout(r, 300));
    }

    alert('Enviei as etiquetas para a impressora Bluetooth.');
  }

  /* ===== diagnóstico rápido ===== */
  async function runDiag(){
    const conf = readCfg();
    let msg = 'Diagnóstico rápido das etiquetas:\n\n';
    msg += '- Modo: ' + conf.modo + '\n';
    msg += '- Tamanho: ' + conf.w + '×' + conf.h + ' mm\n';
    msg += '- Modelo: ' + (conf.modelo || 'tspl') + '\n';
    msg += '- Auto-print: ' + (conf.auto ? 'ligado' : 'desligado') + '\n';

    msg += '\nFila atual: ' + filaLoad().length + ' itens.\n';
    msg += 'Eventos carregados: ' + listEventos().length + '\n';

    alert(msg);
  }

  /* ===== inicialização ===== */
  if (!IS_WORKER){
    document.addEventListener('DOMContentLoaded', ()=>{
      setupUI();
      setInterval(syncFilaComVendas, 5000);
    });
  } else {
    document.addEventListener('DOMContentLoaded', ()=>{
      const btn = document.getElementById('btnWorkerConnect');
      if (btn){
        btn.addEventListener('click', async ()=>{
          const eventoId = byId('selEvento')?.value || null;
          if (!eventoId){
            alert('Selecione um evento antes de conectar.');
            return;
          }
          await imprimirViaBluetooth([], readCfg().w, readCfg().h);
        });
      }
    });
  }

  // Permite debug manual no console
  window.__etq_debug = { filaLoad, filaSave, FilaRAM };
})(); // fim do IIFE de etiquetas.js
