// logs-api.js — proxy fino para as rotas oficiais de /logs
// Mantém uma única fonte de verdade (routes.js) e respeita o auto-switch para API remota.

import { handleRequest } from './routes.js';
const api = (endpoint, req = {}) => new Promise(resolve => handleRequest(endpoint, req, resolve));

/* Compat (callback-style): mantém assinatura flexível */
export function getLogs(req = {}, res = () => {}) {
  return handleRequest('/logs', { method: 'GET', body: req?.body || {} }, res);
}
export function postLog(req = {}, res = () => {}) {
  return handleRequest('/logs', { method: 'POST', body: req?.body || {} }, res);
}

/* Promises (uso moderno) */
export async function listLogs(params = {}) {
  return api('/logs', { method: 'GET', body: params });
}
export async function createLog(payload = {}) {
  // payload: { action, actor, target, detail }
  return api('/logs', { method: 'POST', body: payload });
}

export default { getLogs, postLog, listLogs, createLog };
