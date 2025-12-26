(function () {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // referências iniciais (ok se vierem null — funções fazem lazy lookup)
  const btnMarcarTodas = $('#btnMarcarTodas');

  // ==== helpers de storage / ping ====
  const NOTIFS_KEY = (typeof window.NOTIFS_KEY !== 'undefined' ? window.NOTIFS_KEY : 'notificacoes');
  function pingNotifs(){
    try {
      // ping “nativo” desta tela
      localStorage.setItem(NOTIFS_KEY + ':ping', String(Date.now()));
      // ping de compatibilidade com o dashboard (sino)
      localStorage.setItem('notif:ping', String(Date.now()));
    } catch {}
  }

  // Quem está logado? (para filtrar internas)
  function getUsuarioLogado(){
    try { return JSON.parse(localStorage.getItem('usuarioLogado') || '{}'); }
    catch { return {}; }
  }
  function isAdmin(u){
    return String(u?.perfil || '').toLowerCase().includes('admin');
  }
  function isMinha(n){
    const u = getUsuarioLogado();
    if (isAdmin(u)) return true;
    const meu  = String(u?.email || u?.nome || '').toLowerCase();
    const dest = String(n?.destinatario || n?.assignedTo || n?.responsavel || '').toLowerCase();
    if (!dest) return false;
    return dest === meu;
  }

  // localStorage helpers
  function getArr(key) {
    try {
      const raw = localStorage.getItem(key);
      const v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  }
  function setArr(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr || []));
      if (key === NOTIFS_KEY) pingNotifs();
    } catch {}
  }

  // Carrega usuários (para o select "responsável")
  function getUsuarios() {
    const us = getArr('usuarios');
    if (!us.length) {
      return [{ id: 'adm', nome: 'Administrativo', email: 'adm@local' }];
    }
    return us;
  }

  // Cartão de notificação
  function cardNotif(n, tipo) {
    const dt = new Date(n?.data || n?.ts || Date.now());
    const quando = (typeof n?.data === 'string' && n.data) ? n.data : (!isNaN(dt) ? dt.toLocaleString('pt-BR') : '');
    const titulo = n?.titulo || (tipo === 'externa' ? 'Lead do formulário' : 'Notificação interna');
    const desc   = n?.descricao || n?.mensagem || '';
    const leadId = n?.leadId ? String(n.leadId) : null;

    const status = n?.lido ? 'LIDA' : 'NÃO LIDA';
    const badge  = `<span class="badge ${n?.lido ? 'badge--read' : 'badge--unread'}">${status}</span>`;

    const box = document.createElement('article');
    box.className = `notif-card ${n?.lido ? '' : 'notif-card--unread'}`;

    let botoes = '';
    if (tipo === 'externa') {
      botoes = `
        <button class="btn jsAtender" data-id="${n.id}" ${leadId ? `data-lead="${leadId}"` : ''}>Atender</button>
        <button class="btn btn-ghost jsMarcarLida" data-id="${n.id}">Marcar lida</button>`;
    } else {
      botoes = `
        ${leadId ? `<button class="btn jsVisualizar" data-id="${n.id}" data-lead="${leadId}">Visualizar</button>` : ''}
        ${leadId ? `<button class="btn jsCriarOrcamento" data-id="${n.id}" data-lead="${leadId}">Criar orçamento</button>` : ''}
        <button class="btn btn-ghost jsMarcarLida" data-id="${n.id}">Marcar lida</button>`;
    }

    box.innerHTML = `
      <header class="notif-card__header">
        <div class="notif-card__title">
          <strong>${titulo}</strong>
          <span class="chip">${tipo}</span>
        </div>
        <div class="notif-card__meta">
          <span class="notif-card__date">${quando}</span>
          ${badge}
        </div>
      </header>

      ${desc ? `<div class="notif-card__body">${desc}</div>` : ''}

      <footer class="notif-card__footer">
        ${botoes}
      </footer>
    `;
    return box;
  }

  // Ordenação: não lidas primeiro; depois mais recentes
  function toTS(n) {
    if (typeof n?.ts === 'number') return n.ts;
    if (n?.ts && !Number.isNaN(Number(n.ts))) return Number(n.ts);

    if (typeof n?.data === 'string') {
      const m = n.data.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      if (m) {
        const [, d, mo, y, h = '0', mi = '0', se = '0'] = m;
        const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
        if (!isNaN(dt)) return dt.getTime();
      }
    }

    const idNum = Number(n?.id);
    if (!Number.isNaN(idNum)) return idNum;
    return 0;
  }
  function unreadFirstThenNewest(a, b) {
    const aRead = !!a?.lido;
    const bRead = !!b?.lido;
    if (aRead !== bRead) return aRead ? 1 : -1;
    return toTS(b) - toTS(a);
  }

  // Render
  function render() {
    const elExt = document.getElementById('lista-notificacoes-externas');
    const elInt = document.getElementById('lista-notificacoes-internas'); // pode ser null, e tudo bem

    if (!elExt && !elInt) return; // se não tiver nenhuma lista, não faz nada

    const notifs = getArr(NOTIFS_KEY);

    // externas (por tipo/origem)
    const externas = notifs
      .filter(n => {
        const t = String(n?.tipo || '').toLowerCase();
        const o = String(n?.origem || '').toLowerCase();
        return t.includes('extern') || o.includes('extern');
      })
      .sort(unreadFirstThenNewest);

    // internas (só as minhas, a menos que admin) — só calcula se existir contêiner
    let internas = [];
    if (elInt) {
      internas = notifs
        .filter(n => {
          const t = String(n?.tipo || '').toLowerCase();
          const o = String(n?.origem || '').toLowerCase();
          return t.includes('intern') || o.includes('intern');
        })
        .filter(n => isMinha(n))
        .sort(unreadFirstThenNewest);
    }

    // contadores
    const cExt = externas.filter(n => !n.lido).length;
    const cInt = internas.filter(n => !n.lido).length;
    const $countExt = document.getElementById('countExt');
    const $countInt = document.getElementById('countInt');
    if ($countExt) $countExt.textContent = `${cExt} não lida${cExt === 1 ? '' : 's'}`;
    if ($countInt) $countInt.textContent = `${cInt} não lida${cInt === 1 ? '' : 's'}`;

    // render externas
    if (elExt) {
      elExt.innerHTML = externas.length ? '' : '<div class="box">Sem notificações externas 🎉</div>';
      externas.forEach(n => elExt.appendChild(cardNotif(n, 'externa')));
    }

    // render internas (só se existir a área — na sua tela, ela está escondida por CSS)
    if (elInt) {
      elInt.innerHTML = internas.length ? '' : '<div class="box">Sem notificações internas 🎉</div>';
      internas.forEach(n => elInt.appendChild(cardNotif(n, 'interna')));
    }

    // ligações — externas
    if (elExt) {
      $$('.jsAtender', elExt).forEach(btn => {
        btn.addEventListener('click', () => {
          const notifId = btn.dataset.id || '';
          const leadId  = btn.dataset.lead || '';
          abrirModalAtender(notifId, leadId);
        });
      });
    }

    // ligações — internas (se a lista existir)
    if (elInt) {
      $$('.jsVisualizar', elInt).forEach(btn => {
        btn.addEventListener('click', () => {
          const notifId = btn.dataset.id || '';
          const leadId  = btn.dataset.lead || '';
          abrirModalVisualizar(leadId, notifId);
        });
      });

      $$('.jsCriarOrcamento', elInt).forEach(btn => {
        btn.addEventListener('click', () => {
          const leadId  = btn.dataset.lead;
          const notifId = btn.dataset.id;
          if (notifId) marcarLida(notifId);
          if (leadId) window.location.href = `orcamento.html?leadId=${encodeURIComponent(leadId)}&src=interno`;
        });
      });
    }

    // marcar lida (ambas)
    const marcarBtns = [
      ...$$('.jsMarcarLida', elExt || document.createElement('div')),
      ...$$('.jsMarcarLida', elInt || document.createElement('div'))
    ];
    marcarBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const notifId = btn.dataset.id;
        if (notifId) marcarLida(notifId);
      });
    });

    window.lucide?.createIcons?.();
  }

  // Visualizar
  function abrirModalVisualizar(leadId, notifId) {
    const modalViz   = $('#modalVisualizar');
    const vizResumo  = $('#vizResumo');
    const vizCriarOrc= $('#vizCriarOrc');
    if (!modalViz || !vizResumo || !vizCriarOrc) return;

    if (notifId) {
      const arr = getArr(NOTIFS_KEY);
      const ix  = arr.findIndex(n => String(n.id) === String(notifId));
      if (ix > -1 && !arr[ix].lido) {
        arr[ix].lido = true;
        setArr(NOTIFS_KEY, arr);
        render();
      }
    }

    vizResumo.innerHTML = renderResumoLead(leadId);
    modalViz.hidden = false;
    document.body.style.overflow = 'hidden';
    window.lucide?.createIcons?.();

    vizCriarOrc.onclick = () => {
      if (!leadId) return;
      window.location.href = `orcamento.html?leadId=${encodeURIComponent(leadId)}`;
    };
  }
  function fecharModalVisualizar(){
    const modalViz = $('#modalVisualizar');
    if (!modalViz) return;
    modalViz.hidden = true;
    document.body.style.overflow = '';
  }
  // listeners de fechar visualizar
  document.addEventListener('click', (e) => {
    const modalViz = $('#modalVisualizar');
    if (!modalViz || modalViz.hidden) return;
    const closeBtn = e.target.closest?.('[data-close]');
    if (closeBtn || e.target.classList?.contains('modal__backdrop')) fecharModalVisualizar();
  });
  document.addEventListener('keydown', (e) => {
    const modalViz = $('#modalVisualizar');
    if (e.key === 'Escape' && modalViz && !modalViz.hidden) fecharModalVisualizar();
  });

  // Marcar lida(s)
  function marcarLida(id) {
    const arr = getArr(NOTIFS_KEY);
    const ix = arr.findIndex(n => String(n.id) === String(id));
    if (ix > -1) {
      arr[ix].lido = true;
      setArr(NOTIFS_KEY, arr);
      render();
    }
  }
  btnMarcarTodas?.addEventListener('click', () => {
    const arr = getArr(NOTIFS_KEY);
    arr.forEach(n => n.lido = true);
    setArr(NOTIFS_KEY, arr);
    render();
  });

  // Atender (externa)
  function abrirModalAtender(notifId, leadId) {
    const modal = $('#modalAtender');
    const formAtender = $('#formAtender');
    const resumoLead = $('#resumoLead');
    if (!formAtender || !modal) return;

    // marca como lida ao abrir
    const arr = getArr(NOTIFS_KEY);
    const ix  = arr.findIndex(n => String(n.id) === String(notifId));
    if (ix > -1 && !arr[ix].lido) {
      arr[ix].lido = true;
      setArr(NOTIFS_KEY, arr);
      render();
    }

    // popula responsáveis
    const sel = formAtender.elements['responsavel'];
    if (sel) {
      sel.innerHTML = '';
      getUsuarios().forEach(u => {
        const op = document.createElement('option');
        op.value = u.email || u.id || u.nome;
        op.textContent = u.nome || u.email || u.id;
        sel.appendChild(op);
      });
    }

    // hiddens + resumo
    formAtender.elements['notifId'] && (formAtender.elements['notifId'].value = String(notifId || ''));
    formAtender.elements['leadId']  && (formAtender.elements['leadId'].value  = String(leadId  || ''));
    if (resumoLead) resumoLead.innerHTML = renderResumoLead(leadId);

    // abre modal
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    window.lucide?.createIcons?.();
  }
  function fecharModal() {
    const modal = $('#modalAtender');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }
  // listeners de fechar atender
  document.addEventListener('click', (e) => {
    const modal = $('#modalAtender');
    if (!modal || modal.hidden) return;
    const closeBtn = e.target.closest?.('[data-close]');
    if (closeBtn || e.target.classList?.contains('modal__backdrop')) fecharModal();
  });
  document.addEventListener('keydown', (e) => {
    const modal = $('#modalAtender');
    if (e.key === 'Escape' && modal && !modal.hidden) fecharModal();
  });

  // === SUBMIT "ATENDER": atribui, marca lida e (opcional) cria follow-up ===
  (function bindSubmitAtender(){
    const formAtender = $('#formAtender');
    if (formAtender && !formAtender.__bindSubmit){
      formAtender.__bindSubmit = true;
      formAtender.addEventListener('submit', (ev) => {
        ev.preventDefault();

        const notifId    = formAtender.elements['notifId']?.value || '';
        const leadId     = formAtender.elements['leadId']?.value  || '';
        const responsavel= formAtender.elements['responsavel']?.value || '';
        const obs        = formAtender.elements['obs']?.value || '';
        const dataISO    = formAtender.elements['dataFollow']?.value || ''; // opcional
        const hora       = formAtender.elements['horaFollow']?.value || ''; // opcional

        // 1) Atualiza notificação
        const arr = getArr(NOTIFS_KEY);
        const ix  = arr.findIndex(n => String(n.id) === String(notifId));
        if (ix > -1){
          arr[ix].responsavel = responsavel || arr[ix].responsavel || '';
          arr[ix].lido = true;
          if (obs) arr[ix].obs = obs;
          setArr(NOTIFS_KEY, arr);
        }

        // 2) Opcional: follow-up na Agenda (se informar data)
        if (dataISO && typeof window.__agendaBridge?.upsertAgendaItem === 'function'){
          const nomeLead = (() => {
            const leads = getArr('leads');
            const L = leads.find(l => String(l.id) === String(leadId));
            return (L?.nome || L?.cliente || 'Lead');
          })();

          const itemId = window.__agendaBridge.upsertAgendaItem({
            id: `lead_follow_${notifId}`,  // estável para evitar duplicado
            src: 'lead',
            title: `Follow-up com ${nomeLead}`,
            date: dataISO,
            timeStart: hora || undefined,
            status: 'scheduled',
            entity: { type: 'lead', id: String(leadId || notifId) }
          });
// === NOTIFICAÇÃO: Follow-up criado ===
fetch(`${API_BASE}/notificacoes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        id: `notif:followup:${leadId}:${Date.now()}`,
        kind: "followup_agendado",
        title: "Follow-up agendado",
        message: `Um follow-up foi agendado para o lead ${leadId} em ${dataISO} ${hora ? 'às ' + hora : ''}.`,
        audience: responsavel,
        level: "info",
        entityType: "lead",
        entityId: leadId
    })
});

          // 3) Notificação interna para o responsável
          if (typeof window.__agendaBridge?.publishNotification === 'function'){
            window.__agendaBridge.publishNotification({
              id: `notif:lead:follow:${itemId ?? notifId}`,
              kind: 'lead:follow:upsert',
              title: `Follow-up agendado: ${nomeLead} (${dataISO.split('-').reverse().join('/')}${hora? ' • '+hora : ''})`,
              level: 'info',
              audience: responsavel || 'comercial'
            });
          }
        }

        // 4) fecha modal e atualiza UI
        fecharModal();
        render();
      });
    }
  })();

  // Resumo do lead
  function renderResumoLead(leadId) {
    if (!leadId) return '<em>Lead não vinculado à notificação.</em>';
    const leads = getArr('leads');
    const L = leads.find(l => String(l.id) === String(leadId));
    if (!L) return '<em>Lead não encontrado.</em>';

    const nome   = L.nome || L.cliente || '—';
    const evento = [L.tipoEvento, L.dataEvento].filter(Boolean).join(' • ') || '—';
    const local  = L.local || L.local_evento || '—';
    const qtd    = (L.qtd ?? L.qtdConvidados ?? L.convidados);
    const conv   = (qtd === 0 || qtd) ? String(qtd) : '—';
    const contato= L.whatsapp || L.telefone || L.email || '—';

    const linhas = [
      ['Nome', nome],
      ['Evento', evento],
      ['Local', local],
      ['Convidados', conv],
      ['Contato', contato],
    ];
    return linhas.map(([k,v]) => `<div><strong>${k}:</strong> ${v}</div>`).join('');
  }

  // === Tempo real: ouvir mudanças vindas de outras abas/telas ===
  window.addEventListener('storage', (e) => {
    if (e.key === NOTIFS_KEY || e.key === NOTIFS_KEY+':ping') {
      try { render(); } catch {}
    }
  });

  // Inicializa
  document.addEventListener('DOMContentLoaded', () => {
    render();
    window.lucide?.createIcons?.();
  });
})();

// === Auto-reload para notificações internas / financeiro (compat) ===
(function wireNotificacoesLive(){
  function safeRender(){
    try {
      if (typeof renderNotificacoes === 'function') return renderNotificacoes();
      if (typeof loadAndRenderNotificacoes === 'function') return loadAndRenderNotificacoes();
    } catch (e) {
      console.warn('[Notificações] render falhou:', e);
    }
  }

  window.addEventListener('storage', (ev) => {
    if (!ev || !ev.key) return;
    if (ev.key === 'financeiroGlobal' || ev.key === 'financeiroGlobal:ping') {
      safeRender();
    }
  });

  try {
    const bc = new BroadcastChannel('mrubuffet');
    bc.onmessage = (e) => {
      if (e?.data?.type === 'fin-store-changed') safeRender();
    };
  } catch {}
})();
