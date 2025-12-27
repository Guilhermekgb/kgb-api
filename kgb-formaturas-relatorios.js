document.addEventListener('DOMContentLoaded', function () {
  if (window.lucide) window.lucide.createIcons();

  // -------- MENU MOBILE --------
  var menu = document.getElementById('menuLateral');
  var btn = document.getElementById('hamburguer');
  var backdrop = document.getElementById('menuBackdrop');

  if (btn && menu && backdrop) {
    function toggleMenu() {
      var aberto = menu.classList.toggle('aberto');
      backdrop.hidden = !aberto;
    }
    btn.addEventListener('click', toggleMenu);
    backdrop.addEventListener('click', toggleMenu);
  }

  // -------- DADOS REAIS (sem mock) --------
  // Estrutura base que será preenchida a partir do backend ou localStorage.
  var dadosBase = {
    eventos: [],   // [{ id, nome, tipo, dataBr, ano, mes, escolasQtd, alunosQtd, total, recebido, aberto, escolas:[] }, ...]
    escolas: [],   // [{ nome, ano, alunosContrato, faturamento, recebido, aberto, inadimplentes }, ...]
    alunos: [],    // [{ nome, escola, ano, eventos:[], total, pago, aberto, situacao }, ...]
    periodos: [],  // [{ ano, mes, rotulo, eventos, faturamento, recebido, aberto }, ...]
    projecao: []   // [{ ano, mes, rotulo, valorPrevisto, parcelas, principalEvento }, ...]
  };

  function mesclarArraySeValido(origem, chave) {
    if (!origem || !Array.isArray(origem[chave])) return;
    dadosBase[chave] = origem[chave].slice();
  }

  function carregarDadosBase() {
    try {
      // 1) Se o backend injetar um objeto global com os dados de relatórios
      if (window.kgbRelatoriosBase && typeof window.kgbRelatoriosBase === 'object') {
        mesclarArraySeValido(window.kgbRelatoriosBase, 'eventos');
        mesclarArraySeValido(window.kgbRelatoriosBase, 'escolas');
        mesclarArraySeValido(window.kgbRelatoriosBase, 'alunos');
        mesclarArraySeValido(window.kgbRelatoriosBase, 'periodos');
        mesclarArraySeValido(window.kgbRelatoriosBase, 'projecao');
      }

      // 2) Opcional: ler um resumo salvo no localStorage (se você quiser usar isso no futuro)
      var salvo = localStorage.getItem('kgb_relatorios_base');
      if (salvo) {
        var parsed = JSON.parse(salvo);
        if (parsed && typeof parsed === 'object') {
          mesclarArraySeValido(parsed, 'eventos');
          mesclarArraySeValido(parsed, 'escolas');
          mesclarArraySeValido(parsed, 'alunos');
          mesclarArraySeValido(parsed, 'periodos');
          mesclarArraySeValido(parsed, 'projecao');
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar dados reais para relatórios:', e);
    }
  }

  // -------- POPULAR FILTROS COM DADOS REAIS --------

  function popularFiltrosGerais() {
    var selAno = document.getElementById('filtroAnoRel');
    var selEscola = document.getElementById('filtroEscolaRel');

    // Anos a partir dos dados (eventos, escolas, alunos, períodos, projeções)
    if (selAno) {
      var anosSet = new Set();

      dadosBase.eventos.forEach(function (e) { if (e.ano) anosSet.add(e.ano); });
      dadosBase.escolas.forEach(function (e) { if (e.ano) anosSet.add(e.ano); });
      dadosBase.alunos.forEach(function (a) { if (a.ano) anosSet.add(a.ano); });
      dadosBase.periodos.forEach(function (p) { if (p.ano) anosSet.add(p.ano); });
      dadosBase.projecao.forEach(function (p) { if (p.ano) anosSet.add(p.ano); });

   var anos = Array.from(anosSet).filter(Boolean).sort();

selAno.innerHTML = '';

if (!anos.length) {
  // Sem dados de anos ainda: mostra uma opção neutra
  var opt = document.createElement('option');
  opt.value = '';
  opt.textContent = 'Sem anos cadastrados';
  selAno.appendChild(opt);
  return;
}

anos.forEach(function (ano, idx) {
  var opt = document.createElement('option');
  opt.value = String(ano);
  opt.textContent = String(ano);
  if (idx === 0) opt.selected = true;
  selAno.appendChild(opt);
});

    }

    // Escolas distintas vindas dos dados (eventos/escolas/alunos)
    if (selEscola) {
      var escolasSet = new Set();

      dadosBase.eventos.forEach(function (ev) {
        (ev.escolas || []).forEach(function (nome) {
          if (nome) escolasSet.add(nome);
        });
      });
      dadosBase.escolas.forEach(function (e) {
        if (e.nome) escolasSet.add(e.nome);
      });
      dadosBase.alunos.forEach(function (a) {
        if (a.escola) escolasSet.add(a.escola);
      });

      selEscola.innerHTML = '';
      var optTodas = document.createElement('option');
      optTodas.value = '';
      optTodas.textContent = 'Todas';
      selEscola.appendChild(optTodas);

      Array.from(escolasSet).filter(Boolean).sort().forEach(function (nome) {
        var opt = document.createElement('option');
        opt.value = nome;
        opt.textContent = nome;
        selEscola.appendChild(opt);
      });
    }
  }

  function popularFiltroTipoEvento() {
    var sel = document.getElementById('filtroTipoEventoRelEvento');
    if (!sel) return;

    sel.innerHTML = '';
    var optTodos = document.createElement('option');
    optTodos.value = '';
    optTodos.textContent = 'Todos';
    sel.appendChild(optTodos);

    // Aproveita os tipos cadastrados na tela "Tipos de Evento"
    try {
      var tiposRaw = localStorage.getItem('kgb_formaturas_tiposEvento');
      if (!tiposRaw) return;
      var arr = JSON.parse(tiposRaw);
      if (!Array.isArray(arr)) return;

      var nomesSet = new Set();
      arr.forEach(function (t) {
        if (t && t.nome) nomesSet.add(t.nome);
      });

      Array.from(nomesSet).sort().forEach(function (nome) {
        var op = document.createElement('option');
        op.value = nome;
        op.textContent = nome;
        sel.appendChild(op);
      });
    } catch (e) {
      console.warn('Erro ao carregar tipos de evento para filtro de relatórios:', e);
    }
  }

  // -------- ESTADO --------
  var estado = { tipoAtual: 'por-evento' };

  // -------- FUNÇÕES AUXILIARES --------
  function lerFiltrosGerais() {
    var ano = Number(document.getElementById('filtroAnoRel').value || 0);
    var periodo = document.getElementById('filtroPeriodoRel').value || 'ano';
    var escola = document.getElementById('filtroEscolaRel').value || '';
    return { ano: ano, periodo: periodo, escola: escola };
  }

  function filtroPorPeriodo(mes, periodo) {
    if (!periodo || periodo === 'ano') return true;
    if (periodo === 'tri1') return mes >= 1 && mes <= 3;
    if (periodo === 'tri2') return mes >= 4 && mes <= 6;
    if (periodo === 'tri3') return mes >= 7 && mes <= 9;
    if (periodo === 'tri4') return mes >= 10 && mes <= 12;
    return true;
  }

  function formatarMoeda(v) {
    var num = Number(v || 0);
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function limparTabela(secaoId) {
    var sec = document.getElementById(secaoId);
    var tbody = sec.querySelector('tbody');
    tbody.innerHTML = '';
    return { sec: sec, tbody: tbody };
  }

  // -------- RELATÓRIOS (agora usando apenas dados reais em dadosBase) --------
  function gerarRelPorEvento() {
    var filtros = lerFiltrosGerais();
    var ano = filtros.ano;
    var periodo = filtros.periodo;
    var escola = filtros.escola;
    var tipoSel = document.getElementById('filtroTipoEventoRelEvento').value || '';

    var lista = dadosBase.eventos.slice();
    if (ano) lista = lista.filter(function (e) { return e.ano === ano; });
    if (periodo !== 'ano') lista = lista.filter(function (e) { return filtroPorPeriodo(e.mes, periodo); });
    if (escola) lista = lista.filter(function (e) { return Array.isArray(e.escolas) && e.escolas.indexOf(escola) !== -1; });
    if (tipoSel) lista = lista.filter(function (e) { return e.tipo === tipoSel; });

    var obj = limparTabela('rel-por-evento');
    var sec = obj.sec;
    var tbody = obj.tbody;

    var tv = 0, tr = 0, ta = 0;

    lista.forEach(function (ev) {
      tv += Number(ev.total || 0);
      tr += Number(ev.recebido || 0);
      ta += Number(ev.aberto || 0);

      var trEl = document.createElement('tr');

      var tdNome = document.createElement('td');
      tdNome.textContent = ev.nome || '';

      var tdTipo = document.createElement('td');
      var chip = document.createElement('span');
      chip.className = 'tag-evento';
      chip.textContent = ev.tipo || '';
      tdTipo.appendChild(chip);

      var tdData = document.createElement('td');
      tdData.textContent = ev.dataBr || '';

      var tdEsc = document.createElement('td');
      tdEsc.textContent = ev.escolasQtd != null ? ev.escolasQtd : (ev.escolas ? ev.escolas.length : '');

      var tdAlu = document.createElement('td');
      tdAlu.textContent = ev.alunosQtd != null ? ev.alunosQtd : '';

      var tdTot = document.createElement('td');
      tdTot.textContent = formatarMoeda(ev.total);

      var tdRec = document.createElement('td');
      tdRec.textContent = formatarMoeda(ev.recebido);

      var tdAb = document.createElement('td');
      tdAb.textContent = formatarMoeda(ev.aberto);

      trEl.appendChild(tdNome);
      trEl.appendChild(tdTipo);
      trEl.appendChild(tdData);
      trEl.appendChild(tdEsc);
      trEl.appendChild(tdAlu);
      trEl.appendChild(tdTot);
      trEl.appendChild(tdRec);
      trEl.appendChild(tdAb);

      tbody.appendChild(trEl);
    });

    var resumos = sec.querySelectorAll('.resumos-linha .card-resumo');
    if (resumos[0]) resumos[0].innerHTML = '<strong>Total vendido (eventos filtrados)</strong> ' + formatarMoeda(tv);
    if (resumos[1]) resumos[1].innerHTML = '<strong>Total recebido</strong> ' + formatarMoeda(tr);
    if (resumos[2]) resumos[2].innerHTML = '<strong>Em aberto / atrasado</strong> ' + formatarMoeda(ta);

    var rodape = sec.querySelector('.rodape-tabela span');
    if (rodape) rodape.textContent = 'Exibindo ' + lista.length + ' evento(s).';

    return lista;
  }

  function gerarRelPorEscola() {
    var filtros = lerFiltrosGerais();
    var ano = filtros.ano;
    var escolaFiltro = filtros.escola;

    var lista = dadosBase.escolas.slice();
    if (ano) lista = lista.filter(function (e) { return e.ano === ano; });
    if (escolaFiltro) lista = lista.filter(function (e) { return e.nome === escolaFiltro; });

    var obj = limparTabela('rel-por-escola');
    var sec = obj.sec;
    var tbody = obj.tbody;

    var totalAlunos = 0, totalFat = 0, totalInad = 0;

    lista.forEach(function (e) {
      totalAlunos += Number(e.alunosContrato || 0);
      totalFat += Number(e.faturamento || 0);
      totalInad += Number(e.inadimplentes || 0);

      var trEl = document.createElement('tr');

      var tdNome = document.createElement('td');
      tdNome.textContent = e.nome || '';

      var tdAlu = document.createElement('td');
      tdAlu.textContent = e.alunosContrato || 0;

      var tdFat = document.createElement('td');
      tdFat.textContent = formatarMoeda(e.faturamento);

      var tdRec = document.createElement('td');
      tdRec.textContent = formatarMoeda(e.recebido);

      var tdAb = document.createElement('td');
      tdAb.textContent = formatarMoeda(e.aberto);

      var tdInad = document.createElement('td');
      tdInad.textContent = e.inadimplentes || 0;

      trEl.appendChild(tdNome);
      trEl.appendChild(tdAlu);
      trEl.appendChild(tdFat);
      trEl.appendChild(tdRec);
      trEl.appendChild(tdAb);
      trEl.appendChild(tdInad);

      tbody.appendChild(trEl);
    });

    var resumos = sec.querySelectorAll('.resumos-linha .card-resumo');
    if (resumos[0]) resumos[0].innerHTML = '<strong>Alunos com contrato</strong> ' + totalAlunos;
    if (resumos[1]) resumos[1].innerHTML = '<strong>Faturamento total</strong> ' + formatarMoeda(totalFat);
    if (resumos[2]) resumos[2].innerHTML = '<strong>Inadimplentes</strong> ' + totalInad + ' alunos';

    var rodape = sec.querySelector('.rodape-tabela span');
    if (rodape) rodape.textContent = 'Exibindo ' + lista.length + ' escola(s).';

    return lista;
  }

  function classeStatus(s) {
    if (s === 'Quitado') return 'status-ok';
    if (s === 'Inadimplente') return 'status-inadimplente';
    return 'status-pendente';
  }
  function iconStatus(s) {
    if (s === 'Quitado') return 'check-circle-2';
    if (s === 'Inadimplente') return 'x-circle';
    return 'clock-3';
  }

  function gerarRelPorAluno() {
    var filtros = lerFiltrosGerais();
    var ano = filtros.ano;
    var escola = filtros.escola;
    var sit = document.getElementById('filtroSituacaoAluno').value || '';

    var lista = dadosBase.alunos.slice();
    if (ano) lista = lista.filter(function (a) { return a.ano === ano; });
    if (escola) lista = lista.filter(function (a) { return a.escola === escola; });
    if (sit) lista = lista.filter(function (a) { return a.situacao === sit; });

    var obj = limparTabela('rel-por-aluno');
    var sec = obj.sec;
    var tbody = obj.tbody;

    lista.forEach(function (a) {
      var trEl = document.createElement('tr');

      var tdNome = document.createElement('td');
      tdNome.textContent = a.nome || '';

      var tdEsc = document.createElement('td');
      tdEsc.textContent = (a.escola || '') + (a.ano ? ' – ' + a.ano : '');

      var tdEventos = document.createElement('td');
      (a.eventos || []).forEach(function (ev) {
        var span = document.createElement('span');
        span.className = 'tag-evento';
        span.textContent = ev;
        tdEventos.appendChild(span);
      });

      var tdTot = document.createElement('td');
      tdTot.textContent = formatarMoeda(a.total);

      var tdPago = document.createElement('td');
      tdPago.textContent = formatarMoeda(a.pago);

      var tdAb = document.createElement('td');
      tdAb.textContent = formatarMoeda(a.aberto);

      var tdSit = document.createElement('td');
      var tag = document.createElement('span');
      tag.className = 'status-financeiro ' + classeStatus(a.situacao);
      var icon = document.createElement('i');
      icon.setAttribute('data-lucide', iconStatus(a.situacao));
      tag.appendChild(icon);
      tag.appendChild(document.createTextNode(' ' + (a.situacao || '')));
      tdSit.appendChild(tag);

      trEl.appendChild(tdNome);
      trEl.appendChild(tdEsc);
      trEl.appendChild(tdEventos);
      trEl.appendChild(tdTot);
      trEl.appendChild(tdPago);
      trEl.appendChild(tdAb);
      trEl.appendChild(tdSit);

      tbody.appendChild(trEl);
    });

    var rodape = sec.querySelector('.rodape-tabela span');
    if (rodape) rodape.textContent = 'Exibindo ' + lista.length + ' aluno(s).';

    if (window.lucide) window.lucide.createIcons();
    return lista;
  }

  function gerarRelPorPeriodo() {
    var filtros = lerFiltrosGerais();
    var ano = filtros.ano;
    var periodo = filtros.periodo;

    var lista = dadosBase.periodos.slice();
    if (ano) lista = lista.filter(function (p) { return p.ano === ano; });
    if (periodo !== 'ano') lista = lista.filter(function (p) { return filtroPorPeriodo(p.mes, periodo); });

    var obj = limparTabela('rel-por-periodo');
    var sec = obj.sec;
    var tbody = obj.tbody;

    lista.forEach(function (p) {
      var trEl = document.createElement('tr');

      var tdMes = document.createElement('td');
      tdMes.textContent = p.rotulo || '';

      var tdEvt = document.createElement('td');
      tdEvt.textContent = p.eventos || 0;

      var tdFat = document.createElement('td');
      tdFat.textContent = formatarMoeda(p.faturamento);

      var tdRec = document.createElement('td');
      tdRec.textContent = formatarMoeda(p.recebido);

      var tdAb = document.createElement('td');
      tdAb.textContent = formatarMoeda(p.aberto);

      trEl.appendChild(tdMes);
      trEl.appendChild(tdEvt);
      trEl.appendChild(tdFat);
      trEl.appendChild(tdRec);
      trEl.appendChild(tdAb);

      tbody.appendChild(trEl);
    });

    var rodape = sec.querySelector('.rodape-tabela span');
    if (rodape) rodape.textContent = 'Exibindo ' + lista.length + ' mês(es).';

    return lista;
  }

  function gerarRelProjecao() {
    var filtros = lerFiltrosGerais();
    var ano = filtros.ano;
    var meses = Number(document.getElementById('filtroMesesProjecao').value || 6);

    var lista = dadosBase.projecao.slice();
    if (ano) lista = lista.filter(function (p) { return p.ano === ano; });

    // "Meses à frente": se quiser limitar a quantidade de linhas
    if (meses > 0 && lista.length > meses) {
      lista = lista.slice(0, meses);
    }

    var obj = limparTabela('rel-projecao');
    var sec = obj.sec;
    var tbody = obj.tbody;

    var total = 0;
    var maior = null;

    lista.forEach(function (p) {
      total += Number(p.valorPrevisto || 0);
      if (!maior || Number(p.valorPrevisto || 0) > Number(maior.valorPrevisto || 0)) maior = p;

      var trEl = document.createElement('tr');

      var tdMes = document.createElement('td');
      tdMes.textContent = p.rotulo || '';

      var tdVal = document.createElement('td');
      tdVal.textContent = formatarMoeda(p.valorPrevisto);

      var tdParc = document.createElement('td');
      tdParc.textContent = p.parcelas || 0;

      var tdEv = document.createElement('td');
      tdEv.textContent = p.principalEvento || '';

      trEl.appendChild(tdMes);
      trEl.appendChild(tdVal);
      trEl.appendChild(tdParc);
      trEl.appendChild(tdEv);

      tbody.appendChild(trEl);
    });

    var resumos = sec.querySelectorAll('.resumos-linha .card-resumo');
    if (resumos[0]) resumos[0].innerHTML = '<strong>Projeção total</strong> ' + formatarMoeda(total);
    if (resumos[1]) {
      if (maior) {
        resumos[1].innerHTML =
          '<strong>Mês com maior recebimento previsto</strong> ' +
          (maior.rotulo || '') + ' – ' + formatarMoeda(maior.valorPrevisto);
      } else {
        resumos[1].innerHTML =
          '<strong>Mês com maior recebimento previsto</strong> -';
      }
    }

    var rodape = sec.querySelector('.rodape-tabela span');
    if (rodape) rodape.textContent = 'Exibindo ' + lista.length + ' mês(es).';

    return lista;
  }

  function gerarRelatorio(tipo) {
    estado.tipoAtual = tipo;
    if (tipo === 'por-evento') return gerarRelPorEvento();
    if (tipo === 'por-escola') return gerarRelPorEscola();
    if (tipo === 'por-aluno') return gerarRelPorAluno();
    if (tipo === 'por-periodo') return gerarRelPorPeriodo();
    if (tipo === 'projecao') return gerarRelProjecao();
    return [];
  }
  function gerarRelatorioAtual() {
    return gerarRelatorio(estado.tipoAtual);
  }

  // -------- EXPORTAÇÃO --------
  function gerarCSV(headers, linhas) {
    var sep = ';';
    var linhasCSV = [];
    linhasCSV.push(headers.join(sep));
    linhas.forEach(function (l) {
      var linha = headers.map(function (h) {
        var v = l[h] != null ? l[h] : '';
        var texto = String(v).replace(/"/g, '""');
        return '"' + texto + '"';
      }).join(sep);
      linhasCSV.push(linha);
    });
    return linhasCSV.join('\n');
  }

  function downloadArquivo(nome, conteudo, mime) {
    var blob = new Blob([conteudo], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportarRelatorio(tipo) {
    var escolha = window.prompt('Digite "E" para Excel (planilha) ou "P" para PDF:', 'E');
    if (!escolha) return;
    var formato = escolha.trim().toUpperCase();

    var base = gerarRelatorio(tipo);
    var headers = [];
    var linhas = [];

    if (tipo === 'por-evento') {
      headers = ['Evento', 'Tipo', 'Data', 'Escolas', 'Alunos', 'Total vendido', 'Recebido', 'Em aberto'];
      linhas = base.map(function (ev) {
        return {
          'Evento': ev.nome || '',
          'Tipo': ev.tipo || '',
          'Data': ev.dataBr || '',
          'Escolas': ev.escolasQtd != null ? ev.escolasQtd : (ev.escolas ? ev.escolas.length : ''),
          'Alunos': ev.alunosQtd != null ? ev.alunosQtd : '',
          'Total vendido': formatarMoeda(ev.total),
          'Recebido': formatarMoeda(ev.recebido),
          'Em aberto': formatarMoeda(ev.aberto)
        };
      });
    } else if (tipo === 'por-escola') {
      headers = ['Escola', 'Alunos com contrato', 'Faturamento', 'Recebido', 'Em aberto', 'Inadimplentes'];
      linhas = base.map(function (e) {
        return {
          'Escola': e.nome || '',
          'Alunos com contrato': e.alunosContrato || 0,
          'Faturamento': formatarMoeda(e.faturamento),
          'Recebido': formatarMoeda(e.recebido),
          'Em aberto': formatarMoeda(e.aberto),
          'Inadimplentes': e.inadimplentes || 0
        };
      });
    } else if (tipo === 'por-aluno') {
      headers = ['Aluno', 'Escola/Ano', 'Eventos', 'Total', 'Pago', 'Em aberto', 'Situação'];
      linhas = base.map(function (a) {
        return {
          'Aluno': a.nome || '',
          'Escola/Ano': (a.escola || '') + (a.ano ? ' – ' + a.ano : ''),
          'Eventos': (a.eventos || []).join(', '),
          'Total': formatarMoeda(a.total),
          'Pago': formatarMoeda(a.pago),
          'Em aberto': formatarMoeda(a.aberto),
          'Situação': a.situacao || ''
        };
      });
    } else if (tipo === 'por-periodo') {
      headers = ['Mês', 'Eventos', 'Faturamento', 'Recebido', 'Em aberto'];
      linhas = base.map(function (p) {
        return {
          'Mês': p.rotulo || '',
          'Eventos': p.eventos || 0,
          'Faturamento': formatarMoeda(p.faturamento),
          'Recebido': formatarMoeda(p.recebido),
          'Em aberto': formatarMoeda(p.aberto)
        };
      });
    } else if (tipo === 'projecao') {
      headers = ['Mês', 'Valor previsto', 'Qtd. parcelas', 'Principal tipo de evento'];
      linhas = base.map(function (p) {
        return {
          'Mês': p.rotulo || '',
          'Valor previsto': formatarMoeda(p.valorPrevisto),
          'Qtd. parcelas': p.parcelas || 0,
          'Principal tipo de evento': p.principalEvento || ''
        };
      });
    }

    if (formato === 'E') {
      var csv = gerarCSV(headers, linhas);
      downloadArquivo('relatorio-' + tipo + '.csv', csv, 'text/csv;charset=utf-8;');
      return;
    }

    if (formato === 'P') {
      // Usa a tabela já renderizada na tela
      var sec = document.getElementById('rel-' + tipo);
      if (!sec) return;
      var tabela = sec.querySelector('table').outerHTML;
      var html =
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório ' +
        tipo +
        '</title><style>body{font-family:Arial,sans-serif;padding:20px;}table{border-collapse:collapse;width:100%;font-size:12px;}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}th{background:#eee;}h1{font-size:18px;margin-bottom:10px;}</style></head><body><h1>Relatório ' +
        tipo +
        '</h1>' +
        tabela +
        '</body></html>';

      var win = window.open('', '_blank');
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
        win.focus();
        win.print();
      }
    }
  }

  // -------- LISTENERS (CLICKS) --------
  var btnsRel = document.querySelectorAll('.btn-relatorio');
  var blocosRel = document.querySelectorAll('.relatorio-conteudo');

  btnsRel.forEach(function (botao) {
    botao.addEventListener('click', function () {
      var alvo = botao.getAttribute('data-rel');
      if (!alvo) return;

      btnsRel.forEach(function (b) { b.classList.remove('ativo'); });
      blocosRel.forEach(function (sec) { sec.classList.remove('ativo'); });

      botao.classList.add('ativo');
      var bloco = document.getElementById('rel-' + alvo);
      if (bloco) bloco.classList.add('ativo');

      gerarRelatorio(alvo);
      if (window.lucide) window.lucide.createIcons();
    });
  });

  var btnAplicar = document.getElementById('btnAplicarFiltrosRel');
  if (btnAplicar) {
    btnAplicar.addEventListener('click', function () {
      gerarRelatorioAtual();
      if (window.lucide) window.lucide.createIcons();
    });
  }

  document.querySelectorAll('.btnGerarRel').forEach(function (botao) {
    botao.addEventListener('click', function () {
      var rel = botao.getAttribute('data-rel') || '';
      gerarRelatorio(rel);
      if (window.lucide) window.lucide.createIcons();
    });
  });

  document.querySelectorAll('.btnExportarRel').forEach(function (botao) {
    botao.addEventListener('click', function () {
      var rel = botao.getAttribute('data-rel') || '';
      exportarRelatorio(rel);
    });
  });

  // -------- INICIALIZAÇÃO --------
  carregarDadosBase();
  popularFiltrosGerais();
  popularFiltroTipoEvento();

  // Gera o primeiro relatório ao abrir (por evento) – se não tiver dados, aparecerá tudo zerado/sem linhas
  gerarRelatorio('por-evento');
  if (window.lucide) window.lucide.createIcons();
});
