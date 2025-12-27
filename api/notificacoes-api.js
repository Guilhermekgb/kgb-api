import { verificarAutenticacao } from './middleware.js';
const newId = () => (crypto?.randomUUID?.() || String(Date.now() + Math.random()));

const notificacoesKey = 'notificacoes';

// Lê notificações do localStorage
function obterNotificacoes() {
  try {
    return JSON.parse(localStorage.getItem(notificacoesKey) || '[]');
  } catch {
    return [];
  }
}


// Salva notificações no localStorage
function salvarNotificacoes(lista) {
  localStorage.setItem(notificacoesKey, JSON.stringify(lista));
}

// POST – Criar nova notificação
export function postNotificacao(req, res) {
  if (!verificarAutenticacao(req)) {
    res({ status: 401, error: 'Não autorizado' });
    return;
  }

  const novaNotificacao = req.body;
  if (!novaNotificacao || typeof novaNotificacao !== 'object') {
  res({ status: 400, error: 'Dados inválidos.' });
  return;
}

  const lista = obterNotificacoes();

  novaNotificacao.id = newId();
  novaNotificacao.lida = false;
  novaNotificacao.data = new Date().toISOString();

  lista.push(novaNotificacao);
  salvarNotificacoes(lista);

  res({ status: 201, data: novaNotificacao });
}
export function getNotificacoes(req, res) {
  if (!verificarAutenticacao(req)) {
    res({ status: 401, error: 'Não autorizado' });
    return;
  }
  res({ status: 200, data: obterNotificacoes() });
}

export function patchNotificacao(req, res) {
  if (!verificarAutenticacao(req)) {
    res({ status: 401, error: 'Não autorizado' });
    return;
  }
  const { id, lida = true } = req.body || {};
  if (!id) return res({ status: 400, error: 'ID obrigatório.' });

  const lista = obterNotificacoes();
  const idx = lista.findIndex(n => String(n.id) === String(id));
  if (idx === -1) return res({ status: 404, error: 'Notificação não encontrada.' });

  lista[idx].lida = !!lida;
  salvarNotificacoes(lista);
  res({ status: 200, data: lista[idx] });
}

export function deleteNotificacao(req, res) {
  if (!verificarAutenticacao(req)) {
    res({ status: 401, error: 'Não autorizado' });
    return;
  }
  const { id } = req.body || {};
  if (!id) return res({ status: 400, error: 'ID obrigatório.' });

  const lista = obterNotificacoes();
  const nova = lista.filter(n => String(n.id) !== String(id));
  if (nova.length === lista.length) return res({ status: 404, error: 'Notificação não encontrada.' });

  salvarNotificacoes(nova);
  res({ status: 204 });
}
