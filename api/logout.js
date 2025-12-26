// api/logout.js (ajuste o caminho de import se necessário)
import { handleRequest } from './routes.js'; 
const api = (endpoint, req = {}) =>
  new Promise(resolve => handleRequest(endpoint, req, resolve));

export async function sair() {
  const u =
    JSON.parse(localStorage.getItem('usuarioLogado') || 'null') ||
    JSON.parse(sessionStorage.getItem('usuarioLogado') || 'null');

  try {
    await api('/logs', {
      method: 'POST',
      body: {
        action: 'LOGOUT',
        actor: u?.email || u?.nome || '',
        target: '',
        detail: 'Usuário saiu do sistema'
      }
    });
  } catch (e) {
    console.warn('Falha ao registrar log de logout:', e);
  } finally {
    // limpeza TOTAL
    localStorage.removeItem('token');
    localStorage.removeItem('usuarioLogado');
    localStorage.removeItem('loginTimestamp');
    sessionStorage.removeItem('token');        // <- faltava
    sessionStorage.removeItem('usuarioLogado');
    // também limpa permissões/flags salvas
localStorage.removeItem('permissoes');
localStorage.removeItem('disable_guards');
sessionStorage.removeItem('permissoes');
sessionStorage.removeItem('disable_guards');


    // evita voltar para páginas protegidas
    window.location.replace('login.html');     // <- substitui href por replace
  }
}

if (typeof window !== 'undefined') window.sair = sair;
