// KGB FORMATURAS – Tela de aluno (detalhe)
var tbodyEventos = null;
// ===============================
// VARIÁVEIS GLOBAIS
// ===============================
let alunoAtual = null;

document.addEventListener('DOMContentLoaded', function () {
  // Ícones
  if (window.lucide) window.lucide.createIcons();

 // ------------------------------------------------------------------
// TIPOS DE EVENTO – carrega do localStorage
// chave usada também em kgb-formaturas-tipos-evento.html
// ------------------------------------------------------------------
function carregarTiposEventoCadastrados() {
  try {
    var raw = localStorage.getItem('kgb_formaturas_tiposEvento');
    if (!raw) return [];

    var lista = JSON.parse(raw);
    if (!Array.isArray(lista)) return [];

    return lista;
  } catch (e) {
    console.warn('Erro ao ler tipos de evento do localStorage:', e);
    return [];
  }
}


  // ---------------- MENU LATERAL (MOBILE) ----------------
  (function initHamburguer(){
    var btn   = document.getElementById('hamburguer');
    var aside = document.getElementById('menuLateral');
    var back  = document.getElementById('menuBackdrop');

    if (!btn || !aside || !back) return;

    function setOpened(open){
      var opened = !!open;
      aside.classList.toggle('aberto', opened);
      back.hidden = !opened;
      document.body.classList.toggle('no-scroll', opened);

      var icon = btn.querySelector('i[data-lucide]');
      if (icon){
        icon.setAttribute('data-lucide', opened ? 'x' : 'menu');
        try { window.lucide && window.lucide.createIcons && window.lucide.createIcons(); } catch(e){}
      }
    }


    function isMobile(){ return window.innerWidth <= 768; }

    function syncVisibility(){
      var mob = isMobile();
      btn.style.display = mob ? 'block' : 'none';
      if (!mob){
        setOpened(false);
      }
    }

    if (!btn.hasAttribute('data-bound')){
      btn.setAttribute('data-bound','1');
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        setOpened(!aside.classList.contains('aberto'));
      });
    }

    if (!back.hasAttribute('data-bound')){
      back.setAttribute('data-bound','1');
      back.addEventListener('click', function(){
        setOpened(false);
      });
    }

    document.addEventListener('click', function(e){
      if (!aside.classList.contains('aberto')) return;
      if (!aside.contains(e.target) && !btn.contains(e.target)){
        setOpened(false);
      }
    });

    syncVisibility();
    window.addEventListener('resize', syncVisibility);
  })();
// Preenche a lista de tipos de evento da aba "Eventos contratados" como checkboxes
function popularSelectTiposEventoAluno() {
  var container = document.getElementById('selectTipoEventoAluno');
  if (!container) return;

  var tipos = carregarTiposEventoCadastrados();

  // Limpa a área
  container.innerHTML = '';

  tipos.forEach(function (t, idx) {
    var nome = t.nome || t.nomeInterno || t.tipoEvento || t.tipo || '';
    if (!nome) return;

    var idInput = 'tipoEventoAluno_' + (t.id != null ? t.id : idx);

    var label = document.createElement('label');
    label.className = 'tipo-evento-item';
    label.setAttribute('for', idInput);

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'chkTipoEventoAluno';
    input.id = idInput;
    input.value = nome;

    // Dados extras úteis
    if (t.id != null) input.dataset.id = t.id;
    if (t.valor != null) input.dataset.valorPadrao = t.valor;
    if (t.convites != null) input.dataset.convitesPadrao = t.convites;

    var spanTexto = document.createElement('span');
    spanTexto.textContent = nome;

    label.appendChild(input);
    label.appendChild(spanTexto);
    container.appendChild(label);
  });
}

  // --------------- CONSTANTES LOCALSTORAGE ---------------
var STORAGE_KEYS = {
  escolas: 'kgb-formaturas-escolas',
  alunos: 'kgb_alunos',
  msgCobranca: 'kgb_cfg_msg_cobranca',
  modelosContrato: 'kgb_modelos_contrato',
  docsAluno: 'kgb_documentos_aluno',
  contratoPrefix: 'kgb_contrato_'
};

// -------------------- FUNÇÕES BASE ---------------------
function carregarListaEscolas() {
  try {
    var txt = localStorage.getItem(STORAGE_KEYS.escolas);
    if (!txt) return [];
    var lista = JSON.parse(txt);
    if (!Array.isArray(lista)) return [];
    return lista;
  } catch (e) {
    console.warn('Erro ao ler escolas do localStorage:', e);
    return [];
  }
}

function popularSelectEscolas() {
  var select = document.getElementById('alunoEscola');
  if (!select) return;
  var escolas = carregarListaEscolas();
  if (!escolas.length) return;

  var valorAnterior = select.value;
  select.innerHTML = '<option value="">Selecionar escola...</option>';

  escolas.forEach(function (esc) {
    var opt = document.createElement('option');
    var nome = esc.nome || esc.titulo || esc.nomeEscola || 'Escola ' + (esc.id || '');
    opt.value = nome;
    opt.textContent = nome;
    if (esc.id != null) opt.dataset.id = esc.id;
    select.appendChild(opt);
  });

  if (valorAnterior) select.value = valorAnterior;
}



  function carregarListaAlunos() {
    try {
      var txt = localStorage.getItem(STORAGE_KEYS.alunos);
      if (!txt) return [];
      var lista = JSON.parse(txt);
      if (!Array.isArray(lista)) return [];
      return lista;
    } catch (e) {
      console.warn('Erro ao ler alunos do localStorage:', e);
      return [];
    }
  }

  function salvarListaAlunos(lista) {
    try {
      localStorage.setItem(STORAGE_KEYS.alunos, JSON.stringify(lista));
    } catch (e) {
      console.warn('Erro ao salvar alunos:', e);
    }
  }

  function obterTemplateMsgCobranca() {
    var txt = localStorage.getItem(STORAGE_KEYS.msgCobranca);
    if (txt && typeof txt === 'string') return txt;

    txt =
      'Olá {RESPONSAVEL}, tudo bem?\n' +
      'Verificamos aqui que ainda consta um valor em aberto referente à formatura de {NOME_ALUNO} ({EVENTOS_CONTRATADOS}).\n' +
      'Valor em aberto desta parcela: {VALOR_EM_ABERTO} (vencimento em {DATA_VENCIMENTO}).\n' +
      'Se já tiver feito o pagamento, por favor desconsidere esta mensagem e, se possível, nos envie o comprovante. 💛';
    return txt;
  }

  function preencherTemplateCobranca(template, valores) {
    var texto = template || '';
    texto = texto.replace(/&#10;/g, '\n');
    Object.keys(valores).forEach(function (chave) {
      var token = '{' + chave + '}';
      texto = texto.split(token).join(valores[chave]);
    });
    return texto;
  }

  function abrirWhatsDoCampo(idCampo, mensagemPadrao) {
    var input = document.getElementById(idCampo);
    if (!input) {
      alert('Campo de telefone/WhatsApp não encontrado.');
      return;
    }
    var raw = input.value || '';
    var digits = raw.replace(/\D/g, '');
    if (!digits) {
      alert('Informe um número de WhatsApp válido antes de abrir.');
      return;
    }
    var numeroWhats = digits;
    if (numeroWhats.length === 11 && !numeroWhats.startsWith('55')) {
      numeroWhats = '55' + numeroWhats;
    }
    var msg = mensagemPadrao || 'Olá, tudo bem?';
    var url = 'https://wa.me/' + numeroWhats + '?text=' + encodeURIComponent(msg);
    window.open(url, '_blank');
  }

  function formatarMoeda(v) {
    var num = Number(v || 0);
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatarDataBr(aaaaMmDd) {
    if (!aaaaMmDd) return '';
    var partes = aaaaMmDd.split('-');
    if (partes.length !== 3) return aaaaMmDd;
    return partes[2] + '/' + partes[1] + '/' + partes[0];
  }

  
   // ------------------ ESTADOS EM MEMÓRIA -----------------
  // Agora SEM dados fictícios: tudo começa vazio e é carregado
  // do localStorage (do próprio aluno) em inicializarAlunoAtual/preencherCamposComAluno.

  var eventosAluno = [];
  var proximoIdEvento = 1;

  var parcelasAluno = [];
  var proximoIdParcela = 1;

  var convitesAluno = [];

  // Não usamos mais resumoConvitesPorEvento fixo.
  // O resumo passa a ser calculado em tempo real a partir de convitesAluno.

  var listaAlunos = carregarListaAlunos();
  var alunoAtualId = null;

  // ------------------ RENDER EVENTOS ----------------------
tbodyEventos = document.getElementById('tbodyEventosAluno');


  function renderEventosAluno() {
    if (!tbodyEventos) return;
    tbodyEventos.innerHTML = '';

    if (!eventosAluno.length) {
      var trVazio = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 7;
      td.textContent = 'Nenhum evento contratado para este aluno ainda.';
      td.style.fontSize = '12px';
      td.style.color = '#8c6c44';
      trVazio.appendChild(td);
      tbodyEventos.appendChild(trVazio);
      return;
    }

    eventosAluno.forEach(function (ev) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-id', ev.id);

      var tdEvento = document.createElement('td');
      tdEvento.textContent = ev.tipo || '-';

      var tdValor = document.createElement('td');
      tdValor.textContent = 'R$ ' + (Number(ev.valor || 0)).toFixed(2).replace('.', ',');

      var tdIncluidos = document.createElement('td');
      tdIncluidos.textContent = ev.convitesIncluidos || 0;

      var tdExtras = document.createElement('td');
      tdExtras.textContent = ev.convitesExtras || 0;

      var tdTotal = document.createElement('td');
      var tot = (ev.convitesIncluidos || 0) + (ev.convitesExtras || 0);
      tdTotal.textContent = tot;

      var tdSituacao = document.createElement('td');
      var spanSit = document.createElement('span');
      spanSit.className = 'status-financeiro status-pendente';
      spanSit.textContent = ev.situacao || 'Pendente';
      tdSituacao.appendChild(spanSit);

      var tdAcoes = document.createElement('td');

      var btnEditar = document.createElement('button');
      btnEditar.type = 'button';
      btnEditar.className = 'btn-acao-mini';
      btnEditar.setAttribute('data-acao', 'editar-evento');
      btnEditar.innerHTML = '<i data-lucide="pen-line"></i> Editar';

      var btnExcluir = document.createElement('button');
      btnExcluir.type = 'button';
      btnExcluir.className = 'btn-acao-mini';
      btnExcluir.setAttribute('data-acao', 'remover-evento');
      btnExcluir.innerHTML = '<i data-lucide="trash-2"></i> Remover';

      tdAcoes.appendChild(btnEditar);
      tdAcoes.appendChild(btnExcluir);

      tr.appendChild(tdEvento);
      tr.appendChild(tdValor);
      tr.appendChild(tdIncluidos);
      tr.appendChild(tdExtras);
      tr.appendChild(tdTotal);
      tr.appendChild(tdSituacao);
      tr.appendChild(tdAcoes);

      tbodyEventos.appendChild(tr);
    });

    try {
      window.lucide && window.lucide.createIcons && window.lucide.createIcons();
    } catch (e) {}
  }

  // Clique nos botões de ação dentro da tabela de eventos
  if (tbodyEventos) {
    tbodyEventos.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-acao]');
      if (!btn) return;

      var acao = btn.getAttribute('data-acao');
      var tr = btn.closest('tr');
      var id = tr ? parseInt(tr.getAttribute('data-id'), 10) : null;

      if (!id) return;

      var evento = eventosAluno.find(function (e) {
        return e.id === id;
      });
      if (!evento) return;

      if (acao === 'remover-evento') {
        if (confirm('Remover o evento "' + evento.tipo + '" deste aluno?')) {
          eventosAluno = eventosAluno.filter(function (e) { return e.id !== id; });
          renderEventosAluno();
          calcularResumoFinanceiro();
          salvarAlunoNoStorage();
          atualizarSelectFinReferencia();
        }
      } else if (acao === 'editar-evento') {
        var novoValor = window.prompt('Novo valor para "' + evento.tipo + '" (em R$):', evento.valor);
        if (novoValor !== null && novoValor !== '') {
          var v = parseFloat(novoValor.replace(',', '.'));
          if (!isNaN(v)) evento.valor = v;
        }
        var novosExtras = window.prompt('Quantidade de convites extras:', evento.convitesExtras);
        if (novosExtras !== null && novosExtras !== '') {
          var e = parseInt(novosExtras, 10);
          if (!isNaN(e)) evento.convitesExtras = e;
        }
        renderEventosAluno();
        calcularResumoFinanceiro();
        salvarAlunoNoStorage();
      }
    });
  }

  // Atualiza o select de referência do financeiro com os eventos realmente contratados
  function atualizarSelectFinReferencia() {
    var select = document.getElementById('finTipoEventoRef');
    if (!select) return;

    var valorAtual = select.value;

    // Pega tipos distintos a partir dos eventos contratados do aluno
    var mapaTipos = {};
    eventosAluno.forEach(function (ev) {
      if (ev && ev.tipo) {
        mapaTipos[ev.tipo] = true;
      }
    });

    // Reconstrói as opções
    select.innerHTML = '<option value="">Geral (todos os eventos)</option>';

    Object.keys(mapaTipos).sort().forEach(function (nome) {
      var opt = document.createElement('option');
      opt.value = nome;
      opt.textContent = nome;
      select.appendChild(opt);
    });

    // Mantém o valor se ainda fizer sentido
    if (valorAtual && (valorAtual === '' || mapaTipos[valorAtual])) {
      select.value = valorAtual;
    }
  }


   // ---------- Financeiro ----------
  var tbodyFin = document.getElementById('tbodyFinanceiroAluno');
  var modalFinOverlay = document.getElementById('modalFinOverlay');
  var modalFinData = document.getElementById('finModalDataPgto');
  var modalFinValor = document.getElementById('finModalValorPago');
  var modalFinComprovante = document.getElementById('finModalComprovante');
  var modalFinMsgDif = document.getElementById('finModalDiferencaInfo');
  var btnModalFinFechar = document.getElementById('btnFecharModalFin');
  var btnModalFinCancelar = document.getElementById('btnCancelarModalFin');
  var btnModalFinConfirmar = document.getElementById('btnConfirmarModalFin');
  var parcelaEmPagamento = null;

  function calcularTotalContratado() {
    return eventosAluno.reduce(function (total, ev) {
      var v = Number(ev.valor || 0);
      return total + (isNaN(v) ? 0 : v);
    }, 0);
  }

  function obterResumoFinanceiroAtual() {
    var total = calcularTotalContratado();
    var pago = 0;
    parcelasAluno.forEach(function (p) {
      var vp = Number(p.valorPago || 0);
      if (!isNaN(vp)) pago += vp;
    });
    var pendente = total - pago;
    if (pendente < 0) pendente = 0;
    return { total: total, pago: pago, pendente: pendente };
  }
  function abrirModalPagamento(parcela) {
    if (!modalFinOverlay || !modalFinData || !modalFinValor) return;
    parcelaEmPagamento = parcela;

    var hoje = new Date().toISOString().slice(0, 10);
    var dataBase = parcela.dataPagamento || parcela.vencimento || hoje;
    modalFinData.value = dataBase;

    var valorBase = parcela.valorPago && parcela.valorPago > 0 ? parcela.valorPago : parcela.valor;
    if (!valorBase) valorBase = 0;
    modalFinValor.value = String(valorBase).replace('.', ',');

    if (modalFinComprovante) {
      modalFinComprovante.value = '';
    }

    atualizarInfoDiferencaModal();

    modalFinOverlay.removeAttribute('hidden');
  }

  function fecharModalPagamento() {
    parcelaEmPagamento = null;
    if (modalFinOverlay) {
      modalFinOverlay.setAttribute('hidden', 'hidden');
    }
  }

  function atualizarInfoDiferencaModal() {
    if (!parcelaEmPagamento || !modalFinMsgDif || !modalFinValor) return;

    var valorOriginal = Number(parcelaEmPagamento.valor || 0);
    var valorPagoInformado = parseFloat(String(modalFinValor.value || '0').replace(',', '.'));
    if (isNaN(valorPagoInformado)) valorPagoInformado = 0;

    var dif = valorPagoInformado - valorOriginal;
    var texto = '';
    if (dif > 0.009) {
      texto = '<strong>Resultado:</strong> pagamento MAIOR que o combinado. ' +
        'Fica um CRÉDITO de ' + formatarMoeda(dif) + ' para abater de outra parcela.';
    } else if (dif < -0.009) {
      texto = '<strong>Resultado:</strong> pagamento MENOR que o combinado. ' +
        'Fica um valor em aberto de ' + formatarMoeda(Math.abs(dif)) + ' para complementar em outra parcela.';
    } else {
      texto = '<strong>Resultado:</strong> valor pago igual ao valor da parcela, sem diferença.';
    }
    modalFinMsgDif.innerHTML = texto;
  }

  function calcularResumoFinanceiro() {
    var resumo = obterResumoFinanceiroAtual();
    var cont = document.getElementById('resumosFinanceiroAluno');
    if (!cont) return;

    var spTotal = cont.querySelector('[data-resumo="total"]');
    var spPago = cont.querySelector('[data-resumo="pago"]');
    var spPend = cont.querySelector('[data-resumo="pendente"]');

    if (spTotal) spTotal.textContent = formatarMoeda(resumo.total);
    if (spPago) spPago.textContent = formatarMoeda(resumo.pago);
    if (spPend) spPend.textContent = formatarMoeda(resumo.pendente);

    var resumoFinTopo = document.getElementById('resumoAlunoFinanceiro');
    if (resumoFinTopo) {
      resumoFinTopo.textContent =
        formatarMoeda(resumo.total) + ' (' + formatarMoeda(resumo.pago) + ' pago)';
    }
  }

    function renderFinanceiroAluno() {
    if (!tbodyFin) return;
    tbodyFin.innerHTML = '';

    parcelasAluno.forEach(function (p) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-id', p.id);

      var dataBr = formatarDataBr(p.vencimento);

      var classeSit = 'status-pendente';
      var iconeSit = 'clock-3';
      var labelSit = 'Em aberto';
      if (p.situacao === 'Pago') {
        classeSit = 'status-ok';
        iconeSit = 'check-circle-2';
        labelSit = 'Pago';
      }

      var valorOriginal = Number(p.valor || 0);
      var valorPago = Number(p.valorPago || 0);
      var diferenca = valorPago - valorOriginal;
      var difHtml = '';

      if (p.situacao === 'Pago') {
        if (diferenca > 0.009) {
          difHtml = '<span class="dif-badge dif-credito">+' + formatarMoeda(diferenca) + ' em haver</span>';
        } else if (diferenca < -0.009) {
          difHtml = '<span class="dif-badge dif-debito">-' + formatarMoeda(Math.abs(diferenca)) + ' em aberto</span>';
        } else {
          difHtml = '<span class="dif-badge dif-zero">Sem diferença</span>';
        }
      } else {
        difHtml = '<span class="dif-badge dif-nao-pago">Aguardando pagamento</span>';
      }

      tr.innerHTML =
        '<td>' + dataBr + '</td>' +
        '<td>' + (p.evento || '-') + '</td>' +
        '<td>' + (p.descricao || '-') + '</td>' +
        '<td>' + formatarMoeda(p.valor) + '</td>' +
        '<td>' + difHtml + '</td>' +
        '<td>' +
          '<span class="status-financeiro ' + classeSit + '">' +
            '<i data-lucide="' + iconeSit + '"></i> ' + labelSit +
          '</span>' +
        '</td>' +
        '<td>' + (p.forma || '-') + '</td>' +
        '<td>' +
          (p.situacao !== 'Pago'
            ? '<button class="btn-acao-mini" data-acao="marcar-pago"><i data-lucide="check"></i> Marcar como pago</button> '
            : '') +
          '<button class="btn-acao-mini" data-acao="enviar-cobranca"><i data-lucide="send"></i> Enviar cobrança</button> ' +
          '<button class="btn-acao-mini" data-acao="editar-parcela"><i data-lucide="file-pen-line"></i> Editar</button> ' +
          '<button class="btn-acao-mini" data-acao="excluir-parcela"><i data-lucide="trash-2"></i> Excluir</button> ' +
          (p.comprovanteBase64
            ? '<button class="btn-acao-mini" data-acao="ver-comprovante"><i data-lucide="eye"></i> Ver comprovante</button>'
            : '') +
        '</td>';

      tbodyFin.appendChild(tr);
    });

    calcularResumoFinanceiro();
    if (window.lucide) window.lucide.createIcons();
  }
  
 
  // Função interna para finalizar salvamento da parcela (usada pelo modal)
 function finalizarAtualizacaoParcela(parcela, valorPagoInformado, dataPgto) {
  parcela.valorPago = valorPagoInformado;
  parcela.dataPagamento = dataPgto;
  parcela.situacao = valorPagoInformado > 0 ? 'Pago' : 'Em aberto';

  // Atualiza status dos convites extras ligados a esta parcela
  if (parcela.id != null) {
    convitesAluno.forEach(function (c) {
      if (c.parcelaId === parcela.id) {
        if (parcela.situacao === 'Pago') {
          c.statusPagamento = 'pago';
          c.pagamento = 'Pago';
        } else {
          c.statusPagamento = 'pendente';
          c.pagamento = 'Pendente';
        }
      }
    });
  }

  fecharModalPagamento();
  renderFinanceiroAluno();
  renderConvitesAluno();
  salvarAlunoNoStorage();
}

  // Clique nas ações da tabela (marcar pago, editar, excluir, enviar cobrança, ver comprovante)
  if (tbodyFin) {
    tbodyFin.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-acao]');
      if (!btn) return;

      var acao = btn.getAttribute('data-acao');
      var tr = btn.closest('tr');
      if (!tr) return;
      var id = parseInt(tr.getAttribute('data-id'), 10);
      if (!id) return;

      var parcela = parcelasAluno.find(function (p) { return p.id === id; });
      if (!parcela) return;

      if (acao === 'marcar-pago' || acao === 'editar-parcela') {
        abrirModalPagamento(parcela);

      } else if (acao === 'excluir-parcela') {
        if (confirm('Deseja excluir esta parcela?')) {
          parcelasAluno = parcelasAluno.filter(function (p) { return p.id !== id; });
          renderFinanceiroAluno();
          salvarAlunoNoStorage();
        }

      } else if (acao === 'enviar-cobranca') {
        var nomeAluno = (document.getElementById('alunoNome') || {}).value || 'Aluno';
        var responsavel = (document.getElementById('respNome') || {}).value || 'responsável';
        var eventosTxt = eventosAluno.map(function (e) { return e.tipo; }).join(', ');
        var valorAberto = Number(parcela.valor || 0) - Number(parcela.valorPago || 0);
        if (valorAberto < 0) valorAberto = 0;
        var dataVenc = formatarDataBr(parcela.vencimento);

        var template = obterTemplateMsgCobranca();
        var msg = preencherTemplateCobranca(template, {
          RESPONSAVEL: responsavel,
          NOME_ALUNO: nomeAluno,
          EVENTOS_CONTRATADOS: eventosTxt || 'formatura',
          VALOR_EM_ABERTO: formatarMoeda(valorAberto),
          DATA_VENCIMENTO: dataVenc || ''
        });

        // tenta enviar para o responsável; se não tiver, vai para o Whats do aluno
        var campoTelefone = 'respTelefone1';
        var elResp = document.getElementById('respTelefone1');
        if (!elResp || !elResp.value) {
          campoTelefone = 'alunoWhatsapp';
        }
        abrirWhatsDoCampo(campoTelefone, msg);

      } else if (acao === 'ver-comprovante') {
        if (!parcela.comprovanteBase64) {
          alert('Nenhum comprovante foi anexado para esta parcela.');
          return;
        }
        var w = window.open('', '_blank');
        var html =
          '<html><head><title>Comprovante</title></head>' +
          '<body style="margin:0;padding:16px;font-family:sans-serif;background:#f4f4f4;">' +
          '<h3>Comprovante de pagamento</h3>' +
          '<p>Parcela com vencimento em ' + formatarDataBr(parcela.vencimento) + '</p>' +
          '<img src="' + parcela.comprovanteBase64 + '" style="max-width:100%;height:auto;display:block;margin-top:12px;" />' +
          '</body></html>';
        w.document.write(html);
        w.document.close();
      }
    });
  }

  // Eventos do modal de pagamento (editar / marcar como pago)
  if (modalFinValor) {
    modalFinValor.addEventListener('input', atualizarInfoDiferencaModal);
    modalFinValor.addEventListener('change', atualizarInfoDiferencaModal);
  }

  if (btnModalFinFechar) {
    btnModalFinFechar.addEventListener('click', fecharModalPagamento);
  }
  if (btnModalFinCancelar) {
    btnModalFinCancelar.addEventListener('click', fecharModalPagamento);
  }

  if (btnModalFinConfirmar) {
    btnModalFinConfirmar.addEventListener('click', function () {
      if (!parcelaEmPagamento) {
        fecharModalPagamento();
        return;
      }

      var dataPgto = modalFinData && modalFinData.value
        ? modalFinData.value
        : new Date().toISOString().slice(0, 10);

      var valorPagoInformado = parseFloat(String(modalFinValor.value || '0').replace(',', '.'));
      if (isNaN(valorPagoInformado) || valorPagoInformado <= 0) {
        if (!confirm('Valor pago está vazio ou zero. Deseja mesmo manter a parcela como não paga?')) {
          return;
        }
        valorPagoInformado = 0;
      }

      var arquivo = modalFinComprovante && modalFinComprovante.files
        ? modalFinComprovante.files[0]
        : null;

      if (arquivo) {
        var reader = new FileReader();
        reader.onload = function (e) {
          parcelaEmPagamento.comprovanteBase64 = e.target.result;
          finalizarAtualizacaoParcela(parcelaEmPagamento, valorPagoInformado, dataPgto);
        };
        reader.readAsDataURL(arquivo);
      } else {
        finalizarAtualizacaoParcela(parcelaEmPagamento, valorPagoInformado, dataPgto);
      }
    });
  }

  if (modalFinOverlay) {
    modalFinOverlay.addEventListener('click', function (ev) {
      if (ev.target === modalFinOverlay) {
        fecharModalPagamento();
      }
    });
  }

  // ------------------ CONVITES ---------------------------
  var tbodyConvites = document.getElementById('tbodyConvitesAluno');
  var chkTodosConvites = document.getElementById('chkTodosConvites');

 
// ======= NUMERAÇÃO GLOBAL DE CONVITES (POR LETRA + ANO) =======

// Onde guardamos o contador global
var LS_CONTADORES_CONVITE = 'kgb-formaturas-contadores-convite';

// Lê configurações da tela Configurações
function getCfgConvite() {
  var cfgPadrao = {
    cfgReiniciarAno: true,
    cfgMascaraConvite: '{LETRA_EVENTO}-{SEQUENCIA}-{ANO}',
    cfgSequenciaInicial: 1
  };

  try {
    var raw = localStorage.getItem('kgb-formaturas-configuracoes');
    if (!raw) return cfgPadrao;

    var cfg = JSON.parse(raw) || {};
    return {
      cfgReiniciarAno: (typeof cfg.cfgReiniciarAno === 'boolean') ? cfg.cfgReiniciarAno : cfgPadrao.cfgReiniciarAno,
      cfgMascaraConvite: cfg.cfgMascaraConvite || cfgPadrao.cfgMascaraConvite,
      cfgSequenciaInicial: parseInt(cfg.cfgSequenciaInicial, 10) || cfgPadrao.cfgSequenciaInicial
    };
  } catch (e) {
    console.warn('Erro lendo configurações de convite:', e);
    return cfgPadrao;
  }
}

// Busca a letra do evento pelo cadastro de Tipos de Evento
function getLetraDoTipoEvento(tipoEvento) {
  try {
    var tipos = carregarTiposEventoCadastrados ? carregarTiposEventoCadastrados() : [];
    var t = tipos.find(function (x) {
      return (x && (x.nome || x.tipo || x.tipoEvento)) === tipoEvento;
    });

    var letra = t && (t.letra || t.codigo || t.sigla);
    letra = (letra || '').toString().trim().toUpperCase();

    // Se não achou, tenta pegar a primeira letra do nome
    if (!letra && tipoEvento) letra = tipoEvento.toString().trim().charAt(0).toUpperCase();

    return letra || 'X';
  } catch (e) {
    return 'X';
  }
}

// Lê o mapa de contadores globais
function lerContadoresConvite() {
  try {
    var raw = localStorage.getItem(LS_CONTADORES_CONVITE);
    if (!raw) return {};
    var obj = JSON.parse(raw);
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (e) {
    return {};
  }
}

// Salva o mapa de contadores globais
function salvarContadoresConvite(obj) {
  try {
    localStorage.setItem(LS_CONTADORES_CONVITE, JSON.stringify(obj || {}));
  } catch (e) {
    console.warn('Erro salvando contadores de convite:', e);
  }
}

// Retorna a próxima sequência para a letra/ano
function proximaSequenciaConvite(letra, ano) {
  var cfg = getCfgConvite();
  var cont = lerContadoresConvite();

  var chave = cfg.cfgReiniciarAno ? (letra + '-' + ano) : (letra);

  var atual = parseInt(cont[chave], 10);
  if (isNaN(atual) || atual < (cfg.cfgSequenciaInicial - 1)) {
    atual = cfg.cfgSequenciaInicial - 1;
  }

  var proximo = atual + 1;
  cont[chave] = proximo;
  salvarContadoresConvite(cont);

  return proximo;
}

// Formata 0001, 0002...
function pad4(n) {
  var s = String(n || 0);
  while (s.length < 4) s = '0' + s;
  return s;
}

// Gera o código final usando a máscara das configurações
function gerarCodigoConvite(tipoEvento) {
  var cfg = getCfgConvite();
  var ano = new Date().getFullYear();
  var letra = getLetraDoTipoEvento(tipoEvento);

  var seq = proximaSequenciaConvite(letra, ano);

  var codigo = (cfg.cfgMascaraConvite || '{LETRA_EVENTO}-{SEQUENCIA}-{ANO}')
    .replaceAll('{LETRA_EVENTO}', letra)
    .replaceAll('{SEQUENCIA}', pad4(seq))
    .replaceAll('{ANO}', String(ano));

  return { codigo: codigo, sequencia: seq, letra: letra, ano: ano };
}

// ======= CRIAÇÃO DE CONVITES (AGORA COM CÓDIGO GLOBAL) =======
function adicionarConvitesExtrasParaEvento(tipoEvento, quantidade, parcelaId) {
  quantidade = parseInt(quantidade, 10);
  if (isNaN(quantidade) || quantidade <= 0) return;

  var nomeAlunoTela = (document.getElementById('alunoNome') || {}).value || 'Aluno';

  // Descobre próximo ID (isso pode continuar local por aluno)
  var maxId = convitesAluno.reduce(function (max, c) {
    var idNum = parseInt(c.id, 10);
    return isNaN(idNum) ? max : Math.max(max, idNum);
  }, 0);
  var proximoId = maxId + 1;

  for (var i = 0; i < quantidade; i++) {
    var info = gerarCodigoConvite(tipoEvento);

    convitesAluno.push({
      id: proximoId++,
      numero: info.codigo,           // EX: C-0001-2025
      sequencia: info.sequencia,     // 1, 2, 3... (opcional mas útil)
      letra: info.letra,             // C
      ano: info.ano,                 // 2025
      evento: tipoEvento,
      nomeAluno: nomeAlunoTela,
      statusPagamento: 'pendente',
      pagamento: 'Pendente',
      statusEmissao: 'pendente',
      emissao: 'Não emitido',
      cancelado: false,
      selecionavel: true,
      parcelaId: parcelaId || null
    });
  }
}



   function renderResumoConvites(tipoEvento) {
    tipoEvento = tipoEvento || 'todos';

    var direito = 0;
    var emitidos = 0;

    convitesAluno.forEach(function (c) {
      if (c.cancelado) return;
      if (tipoEvento !== 'todos' && c.evento !== tipoEvento) return;

      // Consideramos cada convite como "direito" 1.
      direito += 1;
      if (c.statusEmissao === 'emitido') {
        emitidos += 1;
      }
    });

    var spanDireito = document.getElementById('cvDireito');
    var spanExtras = document.getElementById('cvExtras');
    var spanTotal = document.getElementById('cvTotal');
    var spanEmitidos = document.getElementById('cvEmitidos');

    if (spanDireito) spanDireito.textContent = direito;
    if (spanExtras) spanExtras.textContent = 0;          // se quiser, depois dá pra tratar extras de outra forma
    if (spanTotal) spanTotal.textContent = direito;
    if (spanEmitidos) spanEmitidos.textContent = emitidos;
  }

    function atualizarSelectConvitesTipoEvento() {
    var select = document.getElementById('convitesTipoEvento');
    if (!select) return;

    var valorAtual = select.value || 'todos';

    // Conjunto de eventos que existem nos convites
    var tipos = {};
    convitesAluno.forEach(function (c) {
      if (c.evento) {
        tipos[c.evento] = true;
      }
    });

    // Reconstrói as opções
    select.innerHTML = '<option value="todos">Todos</option>';
    Object.keys(tipos).forEach(function (nome) {
      var opt = document.createElement('option');
      opt.value = nome;
      opt.textContent = nome;
      select.appendChild(opt);
    });

    // Mantém o valor se ainda fizer sentido
    if (valorAtual && (valorAtual === 'todos' || tipos[valorAtual])) {
      select.value = valorAtual;
    }
  }


  function renderConvitesAluno() {
    if (!tbodyConvites) return;
    tbodyConvites.innerHTML = '';

    var filtroEvento = document.getElementById('convitesTipoEvento');
    var tipoFiltro = filtroEvento ? filtroEvento.value : 'todos';

    var filtroNomeEl = document.getElementById('convitesFiltroNomeAluno');
    var filtroNome = filtroNomeEl ? (filtroNomeEl.value || '').toLowerCase().trim() : '';

    var nomeAlunoTela = (document.getElementById('alunoNome') || {}).value || '';

    convitesAluno.forEach(function (c) {
      var nomeAluno = c.nomeAluno || nomeAlunoTela || 'Aluno';

      if (tipoFiltro && tipoFiltro !== 'todos' && c.evento !== tipoFiltro) return;
      if (filtroNome && nomeAluno.toLowerCase().indexOf(filtroNome) === -1) return;

      var tr = document.createElement('tr');
      tr.setAttribute('data-id', c.id);

      var pagoClass;
      if (c.statusPagamento === 'pago') pagoClass = 'status-convite-pago';
      else if (c.statusPagamento === 'bloqueado') pagoClass = 'status-convite-bloqueado';
      else if (c.statusPagamento === 'cancelado') pagoClass = 'status-convite-cancelado';
      else pagoClass = 'status-convite-pendente';

      var emissClass;
      if (c.statusEmissao === 'emitido') emissClass = 'status-convite-emitido';
      else if (c.statusEmissao === 'cancelado') emissClass = 'status-convite-cancelado';
      else emissClass = 'status-convite-pendente';

      var chkHtml = '<input type="checkbox"' + (c.selecionavel ? '' : ' disabled') + '>';

     tr.innerHTML =
  '<td>' + chkHtml + '</td>' +
  '<td>' + c.numero + '</td>' +
  '<td>' + c.evento + '</td>' +
  '<td>' +
    '<span class="status-convite ' + pagoClass + '">' +
      '<i data-lucide="' +
        (c.statusPagamento === 'pago'
          ? 'check-circle-2'
          : c.statusPagamento === 'bloqueado'
            ? 'alert-triangle'
            : c.statusPagamento === 'cancelado'
              ? 'x-circle'
              : 'clock-3') +
      '"></i> ' +
      c.pagamento +
    '</span>' +
  '</td>' +
  '<td>' +
    '<span class="status-convite ' + emissClass + '">' +
      '<i data-lucide="' +
        (c.statusEmissao === 'emitido'
          ? 'ticket'
          : c.statusEmissao === 'cancelado'
            ? 'ban'
            : 'clock-3') +
      '"></i> ' +
      c.emissao +
    '</span>' +
  '</td>' +
  '<td>' +
    (c.statusEmissao === 'emitido'
      ? '<button class="btn-acao-mini" data-acao="ver-pdf"><i data-lucide="eye"></i> Ver PDF</button> '
      : '') +
    (!c.cancelado && c.statusEmissao !== 'emitido'
      ? '<button class="btn-acao-mini" data-acao="emitir-convite"><i data-lucide="sparkles"></i> Emitir convite</button> '
      : '') +
    (!c.cancelado
      ? '<button class="btn-acao-mini" data-acao="cancelar-convite"><i data-lucide="x-circle"></i> Cancelar</button>'
      : '') +
  '</td>';


      tbodyConvites.appendChild(tr);
    });
    // Atualiza as opções do filtro de evento com base nos convites existentes
    atualizarSelectConvitesTipoEvento();

    if (chkTodosConvites) chkTodosConvites.checked = false;
    renderResumoConvites(tipoFiltro);
    if (window.lucide) window.lucide.createIcons();
  }

  // ----------------- ABAS DA TELA ------------------------
  var abas = document.querySelectorAll('.aba-aluno');
  var conteudos = document.querySelectorAll('.aba-conteudo');

  abas.forEach(function (aba) {
    aba.addEventListener('click', function () {
      var alvo = aba.getAttribute('data-aba');
      if (!alvo) return;

      abas.forEach(function (a) { a.classList.remove('ativa'); });
      conteudos.forEach(function (sec) { sec.classList.remove('ativa'); });

      aba.classList.add('ativa');
      var secAlvo = document.getElementById('aba-' + alvo);
      if (secAlvo) secAlvo.classList.add('ativa');

      if (window.lucide) window.lucide.createIcons();
    });
  });

  // ------------- PREENCHER / SALVAR ALUNO ---------------
  function preencherCamposComAluno(aluno) {
    if (!aluno) return;

    var campoNome = document.getElementById('alunoNome');
    var campoEscola = document.getElementById('alunoEscola');
    var campoAno = document.getElementById('alunoAnoFormatura');
    var campoSerie = document.getElementById('alunoSerie');
    var campoStatus = document.getElementById('alunoStatus');
    var campoWhatsapp = document.getElementById('alunoWhatsapp');

    if (campoNome) campoNome.value = aluno.nome || '';
    if (campoEscola && aluno.escolaNome) campoEscola.value = aluno.escolaNome;
    if (campoAno && aluno.anoFormatura) campoAno.value = aluno.anoFormatura;
    if (campoSerie && aluno.serie) campoSerie.value = aluno.serie;
    if (campoStatus && aluno.status) campoStatus.value = aluno.status;
    if (campoWhatsapp && aluno.whatsappAluno) campoWhatsapp.value = aluno.whatsappAluno;

    var respCampos = {
      respNome: 'respNome',
      respParentesco: 'respParentesco',
      respCpf: 'respCpf',
      respRg: 'respRg',
      respTelefone1: 'respTelefone1',
      respTelefone2: 'respTelefone2',
      respEmail: 'respEmail',
      respEndereco: 'respEndereco'
    };
    Object.keys(respCampos).forEach(function (chave) {
      var idHtml = respCampos[chave];
      var el = document.getElementById(idHtml);
      if (el && aluno[chave] != null) el.value = aluno[chave];
    });

    var obsCampo = document.getElementById('obsEstrategicasAluno');
    if (obsCampo && aluno.obsEstrategicas) obsCampo.value = aluno.obsEstrategicas;

    var spanNome = document.getElementById('resumoAlunoNome');
    var spanEscola = document.getElementById('resumoAlunoEscola');
    var spanAno = document.getElementById('resumoAlunoAno');
    var spanFin = document.getElementById('resumoAlunoFinanceiro');
    var spanSit = document.getElementById('resumoAlunoSituacao');
    var lblResumoEscola = document.getElementById('lblResumoEscola');
    var lblResumoAno = document.getElementById('lblResumoAno');
    var miniStatus = document.getElementById('miniStatusAluno');

    if (spanNome) spanNome.textContent = aluno.nome || '';
    if (spanEscola) spanEscola.textContent = aluno.escolaNome || '';
    if (spanAno) spanAno.textContent = aluno.anoFormatura || '';
    if (lblResumoEscola) lblResumoEscola.textContent = aluno.escolaNome || 'não informado';
    if (lblResumoAno) lblResumoAno.textContent = aluno.anoFormatura || '-';
    if (miniStatus) miniStatus.textContent = aluno.status || 'Ativo';

        // ---------- carrega eventos / parcelas / convites do aluno ----------
    eventosAluno  = Array.isArray(aluno.eventos)  ? aluno.eventos.slice()  : [];
    parcelasAluno = Array.isArray(aluno.parcelas) ? aluno.parcelas.slice() : [];
    convitesAluno = Array.isArray(aluno.convites) ? aluno.convites.slice() : [];

    // Ajusta os próximos IDs com base no maior ID existente
    proximoIdEvento = eventosAluno.reduce(function (max, ev) {
      var idNum = parseInt(ev.id, 10);
      return isNaN(idNum) ? max : Math.max(max, idNum);
    }, 0) + 1;

    proximoIdParcela = parcelasAluno.reduce(function (max, p) {
      var idNum = parseInt(p.id, 10);
      return isNaN(idNum) ? max : Math.max(max, idNum);
    }, 0) + 1;

    // Garante que convites tenham ID
    convitesAluno.forEach(function (c, idx) {
      if (c.id == null) {
        c.id = idx + 1;
      }
    });

    // Renderiza tudo na tela a partir dos dados reais
    renderEventosAluno();
    renderFinanceiroAluno();
    renderConvitesAluno();
    calcularResumoFinanceiro();

    var resumoFin = aluno.resumoFinanceiro || obterResumoFinanceiroAtual();
    if (spanFin) {
      spanFin.textContent =
        formatarMoeda(resumoFin.total || 0) +
        ' (' +
        formatarMoeda(resumoFin.pago || 0) +
        ' pago)';
    }

    if (spanSit) {
      spanSit.classList.remove('badge-situacao-ok', 'badge-situacao-pendente', 'badge-situacao-inad');
      var texto = 'Situação OK';
      var icone = 'check-circle-2';
      if (aluno.status === 'Arquivado') {
        spanSit.classList.add('badge-situacao-pendente');
        texto = 'Cadastro arquivado';
        icone = 'archive';
      } else if (aluno.status === 'Inadimplente') {
        spanSit.classList.add('badge-situacao-inad');
        texto = 'Inadimplente';
        icone = 'alert-triangle';
      } else {
        spanSit.classList.add('badge-situacao-ok');
      }
      spanSit.innerHTML = '<i data-lucide="' + icone + '"></i> ' + texto;
    }

    if (window.lucide) window.lucide.createIcons();
  }

  function coletarDadosAlunoParaStorage(alunoAnterior) {
    alunoAnterior = alunoAnterior || {};

    var resultado = {
      id: alunoAnterior.id,
      criadoEm: alunoAnterior.criadoEm || new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    };

    resultado.nome = (document.getElementById('alunoNome') || {}).value || '';
    var selectEscola = document.getElementById('alunoEscola');
    if (selectEscola) {
      var optSel = selectEscola.options[selectEscola.selectedIndex];
      resultado.escolaNome = optSel ? optSel.value : '';
      resultado.escolaId = optSel && optSel.dataset.id ? optSel.dataset.id : null;
    } else {
      resultado.escolaNome = '';
      resultado.escolaId = null;
    }

    resultado.anoFormatura = (document.getElementById('alunoAnoFormatura') || {}).value || '';
    resultado.serie = (document.getElementById('alunoSerie') || {}).value || '';
    resultado.status = (document.getElementById('alunoStatus') || {}).value || '';
    resultado.whatsappAluno = (document.getElementById('alunoWhatsapp') || {}).value || '';

    var respCampos = {
      respNome: 'respNome',
      respParentesco: 'respParentesco',
      respCpf: 'respCpf',
      respRg: 'respRg',
      respTelefone1: 'respTelefone1',
      respTelefone2: 'respTelefone2',
      respEmail: 'respEmail',
      respEndereco: 'respEndereco'
    };
    Object.keys(respCampos).forEach(function (chave) {
      var idHtml = respCampos[chave];
      var el = document.getElementById(idHtml);
      resultado[chave] = el ? el.value || '' : '';
    });

    var obsCampo = document.getElementById('obsEstrategicasAluno');
    resultado.obsEstrategicas = obsCampo ? obsCampo.value || '' : '';

    resultado.resumoFinanceiro = obterResumoFinanceiroAtual();

        // Salva também os dados “ricos” do aluno (eventos, parcelas e convites)
    resultado.eventos  = Array.isArray(eventosAluno)  ? eventosAluno.slice()  : [];
    resultado.parcelas = Array.isArray(parcelasAluno) ? parcelasAluno.slice() : [];
    resultado.convites = Array.isArray(convitesAluno) ? convitesAluno.slice() : [];

    return resultado;
  }

  function salvarAlunoNoStorage() {
    var alunoAnterior = null;
    if (alunoAtualId != null) {
      alunoAnterior = listaAlunos.find(function (a) {
        return String(a.id) === String(alunoAtualId);
      }) || null;
    }

    var dados = coletarDadosAlunoParaStorage(alunoAnterior);

    if (alunoAtualId == null) {
      alunoAtualId = Date.now().toString();
      dados.id = alunoAtualId;
      listaAlunos.push(dados);
    } else {
      dados.id = alunoAtualId;
      var idx = listaAlunos.findIndex(function (a) {
        return String(a.id) === String(alunoAtualId);
      });
      if (idx >= 0) {
        listaAlunos[idx] = dados;
      } else {
        listaAlunos.push(dados);
      }
    }

    salvarListaAlunos(listaAlunos);
  }

 function inicializarAlunoAtual() {
  var params = new URLSearchParams(window.location.search);
  var idUrl = params.get('id');

  var alvo = null;
  if (idUrl) {
    alvo = listaAlunos.find(function (a) {
      return String(a.id) === String(idUrl);
    }) || null;
  }

  if (alvo) {
    // Editando aluno existente
    alunoAtualId = alvo.id;

    // ✅ IMPORTANTE: define o aluno atual (para PDF / modelo / etc)
    alunoAtual = alvo;

    preencherCamposComAluno(alvo);
  } else {
    // Novo aluno: limpa estados
    alunoAtualId = null;

    // ✅ IMPORTANTE: sem aluno carregado
    alunoAtual = null;

    eventosAluno = [];
    parcelasAluno = [];
    convitesAluno = [];
    proximoIdEvento = 1;
    proximoIdParcela = 1;

    renderEventosAluno();
    renderFinanceiroAluno();
    renderConvitesAluno();
    calcularResumoFinanceiro();
  }
}

  var btnSalvarDadosAluno = document.getElementById('btnSalvarDadosAluno');
  if (btnSalvarDadosAluno) {
    btnSalvarDadosAluno.addEventListener('click', function () {
      var nome = document.getElementById('alunoNome').value || 'Aluno';
      var escola = document.getElementById('alunoEscola').value || '';
      var serie = document.getElementById('alunoSerie').value || '';
      var ano = document.getElementById('alunoAnoFormatura').value || '';
      var status = document.getElementById('alunoStatus').value || 'Ativo';

      var spanNome = document.getElementById('resumoAlunoNome');
      var spanEscola = document.getElementById('resumoAlunoEscola');
      var spanAno = document.getElementById('resumoAlunoAno');
      var spanSit = document.getElementById('resumoAlunoSituacao');
      var lblResumoEscola = document.getElementById('lblResumoEscola');
      var lblResumoAno = document.getElementById('lblResumoAno');
      var miniStatus = document.getElementById('miniStatusAluno');

      if (spanNome) spanNome.textContent = nome;
      if (spanEscola) spanEscola.textContent = escola;
      if (spanAno) spanAno.textContent = ano;
      if (lblResumoEscola) lblResumoEscola.textContent = escola || 'não informado';
      if (lblResumoAno) lblResumoAno.textContent = ano || '-';
      if (miniStatus) miniStatus.textContent = status;

      if (spanSit) {
        spanSit.classList.remove('badge-situacao-ok', 'badge-situacao-pendente', 'badge-situacao-inad');
        var texto = 'Situação OK';
        var icone = 'check-circle-2';
        if (status === 'Arquivado') {
          spanSit.classList.add('badge-situacao-pendente');
          texto = 'Cadastro arquivado';
          icone = 'archive';
        } else if (status === 'Inadimplente') {
          spanSit.classList.add('badge-situacao-inad');
          texto = 'Inadimplente';
          icone = 'alert-triangle';
        } else {
          spanSit.classList.add('badge-situacao-ok');
        }
        spanSit.innerHTML = '<i data-lucide="' + icone + '"></i> ' + texto;
      }

      calcularResumoFinanceiro();
      salvarAlunoNoStorage();

      convitesAluno.forEach(function (c) { c.nomeAluno = nome; });
      renderConvitesAluno();

      alert('Dados do aluno salvos.');
      if (window.lucide) window.lucide.createIcons();
    });
  }

  var btnWhatsAluno = document.getElementById('btnWhatsAluno');
  if (btnWhatsAluno) {
    btnWhatsAluno.addEventListener('click', function () {
      var nome = document.getElementById('alunoNome').value || 'formando';
      abrirWhatsDoCampo('alunoWhatsapp', 'Olá ' + nome + ', tudo bem? Aqui é do buffet da formatura.');
    });
  }

  // ------------- RESPONSÁVEL -----------------------------
  var btnWhatsResp = document.getElementById('btnWhatsResp');
  if (btnWhatsResp) {
    btnWhatsResp.addEventListener('click', function () {
      var nome = document.getElementById('respNome').value || 'responsável';
      abrirWhatsDoCampo('respTelefone1', 'Olá ' + nome + ', tudo bem? Aqui é do buffet da formatura.');
    });
  }

  var btnSalvarResponsavel = document.getElementById('btnSalvarResponsavel');
  if (btnSalvarResponsavel) {
    btnSalvarResponsavel.addEventListener('click', function () {
      salvarAlunoNoStorage();
      alert('Dados do responsável salvos.');
    });
  }

// ------------- EVENTOS – ADICIONAR/EDITAR --------------
var btnAdicionarEvento = document.getElementById('btnAdicionarEventoAluno');
if (btnAdicionarEvento) {
  btnAdicionarEvento.addEventListener('click', function () {
    var container = document.getElementById('selectTipoEventoAluno');
    if (!container) return;

    // Pega TODOS os tipos marcados (checkboxes)
    var selecionados = Array.from(
      container.querySelectorAll('.chkTipoEventoAluno:checked')
    );

    if (!selecionados.length) {
      alert('Selecione pelo menos um tipo de evento.');
      return;
    }

    var valorInput = document.getElementById('valorCustomEvento');
    var extrasInput = document.getElementById('convitesExtrasEvento');
    var convitesDireitoInput = document.getElementById('convitesDireitoEvento'); // se você usar esse campo

    var valorStr = valorInput ? (valorInput.value || '') : '';
    var extrasStr = extrasInput ? (extrasInput.value || '') : '';

    // Convites extras digitados valem para todos os tipos selecionados
    var extras = 0;
    if (extrasStr) {
      var e = parseInt(extrasStr, 10);
      if (!isNaN(e)) extras = e;
    }

    var tiposCadastrados = carregarTiposEventoCadastrados();

    selecionados.forEach(function (input) {
      var tipo = input.value;

      var valor = 0;
      var convitesIncluidos = 0;

      var tipoConfig = tiposCadastrados.find(function (t) {
        var nome = t.nome || t.nomeInterno || t.tipoEvento || t.tipo || '';
        return nome === tipo;
      });

      if (tipoConfig && tipoConfig.valor != null) {
        valor = Number(tipoConfig.valor) || 0;
      }
      if (tipoConfig && tipoConfig.convites != null) {
        convitesIncluidos = parseInt(tipoConfig.convites, 10) || 0;
      }

      // Se preencher manualmente "convites de direito", sobrescreve o padrão
      if (convitesDireitoInput && convitesDireitoInput.value !== '') {
        var qtdDireito = parseInt(convitesDireitoInput.value, 10);
        if (!isNaN(qtdDireito) && qtdDireito >= 0) {
          convitesIncluidos = qtdDireito;
        }
      }

      // Se informou valor personalizado, vale para todos os tipos
      if (valorStr) {
        var v = parseFloat(valorStr.replace(',', '.'));
        if (!isNaN(v)) {
          valor = v;
        }
      }

      // Cria UM evento para esse tipo
      var novoEvento = {
        id: proximoIdEvento++,
        tipo: tipo,
        valor: valor,
        convitesIncluidos: convitesIncluidos,
        convitesExtras: extras,
        situacao: 'Pendente'
      };

      eventosAluno.push(novoEvento);

      // Já cria automaticamente os convites de direito desse evento
      // (usa a função que você já tem para convites extras)
      if (convitesIncluidos && convitesIncluidos > 0 &&
          typeof adicionarConvitesExtrasParaEvento === 'function') {
        adicionarConvitesExtrasParaEvento(tipo, convitesIncluidos, null);
      }
    });

    // Limpa checkboxes e campos
    selecionados.forEach(function (input) {

      input.checked = false;
    });
    if (valorInput) valorInput.value = '';
    if (extrasInput) extrasInput.value = '';

    renderEventosAluno();
    atualizarSelectFinReferencia();
    calcularResumoFinanceiro();
    renderConvitesAluno();
    renderResumoConvites('todos');
    salvarAlunoNoStorage();
  });
}


// Lançar convites extras para um evento específico
var btnSalvarConvitesExtras = document.getElementById('btnSalvarConvitesExtras');
if (btnSalvarConvitesExtras) {
  btnSalvarConvitesExtras.addEventListener('click', function () {
    var container = document.getElementById('selectTipoEventoAluno');
    if (!container) return;

    // pega os checkboxes marcados
    var selecionados = Array.from(
      container.querySelectorAll('.chkTipoEventoAluno:checked')
    );

    if (!selecionados.length) {
      alert('Selecione o evento para lançar os convites extras.');
      return;
    }
    if (selecionados.length > 1) {
      alert('Selecione apenas um evento para lançar os convites extras.');
      return;
    }

    var tipo = selecionados[0].value;

    // quantidade de convites extras
    var extrasInput = document.getElementById('convitesExtrasEvento');
    var qtdStr = extrasInput ? String(extrasInput.value || '').trim() : '';
    var qtd = parseInt(qtdStr, 10);

    if (!qtd || isNaN(qtd) || qtd <= 0) {
      alert('Informe a quantidade de convites extras.');
      return;
    }

    // valor do convite extra
    var valorInput = document.getElementById('valorConviteExtraEvento');
    var valorStr = valorInput ? String(valorInput.value || '').trim() : '';
    var valorUnit = parseFloat(
      valorStr.replace(/\./g, '').replace(',', '.')
    );

    if (!valorUnit || isNaN(valorUnit) || valorUnit <= 0) {
      alert('Informe o valor de cada convite extra (ex: 30,00).');
      return;
    }

    var valorTotal = qtd * valorUnit;

    // cria uma parcela em aberto no financeiro
    var hoje = new Date().toISOString().slice(0, 10);
    var novaParcela = {
      id: proximoIdParcela++,
      vencimento: hoje,
      evento: tipo,
      descricao: 'Convites extras - ' + tipo,
      valor: valorTotal,
      valorPago: 0,
      situacao: 'Em aberto',
      forma: 'PIX',
      dataPagamento: null
    };
    parcelasAluno.push(novaParcela);

    // atualiza o evento correspondente com o total de extras
    var evento = eventosAluno.find(function (e) { return e.tipo === tipo; });
    if (evento) {
      evento.convitesExtras = (evento.convitesExtras || 0) + qtd;
    }

    // cria os convites extras na aba "Convites"
    adicionarConvitesExtrasParaEvento(tipo, qtd, novaParcela.id);

    renderEventosAluno();
    renderFinanceiroAluno();
    renderConvitesAluno();
    calcularResumoFinanceiro();
    salvarAlunoNoStorage();

    alert('Convites extras lançados no financeiro e criados na aba Convites.');
  });
}

// >>> FIM DO LISTENER NOVO <<<

  if (tbodyEventos) {
    tbodyEventos.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-acao]');
      if (!btn) return;

      var acao = btn.getAttribute('data-acao');
      var tr = btn.closest('tr');
      var id = tr ? parseInt(tr.getAttribute('data-id'), 10) : null;
      if (!id) return;

      var evento = eventosAluno.find(function (e) { return e.id === id; });
      if (!evento) return;

      if (acao === 'remover-evento') {
        if (confirm('Remover o evento "' + evento.tipo + '" deste aluno?')) {
          eventosAluno = eventosAluno.filter(function (e) { return e.id !== id; });
          renderEventosAluno();
          calcularResumoFinanceiro();
          salvarAlunoNoStorage();
          atualizarSelectFinReferencia();

        }
      } else if (acao === 'editar-evento') {
        var novoValor = window.prompt('Novo valor para "' + evento.tipo + '" (em R$):', evento.valor);
        if (novoValor !== null && novoValor !== '') {
          var v = parseFloat(novoValor.replace(',', '.'));
          if (!isNaN(v)) evento.valor = v;
        }
        var novosExtras = window.prompt('Quantidade de convites extras:', evento.convitesExtras);
        if (novosExtras !== null && novosExtras !== '') {
          var e = parseInt(novosExtras, 10);
          if (!isNaN(e)) evento.convitesExtras = e;
        }
        renderEventosAluno();
        calcularResumoFinanceiro();
        salvarAlunoNoStorage();
      }
    });
  }

  // ------------- FINANCEIRO – AÇÕES ----------------------
  var btnAdicionarParcela = document.getElementById('btnAdicionarParcela');
if (btnAdicionarParcela) {
  btnAdicionarParcela.addEventListener('click', function () {
    var data = document.getElementById('finDataVenc').value;
    var valorStr = document.getElementById('finValor').value;
    var valor = parseFloat(valorStr.replace(',', '.'));
   var eventoRefEl = document.getElementById('finTipoEventoRef');
var eventoRef = eventoRefEl ? eventoRefEl.value : '';
    var forma = document.getElementById('finFormaPgto').value;

    if (!data || isNaN(valor) || valor <= 0) {
      alert('Informe data e valor válidos para a parcela.');
      return;
    }

    parcelasAluno.push({
      id: proximoIdParcela++,
      vencimento: data,
      evento: eventoRef || 'Geral',
      descricao: '',
      valor: valor,
      valorPago: 0,
      situacao: 'Em aberto',
      forma: forma || 'PIX',
      dataPagamento: null
    });

    document.getElementById('finDataVenc').value = '';
    document.getElementById('finValor').value = '';

    renderFinanceiroAluno();
    salvarAlunoNoStorage();
  });
}


   // Eventos do modal financeiro
  if (modalFinValor) {
    modalFinValor.addEventListener('input', atualizarInfoDiferencaModal);
  }
  if (btnModalFinFechar) {
    btnModalFinFechar.addEventListener('click', fecharModalPagamento);
  }
  if (btnModalFinCancelar) {
    btnModalFinCancelar.addEventListener('click', fecharModalPagamento);
  }
  if (modalFinOverlay) {
    modalFinOverlay.addEventListener('click', function (ev) {
      if (ev.target === modalFinOverlay) {
        fecharModalPagamento();
      }
    });
  }
  if (btnModalFinConfirmar) {
    btnModalFinConfirmar.addEventListener('click', function () {
      if (!parcelaEmPagamento) {
        fecharModalPagamento();
        return;
      }

      var dataPgto = modalFinData.value || new Date().toISOString().slice(0, 10);
      var valorStr = String(modalFinValor.value || '0')
        .replace(/\./g, '')
        .replace(',', '.');
      var v = parseFloat(valorStr);
      if (isNaN(v) || v <= 0) {
        alert('Informe um valor pago válido.');
        return;
      }

      var arquivo = modalFinComprovante && modalFinComprovante.files && modalFinComprovante.files[0];

      function aplicarPagamento(base64, tipo, nome) {
        parcelaEmPagamento.situacao = 'Pago';
        parcelaEmPagamento.dataPagamento = dataPgto;
        parcelaEmPagamento.valorPago = v;
        parcelaEmPagamento.diferenca = v - Number(parcelaEmPagamento.valor || 0);

        if (base64) {
          parcelaEmPagamento.comprovanteBase64 = base64;
          parcelaEmPagamento.comprovanteTipo = tipo || '';
          parcelaEmPagamento.comprovanteNome = nome || '';
        }

        renderFinanceiroAluno();
        salvarAlunoNoStorage();
        fecharModalPagamento();
      }

      if (arquivo) {
        var reader = new FileReader();
        reader.onload = function (e) {
          aplicarPagamento(e.target.result, arquivo.type, arquivo.name);
        };
        reader.readAsDataURL(arquivo);
      } else {
        aplicarPagamento(null, null, null);
      }
    });
  }

  // Modal do comprovante: fechar ao clicar no X ou fora
  var modalComprovanteOverlay = document.getElementById('modalComprovanteOverlay');
  var btnFecharModalComprovante = document.getElementById('btnFecharModalComprovante');

  function fecharModalComprovante() {
    if (modalComprovanteOverlay) {
      modalComprovanteOverlay.setAttribute('hidden', 'hidden');
    }
  }

  if (btnFecharModalComprovante) {
    btnFecharModalComprovante.addEventListener('click', fecharModalComprovante);
  }
  if (modalComprovanteOverlay) {
    modalComprovanteOverlay.addEventListener('click', function (ev) {
      if (ev.target === modalComprovanteOverlay) {
        fecharModalComprovante();
      }
    });
  }
  // Eventos do modal financeiro
  if (modalFinValor) {
    modalFinValor.addEventListener('input', atualizarInfoDiferencaModal);
  }
  if (btnModalFinFechar) {
    btnModalFinFechar.addEventListener('click', fecharModalPagamento);
  }
  if (btnModalFinCancelar) {
    btnModalFinCancelar.addEventListener('click', fecharModalPagamento);
  }
  if (modalFinOverlay) {
    modalFinOverlay.addEventListener('click', function (ev) {
      if (ev.target === modalFinOverlay) {
        fecharModalPagamento();
      }
    });
  }
  if (btnModalFinConfirmar) {
    btnModalFinConfirmar.addEventListener('click', function () {
      if (!parcelaEmPagamento) {
        fecharModalPagamento();
        return;
      }

      var dataPgto = modalFinData.value || new Date().toISOString().slice(0, 10);
      var valorStr = String(modalFinValor.value || '0')
        .replace(/\./g, '')
        .replace(',', '.');
      var v = parseFloat(valorStr);
      if (isNaN(v) || v <= 0) {
        alert('Informe um valor pago válido.');
        return;
      }

      var arquivo = modalFinComprovante && modalFinComprovante.files && modalFinComprovante.files[0];

      function aplicarPagamento(base64, tipo, nome) {
        parcelaEmPagamento.situacao = 'Pago';
        parcelaEmPagamento.dataPagamento = dataPgto;
        parcelaEmPagamento.valorPago = v;
        parcelaEmPagamento.diferenca = v - Number(parcelaEmPagamento.valor || 0);

        if (base64) {
          parcelaEmPagamento.comprovanteBase64 = base64;
          parcelaEmPagamento.comprovanteTipo = tipo || '';
          parcelaEmPagamento.comprovanteNome = nome || '';
        }

        renderFinanceiroAluno();
        salvarAlunoNoStorage();
        fecharModalPagamento();
      }

      if (arquivo) {
        var reader = new FileReader();
        reader.onload = function (e) {
          aplicarPagamento(e.target.result, arquivo.type, arquivo.name);
        };
        reader.readAsDataURL(arquivo);
      } else {
        aplicarPagamento(null, null, null);
      }
    });
  }

  // Modal do comprovante: fechar ao clicar no X ou fora
  var modalComprovanteOverlay = document.getElementById('modalComprovanteOverlay');
  var btnFecharModalComprovante = document.getElementById('btnFecharModalComprovante');

  function fecharModalComprovante() {
    if (modalComprovanteOverlay) {
      modalComprovanteOverlay.setAttribute('hidden', 'hidden');
    }
  }

  if (btnFecharModalComprovante) {
    btnFecharModalComprovante.addEventListener('click', fecharModalComprovante);
  }
  if (modalComprovanteOverlay) {
    modalComprovanteOverlay.addEventListener('click', function (ev) {
      if (ev.target === modalComprovanteOverlay) {
        fecharModalComprovante();
      }
    });
  }


  // ------------- CONVITES – BOTÕES / WHATS --------------
    // Abre a página de modelos de convite já com alguns dados via query string
function abrirModeloConvite(convite) {
  if (!convite) return;

  const params = new URLSearchParams();

  params.set('modo', 'pdf'); // <<< IMPORTANTE: abre em modo impressão/PDF
  params.set('numero', convite.numero || '');
  params.set('evento', convite.evento || '');

  if (alunoAtual) {
    params.set('aluno', alunoAtual.nomeCompleto || '');
    params.set('escola', alunoAtual.escola || '');
    params.set('ano', alunoAtual.anoFormatura || '');
  }

  const url = 'kgb-formaturas-modelos-convite.html?' + params.toString();
  window.open(url, '_blank');
}


  var selectConvitesEvento = document.getElementById('convitesTipoEvento');
  if (selectConvitesEvento) {
    selectConvitesEvento.addEventListener('change', function () {
      renderConvitesAluno();
    });
  }

  var filtroNomeConvite = document.getElementById('convitesFiltroNomeAluno');
  if (filtroNomeConvite) {
    filtroNomeConvite.addEventListener('input', function () {
      renderConvitesAluno();
    });
  }

  if (chkTodosConvites) {
    chkTodosConvites.addEventListener('change', function () {
      var marcar = chkTodosConvites.checked;
      var chks = tbodyConvites.querySelectorAll('input[type="checkbox"]');
      chks.forEach(function (c) {
        if (!c.disabled) c.checked = marcar;
      });
    });
  }

    if (tbodyConvites) {
    tbodyConvites.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-acao]');
      if (!btn) return;

      var acao = btn.getAttribute('data-acao');
      var tr = btn.closest('tr');
      var id = tr ? parseInt(tr.getAttribute('data-id'), 10) : null;
      if (!id) return;

      var convite = convitesAluno.find(function (c) { return c.id === id; });
      if (!convite) return;

      if (acao === 'ver-pdf') {
        // apenas abre o modelo com esse convite
        abrirModeloConvite(convite);

      } else if (acao === 'emitir-convite') {
        // marca como emitido
        convite.statusEmissao = 'emitido';
        convite.emissao = 'Emitido';
        convite.cancelado = false;
        convite.selecionavel = true;

        salvarAlunoNoStorage();
        renderConvitesAluno();

        // abre o modelo já com os dados do convite
        abrirModeloConvite(convite);

      } else if (acao === 'cancelar-convite') {
        if (confirm('Deseja cancelar o convite ' + convite.numero + '?')) {
          convite.cancelado = true;
          convite.statusEmissao = 'cancelado';
          convite.emissao = 'Convite inválido';
          convite.statusPagamento = 'cancelado';
          convite.pagamento = 'Cancelado';
          convite.selecionavel = false;

          salvarAlunoNoStorage();
          renderConvitesAluno();
        }
      }
    });
  }


   var btnEmitirConvitesSel = document.getElementById('btnEmitirConvitesSel');
  if (btnEmitirConvitesSel) {
    btnEmitirConvitesSel.addEventListener('click', function () {
      if (!tbodyConvites) return;

      var selecionados = [];
      var linhas = tbodyConvites.querySelectorAll('tr');

      linhas.forEach(function (tr) {
        var chk = tr.querySelector('input[type="checkbox"]');
        if (chk && chk.checked && !chk.disabled) {
          var id = parseInt(tr.getAttribute('data-id'), 10);
          var conv = convitesAluno.find(function (c) { return c.id === id; });
          if (conv) selecionados.push(conv);
        }
      });

      if (!selecionados.length) {
        alert('Selecione pelo menos um convite para emitir.');
        return;
      }

      selecionados.forEach(function (convite) {
        convite.statusEmissao = 'emitido';
        convite.emissao = 'Emitido';
        convite.cancelado = false;
        convite.selecionavel = true;
      });

      salvarAlunoNoStorage();
      renderConvitesAluno();

      // Abre o PDF do primeiro convite selecionado
      abrirModeloConvite(selecionados[0]);
    });
  }


  var btnEnviarConvitesWhats = document.getElementById('btnEnviarConvitesWhats');
  if (btnEnviarConvitesWhats) {
    btnEnviarConvitesWhats.addEventListener('click', function () {
      var telefoneFieldId = 'alunoWhatsapp';
      var nomeAluno = (document.getElementById('alunoNome') || {}).value || 'Aluno';

      if (!tbodyConvites) {
        alert('Nenhuma tabela de convites encontrada.');
        return;
      }

      var selecionados = [];
      var linhas = tbodyConvites.querySelectorAll('tr');

      linhas.forEach(function (tr) {
        var chk = tr.querySelector('input[type="checkbox"]');
        if (chk && chk.checked && !chk.disabled) {
          var idAttr = tr.getAttribute('data-id');
          var convite = null;

          if (idAttr) {
            var idNum = parseInt(idAttr, 10);
            if (!isNaN(idNum)) {
              convite = convitesAluno.find(function (c) {
                return c.id === idNum;
              });
            }
          }
          if (!convite) {
            var tds = tr.querySelectorAll('td');
            if (tds.length >= 3) {
              convite = {
                numero: (tds[1].textContent || '').trim(),
                evento: (tds[2].textContent || '').trim()
              };
            }
          }
          if (convite) selecionados.push(convite);
        }
      });

      if (!selecionados.length) {
        selecionados = convitesAluno
          .filter(function (c) { return !c.cancelado; })
          .map(function (c) {
            return { numero: c.numero, evento: c.evento };
          });
      }

      if (!selecionados.length) {
        alert('Não há convites para enviar.');
        return;
      }

      var listaConvites = selecionados
        .map(function (c) { return c.numero + ' - ' + c.evento; })
        .join('\n');

      var msg =
        'Olá ' + nomeAluno + ', tudo bem?\n\n' +
        'Segue(m) seu(s) convite(s) de formatura em PDF:\n\n' +
        listaConvites + '\n\n' +
        'Os arquivos em PDF vão em anexo aqui no WhatsApp. Qualquer dúvida estou à disposição.';

      abrirWhatsDoCampo(telefoneFieldId, msg);
    });
  }

  // ------------- CONTRATOS / DOCUMENTOS ------------------
  function carregarModelosContrato() {
    var select = document.getElementById('modeloContrato');
    if (!select) return;

    var txt = localStorage.getItem(STORAGE_KEYS.modelosContrato);
    if (!txt) return;

    var lista;
    try {
      lista = JSON.parse(txt);
    } catch (e) {
      console.warn('Não consegui ler kgb_modelos_contrato do localStorage.');
      return;
    }
    if (!Array.isArray(lista) || !lista.length) return;

    select.innerHTML = '<option value="">Selecionar modelo...</option>';
    lista.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m.id || m.nome || m.titulo || '';
      opt.textContent = m.nome || m.titulo || ('Modelo ' + (m.id || ''));
      if (m.conteudo) opt.dataset.conteudo = m.conteudo;
      select.appendChild(opt);
    });

    select.addEventListener('dblclick', function () {
      window.open('kgb-formaturas-modelos-convite.html', '_blank');
    });
  }

  carregarModelosContrato();

  function obterAlunoKeyContrato() {
    var params = new URLSearchParams(window.location.search);
    var idUrl = params.get('id');
    if (idUrl) return 'aluno_' + idUrl;
    var nome = (document.getElementById('alunoNome') || {}).value || '';
    return nome ? 'nome_' + nome : 'sem_id';
  }
  var ALUNO_KEY_CONTRATO = obterAlunoKeyContrato();

  function montarContratoComDadosAluno(templateBase) {
    var nomeAluno = (document.getElementById('alunoNome') || {}).value || '';
    var escola = (document.getElementById('alunoEscola') || {}).value || '';
    var ano = (document.getElementById('alunoAnoFormatura') || {}).value || '';
    var serie = (document.getElementById('alunoSerie') || {}).value || '';

    var respNome = (document.getElementById('respNome') || {}).value || '';
    var respCpf = (document.getElementById('respCpf') || {}).value || '';
    var respRg = (document.getElementById('respRg') || {}).value || '';
    var respEnd = (document.getElementById('respEndereco') || {}).value || '';

    var hoje = new Date();
    var dataHoje = hoje.toLocaleDateString('pt-BR');

    var texto = (templateBase && templateBase.trim())
      ? templateBase
      : (
`CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FORMATURA

Contratante (responsável): {RESP_NOME}, CPF {RESP_CPF}, RG {RESP_RG}, residente em {RESP_ENDERECO}.

Aluno(a): {ALUNO_NOME}, Escola: {ESCOLA}, Série/Turma: {SERIE}, Ano de formatura: {ANO}.

[INSIRA AQUI AS CLÁUSULAS DO CONTRATO.]

Data: {DATA_HOJE}.`
        );

    var mapa = {
      '{ALUNO_NOME}': nomeAluno || 'Aluno',
      '{ESCOLA}': escola || '',
      '{ANO}': ano || '',
      '{SERIE}': serie || '',
      '{RESP_NOME}': respNome || '',
      '{RESP_CPF}': respCpf || '',
      '{RESP_RG}': respRg || '',
      '{RESP_ENDERECO}': respEnd || '',
      '{DATA_HOJE}': dataHoje
    };
    Object.keys(mapa).forEach(function (ch) {
      texto = texto.split(ch).join(mapa[ch]);
    });

    return texto;
  }

  var btnGerarContrato = document.getElementById('btnGerarContrato');
  if (btnGerarContrato) {
    btnGerarContrato.addEventListener('click', function () {
      var select = document.getElementById('modeloContrato');
      if (!select) {
        alert('Campo "Modelo de contrato" não encontrado.');
        return;
      }
      if (!select.value) {
        alert('Selecione um modelo de contrato.');
        return;
      }

      var optSel = select.options[select.selectedIndex];
      var conteudoModelo = optSel.dataset.conteudo || '';
      var textoContrato = montarContratoComDadosAluno(conteudoModelo);

      var nomeAluno = (document.getElementById('alunoNome') || {}).value || 'Aluno';
      var storageKey = STORAGE_KEYS.contratoPrefix + ALUNO_KEY_CONTRATO;

      var win = window.open('', '_blank');
      if (!win) {
        alert('Não foi possível abrir a janela do contrato (pop-up bloqueado).');
        return;
      }

      var textoEscapado = textoContrato
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

      var htmlBase = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Contrato - ${nomeAluno}</title>
  <style>
    body{font-family:Arial, sans-serif; padding:20px; line-height:1.5; background:#f8f1e8;}
    h1{font-size:20px; margin-bottom:10px;}
    .barra-acoes{margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #ddd;}
    .barra-acoes button{margin-right:8px; padding:6px 12px;}
    #contratoConteudo{border:1px solid #ccc; padding:12px; min-height:400px; white-space:pre-wrap; background:#fff;}
    small{color:#666;}
  </style>
</head>
<body>
  <h1>Contrato de formatura – ${nomeAluno}</h1>
  <div class="barra-acoes">
    <button id="btnEditarContrato">Editar contrato</button>
    <button id="btnSalvarContrato">Salvar alterações</button>
    <button id="btnPdfContrato">Gerar PDF (imprimir)</button>
    <br><small>Clique em "Editar contrato" para liberar a edição do texto.</small>
  </div>
  <div id="contratoConteudo">${textoEscapado}</div>
</body>
</html>`;

      win.document.open();
      win.document.write(htmlBase);
      win.document.close();
      win.focus();

      win.addEventListener('load', function () {
        var div = win.document.getElementById('contratoConteudo');
        var btnEditar = win.document.getElementById('btnEditarContrato');
        var btnSalvar = win.document.getElementById('btnSalvarContrato');
        var btnPdf = win.document.getElementById('btnPdfContrato');

        if (!div) return;

        try {
          var salvo = localStorage.getItem(storageKey);
          if (salvo) div.innerHTML = salvo;
        } catch (e) {
          console.warn('Não foi possível ler contrato salvo deste aluno.', e);
        }

        div.contentEditable = 'false';

        if (btnEditar) {
          btnEditar.addEventListener('click', function () {
            div.contentEditable = 'true';
            div.focus();
          });
        }

        if (btnSalvar) {
          btnSalvar.addEventListener('click', function () {
            try {
              localStorage.setItem(storageKey, div.innerHTML);
              div.contentEditable = 'false';
              alert('Contrato salvo para este aluno. Ao abrir novamente, ele virá com estas alterações.');
            } catch (e) {
              alert('Não foi possível salvar o contrato (localStorage).');
            }
          });
        }

        if (btnPdf) {
          btnPdf.addEventListener('click', function () {
            var conteudoHtml = div.innerHTML;
            var w2 = win.open('', '_blank');
            if (!w2) {
              alert('Não foi possível abrir a janela de impressão.');
              return;
            }
            w2.document.open();
            w2.document.write(
              '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Contrato PDF</title>' +
              '<style>body{font-family:Arial,sans-serif;padding:20px;line-height:1.5;}</style>' +
              '</head><body>' + conteudoHtml + '</body></html>'
            );
            w2.document.close();
            w2.focus();
            w2.print();
          });
        }
      });
    });
  }

  // ---------------- DOCUMENTOS / UPLOAD ------------------
  function carregarTodosDocumentos() {
    var txt = localStorage.getItem(STORAGE_KEYS.docsAluno);
    if (!txt) return [];
    try {
      var arr = JSON.parse(txt);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function salvarTodosDocumentos(lista) {
    localStorage.setItem(STORAGE_KEYS.docsAluno, JSON.stringify(lista));
  }

  function obterAlunoKeyDocs() {
    var params = new URLSearchParams(window.location.search);
    var idUrl = params.get('id');
    if (idUrl) return 'aluno_' + idUrl;
    var nome = (document.getElementById('alunoNome') || {}).value || '';
    return nome ? 'nome_' + nome : 'sem_id';
  }

  var tbodyDocs = document.getElementById('tbodyDocumentosAluno');

  function renderDocumentosAluno() {
    if (!tbodyDocs) return;
    tbodyDocs.innerHTML = '';

    var todosDocs = carregarTodosDocumentos();
    var alunoKey = obterAlunoKeyDocs();
    var docsDoAluno = todosDocs.filter(function (d) { return d.alunoKey === alunoKey; });

    if (!docsDoAluno.length) {
      tbodyDocs.innerHTML =
        '<tr><td colspan="5">Nenhum documento cadastrado para este aluno.</td></tr>';
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    docsDoAluno.forEach(function (d) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (d.nomeArquivo || 'Documento') + '</td>' +
        '<td>' + (d.tipo || 'Contrato assinado') + '</td>' +
        '<td>' + (d.data || '') + '</td>' +
        '<td>' + (d.observacoes || '') + '</td>' +
        '<td>' +
        '<button class="btn-acao-mini" data-acao="ver" data-id="' + d.id + '"><i data-lucide="eye"></i> Ver</button> ' +
        '<button class="btn-acao-mini" data-acao="baixar" data-id="' + d.id + '"><i data-lucide="download"></i> Baixar</button> ' +
        '<button class="btn-acao-mini" data-acao="excluir" data-id="' + d.id + '"><i data-lucide="trash-2"></i> Excluir</button>' +
        '</td>';
      tbodyDocs.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  var btnUploadContrato = document.getElementById('btnUploadContrato');
  var inputUploadContrato = document.getElementById('inputUploadContrato');

  if (btnUploadContrato && inputUploadContrato) {
    btnUploadContrato.addEventListener('click', function () {
      inputUploadContrato.click();
    });

    inputUploadContrato.addEventListener('change', function (ev) {
      var arquivo = ev.target.files[0];
      if (!arquivo) return;

      var todosDocs = carregarTodosDocumentos();
      var novo = {
        id: 'doc_' + Date.now(),
        alunoKey: obterAlunoKeyDocs(),
        nomeArquivo: arquivo.name,
        tipo: 'Contrato assinado',
        data: new Date().toLocaleDateString('pt-BR'),
        observacoes: 'Enviado pelo upload na tela do aluno'
      };
      todosDocs.push(novo);
      salvarTodosDocumentos(todosDocs);
      renderDocumentosAluno();
      inputUploadContrato.value = '';

      alert('Contrato "' + arquivo.name + '" registrado na lista de documentos.\n(No sistema real o arquivo ficaria salvo no servidor.)');
    });
  }

  if (tbodyDocs) {
    tbodyDocs.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-acao]');
      if (!btn) return;

      var acao = btn.getAttribute('data-acao');
      var id = btn.getAttribute('data-id');
      if (!id) return;

      var todosDocs = carregarTodosDocumentos();
      var doc = todosDocs.find(function (d) { return d.id === id; });
      if (!doc) return;

      if (acao === 'ver') {
        alert('No sistema real, o contrato "' + doc.nomeArquivo + '" seria aberto em uma nova aba.\nAqui é apenas simulação.');
      } else if (acao === 'baixar') {
        alert('No sistema real, o arquivo "' + doc.nomeArquivo + '" seria baixado.\nAqui é apenas simulação.');
      } else if (acao === 'excluir') {
        if (!confirm('Excluir o documento "' + doc.nomeArquivo + '" desta lista?')) return;
        todosDocs = todosDocs.filter(function (d) { return d.id !== id; });
        salvarTodosDocumentos(todosDocs);
        renderDocumentosAluno();
      }
    });
  }

  var btnEnviarContratoWhats = document.getElementById('btnEnviarContratoWhats');
  if (btnEnviarContratoWhats) {
    btnEnviarContratoWhats.addEventListener('click', function () {
      var nomeAluno = (document.getElementById('alunoNome') || {}).value || 'Aluno';
      var msg =
        'Olá ' + nomeAluno + ', tudo bem?\n\n' +
        'Segue o contrato da formatura em anexo aqui pelo WhatsApp. ' +
        'Qualquer dúvida estou à disposição.';
      abrirWhatsDoCampo('respTelefone1', msg);
    });
  }

  // ------------- HISTÓRICO / OBS -------------------------
  var btnSalvarObsHistorico = document.getElementById('btnSalvarObsHistorico');
  if (btnSalvarObsHistorico) {
    btnSalvarObsHistorico.addEventListener('click', function () {
      var txt = document.getElementById('obsEstrategicasAluno').value.trim();
      if (!txt) {
        alert('Digite alguma observação antes de salvar.');
        return;
      }

      var lista = document.getElementById('listaHistoricoAluno');
      if (!lista) return;

      var li = document.createElement('li');
      var agora = new Date();
      var data =
        ('0' + agora.getDate()).slice(-2) + '/' +
        ('0' + (agora.getMonth() + 1)).slice(-2) + '/' +
        agora.getFullYear();
      var hora =
        ('0' + agora.getHours()).slice(-2) + ':' +
        ('0' + agora.getMinutes()).slice(-2);

      li.innerHTML =
        '<small>' + data + ' – ' + hora + '</small>' +
        txt;

      lista.insertBefore(li, lista.firstChild);
      document.getElementById('obsEstrategicasAluno').value = '';

      salvarAlunoNoStorage();
      alert('Observação salva (localStorage – linha do tempo visual).');
    });
  }

// ----------------- INICIALIZAÇÃO -----------------------

// Preenche combo de escolas
popularSelectEscolas();

// Renderiza abas com o estado atual dos arrays (eventosAluno, parcelasAluno, etc.)
renderEventosAluno();
renderFinanceiroAluno();
renderConvitesAluno();
renderDocumentosAluno();

// Carrega dados do aluno
inicializarAlunoAtual();
popularSelectTiposEventoAluno();
atualizarSelectFinReferencia();

if (window.lucide) window.lucide.createIcons();
});
