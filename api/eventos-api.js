// api/eventos-api.js
import { verificarAutenticacao } from './middleware.js';
const uuid = () => (crypto?.randomUUID?.() || String(Date.now() + Math.random()));

const KEY = 'eventos';
const load  = () => JSON.parse(localStorage.getItem(KEY) || '[]');
const save  = (arr) => localStorage.setItem(KEY, JSON.stringify(arr));

export function getEventos(req, res) {
  if (!verificarAutenticacao(req)) return res({ status: 401, error: 'Não autorizado' });
  res({ status: 200, data: load() });
}

export function getEvento(req, res) {
  if (!verificarAutenticacao(req)) return res({ status: 401, error: 'Não autorizado' });
  const id = req?.params?.id || req?.query?.id;
  const ev = load().find(e => e.id === id);
  if (!ev) return res({ status: 404, error: 'Evento não encontrado' });
  res({ status: 200, data: ev });
}

export function postEvento(req, res) {
  if (!verificarAutenticacao(req)) return res({ status: 401, error: 'Não autorizado' });
  const b = req?.body || {};
  const novo = {
    id: uuid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...b
  };
  const arr = load();
  arr.push(novo);
  save(arr);
  res({ status: 201, data: novo });
}

export function putEvento(req, res) {
  if (!verificarAutenticacao(req)) return res({ status: 401, error: 'Não autorizado' });
  const b = req?.body || {};
  const id = b.id || req?.params?.id;
  if (!id) return res({ status: 400, error: 'Informe id' });

  let upd = null;
  const arr = load().map(e => e.id === id
    ? (upd = { ...e, ...b, id, updatedAt: new Date().toISOString() })
    : e
  );
  if (!upd) return res({ status: 404, error: 'Evento não encontrado' });

  save(arr);
  res({ status: 200, data: upd });
}

export function deleteEvento(req, res) {
  if (!verificarAutenticacao(req)) return res({ status: 401, error: 'Não autorizado' });
  const id = req?.query?.id || req?.body?.id || req?.params?.id;
  if (!id) return res({ status: 400, error: 'Informe id' });

  const arr = load();
  const next = arr.filter(e => e.id !== id);
  if (next.length === arr.length) return res({ status: 404, error: 'Evento não encontrado' });

  save(next);
  res({ status: 200, data: { id } });
}
