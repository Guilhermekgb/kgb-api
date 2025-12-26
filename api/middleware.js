// api/middleware.js
import { obterUsuarioDoToken } from './auth.js';
function getToken() {
  try {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  } catch { return null; }
}
function getUsuarioLogado() {
  try {
    return JSON.parse(
      localStorage.getItem('usuarioLogado') ||
      sessionStorage.getItem('usuarioLogado') ||
      'null'
    );
  } catch { return null; }
}

// Protege páginas HTML
export function protegerPagina() {
  const token = getToken();
  const usuarioDoToken = obterUsuarioDoToken(); // pode ser null
  const usuarioFallback = getUsuarioLogado();
  const usuario = usuarioDoToken || usuarioFallback;

  console.debug('[protegerPagina]', {
    temToken: !!token,
    temUsuarioDoToken: !!usuarioDoToken,
    temUsuarioFallback: !!usuarioFallback
  });

  if (!token && !usuario) {
    alert('Acesso não autorizado. Faça login.');
    window.location.href = 'login.html'; // relativo evita problemas de caminho
    return;
  }
}


// Protege rotas “da API”
export function verificarAutenticacao(req) {
  const h = req?.headers || {};
  const auth = h.Authorization || h.authorization || '';
  const headerToken = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  const tokenSalvo = getToken();
  if (tokenSalvo && headerToken === tokenSalvo) return true;

  // Fallback local: aceita se houver usuário salvo
  return Boolean(getUsuarioLogado());
}

// === INÍCIO PATCH P1: Agendador Global de Auto-Backup (local) ===
// Este bloco roda em qualquer página do sistema e cria/renova auto-backup conforme meta.
// Não depende de funções de backup.html; é autocontido e seguro repetir.

(function KGB_AutoBackup_Global(){
  const AUTO_BKP_KEY      = '__autoBackups';
  const AUTO_BKP_META_KEY = '__autoBackups.meta';

  // helpers locais (não conflitam com outras partes)
  const nowISO = () => new Date().toISOString();
  const parseJSON = (s, defVal) => { try { return JSON.parse(String(s||'')); } catch { return defVal; } };
  const salvar = (k,v) => localStorage.setItem(k, JSON.stringify(v));
  const ler    = (k,defVal) => parseJSON(localStorage.getItem(k), defVal);

  function coletarDumpLocalStorage(){
    const dump = {};
    for (let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      dump[k] = localStorage.getItem(k);
    }
    // usuário atual (ajuste a chave se seu login usar outro nome)
    const usuarioAtual = (()=>{
      // tenta pegar um id/nome salvo no login; adapte se necessário
      const u = parseJSON(localStorage.getItem('usuarioAtual'), null);
      if (u && (u.id || u.nome)) return u.id || u.nome;
      return localStorage.getItem('usuario') || 'admin';
    })();

    dump.__backup_meta = {
      createdAt: nowISO(),
      origin: location.origin,
      usuario: usuarioAtual
    };
    return dump;
  }

  function salvarLog(acao, extra){
    try{
      const logs = ler("logs", []);
      logs.push({ data: nowISO(), acao, ...(extra||{}) });
      salvar("logs", logs);
    }catch{}
  }

  function lerMeta(){
    // valores padrão: freqDias = 7, ret = 10
    const meta = ler(AUTO_BKP_META_KEY, { lastRun:null, freqDias:7, ret:10 });
    // respeita preferências salvas pela tela backup.html, se existirem
    const uiFreq = Number(localStorage.getItem('frequenciaBackup'));
    const uiRet  = Number(localStorage.getItem('autoBackupRetencao'));
    if (uiFreq) meta.freqDias = uiFreq;
    if (uiRet)  meta.ret = Math.max(1, uiRet);
    return meta;
  }
  function salvarMeta(m){ salvar(AUTO_BKP_META_KEY, m); }
  function lerLista(){ return ler(AUTO_BKP_KEY, []); }
  function salvarLista(xs){ salvar(AUTO_BKP_KEY, xs); }

  function rodarAutoBackup(){
    const meta  = lerMeta();
    const dump  = coletarDumpLocalStorage();
    const nome  = (function gerarNomeArquivo(){
      const d = new Date(); const pad=(n)=>String(n).padStart(2,'0');
      return `auto-backup-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
    })();

    const lista = lerLista();
    const novo  = { name:nome, createdAt: nowISO(), data: dump };
    lista.push(novo);
    while (lista.length > (Number(meta.ret)||10)) lista.shift();
    salvarLista(lista);

    meta.lastRun = nowISO();
    salvarMeta(meta);
    salvarLog('Auto-backup criado (global)', { nome });
  }

  function checarEExecutarSeNecessario(){
    const meta = lerMeta();
    if (!meta.lastRun){
      // primeira marcação apenas registra a data
      meta.lastRun = nowISO();
      salvarMeta(meta);
      return;
    }
    const diasPassados = (Date.now() - new Date(meta.lastRun).getTime()) / (1000*60*60*24);
    if (diasPassados >= (Number(meta.freqDias)||7)) {
      rodarAutoBackup();
    }
  }

  // Executa 1x ao carregar
  try { checarEExecutarSeNecessario(); } catch {}
  // Revalida a cada 6 horas (leve)
  setInterval(()=>{ try { checarEExecutarSeNecessario(); } catch {} }, 6*60*60*1000);
})();
// === FIM PATCH P1 ===
