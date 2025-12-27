import { handleRequest } from './api/remote-adapter.js';
// leads-api.js — proxy fino para as rotas oficiais de /leads
// Uma única fonte de verdade (routes.js): UUID, ts, histórico, auditoria etc.
// Respeita o auto-switch para API remota via window.__API_BASE__.

import { handleRequest } from './routes.js'; // se este arquivo estiver fora de /api, ajuste o caminho

const api = (endpoint, req = {}) =>
  new Promise(resolve => handleRequest(endpoint, req, resolve));

/* ===== Compat: assinatura antiga callback-style ===== */
export function getLeads(req = {}, res = () => {}) {
  return handleRequest('/leads', { method: 'GET', body: req?.body || {} }, res);
}
export function postLead(req = {}, res = () => {}) {
  return handleRequest('/leads', { method: 'POST', body: req?.body || {} }, res);
}
export function putLead(req = {}, res = () => {}) {
  return handleRequest('/leads', { method: 'PUT', body: req?.body || {} }, res);
}
export function deleteLead(req = {}, res = () => {}) {
  return handleRequest('/leads', { method: 'DELETE', body: req?.body || {} }, res);
}

/* ===== Opção moderna promise-style ===== */
export async function listLeads(params = {}) {
  return api('/leads', { method: 'GET', body: params });
}
export async function createLead(payload = {}) {
  return api('/leads', { method: 'POST', body: payload });
}
export async function updateLead(payload = {}) {
  return api('/leads', { method: 'PUT', body: payload });
}
export async function removeLead(id) {
  return api('/leads', { method: 'DELETE', body: { id } });
}

export default {
  getLeads, postLead, putLead, deleteLead,
  listLeads, createLead, updateLead, removeLead,
};
