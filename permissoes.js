/* ===== Perfis fixos + extras salvos ===== */
import { handleRequest } from './api/routes.js';

const perfisFixos = [
  "Administrador",
  "Vendedor",
  "Financeiro",
  "Maitre",
  "Estoque",
  "Responsável por Evento"
];
// Pega o token salvo (login) pra mandar na API
const authHeader = () => {
  const t = localStorage.getItem("token") || sessionStorage.getItem("token");
  return t ? { Authorization: "Bearer " + t } : {};
};

// Atalho pra chamar a API usando o handleRequest (mesmo esquema do resto do sistema)
const api = (endpoint, req = {}) => {
  const headers = { ...authHeader(), ...(req.headers || {}) };
  return handleRequest(endpoint, { ...req, headers });
};

// Lista de perfis que será usada na tabela (colunas)
let perfis = [...perfisFixos];

// Busca perfis extras na API (/perfis) e mistura com os fixos
async function carregarPerfis() {
  const extras = [];
  try {
    const resp = await api("/perfis", { method: "GET" });
    if (resp && resp.status === 200 && Array.isArray(resp.data)) {
      resp.data.forEach(p => {
        const nome = typeof p === "string" ? p : (p?.nome || "");
        const s = String(nome || "").trim();
        if (s) extras.push(s);
      });
    }
  } catch (e) {
    console.warn("Não foi possível carregar perfis da API. Usando apenas perfis fixos.", e);
  }

  const set = new Set(perfisFixos);
  extras.forEach(n => {
    const s = String(n || "").trim();
    if (s && !set.has(s)) set.add(s);
  });

  perfis = Array.from(set);
}


/* ===== Grupos e Páginas (IDs = page:<arquivo>.html) ===== */
const gruposEPaginas = {
  // ===== DASHBOARD =====
  "DASHBOARD (página)": [
    { id: "page:dashboard.html", nome: "Acessar Dashboard" }
  ],

  "DASHBOARD – Botões do topo": [
    { id: "dash:btn-agenda",             nome: "Botão: Agenda" },
    { id: "dash:btn-lancamento-rapido",  nome: "Botão: Lançamento Rápido" },
    { id: "dash:btn-orcamento",          nome: "Botão: Orçamento" },
    { id: "dash:btn-eventos",            nome: "Botão: Eventos" }
  ],

  "DASHBOARD – Cards superiores": [
    { id: "dash:card-retornos",         nome: "Card: Retornos Vencidos" },
    { id: "dash:card-prox-degustacao",  nome: "Card: Próxima Degustação" },
    { id: "dash:card-pag-vencidos",     nome: "Card: Pagamentos vencidos" },
    { id: "dash:card-a-vencer",         nome: "Card: A vencer" },
    { id: "dash:card-pos-evento",       nome: "Card: Pós-evento pendentes" },
    { id: "dash:card-leads-mes",        nome: "KPI: Leads do Mês" },
    { id: "dash:card-vendas",           nome: "KPI: Vendas Realizadas" },
    { id: "dash:card-negociacao",       nome: "KPI: Em Negociação" },
    { id: "dash:card-finalizados",      nome: "KPI: Leads Finalizados" }
  ],

  "DASHBOARD – Gráfico": [
    { id: "dash:grafico-conversao", nome: "Gráfico: Conversão mês a mês" }
  ],

  "DASHBOARD – Blocos inferiores": [
    { id: "dash:card-tarefas",            nome: "Tarefas dos Eventos" },
    { id: "dash:card-proximos-eventos",   nome: "Próximos Eventos" },
    { id: "dash:card-agenda-degustacoes", nome: "Agenda de Degustações" },
    { id: "dash:card-notificacoes",       nome: "Notificações" },
    { id: "dash:card-fluxo-previsto",     nome: "Fluxo Previsto" },
    { id: "dash:card-resultado-mes",      nome: "Resultado do Mês" },
    { id: "dash:card-pagar-15",           nome: "Contas a Pagar (15 dias)" },
    { id: "dash:card-receber-15",         nome: "Contas a Receber (15 dias)" },
    { id: "dash:card-leads-retorno",      nome: "Leads para Retorno" }
  ],

  // ===== NOTIFICAÇÕES =====
  "NOTIFICAÇÕES": [
    { id: "page:notificacoes.html",           nome: "Notificações" },
    { id: "page:notificacoes-internas.html",  nome: "Notificações Internas" },
    { id: "page:alertas.html",  nome: "Alertas" },
    { id: "page:agenda-equipe.html",                 nome: "Agenda" }
  ],

    // ===== AGENDA — Fontes visíveis (por perfil) =====
  "AGENDA — Fontes visíveis": [
    { id: "agenda:src:evento",  nome: "Ver Eventos na Agenda" },
    { id: "agenda:src:check",   nome: "Ver Checklist na Agenda" },
    { id: "agenda:src:fin",     nome: "Ver Financeiro na Agenda" },
    { id: "agenda:src:lead",    nome: "Ver Leads na Agenda" },
    { id: "agenda:src:funil",   nome: "Ver Funil na Agenda" },
    { id: "agenda:src:interno", nome: "Ver Interno na Agenda" }
  ],

  // ===== ORÇAMENTOS =====
  "ORÇAMENTOS": [
    { id: "page:funil-leads.html",               nome: "Funil de Leads" },
    { id: "page:orcamento.html",                 nome: "Orçamento" },
    { id: "page:orcamento-detalhado.html",       nome: "Orçamento Detalhado" },
    { id: "page:lista-propostas.html",           nome: "Lista de Propostas" },
    { id: "page:degustacoes-disponiveis.html",   nome: "Degustações Disponíveis" },
    { id: "page:comissoes.html",                 nome: "Comissões" }
  ],

  // ===== EVENTOS =====
  "EVENTOS": [
    { id: "page:cadastro-evento.html", nome: "Cadastro de Evento" },
    { id: "page:lista-evento.html",    nome: "Lista de Eventos" }
  ],

  // ===== CLIENTES =====
  "CLIENTES": [
    { id: "page:cadastro-cliente.html", nome: "Cadastro de Cliente" },
    { id: "page:clientes-lista.html",   nome: "Lista de Clientes" }
  ],

  // ===== FINANCEIRO =====
  "FINANCEIRO": [
    { id: "page:financeiro-lancamentos.html", nome: "Financeiro - Lançamentos" },
    { id: "page:financeiro-analises.html",    nome: "Financeiro - Análises" },
    { id: "page:financeiro-resumo.html",      nome: "Financeiro - Resumo" },
    { id: "page:financeiro-categorias.html",  nome: "Financeiro - Categorias" },
    { id: "page:custos-fixo.html",            nome: "Custos Fixos" }
  ],

  // ===== SERVIÇOS E PRODUTOS =====
  "SERVIÇOS E PRODUTOS": [
    { id: "page:cardapios-e-produtos.html", nome: "Cardápios e Produtos" },
    { id: "page:montagem-cardapio.html",    nome: "Montagem de Cardápio" }
  ],

  // ===== ESTOQUE =====
  "ESTOQUE": [
    { id: "page:fichas-tecnicas.html",     nome: "Fichas Técnicas" },
    { id: "page:estoque-materiais.html",   nome: "Estoque - Materiais" },
    { id: "page:estoque-insumos.html",     nome: "Estoque - Insumos" },
      { id: "page:estoque-setores.html",     nome: "Estoque - Setores" }
  ],

  // ===== EQUIPE =====
 "EQUIPE": [
  { id: "page:responsavel-eventos.html", nome: "Responsável por Eventos" },
  { id: "page:equipe.html",              nome: "Equipe" },
  { id: "page:colaboradores.html",       nome: "Colaboradores" },
  { id: "page:escala-evento.html",       nome: "Escala do Evento" } // ← ADICIONE ESTA
],

  // ===== FORNECEDORES =====
  "FORNECEDORES": [
    { id: "page:fornecedores.html", nome: "Fornecedores" }
  ],

  // ===== MODELOS =====
  "MODELOS": [
    { id: "page:modelos.html",           nome: "Modelos" },
    { id: "page:modelos-checklist.html", nome: "Modelos de Checklist" },
    { id: "page:contrato.html",          nome: "Contratos" }
  ],

  // ===== FEIRAS =====
  "FEIRAS": [
    { id: "page:feiras.html", nome: "Feiras" }
  ],

   // ===== FORMATURAS =====
  "FORMATURAS": [
    { id: "page:kgb-formaturas-dashboard.html", nome: "Formaturas" }
  ],

  // ===== RELATÓRIOS =====
  "RELATÓRIOS": [
    { id: "page:relatorio-evento.html", nome: "Relatórios de Eventos" },
    { id: "page:painel-cobrancas.html",   nome: "Painel de Cobranças" },
    { id: "page:planilha-eventos.html",   nome: "Planilha de Eventos" }
  ],

  // ===== PDV =====
  "PDV": [
    { id: "page:eventos-pagos.html",      nome: "Eventos Pagos" },
    { id: "page:gerenciar-convites.html", nome: "Gerenciar Convites" },
    { id: "page:checkin.html",            nome: "Check-in" },
    { id: "page:pdv.html",                nome: "PDV" },
    { id: "page:entradas-saida.html",     nome: "Entradas e Saídas" },
    { id: "page:layout-editor.html",      nome: "Editor de Layout" },
    { id: "page:etiquetas.html",          nome: "Etiquetas" }
  ],

  // ===== CONFIGURAÇÕES =====
  "CONFIGURAÇÕES": [
    { id: "page:cadastro-usuario.html",     nome: "Cadastro de Usuários" },
    { id: "page:usuarios.html",              nome: "Usuários" },
    { id: "page:perfis.html",                nome: "Perfis" },
    { id: "page:permissoes.html",            nome: "Permissões" },
    { id: "page:categorias-gerais.html",     nome: "Categorias Gerais" },
    { id: "page:links.html",                 nome: "Links" },
    { id: "page:orcamento-arquivado.html", nome: "Orçamentos Arquivados" },
    { id: "page:eventos-arquivados.html",    nome: "Eventos Arquivados" },
    { id: "page:variaveis-modelos.html",     nome: "Variáveis de Modelos" },
    { id: "page:financeiro-config.html", nome: "Financeiro - Configurações" },
    { id: "page:configuracoes.html",         nome: "Configurações Gerais" }
  ],

  // ===== BLOCO TÉCNICO =====
  "BLOCO TÉCNICO": [
    { id: "page:documentacao-api.html", nome: "Documentação da API" },
    { id: "page:backup.html",           nome: "Backup" },
    { id: "page:logs.html",             nome: "Logs" },
    { id: "page:logs-tecnicos.html",    nome: "Logs Técnicos" },
    { id: "page:integracoes.html",      nome: "Integrações" },
     { id: "page:auditoria.html",      nome: "Auditoria" }
    
  ],

    // ===== FORA MENU LATERAL  =====
  "FORA MENU LATERAL": [
    { id: "page:checklist-materiais.html", nome: "Checklist de Materiais – Evento" },
     { id: "page:cliente-detalhado.html", nome: "Cliente Detalhado - Cliente" },
    { id: "page:checklist.html", nome: "Checklist do Evento" }
    
  ]
};

/* ===== Converte grupos → estrutura usada na matriz ===== */
const permissoesPorModulo = gruposEPaginas;

/* ===== Renderização ===== */
async function carregarPermissoesUi() {
  try {
    const resp = await api("/permissoesUi", { method: "GET" });
    if (resp && resp.status === 200 && resp.data && typeof resp.data === "object") {
      return resp.data;
    }
  } catch (e) {
    console.warn("Não foi possível carregar permissões da API.", e);
  }
  return {};
}

async function renderizarTabela() {
  const container = document.getElementById("tabelasPermissoes");
  if (!container) return;

  // Garante que temos a lista correta de perfis (fixos + API)
  await carregarPerfis();

  const permissoesSalvas = await carregarPermissoesUi();
  container.innerHTML = "";

  for (const modulo in gruposEPaginas) {
    const h2 = document.createElement("h2");
    h2.textContent = modulo;
    container.appendChild(h2);

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.innerHTML =
      "<th>Página</th>" + perfis.map(p => `<th>${p}</th>`).join("");
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    gruposEPaginas[modulo].forEach(p => {
      const tr = document.createElement("tr");
      let linha = `<td>${p.nome}</td>`;
      perfis.forEach(perfil => {
        const checked =
          Array.isArray(permissoesSalvas[p.id]) &&
          permissoesSalvas[p.id].includes(perfil)
            ? "checked"
            : "";
        linha += `<td><input type="checkbox" data-permissao="${p.id}" data-perfil="${perfil}" ${checked}></td>`;
      });
      tr.innerHTML = linha;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  atualizaResumo();
}


function atualizaResumo() {
  const resumo = {};
  document.querySelectorAll("input[type=checkbox]").forEach(chk => {
    if (chk.checked) {
      const perfil = chk.dataset.perfil;
      resumo[perfil] = (resumo[perfil] || 0) + 1;
    }
  });

  let htmlResumo = "<ul style='padding-left: 20px; margin:0;'>";
  Object.keys(resumo).forEach(p => {
    htmlResumo += `<li><strong>${p}:</strong> ${resumo[p]} páginas liberadas</li>`;
  });
  htmlResumo += "</ul>";
  const el = document.getElementById("resumo-perfis");
  if (el) el.innerHTML = htmlResumo;
}

async function salvarPermissoes() {
  const novaPermissao = {};
  document.querySelectorAll("input[type=checkbox]").forEach(chk => {
    const permissao = chk.dataset.permissao;
    const perfil = chk.dataset.perfil;
    if (!novaPermissao[permissao]) novaPermissao[permissao] = [];
    if (chk.checked) novaPermissao[permissao].push(perfil);
  });

  try {
    const resp = await api("/permissoesUi", {
      method: "PUT",
      body: novaPermissao
    });

    if (!resp || (resp.status !== 200 && resp.status !== 204)) {
      const msg =
        (resp && (resp.error || resp.data?.error)) ||
        "Não foi possível salvar as permissões.";
      alert(msg);
      return;
    }

    alert("Permissões salvas com sucesso!");
    await renderizarTabela();
  } catch (e) {
    console.error(e);
    alert("Erro ao salvar permissões. Tente novamente em alguns instantes.");
  }
}
// Disponibiliza para o botão onclick="salvarPermissoes()"
window.salvarPermissoes = salvarPermissoes;

// ================= RBAC DA API (permissoesApi) =================

// Vamos reaproveitar:
// - a função api(endpoint, req) que já criamos lá em cima
// - a lista de perfis (perfis) que usamos na tabela de permissões de página

// Garante que temos uma lista de perfis atualizada (fixos + extras da API)
async function obterPerfisParaRbac() {
  // Se você já tiver uma função carregarPerfis/perfis globais, use ela:
  // aqui estou assumindo que "perfis" já é um array com os nomes.
  if (typeof carregarPerfis === "function") {
    try {
      await carregarPerfis();
    } catch (e) {
      console.warn("Erro ao carregar perfis para RBAC API:", e);
    }
  }
  if (Array.isArray(perfis) && perfis.length) {
    return perfis;
  }
  // fallback bem simples, caso algo dê errado
  return [
    "Administrador",
    "Vendedor",
    "Financeiro",
    "Maitre",
    "Estoque",
    "Responsável por Evento"
  ];
}

// Carrega a matrix atual de permissões da API (/permissoesApi)
async function carregarRbacApiMatrix() {
  try {
    const resp = await api("/permissoesApi", { method: "GET" });
    if (resp && resp.status === 200 && resp.data && typeof resp.data === "object") {
      return resp.data; // algo como { "leads:get": ["Administrador","Vendedor"], ... }
    }
  } catch (e) {
    console.warn("Não foi possível carregar RBAC da API:", e);
  }
  return {};
}

// Monta a tabela dentro de #rbacApiEditor
async function initRbacApi() {
  const container = document.getElementById("rbacApiEditor");
  if (!container) return; // se a seção não existir na página, não faz nada

  container.innerHTML = `
    <p style="padding:8px 0;">Carregando configurações de RBAC da API...</p>
  `;

  const listaPerfis = await obterPerfisParaRbac();
  const matrix = await carregarRbacApiMatrix();

  const chaves = Object.keys(matrix || {}).sort();

  if (!chaves.length) {
    container.innerHTML = `
      <p style="padding:8px 0;">
        Nenhuma regra personalizada encontrada em <code>/permissoesApi</code>.<br/>
        A API deve estar usando as regras padrão internas do backend.
      </p>
    `;
  } else {
    // Monta tabela
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    headRow.innerHTML =
      "<th>Entidade</th><th>Ação</th>" +
      listaPerfis.map(p => `<th>${p}</th>`).join("");

    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    chaves.forEach(key => {
      const [entidade, acao] = String(key).split(":");
      const perfisPermitidos = Array.isArray(matrix[key]) ? matrix[key] : [];

      const tr = document.createElement("tr");
      let html = `
        <td>${entidade || ""}</td>
        <td>${acao || ""}</td>
      `;

      listaPerfis.forEach(perfil => {
        const checked = perfisPermitidos.includes(perfil) ? "checked" : "";
        html += `
          <td style="text-align:center;">
            <input
              type="checkbox"
              data-rbac-key="${key}"
              data-rbac-entity="${entidade || ""}"
              data-rbac-action="${acao || ""}"
              data-rbac-perfil="${perfil}"
              ${checked}
            />
          </td>
        `;
      });

      tr.innerHTML = html;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.innerHTML = "";
    container.appendChild(table);
  }

  // Liga os botões Salvar / Resetar
  const btnSalvar = document.getElementById("rbacApiSalvar");
  const btnReset  = document.getElementById("rbacApiReset");

  if (btnSalvar) {
    btnSalvar.onclick = function (e) {
      e.preventDefault();
      salvarRbacApi();
    };
  }
  if (btnReset) {
    btnReset.onclick = function (e) {
      e.preventDefault();
      resetarRbacApi();
    };
  }
}

// Lê os checkboxes da tabela e envia para /permissoesApi (PUT)
async function salvarRbacApi() {
  const editor = document.getElementById("rbacApiEditor");
  if (!editor) return;

  const novaMatrix = {};
  editor.querySelectorAll('input[type="checkbox"][data-rbac-key]').forEach(chk => {
    const key    = chk.dataset.rbacKey;
    const perfil = chk.dataset.rbacPerfil;
    if (!key || !perfil) return;

    if (!novaMatrix[key]) novaMatrix[key] = [];
    if (chk.checked) novaMatrix[key].push(perfil);
  });

  try {
    const resp = await api("/permissoesApi", {
      method: "PUT",
      body: novaMatrix
    });

    if (!resp || (resp.status !== 200 && resp.status !== 204)) {
      const msg =
        (resp && (resp.error || resp.data?.error)) ||
        "Não foi possível salvar o RBAC da API.";
      alert(msg);
      return;
    }

    alert("RBAC da API salvo com sucesso!");
    await initRbacApi();
  } catch (e) {
    console.error(e);
    alert("Erro ao salvar RBAC da API. Tente novamente em alguns instantes.");
  }
}

// Chama DELETE /permissoesApi (backend deve resetar para padrões internos)
async function resetarRbacApi() {
  if (!confirm("Tem certeza que deseja resetar as regras da API para os padrões?")) {
    return;
  }

  try {
    const resp = await api("/permissoesApi", {
      method: "DELETE"
    });

    if (!resp || (resp.status !== 200 && resp.status !== 204)) {
      const msg =
        (resp && (resp.error || resp.data?.error)) ||
        "Não foi possível resetar o RBAC da API.";
      alert(msg);
      return;
    }

    alert("RBAC da API resetado para padrões com sucesso!");
    await initRbacApi();
  } catch (e) {
    console.error(e);
    alert("Erro ao resetar RBAC da API. Tente novamente em alguns instantes.");
  }
}

// Inicializa o editor da API quando a página carregar
document.addEventListener("DOMContentLoaded", () => {
  initRbacApi();
});


document.addEventListener("DOMContentLoaded", () => {
  renderizarTabela();
  try { window.lucide?.createIcons?.(); } catch {}
});


