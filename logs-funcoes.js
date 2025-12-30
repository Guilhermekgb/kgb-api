// logs-funcoes.js (module)
import { handleRequest } from './api/routes.js';

const api = (endpoint, req = {}) =>
  new Promise(resolve => handleRequest(endpoint, req, resolve));

export async function registrarLog(acao, descricao = '', alvo = '') {
  try {
    // Agora deixamos o backend descobrir o "actor" a partir do token (Authorization: Bearer ...)
    // Enviamos apenas a ação, alvo e detalhes.
    await api('/logs', {
      method: 'POST',
      body: {
        action: acao,
        target: String(alvo || ''),
        detail: String(descricao || '')
      }
    });
  } catch (e) {
    console.warn('Falha ao registrar log:', e);
  }
}

// opcional: manter disponível no window (ex.: botão inline em logs.html)
if (typeof window !== 'undefined') window.registrarLog = registrarLog;
