// api/backup-api.js

import { verificarAutenticacao } from './middleware.js';

// TODO FASE F: este backup hoje fotografa só o localStorage (banco local).
//              Quando o backend for a fonte oficial, o backup "de verdade"
//              será feito no servidor. Aqui continuará como backup do cache.
function snapshotLocalStorage() {
  const dump = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    dump[k] = localStorage.getItem(k);
  }
  return dump;
}


export function getBackup(req, res) {
  if (!verificarAutenticacao(req)) {
  res({ status: 401, error: 'Não autorizado' });
  return;
}


  const dados = snapshotLocalStorage();
  res({ status: 200, data: dados });
}

export function postRestore(req, res) {
  if (!verificarAutenticacao(req)) {
  res({ status: 401, error: 'Não autorizado' });
  return;
}


  const confirmacao = req.confirmacao || false;
  if (!confirmacao) {
    res({ status: 400, error: 'Confirmação de restauração ausente.' });
    return;
  }
localStorage.clear(); // garante que o restore não deixe lixo antigo

  const dados = req.body;
  if (!dados || typeof dados !== "object") {
    res({ status: 400, error: 'Backup inválido.' });
    return;
  }

 Object.entries(dados).forEach(([chave, valor]) => {
  localStorage.setItem(chave, String(valor));
});


  res({ status: 200, data: { mensagem: 'Backup restaurado com sucesso.' } });
}
