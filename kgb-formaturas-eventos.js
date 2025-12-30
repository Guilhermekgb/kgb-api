document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) window.lucide.createIcons();

  const menu = document.getElementById('menuLateral');
  const btn = document.getElementById('hamburguer');
  const backdrop = document.getElementById('menuBackdrop');

  if (btn && menu && backdrop) {
    const toggleMenu = () => {
      const aberto = menu.classList.toggle('aberto');
      backdrop.hidden = !aberto;
    };
    btn.addEventListener('click', toggleMenu);
    backdrop.addEventListener('click', toggleMenu);
  }

  /* ---------- LOCALSTORAGE / CONSTANTES ---------- */

  const LS_KEY_EVENTOS  = 'kgb_formaturas_eventos';
  const LS_KEY_TIPOS    = 'kgb_formaturas_tiposEvento';
  const LS_KEY_ESCOLAS  = 'kgb-formaturas-escolas';


  function criarId(prefixo){
    return (prefixo || 'id_') + Date.now() + '_' + Math.floor(Math.random() * 1e6);
  }

  function formatarDataBR(iso){
    if (!iso) return '--/--/----';
    const [ano, mes, dia] = iso.split('-');
    if (!ano || !mes || !dia) return iso;
    return `${dia}/${mes}/${ano}`;
  }

  function formatarValorBR(num){
    const n = Number(num) || 0;
    return n.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /* ---------- TIPOS DE EVENTO (SELECTS) ---------- */

  function carregarTiposEvento(){
    try{
      const raw = localStorage.getItem(LS_KEY_TIPOS);
      let arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) arr = [];
      // não cria nada fictício
      return arr;
    }catch(e){
      console.error('Erro ao carregar tipos de evento', e);
      return [];
    }
  }

  function preencherSelectTipos(tipos){
    const campoTipoEvento        = document.getElementById('campoTipoEvento');
    const filtroTipoEventoLista  = document.getElementById('filtroTipoEventoLista');

    if (campoTipoEvento){
      campoTipoEvento.innerHTML = '<option value="">Selecione...</option>';
      tipos
        .filter(t => t.ativo !== false)
        .forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.nome;
          opt.textContent = t.nome;
          campoTipoEvento.appendChild(opt);
        });
    }

    if (filtroTipoEventoLista){
      filtroTipoEventoLista.innerHTML = '<option value="">Todos</option>';
      const nomes = new Set();
      tipos.forEach(t => {
        if (!t.nome) return;
        nomes.add(t.nome);
      });
      Array.from(nomes).forEach(nome => {
        const opt = document.createElement('option');
        opt.value = nome;
        opt.textContent = nome;
        filtroTipoEventoLista.appendChild(opt);
      });
    }
  }

  /* ---------- ESCOLAS (SELECTS) ---------- */

  function carregarEscolas(){
    try{
      const raw = localStorage.getItem(LS_KEY_ESCOLAS);
      let arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) arr = [];
      // não cria nada fictício
      return arr;
    }catch(e){
      console.error('Erro ao carregar escolas', e);
      return [];
    }
  }

  function preencherSelectEscolas(escolas){
    const campoEscolasParticipantes = document.getElementById('campoEscolasParticipantes');
    const filtroEscolaEvento        = document.getElementById('filtroEscolaEvento');

    const nomesValidos = escolas
      .map(e => e && (e.nome || e.nomeEscola))
      .filter(Boolean);

    if (campoEscolasParticipantes){
      campoEscolasParticipantes.innerHTML = '';
      nomesValidos.forEach(nome => {
        const opt = document.createElement('option');
        opt.value = nome;
        opt.textContent = nome;
        campoEscolasParticipantes.appendChild(opt);
      });
    }

    if (filtroEscolaEvento){
      filtroEscolaEvento.innerHTML = '<option value="">Todas</option>';
      const usados = new Set();
      nomesValidos.forEach(nome => {
        if (usados.has(nome)) return;
        usados.add(nome);
        const opt = document.createElement('option');
        opt.value = nome;
        opt.textContent = nome;
        filtroEscolaEvento.appendChild(opt);
      });
    }
  }

  /* ---------- EVENTOS (LISTA + FORM) ---------- */

  function carregarEventos(){
    try{
      const raw = localStorage.getItem(LS_KEY_EVENTOS);
      let arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) arr = [];
      // não cria eventos de exemplo
      return arr;
    }catch(e){
      console.error('Erro ao carregar eventos', e);
      return [];
    }
  }

  function salvarEventos(lista){
    try{
      localStorage.setItem(LS_KEY_EVENTOS, JSON.stringify(lista));
    }catch(e){
      console.error('Erro ao salvar eventos', e);
    }
  }

  const tiposEvento   = carregarTiposEvento();
  const escolas       = carregarEscolas();
  let   eventos       = carregarEventos();

  const campoTipoEvento          = document.getElementById('campoTipoEvento');
  const campoAnoFormatura        = document.getElementById('campoAnoFormatura');
  const campoDataEvento          = document.getElementById('campoDataEvento');
  const campoHoraEvento          = document.getElementById('campoHoraEvento');
  const campoNomeEvento          = document.getElementById('campoNomeEvento');
  const campoLocalEvento         = document.getElementById('campoLocalEvento');
  const campoEscolasParticipantes= document.getElementById('campoEscolasParticipantes');
  const campoMetaMinima          = document.getElementById('campoMetaMinima');
  const campoCapacidade          = document.getElementById('campoCapacidade');
  const campoObsEstrategicas     = document.getElementById('campoObsEstrategicas');
  const campoEventoConjunto      = document.getElementById('campoEventoConjunto');
  const campoAtivoEvento         = document.getElementById('campoAtivoEvento');

  const btnNovoEvento            = document.getElementById('btnNovoEvento');
  const btnLimparEvento          = document.getElementById('btnLimparEvento');
  const btnSalvarEvento          = document.getElementById('btnSalvarEvento');

  const filtroAnoEvento          = document.getElementById('filtroAnoEvento');
  const filtroTipoEventoLista    = document.getElementById('filtroTipoEventoLista');
  const filtroEscolaEvento       = document.getElementById('filtroEscolaEvento');
  const filtroSomenteFuturos     = document.getElementById('filtroSomenteFuturos');

  const tbodyEventos             = document.getElementById('tbodyEventos');
  const infoResumoEventos        = document.getElementById('infoResumoEventos');

  preencherSelectTipos(tiposEvento);
  preencherSelectEscolas(escolas);

  /* ---------- ANOS DINÂMICOS (FILTRO) ---------- */

  function extrairAnosDosEventos(){
    const anos = new Set();
    eventos.forEach(e => {
      if (e.anoFormatura) {
        anos.add(String(e.anoFormatura));
      }
    });
    return Array.from(anos).sort();
  }

  function preencherFiltroAnos(){
    if (!filtroAnoEvento) return;
    const anos = extrairAnosDosEventos();

    filtroAnoEvento.innerHTML = '';
    const optTodos = document.createElement('option');
    optTodos.value = '';
    optTodos.textContent = 'Todos';
    filtroAnoEvento.appendChild(optTodos);

    anos.forEach(ano => {
      const opt = document.createElement('option');
      opt.value = ano;
      opt.textContent = ano;
      filtroAnoEvento.appendChild(opt);
    });
  }

  /* ---------- FORMULÁRIO ---------- */

  function limparFormularioEvento(){
    if (campoTipoEvento)           campoTipoEvento.value = '';
    if (campoAnoFormatura)         campoAnoFormatura.value = '';
    if (campoDataEvento)           campoDataEvento.value = '';
    if (campoHoraEvento)           campoHoraEvento.value = '';
    if (campoNomeEvento)           campoNomeEvento.value = '';
    if (campoLocalEvento)          campoLocalEvento.value = '';
    if (campoEscolasParticipantes){
      for (const opt of campoEscolasParticipantes.options){
        opt.selected = false;
      }
    }
    if (campoMetaMinima)           campoMetaMinima.value = '';
    if (campoCapacidade)           campoCapacidade.value = '';
    if (campoObsEstrategicas)      campoObsEstrategicas.value = '';
    if (campoEventoConjunto)       campoEventoConjunto.checked = true;
    if (campoAtivoEvento)          campoAtivoEvento.checked = true;
  }

  function obterEscolasSelecionadas(){
    const lista = [];
    if (!campoEscolasParticipantes) return lista;
    for (const opt of campoEscolasParticipantes.options){
      if (opt.selected) lista.push(opt.value);
    }
    return lista;
  }

  /* ---------- RENDERIZAÇÃO TABELA ---------- */

  function renderTabelaEventos(){
    if (!tbodyEventos) return;

    const anoSel    = filtroAnoEvento        ? filtroAnoEvento.value : '';
    const tipoSel   = filtroTipoEventoLista  ? filtroTipoEventoLista.value : '';
    const escolaSel = filtroEscolaEvento     ? filtroEscolaEvento.value : '';
    const somenteFuturos = filtroSomenteFuturos ? filtroSomenteFuturos.checked : false;

    let filtrados = eventos.slice();

    if (anoSel){
      filtrados = filtrados.filter(e => String(e.anoFormatura) === String(anoSel));
    }
    if (tipoSel){
      filtrados = filtrados.filter(e => e.tipoEvento === tipoSel);
    }
    if (escolaSel){
      filtrados = filtrados.filter(e => Array.isArray(e.escolasParticipantes) && e.escolasParticipantes.includes(escolaSel));
    }

    if (somenteFuturos){
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      filtrados = filtrados.filter(e => {
        if (!e.dataISO) return false;
        const partes = String(e.dataISO).split('-');
        if (partes.length !== 3) return false;

        const ano  = Number(partes[0]);
        const mes  = Number(partes[1]) - 1;
        const dia  = Number(partes[2]);

        const dataEvento = new Date(ano, mes, dia);
        dataEvento.setHours(0, 0, 0, 0);
        return dataEvento >= hoje;
      });
    }

    // ordena do mais próximo pro mais distante
    filtrados.sort((a, b) => {
      const dataA = a.dataISO || '';
      const dataB = b.dataISO || '';

      if (!dataA && !dataB) return 0;
      if (!dataA) return 1;
      if (!dataB) return -1;

      const horaA = (a.hora && a.hora.trim()) ? a.hora : '00:00';
      const horaB = (b.hora && b.hora.trim()) ? b.hora : '00:00';

      const chaveA = `${dataA}T${horaA}`;
      const chaveB = `${dataB}T${horaB}`;

      if (chaveA < chaveB) return -1;
      if (chaveA > chaveB) return 1;
      return 0;
    });

    tbodyEventos.innerHTML = '';

    filtrados.forEach(ev => {
      const tr = document.createElement('tr');

      const nomeExibicao = ev.nomeInterno && ev.nomeInterno.trim()
        ? ev.nomeInterno.trim()
        : `${ev.tipoEvento || 'Evento'} ${ev.anoFormatura || ''}`;

      const escolasTexto = Array.isArray(ev.escolasParticipantes) && ev.escolasParticipantes.length
        ? ev.escolasParticipantes.join(', ')
        : 'Nenhuma escola vinculada ainda';

      const alunosTexto = (ev.alunosParticipantes != null && ev.alunosParticipantes !== '')
        ? String(ev.alunosParticipantes)
        : '—';

      let metaHtml = '';
      if (!ev.metaMinima){
        metaHtml = `
          <span class="status-meta status-meta-pendente">
            <i data-lucide="info"></i>
            Meta mínima não anotada
          </span>
        `;
      } else if (ev.alunosParticipantes == null || ev.alunosParticipantes === ''){
        metaHtml = `
          <span class="status-meta status-meta-pendente">
            <i data-lucide="info"></i>
            Meta ${ev.metaMinima} (anotação)
          </span>
        `;
      } else {
        const atingida = Number(ev.alunosParticipantes) >= Number(ev.metaMinima);
        if (atingida){
          metaHtml = `
            <span class="status-meta status-meta-ok">
              <i data-lucide="check-circle-2"></i>
              Meta: ${ev.metaMinima} – Atingida
            </span>
          `;
        } else{
          metaHtml = `
            <span class="status-meta status-meta-pendente">
              <i data-lucide="clock-3"></i>
              Meta: ${ev.metaMinima} – Ainda não atingida (anotação)
            </span>
          `;
        }
      }

      let financeiroHtml = '';
      if (ev.financeiroPrevisto || ev.financeiroRecebido || ev.financeiroEmAberto){
        financeiroHtml = `
          <div class="resumo-financeiro-evento">
            <strong>Total previsto:</strong> R$ ${formatarValorBR(ev.financeiroPrevisto)}<br>
            <strong>Recebido:</strong> R$ ${formatarValorBR(ev.financeiroRecebido)}<br>
            <strong>Em aberto:</strong> R$ ${formatarValorBR(ev.financeiroEmAberto)}
          </div>
        `;
      } else {
        financeiroHtml = `
          <div class="resumo-financeiro-evento">
            <strong>Total previsto:</strong> será calculado pelo módulo financeiro.<br>
            <strong>Recebido / Em aberto:</strong> integração futura.
          </div>
        `;
      }

      tr.innerHTML = `
        <td>
          <div class="col-evento-nome">${nomeExibicao}</div>
          <div class="col-evento-tipo">
            <span class="tag-tipo-evento">${ev.tipoEvento || 'Tipo não definido'}</span> – Ano ${ev.anoFormatura || '--'}
          </div>
        </td>
        <td>
          ${formatarDataBR(ev.dataISO)}<br>
          <span style="font-size:12px; color:#7c5a3a;">
            ${ev.local || 'Local não informado'}
          </span>
        </td>
        <td>
          <div class="lista-escolas-evento">
            <strong>Escolas:</strong> ${escolasTexto}<br>
            <strong>Alunos participantes:</strong> ${alunosTexto}
          </div>
        </td>
        <td>${metaHtml}</td>
        <td>${financeiroHtml}</td>
        <td>
          <div class="acoes-evento">
            <button class="btn-acao btn-detalhes-evento" data-id="${ev.id}">
              <i data-lucide="file-text"></i>
              Detalhes
            </button>
            <button class="btn-acao btn-modelo-convite-evento" data-id="${ev.id}">
              <i data-lucide="ticket"></i>
              Modelo convite evento
            </button>
            <button class="btn-acao btn-abrir-checkin" data-id="${ev.id}">
              <i data-lucide="scan-line"></i>
              Abrir check-in
            </button>
            <button class="btn-acao btn-excluir-evento" data-id="${ev.id}">
              <i data-lucide="trash-2"></i>
              Excluir
            </button>
          </div>
        </td>
      `;

      tbodyEventos.appendChild(tr);
    });

    const total = eventos.length;
    const visiveis = filtrados.length;

    if (infoResumoEventos){
      if (total === visiveis){
        infoResumoEventos.textContent = `Exibindo ${visiveis} eventos.`;
      }else{
        infoResumoEventos.textContent = `Exibindo ${visiveis} de ${total} eventos (aplicando filtros).`;
      }
    }

    if (window.lucide) window.lucide.createIcons();
  }

  /* ---------- FILTROS ---------- */

  function aplicarListenersFiltros(){
    if (filtroAnoEvento){
      filtroAnoEvento.addEventListener('change', renderTabelaEventos);
    }
    if (filtroTipoEventoLista){
      filtroTipoEventoLista.addEventListener('change', renderTabelaEventos);
    }
    if (filtroEscolaEvento){
      filtroEscolaEvento.addEventListener('change', renderTabelaEventos);
    }
    if (filtroSomenteFuturos){
      filtroSomenteFuturos.addEventListener('change', renderTabelaEventos);
    }
  }

  /* ---------- FORM: NOVO / LIMPAR / SALVAR ---------- */

  if (btnNovoEvento){
    btnNovoEvento.addEventListener('click', () => {
      limparFormularioEvento();
      if (campoTipoEvento) campoTipoEvento.focus();
    });
  }

  if (btnLimparEvento){
    btnLimparEvento.addEventListener('click', () => {
      limparFormularioEvento();
    });
  }

  if (btnSalvarEvento){
    btnSalvarEvento.addEventListener('click', () => {
      const tipo = campoTipoEvento ? campoTipoEvento.value.trim() : '';
      const ano  = campoAnoFormatura ? campoAnoFormatura.value.trim() : '';

      if (!tipo){
        alert('Selecione o tipo de evento.');
        if (campoTipoEvento) campoTipoEvento.focus();
        return;
      }
      if (!campoDataEvento || !campoDataEvento.value){
        alert('Informe a data do evento.');
        if (campoDataEvento) campoDataEvento.focus();
        return;
      }

      const escolasSel = obterEscolasSelecionadas();

      const metaMinimaValor = campoMetaMinima && campoMetaMinima.value
        ? parseInt(campoMetaMinima.value, 10)
        : null;

      const capacidadeValor = campoCapacidade && campoCapacidade.value
        ? parseInt(campoCapacidade.value, 10)
        : null;

      const novoEvento = {
        id: criarId('evt_'),
        tipoEvento: tipo,
        anoFormatura: ano || null,
        dataISO: campoDataEvento.value,
        hora: campoHoraEvento ? campoHoraEvento.value : '',
        nomeInterno: campoNomeEvento ? campoNomeEvento.value.trim() : '',
        local: campoLocalEvento ? campoLocalEvento.value.trim() : '',
        escolasParticipantes: escolasSel,
        alunosParticipantes: null, // será calculado futuramente pelo módulo de alunos
        metaMinima: metaMinimaValor,
        capacidade: capacidadeValor,
        obsEstrategicas: campoObsEstrategicas ? campoObsEstrategicas.value.trim() : '',
        eventoConjunto: campoEventoConjunto ? campoEventoConjunto.checked : false,
        ativo: campoAtivoEvento ? campoAtivoEvento.checked : true,
        financeiroPrevisto: null,
        financeiroRecebido: null,
        financeiroEmAberto: null
      };

      eventos.push(novoEvento);
      salvarEventos(eventos);
      preencherFiltroAnos();
      renderTabelaEventos();
      limparFormularioEvento();

      alert('Evento salvo com sucesso! (Meta mínima é apenas uma anotação, nada obrigatório).');
    });
  }

  /* ---------- AÇÕES DA LISTA ---------- */

  if (tbodyEventos){
    tbodyEventos.addEventListener('click', (ev) => {
      const btnDetalhes  = ev.target.closest('.btn-detalhes-evento');
      const btnModelo    = ev.target.closest('.btn-modelo-convite-evento');
      const btnCheckin   = ev.target.closest('.btn-abrir-checkin');
      const btnExcluir   = ev.target.closest('.btn-excluir-evento');

      if (btnDetalhes){
        const id = btnDetalhes.getAttribute('data-id');
        const evento = eventos.find(e => e.id === id);
        if (!evento) return;

        alert(
          'Resumo do evento:\n\n' +
          `Nome interno: ${evento.nomeInterno || '(sem nome interno)'}\n` +
          `Tipo: ${evento.tipoEvento}\nAno: ${evento.anoFormatura || '(não informado)'}\n` +
          `Data: ${formatarDataBR(evento.dataISO)} ${evento.hora || ''}\n` +
          `Local: ${evento.local || '(não informado)'}\n\n` +
          `Escolas: ${(evento.escolasParticipantes || []).join(', ') || 'nenhuma vinculada'}\n` +
          `Meta mínima (anotação): ${evento.metaMinima != null ? evento.metaMinima : 'não anotada'}\n` +
          `Capacidade: ${evento.capacidade != null ? evento.capacidade : 'não informada'}\n\n` +
          `Obs: ${evento.obsEstrategicas || '(sem observações)'}`
        );
        return;
      }

      if (btnModelo){
        window.location.href = 'kgb-formaturas-modelos-convite.html';
        return;
      }

      if (btnCheckin){
        const id = btnCheckin.getAttribute('data-id');
        window.location.href = `kgb-formaturas-checkin.html?eventoId=${encodeURIComponent(id)}`;
        return;
      }

      if (btnExcluir){
        const id = btnExcluir.getAttribute('data-id');
        const evento = eventos.find(e => e.id === id);
        if (!evento) return;

        const nomeConfirma =
          evento.nomeInterno ||
          evento.tipoEvento ||
          'este evento';

        const confirmar = confirm(
          `Tem certeza que deseja excluir ${nomeConfirma}?\n` +
          'Essa ação não poderá ser desfeita.'
        );
        if (!confirmar) return;

        eventos = eventos.filter(e => e.id !== id);
        salvarEventos(eventos);
        preencherFiltroAnos();
        renderTabelaEventos();
        return;
      }
    });
  }

  /* ---------- INICIAL ---------- */

  preencherFiltroAnos();
  aplicarListenersFiltros();
  renderTabelaEventos();
});
