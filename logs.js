// logs.js (module)
import { handleRequest } from './api/routes.js';

const api = (endpoint, req = {}) =>
  new Promise(resolve => handleRequest(endpoint, req, resolve));

function formatar(ts) {
  const d = new Date(Number(ts) || 0);
  return {
    data: d.toLocaleDateString('pt-BR'),
    hora: d.toLocaleTimeString('pt-BR'),
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  const tbody = document.getElementById('tabelaLogs');
  if (!tbody) return;

  const r = await api('/logs', { method: 'GET' });
  const arr = Array.isArray(r?.data) ? r.data : [];

  if (!arr.length) {
    tbody.innerHTML = '<tr><td colspan="4">Nenhuma ação registrada.</td></tr>';
    return;
  }

  for (const log of arr) {
    const { data, hora } = formatar(log.ts);

    const tr = document.createElement('tr');
    const tdData = document.createElement('td'); tdData.textContent = data;
    const tdHora = document.createElement('td'); tdHora.textContent = hora;
    const tdUser = document.createElement('td'); tdUser.textContent = log.actor || '-';
    const tdAcao = document.createElement('td');
    tdAcao.textContent = log.detail ? `${log.action} — ${log.detail}` : (log.action || '-');

    tr.append(tdData, tdHora, tdUser, tdAcao);
    tbody.appendChild(tr);
  }

  if (window.lucide?.createIcons) lucide.createIcons();
});
