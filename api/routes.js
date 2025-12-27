// api/routes.js
import "./firebase-stub.js";

// “portinha” local: rotas em cima do localStorage, com logs de auditoria e logs técnicos.
export async function handleRequestLocal(endpoint, req = {}, respond) {

  const { method = 'GET', body = {} } = req;

  // === [PATCH FASE F] — Helpers de Backup/Snapshot ==========================
  const __SNAP_DB_KEY = '__snapDB'; // { [tenantId]: [{id, ts, bytes}], ... }
  const __SNAP_FULL_PREFIX = 'backup:full:'; // backup completo: backup:full:<id>

  function __rLS(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } }
  function __wLS(k, v)  { localStorage.setItem(k, JSON.stringify(v)); }
  function __bytesOf(val){ try { return new Blob([JSON.stringify(val)]).size; } catch { return 0; } }
  function __genId(){ return 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2,8).toUpperCase(); }

  function __listSnapshots(tenantId){
    const db = __rLS(__SNAP_DB_KEY, {});
    const arr = Array.isArray(db?.[tenantId]) ? db[tenantId] : [];
    // Normaliza e ordena por ts desc
    return arr
      .map(s => ({ id:String(s.id), ts:Number(s.ts)||0, bytes:Number(s.bytes)||0 }))
      .sort((a,b)=>b.ts-a.ts);
  }

  function __addSnapshot(tenantId, dumpObj){
    const id = __genId();
    const ts = Date.now();
    const bytes = __bytesOf(dumpObj);

    // 1) Index (metadados)
    const db = __rLS(__SNAP_DB_KEY, {});
    const arr = Array.isArray(db?.[tenantId]) ? db[tenantId] : [];
    arr.push({ id, ts, bytes });
    db[tenantId] = arr;
    __wLS(__SNAP_DB_KEY, db);

    // 2) Payload completo (para export/restore)
    localStorage.setItem(__SNAP_FULL_PREFIX + id, JSON.stringify(dumpObj));

    return { id, ts, bytes };
  }

  function __deleteSnapshot(id){
    // remove do índice de todos os tenants em que aparecer (segurança)
    const db = __rLS(__SNAP_DB_KEY, {});
    let removed = 0;
    for (const tId of Object.keys(db)){
      const before = db[tId].length;
      db[tId] = db[tId].filter(s => String(s.id) !== String(id));
      removed += (before - db[tId].length);
    }
    __wLS(__SNAP_DB_KEY, db);
    // remove payload completo
    localStorage.removeItem(__SNAP_FULL_PREFIX + id);
    return removed;
  }

  // Safe getter para email do usuário logado (evita JSON.parse em string pura)
  function _safeUsuarioEmail() {
    try {
      const u = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
      return (u && u.email) ? String(u.email) : '';
    } catch { return ''; }
  }

  // ===== Base de request/log =====
  const started    = Date.now();
  const actorGuess = _safeUsuarioEmail();
  const reqBody    = body || {};

  function readRaw(key){ try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
  function writeRaw(key,val){ localStorage.setItem(key, JSON.stringify(val || [])); }

  // === Helpers de usuário e filtro de visibilidade ===
  function getUsuarioAtual() {
    try {
      return JSON.parse(
        localStorage.getItem('usuarioLogado') ||
        sessionStorage.getItem('usuarioLogado') ||
        'null'
      );
    } catch { return null; }
  }

  function isMinha(notif = {}) {
    const u = getUsuarioAtual();
    const nome   = String(u?.nome || u?.email || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .trim();

    const perfil = String(u?.perfil || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .trim();

    // Admin visualiza todas as internas
    if (perfil === 'administrador' || perfil === 'admin') return true;

    // Confere destinatário (destinatario | assignedTo)
    const destinatario = String(notif.destinatario || notif.assignedTo || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .trim();

    return destinatario && nome ? destinatario === nome : false;
  }

  /* ===== M36 — Auditoria & Logs Técnicos: sensíveis + storage seguro ===== */

  // 1) Campos sensíveis (ajuste à sua realidade)
  const SENSITIVE_KEYS = new Set([
    'senha','password','token','access_token','refresh_token',
    'chave','apiKey','secret','cpf','cnpj','cartao','cvv',
    'pixChave','pix_key','telefone','whatsapp','email'
  ]);

  // 2) Detecta se o objeto tem alguma chave sensível (rasa, mas eficaz)
  function hasSensitive(obj){
    try{
      if (!obj || typeof obj !== 'object') return false;
      for (const k of Object.keys(obj)){
        const lk = String(k).toLowerCase();
        if (SENSITIVE_KEYS.has(lk)) return true;
        const v = obj[k];
        if (v && typeof v === 'object'){
          // procura raso em um nível
          for (const kk of Object.keys(v)){
            const ll = String(kk).toLowerCase();
            if (SENSITIVE_KEYS.has(ll)) return true;
          }
        }
      }
      return false;
    }catch{ return false; }
  }

  // 3) Redação leve (mas não altera o payload real, apenas cópias para log)
  function redactPreview(obj, maxLen=400){
    try{
      if (obj == null) return null;
      const shallow = {};
      Object.keys(obj).forEach(k=>{
        const lk = String(k).toLowerCase();
        const v = obj[k];
        if (SENSITIVE_KEYS.has(lk)) {
          shallow[k] = '***redacted***';
        } else if (typeof v === 'string') {
          shallow[k] = v.length > maxLen ? (v.slice(0, maxLen) + '…') : v;
        } else if (typeof v === 'number' || typeof v === 'boolean') {
          shallow[k] = v;
        } else {
          // evita JSON gigante em log
          shallow[k] = '[object]';
        }
      });
      return shallow;
    }catch{ return null; }
  }

  // 4) Buffer de logs com retenção
  const LOGS_KEY       = 'logsTecnicos';
  const LOGS_MAX_ITEMS = 2000;      // máximo de registros em buffer
  const LOGS_MAX_DAYS  = 30;        // apaga acima de 30 dias

  function readTechLogs(){ try{ return JSON.parse(localStorage.getItem(LOGS_KEY)) || []; } catch{ return []; } }
  function writeTechLogs(arr){ localStorage.setItem(LOGS_KEY, JSON.stringify(arr)); }

  // 5) Insere log com retenção e trims automáticos
  function pushTechLog(entry){
    try{
      const now = Date.now();
      const arr = readTechLogs();

      // aplica TTL (30 dias)
      const minTs = now - (LOGS_MAX_DAYS*24*60*60*1000);
      const filtered = arr.filter(x => (x && typeof x.ts === 'number' ? x.ts >= minTs : true));

      // limita tamanho (descarta mais antigos)
      while (filtered.length >= LOGS_MAX_ITEMS) filtered.shift();

      filtered.push({...entry, ts: now});
      writeTechLogs(filtered);
    }catch{}
  }

  // Use SEMPRE esta função para encerrar a rota
  function finish(payload){
    // Defaults seguros
    const safeStatus = (p) => {
      const s = Number(p?.status);
      return Number.isFinite(s) && s > 0 ? s : 200;
    };
    const toSize = (obj) => {
      try {
        if (obj == null) return 0;
        if (typeof obj === 'string') return obj.length;
        return JSON.stringify(obj).length;
      } catch { return 0; }
    };

    try {
      const dur = Date.now() - started;
      const red = hasSensitive(body);
      const reqSize  = toSize(body);     // tamanho do corpo recebido
      const respSize = toSize(payload);  // tamanho do corpo respondido

      pushTechLog({
        kind: 'route.finish',
        endpoint,
        method,
        status: safeStatus(payload),
        actor: actorGuess,      // quem executou
        ms: dur,
        bodyBytes: reqSize,     // bytes de request
        respBytes: respSize,    // bytes de response
        redacted: red,
        // preview leve para debug sem vazar segredos
        bodyPreview: red ? redactPreview(body) : null,
        error: payload?.error ? String(payload.error) : ''
      });
    } catch {}

    // ✅ Responder ao caller (blindado)
    try {
      return respond(payload);
    } catch {
      return respond({ status: 500, error: 'respond_failed' });
    }
  }

  // ===== RBAC da API (M5 + M36 + M37) =====
  function ensureAllowed(entity, action) {
    try {
      const perfilAtual = (function getPerfilAtual(){
        try {
          const u = JSON.parse(
            localStorage.getItem('usuarioLogado') ||
            sessionStorage.getItem('usuarioLogado') ||
            'null'
          );
          return String(u?.perfil || '').trim();
        } catch { return ''; }
      })();

      const isAdmin = (() => {
        const p = String(perfilAtual).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
        return p === 'administrador' || p === 'admin';
      })();

      // Admin sempre passa
      if (isAdmin) return null;

      const key = `${String(entity||'').trim().toLowerCase()}:${String(action||'').trim().toLowerCase()}`;

      // Defaults razoáveis (ajuste ao seu gosto)
      const DEFAULTS = {
        'leads:get'        : ['Administrador','Vendedor'],
        'leads:post'       : ['Administrador','Vendedor'],
        'leads:put'        : ['Administrador','Vendedor'],
        'leads:delete'     : ['Administrador'],

        'clientes:get'     : ['Administrador','Vendedor'],
        'clientes:post'    : ['Administrador','Vendedor'],
        'clientes:put'     : ['Administrador','Vendedor'],
        'clientes:delete'  : ['Administrador'],

        'contratos:get'    : ['Administrador','Financeiro','Maitre','Vendedor'],
        'contratos:post'   : ['Administrador','Financeiro'],
        'contratos:put'    : ['Administrador','Financeiro'],
        'contratos:delete' : ['Administrador','Financeiro'],

        'notificacoes:get' : ['Administrador','Vendedor','Maitre','Financeiro','Operacional'],
        'notificacoes:post': ['Administrador','Vendedor','Maitre','Financeiro','Operacional'],
        'notificacoes:put' : ['Administrador','Vendedor','Maitre','Financeiro','Operacional'],
        'notificacoes:delete':['Administrador'],

        // === Financeiro / Relatórios
        'financeiro:get'     : ['Administrador','Financeiro'],
        'financeiro:post'    : ['Administrador','Financeiro'],
        'financeiro:put'     : ['Administrador','Financeiro'],
        'financeiro:delete'  : ['Administrador','Financeiro'],
        'finrel:get'         : ['Administrador','Financeiro'],

        // === Auditoria / Backup
        'audit:get'          : ['Administrador','Financeiro'],
        'audit:csv'          : ['Administrador','Financeiro'],
        'backup:put'         : ['Administrador'],
        'backup:get'         : ['Administrador'],
        'backup:delete'      : ['Administrador'],

        // === Webhooks / Sync
        'zapsign:webhook'    : ['Administrador','Financeiro'],
        'sync:push'          : ['Administrador','Financeiro','Maitre','Vendedor','Operacional'],
        'sync:pull'          : ['Administrador','Financeiro','Maitre','Vendedor','Operacional'],
      };

      // Lê matrix salva pela tela de Permissões (permissoes.html)
      let matrix = {};
      try { matrix = JSON.parse(localStorage.getItem('permissoesAPI') || '{}') || {}; } catch {}

      // Lista de perfis autorizados para esta entidade:ação
      const allowed = Array.isArray(matrix[key]) ? matrix[key] : (DEFAULTS[key] || null);

      // Se não houver regra alguma, por padrão PERMITIR (evita travar durante implantação)
      if (!allowed) return null;

      // Checagem por nome exato do perfil (case-sensitive de apresentação)
      const ok = allowed.includes(perfilAtual);
      if (ok) return null;

      // === Negado: responder 403 + log de auditoria (M36)
      log('RBAC_DENY', String(perfilAtual || 'desconhecido'), key, `entity=${entity}; action=${action}`);
      return finish({ status: 403, error: 'forbidden' });
    } catch (e) {
      // Em caso de erro inesperado, falhar de forma permissiva (mas logar)
      try { log('RBAC_ERROR', '', `${entity}:${action}`, String(e?.message || e)); } catch {}
      return null;
    }
  }

 // ===== “Banco” local =====
  // TODO FASE F: estes dados (usuarios, logs, tokens de recuperação etc.)
  //              vão passar a vir do backend (/sync / Firestore).
  //              Aqui no localStorage vai ficar só um cache/snapshot do backend.
  const UKEY = 'usuarios';
  const LKEY = 'logs';
  const RKEY = 'recover_tokens'; // tokens de recuperação

  // === Retenção de auditoria (ajuste se quiser) ===
  const AUDIT_KEEP_DAYS = 90;   // manter só últimos 90 dias
  const AUDIT_KEEP_MAX  = 5000; // e no máximo 5.000 registros

  // === Leads / Clientes / Notificações ===
  const LEADS_KEY   = 'leads';
  const LEAD_STATUS = ['Novo','Em contato','Qualificado','Convertido','Perdido'];
  const CLIENTES_KEY   = 'clientes';
  const CLIENTE_STATUS = ['ativo','inativo'];
  const NOTIFS_KEY = 'notificacoes';

  // === Contratos & Adendos ===
   const CONTRATOS_KEY = 'contratos';

  // TODO FASE F: ler isso da API /sync em vez de localStorage.
  //              Esta função read/write hoje usa localStorage como "banco oficial".
  //              Na FASE F, vamos trocar para buscar/salvar no backend e só
  //              manter um snapshot em localStorage (cache).
  function read(key){ try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
  function write(key,val){ localStorage.setItem(key, JSON.stringify(val || [])); }
  const newId = () => (crypto.randomUUID?.() || String(Date.now() + Math.random()));

  // -- helpers para checar admin no "backend" local --
  function getUsuarioLogado() {
    try { return JSON.parse(localStorage.getItem('usuarioLogado') || 'null'); } catch { return null; }
  }
  function isAdminServer() {
    const perfil = String(getUsuarioLogado()?.perfil || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .trim().toLowerCase();
    return perfil === 'administrador' || perfil === 'admin';
  }

  // Logs de auditoria
  function log(action, actor = '', target = '', detail = '') {
    const logs = read(LKEY) || [];
    const tenantId = (localStorage.getItem('tenantId') || 'kgb').toLowerCase();

    logs.push({
      id: newId(),
      ts: Date.now(),
      action, actor, target, detail,
      tenantId
    });

    const cutoff = Date.now() - (AUDIT_KEEP_DAYS * 24 * 60 * 60 * 1000);
    let kept = logs.filter(l => Number(l?.ts || 0) >= cutoff);
    if (kept.length > AUDIT_KEEP_MAX) {
      kept.splice(0, kept.length - AUDIT_KEEP_MAX);
    }
    write(LKEY, kept);
  }

  // ===== Helpers extras usados por contratos =====
  const now = () => Date.now();

  function pushNotificacao({ tipo='interna', titulo='Contrato', descricao='', destinatario, payload }) {
    const arr = read(NOTIFS_KEY) || [];
    arr.push({
      id: (crypto.randomUUID?.() || String(Date.now()+Math.random())),
      ts: now(),
      tipo, titulo, descricao,
      lido: false,
      destinatario,
      payload
    });
    write(NOTIFS_KEY, arr);
  }

  // ============ USUÁRIOS ============
  if (endpoint === '/usuarios') {
    if (method === 'GET') {
      const deny = ensureAllowed('usuarios','get'); if (deny) return deny;
      // omite o campo 'senha' ao listar
      const data = (read(UKEY) || []).map(({ senha, ...u }) => u);
      return finish({ status: 200, data });
    }

    // POST /usuarios
    if (method === 'POST') {
      const deny = ensureAllowed('usuarios','post'); if (deny) return deny;

      const { nome, email, whatsapp, perfil, senha, foto } = body || {};
      const emailNorm = String(email || '').toLowerCase().trim();

      if (!nome || !emailNorm || !perfil) {
        return finish({ status: 400, error: 'Campos obrigatórios.' });
      }

      const db = read(UKEY);
      if (db.some(u => String(u.email || '').toLowerCase().trim() === emailNorm)) {
        return finish({ status: 409, error: 'Já existe um usuário com esse e-mail.' });
      }

      const novo = {
        id: newId(),
        nome: String(nome || '').trim(),
        email: emailNorm,
        whatsapp: String(whatsapp || ''),
        perfil: String(perfil || '').trim(),
        senha: String(senha || ''), // mantém se enviado
        // aceita base64 'data:image/...'
        foto: (typeof foto === 'string' && foto.startsWith('data:image')) ? foto : ''
      };

      const dbUsers = read(UKEY);
      dbUsers.push(novo);
      write(UKEY, dbUsers);
      log('USUARIO_POST', emailNorm, novo.id, 'Criou usuário');

      // >>> SYNC HOOK
      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('usuarios', { action: 'create', payload: novo });
      }

      return finish({ status: 201, data: novo });
    }

    if (method === 'PUT') {
      const deny = ensureAllowed('usuarios','put'); if (deny) return deny;

      if (!isAdminServer()) {
        return finish({ status: 403, error: 'Apenas administradores podem atualizar usuários.' });
      }

      const { id, ...rest } = body || {};
      if (!id) return finish({ status: 400, error: 'ID obrigatório.' });

      const db = read(UKEY);
      const idx = db.findIndex(u => String(u.id) === String(id));
      if (idx < 0) return finish({ status: 404, error: 'Usuário não encontrado.' });

      if (rest.email) rest.email = String(rest.email).toLowerCase().trim();
      // só aceita foto base64 válida
      if (typeof rest.foto === 'string' && !rest.foto.startsWith('data:image')) {
        delete rest.foto;
      }
      // impede e-mail duplicado ao atualizar
      if (rest.email) {
        const em = String(rest.email).toLowerCase().trim();
        const outro = db.find(u =>
          String(u.email || '').toLowerCase().trim() === em && String(u.id) !== String(id)
        );
        if (outro) return finish({ status: 409, error: 'Já existe um usuário com esse e-mail.' });
      }

      db[idx] = { ...db[idx], ...rest };
      write(UKEY, db);
      log('USUARIO_PUT', db[idx].email, db[idx].id, 'Atualizou usuário');

      // >>> SYNC HOOK
      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('usuarios', { action: 'update', payload: db[idx] });
      }

      return finish({ status: 200, data: db[idx] });
    }

    if (method === 'DELETE') {
      const deny = ensureAllowed('usuarios','delete'); if (deny) return deny;

      if (!isAdminServer()) {
        return finish({ status: 403, error: 'Apenas administradores podem excluir usuários.' });
      }

      let { id, email } = body || {};
      const emailNorm = String(email || '').toLowerCase().trim();
      if (!id && !emailNorm) {
        return finish({ status: 400, error: 'ID ou e-mail obrigatório.' });
      }

      const db = read(UKEY);
      const before = db.length;

      const filtered = db.filter(u => {
        const byId    = id && String(u.id) === String(id);
        const byEmail = emailNorm && String(u.email || '').toLowerCase().trim() === emailNorm;
        return !(byId || byEmail); // mantém quem NÃO é o alvo
      });

      if (filtered.length === before) {
        return finish({ status: 404, error: 'Usuário não encontrado.' });
      }

      write(UKEY, filtered);
      log('USUARIO_DELETE', emailNorm || String(id || ''), '', 'Excluiu usuário');

      // >>> SYNC HOOK
      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('usuarios', { action: 'delete', payload: { id: id || null, email: emailNorm || null } });
      }

      return finish({ status: 200, data: { removed: before - filtered.length } });
    }

    return finish({ status: 405, error: 'Método não suportado.' });
  }

  // ============ ZAPSIGN WEBHOOK ============
  // Endpoint que recebe notificações automáticas da ZapSign
  // Exemplo de corpo enviado: { contract_id, status, who, extra }
  if (endpoint === '/contracts/zapsign/webhook' && method === 'POST') {
    const ev = body || {};

    // Registra no log local quem enviou e o status atual
    log('ZAPSIGN_WEBHOOK', String(ev.who || ''), String(ev.contract_id || ''), `status=${ev.status || ''}`);

    // Cria notificação interna visível no painel
    pushNotificacao({
      tipo: 'interna',
      titulo: 'Contrato',
      descricao: `ZapSign: ${ev.status || ''}`,
      destinatario: (getUsuarioAtual()?.nome || getUsuarioAtual()?.email || '').toLowerCase(),
      payload: ev
    });

    // Retorna confirmação de sucesso
    return finish({ status: 200, data: { ok: true } });
  }

   // ============ FINANCEIRO: Métricas e Extrato ============
  // TODO FASE F: ler "financeiroGlobal" da API (ex: /sync/financeiro no backend)
  //              em vez de pegar direto do localStorage. Aqui o localStorage
  //              vai virar apenas cache das informações financeiras oficiais.
  function readFG(){
    try { return JSON.parse(localStorage.getItem('financeiroGlobal') || '{}') || {}; }
    catch { return {}; }
  }

  // Helper para gravar o snapshot atual do financeiroGlobal
  function writeFG(fg){
    try { localStorage.setItem('financeiroGlobal', JSON.stringify(fg || {})); }
    catch { /* se der erro de quota, apenas ignora */ }
  }

  function flattenLanc(fg){
    const arr = [];
    const bases = Array.isArray(fg?.lancamentos) ? fg.lancamentos : [];
    for (const l of bases){
      // normaliza tipo/valor/data
      const tipo = String(l?.tipo||'').toLowerCase(); // 'entrada' | 'saida'
      const valor = Number(l?.valor || l?.valorBruto || 0) || 0;
      const data  = String(l?.data || l?.dataCompetencia || l?.createdAt || '').slice(0,10);
      const conta = String(l?.contaNome || l?.conta || '');
      const cat   = String(l?.categoria || l?.escopo || '');
      arr.push({ tipo, valor, data, conta, cat, raw:l });
    }
    return arr;
  }


  // GET /fin/metrics?range=mes | semana | ano
  if (endpoint === '/fin/metrics' && method === 'GET') {
    const deny = ensureAllowed('finrel','get'); if (deny) return deny;

    const range = String((body?.range || 'mes')).toLowerCase();
    const hoje = new Date(); const ano = hoje.getFullYear(); const mes = hoje.getMonth();
    let ini, fim;
    if (range === 'ano'){ ini = new Date(ano,0,1);  fim = new Date(ano,11,31,23,59,59); }
    else if (range === 'semana'){ const d = hoje.getDay(); ini = new Date(hoje); ini.setDate(hoje.getDate()-d); ini.setHours(0,0,0,0); fim = new Date(ini); fim.setDate(ini.getDate()+6); fim.setHours(23,59,59,999); }
    else { ini = new Date(ano,mes,1); fim = new Date(ano,mes+1,0,23,59,59); }

    const fg = readFG(); const lancs = flattenLanc(fg);
    const inRange = lancs.filter(x => { const d = new Date(x.data||''); return d>=ini && d<=fim; });

    const entrada = inRange.filter(x=>x.tipo==='entrada').reduce((s,x)=>s+x.valor,0);
    const saida   = inRange.filter(x=>x.tipo==='saida').reduce((s,x)=>s+x.valor,0);
    const saldo   = entrada - saida;

    return finish({ status:200, data:{ range, entrada, saida, saldo, qtd: inRange.length } });
  }

  // GET /fin/relatorios/extrato?from=YYYY-MM-DD&to=YYYY-MM-DD
  if (endpoint === '/fin/relatorios/extrato' && method === 'GET') {
    const deny = ensureAllowed('finrel','get'); if (deny) return deny;

    const from = body?.from ? new Date(body.from) : new Date(0);
    const to   = body?.to   ? new Date(body.to)   : new Date(8640000000000000); // max
    const fg = readFG(); const lancs = flattenLanc(fg).filter(x=>{
      const d = new Date(x.data||''); return d>=from && d<=to;
    }).sort((a,b)=> (a.data<b.data? -1 : a.data>b.data? 1 : 0));

    return finish({ status:200, data:lancs });
  }
  // ============ FINANCEIRO: Lançamentos ============
  if (endpoint === '/fin/lancamentos') {
    const m = String(method || 'GET').toUpperCase();
    const b = body || {};
    const actor = _safeUsuarioEmail().trim();

    const fg = readFG() || {};
    fg.lancamentos = Array.isArray(fg.lancamentos) ? fg.lancamentos : [];
    let list = fg.lancamentos;

    if (m === 'GET') {
      const deny = ensureAllowed('financeiro','get'); if (deny) return deny;

      // Para começar simples: devolve todos os lançamentos ordenados do mais recente para o mais antigo.
      const resp = [...list].sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
      return finish({ status: 200, data: resp });
    }

    if (m === 'POST') {
      const deny = ensureAllowed('financeiro','post'); if (deny) return deny;

      const tipo  = String(b?.tipo || '').toLowerCase(); // 'entrada' | 'saida'
      const valor = Number(b?.valor || 0) || 0;
      const data  = String(b?.data || '').slice(0,10);

      if (!tipo || !['entrada','saida'].includes(tipo)) {
        return finish({ status: 400, error: 'tipo deve ser "entrada" ou "saida".' });
      }
      if (!data) {
        return finish({ status: 400, error: 'data é obrigatória (YYYY-MM-DD).' });
      }
      if (!valor) {
        return finish({ status: 400, error: 'valor deve ser maior que zero.' });
      }

      const novo = {
        id: newId(),
        ts: now(),
        tipo,
        valor,
        data,
        contaNome: String(b?.contaNome || b?.conta || '').trim(),
        categoria: String(b?.categoria || b?.escopo || '').trim(),
        descricao: String(b?.descricao || '').trim(),
        eventoId: b?.eventoId ? String(b.eventoId) : undefined,
        clienteId: b?.clienteId ? String(b.clienteId) : undefined,
        status: String(b?.status || '').trim() || 'aberto',
        origem: String(b?.origem || '').trim() || 'manual'
      };

      list.push(novo);
      fg.lancamentos = list;
      writeFG(fg);

      log('FIN_LANC_POST', actor, novo.id, `tipo=${novo.tipo}; valor=${novo.valor}`);

      // >>> SYNC HOOK (replica para backend remoto)
      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('financeiro_lancamentos', { action: 'create', payload: novo });
      }

      return finish({ status: 201, data: novo });
    }

    if (m === 'PUT') {
      const deny = ensureAllowed('financeiro','put'); if (deny) return deny;

      const id = String(b?.id || '').trim();
      if (!id) return finish({ status: 400, error: 'id é obrigatório.' });

      const idx = list.findIndex(l => String(l.id) === id);
      if (idx < 0) return finish({ status: 404, error: 'lançamento não encontrado.' });

      const cur = { ...(list[idx] || {}) };

      if (typeof b?.tipo !== 'undefined') {
        const t = String(b.tipo || '').toLowerCase();
        if (t && ['entrada','saida'].includes(t)) cur.tipo = t;
      }
      if (typeof b?.valor !== 'undefined') {
        cur.valor = Number(b.valor || 0) || 0;
      }
      if (typeof b?.data !== 'undefined') {
        cur.data = String(b.data || '').slice(0,10);
      }
      if (typeof b?.contaNome !== 'undefined' || typeof b?.conta !== 'undefined') {
        cur.contaNome = String(b?.contaNome || b?.conta || '').trim();
      }
      if (typeof b?.categoria !== 'undefined' || typeof b?.escopo !== 'undefined') {
        cur.categoria = String(b?.categoria || b?.escopo || '').trim();
      }
      if (typeof b?.descricao !== 'undefined') {
        cur.descricao = String(b.descricao || '').trim();
      }
      if (typeof b?.eventoId !== 'undefined') {
        cur.eventoId = b.eventoId ? String(b.eventoId) : undefined;
      }
      if (typeof b?.clienteId !== 'undefined') {
        cur.clienteId = b.clienteId ? String(b.clienteId) : undefined;
      }
      if (typeof b?.status !== 'undefined') {
        cur.status = String(b.status || '').trim() || cur.status || 'aberto';
      }

      list[idx] = cur;
      fg.lancamentos = list;
      writeFG(fg);

      log('FIN_LANC_PUT', actor, id, `valor=${cur.valor}; status=${cur.status}`);

      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('financeiro_lancamentos', { action: 'update', payload: cur });
      }

      return finish({ status: 200, data: cur });
    }

    if (m === 'DELETE') {
      const deny = ensureAllowed('financeiro','delete'); if (deny) return deny;

      const id = String(b?.id || '').trim();
      if (!id) return finish({ status: 400, error: 'id é obrigatório.' });

      const before = list.length;
      const filtered = list.filter(l => String(l.id) !== id);
      const removed = before - filtered.length;

      if (!removed) {
        return finish({ status: 404, error: 'lançamento não encontrado.' });
      }

      fg.lancamentos = filtered;
      writeFG(fg);

      log('FIN_LANC_DELETE', actor, id, `removed=${removed}`);

      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('financeiro_lancamentos', { action: 'delete', payload: { id } });
      }

      return finish({ status: 200, data: { removed } });
    }

    return finish({ status: 405, error: 'Método não suportado.' });
  }
  // ============ FINANCEIRO: Parcelas ============
  if (endpoint === '/fin/parcelas') {
    const m = String(method || 'GET').toUpperCase();
    const b = body || {};
    const actor = _safeUsuarioEmail().trim();

    const fg = readFG() || {};
    fg.parcelas = Array.isArray(fg.parcelas) ? fg.parcelas : [];
    let list = fg.parcelas;

    if (m === 'GET') {
      const deny = ensureAllowed('financeiro','get'); if (deny) return deny;

      let resp = [...list];

      // filtros opcionais simples (eventoId, lancamentoId, status)
      if (b.eventoId) {
        const evId = String(b.eventoId);
        resp = resp.filter(p => String(p.eventoId || '') === evId);
      }
      if (b.lancamentoId) {
        const lId = String(b.lancamentoId);
        resp = resp.filter(p => String(p.lancamentoId || '') === lId);
      }
      if (b.status) {
        const st = String(b.status || '').toLowerCase();
        resp = resp.filter(p => String(p.status || '').toLowerCase() === st);
      }

      resp.sort((a, b) => Number(a.ordem || a.numeroParcela || 0) - Number(b.ordem || b.numeroParcela || 0));

      return finish({ status: 200, data: resp });
    }

    if (m === 'POST') {
      const deny = ensureAllowed('financeiro','post'); if (deny) return deny;

      const eventoId = b?.eventoId ? String(b.eventoId) : '';
      const valor    = Number(b?.valor || 0) || 0;
      const venc     = String(b?.dataVencimento || b?.vencimento || '').slice(0,10);

      if (!eventoId) {
        return finish({ status: 400, error: 'eventoId é obrigatório.' });
      }
      if (!venc) {
        return finish({ status: 400, error: 'dataVencimento é obrigatória (YYYY-MM-DD).' });
      }
      if (!valor) {
        return finish({ status: 400, error: 'valor deve ser maior que zero.' });
      }

      const novo = {
        id: newId(),
        ts: now(),
        eventoId,
        lancamentoId: b?.lancamentoId ? String(b.lancamentoId) : undefined,
        valor,
        dataVencimento: venc,
        status: String(b?.status || '').trim() || 'aberta',
        numeroParcela: Number(b?.numeroParcela || b?.parcela || 0) || 0,
        totalParcelas: Number(b?.totalParcelas || b?.qtdParcelas || 0) || 0,
        descricao: String(b?.descricao || '').trim()
      };

      list.push(novo);
      fg.parcelas = list;
      writeFG(fg);

      log('FIN_PARC_POST', actor, novo.id, `evento=${eventoId}; valor=${valor}`);

      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('financeiro_parcelas', { action: 'create', payload: novo });
      }

      return finish({ status: 201, data: novo });
    }

    if (m === 'PUT') {
      const deny = ensureAllowed('financeiro','put'); if (deny) return deny;

      const id = String(b?.id || '').trim();
      if (!id) return finish({ status: 400, error: 'id é obrigatório.' });

      const idx = list.findIndex(p => String(p.id) === id);
      if (idx < 0) return finish({ status: 404, error: 'parcela não encontrada.' });

      const cur = { ...(list[idx] || {}) };

      if (typeof b?.eventoId !== 'undefined') {
        cur.eventoId = b.eventoId ? String(b.eventoId) : undefined;
      }
      if (typeof b?.lancamentoId !== 'undefined') {
        cur.lancamentoId = b.lancamentoId ? String(b.lancamentoId) : undefined;
      }
      if (typeof b?.valor !== 'undefined') {
        cur.valor = Number(b.valor || 0) || 0;
      }
      if (typeof b?.dataVencimento !== 'undefined' || typeof b?.vencimento !== 'undefined') {
        cur.dataVencimento = String(b?.dataVencimento || b?.vencimento || '').slice(0,10);
      }
      if (typeof b?.status !== 'undefined') {
        cur.status = String(b.status || '').trim() || cur.status || 'aberta';
      }
      if (typeof b?.numeroParcela !== 'undefined' || typeof b?.parcela !== 'undefined') {
        cur.numeroParcela = Number(b?.numeroParcela || b?.parcela || 0) || 0;
      }
      if (typeof b?.totalParcelas !== 'undefined' || typeof b?.qtdParcelas !== 'undefined') {
        cur.totalParcelas = Number(b?.totalParcelas || b?.qtdParcelas || 0) || 0;
      }
      if (typeof b?.descricao !== 'undefined') {
        cur.descricao = String(b.descricao || '').trim();
      }

      list[idx] = cur;
      fg.parcelas = list;
      writeFG(fg);

      log('FIN_PARC_PUT', actor, id, `status=${cur.status}`);

      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('financeiro_parcelas', { action: 'update', payload: cur });
      }

      return finish({ status: 200, data: cur });
    }

    if (m === 'DELETE') {
      const deny = ensureAllowed('financeiro','delete'); if (deny) return deny;

      const id = String(b?.id || '').trim();
      if (!id) return finish({ status: 400, error: 'id é obrigatório.' });

      const before = list.length;
      const filtered = list.filter(p => String(p.id) !== id);
      const removed = before - filtered.length;

      if (!removed) {
        return finish({ status: 404, error: 'parcela não encontrada.' });
      }

      fg.parcelas = filtered;
      writeFG(fg);

      log('FIN_PARC_DELETE', actor, id, `removed=${removed}`);

      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('financeiro_parcelas', { action: 'delete', payload: { id } });
      }

      return finish({ status: 200, data: { removed } });
    }

    return finish({ status: 405, error: 'Método não suportado.' });
  }

  // GET /fin/eventos/:id/parcelas
  if (endpoint.startsWith('/fin/eventos/') && endpoint.endsWith('/parcelas') && method === 'GET') {
    const deny = ensureAllowed('financeiro','get'); if (deny) return deny;

    // caminho esperado: /fin/eventos/:id/parcelas
    const parts = String(endpoint || '').split('/');
    // ['', 'fin', 'eventos', ':id', 'parcelas']
    const eventoId = parts[3] || '';

    const fg = readFG() || {};
    const parcelas = Array.isArray(fg.parcelas) ? fg.parcelas : [];

    const resp = parcelas
      .filter(p => String(p.eventoId || '') === String(eventoId || ''))
      .sort((a, b) => Number(a.numeroParcela || 0) - Number(b.numeroParcela || 0));

    return finish({ status: 200, data: resp });
  }

  // ============ SYNC (delegado ao firebaseSync) ============
  // POST /sync/push { entity, payload }
  if (endpoint === '/sync/push' && method === 'POST') {
    const deny = ensureAllowed('sync','push'); if (deny) return deny;

    const ent = String(body?.entity || '').trim();
    const pay = body?.payload || {};
    if (!ent) return finish({ status: 400, error: 'entity é obrigatória' });

    try {
      if (window.firebaseSync?.enabled && typeof window.firebaseSync.push === 'function') {
        const r = await window.firebaseSync.push(ent, pay);
        return finish({ status: 200, data: r || { ok: true } });
      }
      // fallback local (se stub não existir por algum motivo)
      const k = '_firebase_outbox';
      const out = (readRaw(k) || []);
      out.push({ id: (crypto.randomUUID?.() || String(Date.now()+Math.random())), ts: Date.now(), entity: ent, payload: pay });
      writeRaw(k, out);
      return finish({ status: 200, data: { ok: true, stub: true } });
    } catch (e) {
      return finish({ status: 500, error: String(e?.message || e) });
    }
  }

   // POST /sync/pull { entity, since? }
  // Corpo esperado:
  //   { entity: 'leads' | 'usuarios' | 'clientes' | ...,
  //     since?: <timestamp numero> }
  //
  // Resposta:
  //   { items: [...], nextSince: <numero> }
  //
  // Ideia: o cliente guarda localStorage["syncCheckpoint:<entity>"] = nextSince,
  //        e na próxima chamada manda esse valor em "since" para não precisar
  //        baixar tudo de novo.
  if (endpoint === '/sync/pull' && method === 'POST') {
    const deny = ensureAllowed('sync','pull'); if (deny) return deny;

    const ent   = String(body?.entity || '').trim();
    const since = body?.since != null ? Number(body.since) : 0;

    if (!ent) return finish({ status: 400, error: 'entity é obrigatória' });

    try {
      let items = [];
      let nextSince = since || 0;

      if (window.firebaseSync?.enabled && typeof window.firebaseSync.pull === 'function') {
        // nossa implementação atual de firebaseSync.pull(entity, since)
        // devolve um ARRAY simples [{ ts, payload }, ...]
        const r = await window.firebaseSync.pull(ent, since);

        if (Array.isArray(r)) {
          items = r;
          if (items.length > 0) {
            // pega o maior ts dos itens para ser o próximo checkpoint
            const lastTs = items.reduce((max, it) => {
              const t = Number(it.ts || 0);
              return t > max ? t : max;
            }, since || 0);
            nextSince = lastTs || (since || Date.now());
          } else {
            // se não veio nada novo, mantém o since (ou usa agora)
            nextSince = since || Date.now();
          }
        } else if (r && Array.isArray(r.items)) {
          // futuro: se firebaseSync.pull já devolver { items, nextSince }
          items = r.items;
          nextSince = Number(r.nextSince || since || Date.now());
        }
      }

      // fallback: se por algum motivo firebaseSync não estiver disponível
      if (!Array.isArray(items)) items = [];
      if (!nextSince) nextSince = Date.now();

      return finish({ status: 200, data: { items, nextSince } });

    } catch (e) {
      return finish({ status: 500, error: String(e?.message || e) });
    }
  }

  // ============ LOGIN ============
  if (endpoint === '/auth/login' && method === 'POST') {
    const emailNorm = String(body?.email || '').toLowerCase().trim();
    const senha     = String(body?.senha || '').trim();

    if (!emailNorm || !senha) {
      return finish({ status: 400, error: 'E-mail e senha são obrigatórios.' });
    }

    const db = read(UKEY) || [];
    const user = db.find(u => String(u.email || '').toLowerCase().trim() === emailNorm);

    if (!user || String(user.senha || '') !== senha) {
      log('LOGIN_FAIL', emailNorm, '', 'Credenciais inválidas');
      return finish({ status: 401, error: 'E-mail ou senha inválidos.' });
    }

    const perfisLista = Array.isArray(user.perfis)
      ? user.perfis
      : (user.perfil ? [user.perfil] : []);
    const perfilPrimario = user.perfil || (perfisLista[0] || 'Vendedor');

    const usuarioPayload = {
      id:    user.id || '',
      nome:  user.nome || '',
      email: emailNorm,
      perfis: perfisLista,
      perfil: perfilPrimario
    };

    const token = 'tok_' + newId();
    log('LOGIN', emailNorm, usuarioPayload.id, 'Login via /auth/login');

    return finish({
      status: 200,
      data: {
        ok: true,
        token,
        usuario: usuarioPayload,
        roles: perfisLista
      }
    });
  }

  // ============ RECUPERAÇÃO DE SENHA ============
  if (endpoint === '/auth/recover' && method === 'POST') {
    const emailNorm = String(body?.email || '').toLowerCase().trim();
    const db = read(UKEY);
    const existe = db.some(u => (u.email || '').toLowerCase().trim() === emailNorm);

    // sempre responde 200; se existir, cria token
    let token = null;
    if (existe) {
      const tokens = read(RKEY);
      token = 'rt_' + newId();
      const exp = Date.now() + 15 * 60 * 1000; // 15 min
      tokens.push({ token, email: emailNorm, exp });
      write(RKEY, tokens);
      log('RECOVER_REQUEST', emailNorm, '', 'Solicitou recuperação');
    }
    return finish({ status: 200, data: { ok: true, token } });
  }

  if (endpoint === '/auth/reset' && method === 'POST') {
    const token     = String(body?.token || '').trim();
    const novaSenha = String(body?.novaSenha || '').trim();
    if (!token || novaSenha.length < 4) {
      return finish({ status: 400, error: 'Token inválido ou senha muito curta.' });
    }

    const tokens = read(RKEY);
    const info   = tokens.find(t => t.token === token);
    if (!info) return finish({ status: 400, error: 'Token não encontrado.' });
    if (Date.now() > Number(info.exp)) {
      return finish({ status: 400, error: 'Token expirado.' });
    }

    const db  = read(UKEY);
    const idx = db.findIndex(u => (u.email || '').toLowerCase().trim() === info.email);
    if (idx < 0) return finish({ status: 404, error: 'Usuário não encontrado.' });

    db[idx].senha = novaSenha;
    write(UKEY, db);
    write(RKEY, tokens.filter(t => t.token !== token)); // remove token usado

    log('RESET_PASSWORD', info.email, db[idx].id, 'Redefiniu senha via token');
    return finish({ status: 200, data: { ok: true } });
  }

  // ============ LOGS TÉCNICOS (GET/DELETE) ============
  if (endpoint === '/__tech/logs') {
    // GET
    if (method === 'GET') {
      const arr = (readTechLogs() || [])
        .slice()
        .sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0));
      return finish({ status: 200, data: arr });
    }

    // DELETE
    if (method === 'DELETE') {
      try { localStorage.removeItem('logsTecnicos'); } catch {}
      return finish({ status: 200, data: { ok: true, removedAll: true } });
    }

    return finish({ status: 405, error: 'Método não suportado.' });
  }

  // ============ AUDITORIA (filtros + CSV) ============
  // GET /audit/log?from&to&entity&actor&tenantId
  if (endpoint === '/audit/log' && method === 'GET') {
    // lê tudo do buffer de auditoria já existente
    const data = (read(LKEY) || []).slice().sort((a,b)=>b.ts-a.ts);

    const q = body || {};
    const from = q.from ? Number(new Date(q.from)) : null;
    const to   = q.to   ? Number(new Date(q.to))   : null;
    const entity = String(q.entity||'').toLowerCase();
    const actor  = String(q.actor||'').toLowerCase();
    const tenant = String(q.tenantId||'').toLowerCase();

    const fil = data.filter(l => {
      const okFrom = from ? Number(l.ts)>=from : true;
      const okTo   = to   ? Number(l.ts)<=to   : true;
      const okEnt  = entity ? String(l.target||'').toLowerCase().includes(entity) : true;
      const okAct  = actor  ? String(l.actor||'').toLowerCase().includes(actor)   : true;
      const okTen  = tenant ? String(l.tenantId||'').toLowerCase()===tenant       : true;
      return okFrom && okTo && okEnt && okAct && okTen;
    });

    return finish({ status: 200, data: fil });
  }

  // ============ LOGS (auditoria) ============
  if (endpoint === '/logs') {
    if (method === 'GET') {
      const data = read(LKEY).sort((a, b) => b.ts - a.ts);
      return finish({ status: 200, data });
    }
    if (method === 'POST') {
      const { action, actor = '', target = '', detail = '' } = body || {};
      log(String(action || 'FRONT_LOG'), actor, target, detail);
      return finish({ status: 201, data: { ok: true } });
    }

    return finish({ status: 405, error: 'Método não suportado.' });
  }

  // ============ NOTIFICAÇÕES ============
  if (endpoint === '/notificacoes') {
    const m = String(method || 'GET').toUpperCase();
    const b = body || {};

    const readN  = () => read(NOTIFS_KEY) || [];
    const writeN = (arr) => write(NOTIFS_KEY, arr || []);

    if (m === 'GET') {
      const deny = ensureAllowed('notificacoes','get'); if (deny) return deny;

      let list = readN();

      const tipo = String(b?.tipo || '').toLowerCase().trim(); // 'interna' | 'externa'
      const somenteNaoLidas =
        b?.somenteNaoLidas === true ||
        ['1', 'true', 'sim', 'yes'].includes(String(b?.somenteNaoLidas).toLowerCase());

      if (tipo) {
        list = list.filter(n => String(n?.tipo || '').toLowerCase().includes(tipo));
      }

      // Internas: se não for admin, retorna só as minhas
      if (tipo === 'interna' && !isAdminServer()) {
        const u = getUsuarioLogado();
        const meu = String(u?.nome || u?.email || '').toLowerCase();
        list = list.filter(n =>
          String(n?.destinatario || n?.assignedTo || '').toLowerCase() === meu
        );
      }

      if (somenteNaoLidas) {
        list = list.filter(n => !n?.lido);
      }

      list.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
      return finish({ status: 200, data: list });
    }

    if (m === 'POST') {
      const deny = ensureAllowed('notificacoes','post'); if (deny) return deny;

      const arr = readN();
      const novo = {
        id: (crypto.randomUUID?.() || String(Date.now()+Math.random())),
        ts: Date.now(),
        tipo: String(b?.tipo || 'externa').toLowerCase(),
        leadId: b?.leadId ? String(b.leadId) : undefined,
        titulo: String(b?.titulo || 'Notificação'),
        descricao: String(b?.descricao || ''),
        lido: false,
        destinatario: b?.destinatario ? String(b.destinatario) : undefined,
        payload: b?.payload || undefined
      };
      arr.push(novo);
      writeN(arr);

      // (opcional) sync notificações:
      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('notificacoes', { action: 'create', payload: novo });
      }

      return finish({ status: 201, data: novo });
    }

    if (m === 'PUT') {
      const deny = ensureAllowed('notificacoes','put'); if (deny) return deny;

      const id = String(b?.id || '');
      const arr = readN();
      const ix = arr.findIndex(n => String(n.id) === id);
      if (ix < 0) return finish({ status: 404, error: 'Notificação não encontrada.' });

      // atualizações simples
      if (typeof b?.lido         !== 'undefined') arr[ix].lido         = !!b.lido;
      if (typeof b?.destinatario !== 'undefined') arr[ix].destinatario = String(b.destinatario || '');
      if (typeof b?.descricao    !== 'undefined') arr[ix].descricao    = String(b.descricao || '');
      if (typeof b?.titulo       !== 'undefined') arr[ix].titulo       = String(b.titulo || '');
      if (typeof b?.tipo         !== 'undefined') arr[ix].tipo         = String(b.tipo || '').toLowerCase();

      writeN(arr);

      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('notificacoes', { action: 'update', payload: arr[ix] });
      }

      return finish({ status: 200, data: arr[ix] });
    }

    if (m === 'DELETE') {
      const deny = ensureAllowed('notificacoes','delete'); if (deny) return deny;

      const id = String(b?.id || '');
      const arr = readN();
      const before = arr.length;
      const filtered = arr.filter(n => String(n.id) !== id);
      if (filtered.length === before) return finish({ status: 404, error: 'Notificação não encontrada.' });
      writeN(filtered);

      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('notificacoes', { action: 'delete', payload: { id } });
      }

      return finish({ status: 200, data: { removed: before - filtered.length } });
    }

    return finish({ status: 405, error: 'método não suportado' });
  }

  // ============ LEADS ============
  if (endpoint === '/leads') {
    const m = String(method || 'GET').toUpperCase();
    const b = body || {};

    const normalizeWhats = (v) => String(v || '').replace(/\D/g, '');
    const validStatus = (s) => LEAD_STATUS.includes(String(s || '').trim());
    const actor = _safeUsuarioEmail().trim();

    if (m === 'GET') {
      const deny = ensureAllowed('leads','get'); if (deny) return deny;
      let list = read(LEADS_KEY) || [];
      if (b && b.status) {
        const st = String(b.status).trim().toLowerCase();
        list = list.filter(x =>
          String(x.status || '').trim().toLowerCase() === st
        );
      }

      list.sort((a,b)=> Number(b.ts||0) - Number(a.ts||0));
      return finish({ status: 200, data: list });
    }

    if (m === 'POST') {
      const deny = ensureAllowed('leads','post'); if (deny) return deny;

      const nome = String(b?.nome || '').trim();
      const whatsapp = normalizeWhats(b?.whatsapp);
      if (!nome || !whatsapp) return finish({ status: 400, error: 'Nome e WhatsApp são obrigatórios.' });

      const novo = {
        id: (crypto.randomUUID?.() || String(Date.now()+Math.random())),
        ts: Date.now(),
        nome,
        whatsapp,
        origem: String(b?.origem || '').trim(),
        email: String(b?.email || '').trim(),
        nota: String(b?.nota || '').trim(),
        status: validStatus(b?.status) ? String(b.status).trim() : 'Novo',
        responsavel: actor || null
      };

      const dbPost = read(LEADS_KEY) || [];
      dbPost.push(novo);
      write(LEADS_KEY, dbPost);

      log('LEAD_POST', actor, novo.id, `nome=${novo.nome}`);

      // >>> SYNC HOOK
      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('leads', { action: 'create', payload: novo });
      }

      return finish({ status: 201, data: novo });
    }

    if (m === 'PUT') {
      const deny = ensureAllowed('leads','put'); if (deny) return deny;
      const id = b?.id;
      if (!id) return finish({ status: 400, error: 'id é obrigatório' });

      const db = read(LEADS_KEY) || [];
      const idx = db.findIndex(x => String(x.id) === String(id));
      if (idx < 0) return finish({ status: 404, error: 'lead não encontrado' });

      const cur = { ...db[idx] };
      if (typeof b.nome        !== 'undefined') cur.nome        = String(b.nome || '').trim();
      if (typeof b.whatsapp    !== 'undefined') cur.whatsapp    = normalizeWhats(b.whatsapp);
      if (typeof b.origem      !== 'undefined') cur.origem      = String(b.origem || '').trim();
      if (typeof b.email       !== 'undefined') cur.email       = String(b.email  || '').trim();
      if (typeof b.nota        !== 'undefined') cur.nota        = String(b.nota   || '').trim();
      if (typeof b.status      !== 'undefined' && validStatus(b.status)) cur.status = String(b.status).trim();
      if (typeof b.responsavel !== 'undefined') cur.responsavel = String(b.responsavel || '').trim() || null;
      // vincular lead → cliente (opcional, sem alterar status)
      if (typeof b.clienteId !== 'undefined') {
        const cid = String(b.clienteId || '').trim();
        cur.clienteId = cid || undefined;
      }

      db[idx] = cur;
      write(LEADS_KEY, db);

      log('LEAD_PUT', actor, String(id), `status=${cur.status || ''}`);

      // >>> SYNC HOOK
      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('leads', { action: 'update', payload: cur });
      }

      return finish({ status: 200, data: cur });
    }

    if (m === 'DELETE') {
      const deny = ensureAllowed('leads','delete'); if (deny) return deny;
      const id = b?.id;
      if (!id) return finish({ status: 400, error: 'id é obrigatório' });

      const db = read(LEADS_KEY) || [];
      const idx = db.findIndex(x => String(x.id) === String(id));
      if (idx < 0) return finish({ status: 404, error: 'lead não encontrado' });

      const removed = db[idx];
      db.splice(idx, 1);
      write(LEADS_KEY, db);

      log('LEAD_DELETE', actor, String(id), `removido ${removed?.nome || ''}`);

      // >>> SYNC HOOK
      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('leads', { action: 'delete', payload: { id: String(id) } });
      }

      return finish({ status: 200, data: { id: String(id) } });
    }

    return finish({ status: 405, error: 'método não suportado' });
  } // <-- fecha: if (endpoint === '/leads')

  // ============ CLIENTES ============
  if (endpoint === '/clientes') {
    const m = String(method || 'GET').toUpperCase();
    const b = body || {};

    const normalizeWhats = (v) => String(v || '').replace(/\D/g, '');
    const actor = _safeUsuarioEmail().trim();

    // contatos dinâmicos (mantém compat com relacao1/2)
    const normContato = (c = {}) => ({
      tipo: String(c?.parentesco || c?.tipo || '').trim(),
      nome: String(c?.nome || '').trim(),
      whatsapp: normalizeWhats(c?.whatsapp),
      email: String(c?.email || '').trim(),
      obs: String(c?.obs || '').trim()
    });
    const normContatos = (arr = []) =>
      (Array.isArray(arr) ? arr.map(normContato).filter(x => (x.tipo || x.nome || x.whatsapp || x.email || x.obs)) : []);

    if (m === 'GET') {
      const deny = ensureAllowed('clientes','get'); if (deny) return deny;
      let list = read(CLIENTES_KEY) || [];
      if (b && b.status) {
        const st = String(b.status).toLowerCase().trim();
        list = list.filter(x => String(x.status || '').toLowerCase() === st);
      }
      list.sort((a,b)=> Number(b.ts||0) - Number(a.ts||0));
      return finish({ status: 200, data: list });
    }

    if (m === 'POST') {
      const deny = ensureAllowed('clientes','post'); if (deny) return deny;

      const nome = String(b?.nome || '').trim();
      if (!nome) return finish({ status: 400, error: 'Nome é obrigatório.' });

      const email = String(b?.email || '').trim().toLowerCase();
      const whatsapp = normalizeWhats(b?.whatsapp || b?.telefone);

      const endereco = {
        cep:    String(b?.cep || '').trim(),
        numero: String(b?.numero || '').trim(),
        rua:    String(b?.rua || '').trim(),
        bairro: String(b?.bairro || '').trim(),
        cidade: String(b?.cidade || '').trim(),
        uf:     String(b?.estado || b?.uf || '').trim()
      };

      let relacoes = [];
      if (Array.isArray(b?.contatos)) {
        relacoes = normContatos(b.contatos);
      } else {
        relacoes = [
          { tipo: String(b?.relacao1 || ''), obs: String(b?.obsRelacao1 || '') },
          { tipo: String(b?.relacao2 || ''), obs: String(b?.obsRelacao2 || ''), whatsapp: normalizeWhats(b?.whatsRelacao2) }
        ].filter(r => (r.tipo || r.obs || r.whatsapp));
      }

      const novo = {
        id: newId(),
        ts: Date.now(),
        nome,
        email,
        whatsapp,
        cpfCnpj: String(b?.cpfCnpj || b?.cpf || '').trim(),
        rg: String(b?.rg || '').trim(),
        nascimento: String(b?.nascimento || '').trim(),
        status: CLIENTE_STATUS.includes(String(b?.status || '').toLowerCase()) ? String(b.status).toLowerCase() : 'ativo',
        endereco,
        relacoes,
        documentos: Array.isArray(b?.documentos) ? b.documentos : [],
        leadId: b?.leadId ? String(b.leadId) : undefined,
        responsavel: actor || null
      };

      const db = read(CLIENTES_KEY) || [];
      db.push(novo);
      write(CLIENTES_KEY, db);

      // relação com lead (opcional)
      if (novo.leadId) {
        const leads = read(LEADS_KEY) || [];
        const li = leads.findIndex(x => String(x.id) === String(novo.leadId));
        if (li >= 0) {
          const L = { ...leads[li] };
          L.clienteId = novo.id; // apenas vincula; NÃO altera status automaticamente
          leads[li] = L;
          write(LEADS_KEY, leads);
        }
      }

      log('CLIENTE_POST', actor, novo.id, `nome=${novo.nome}`);

      // >>> SYNC HOOK
      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('clientes', { action: 'create', payload: novo });
      }

      return finish({ status: 201, data: novo });
    }

    if (m === 'PUT') {
      const deny = ensureAllowed('clientes','put'); if (deny) return deny;
      const id = b?.id;
      if (!id) return finish({ status: 400, error: 'id é obrigatório' });

      const db = read(CLIENTES_KEY) || [];
      const idx = db.findIndex(x => String(x.id) === String(id));
      if (idx < 0) return finish({ status: 404, error: 'cliente não encontrado' });

      const cur = { ...db[idx] };

      const set = (cond, key, transform = (x)=>x) => {
        if (typeof cond !== 'undefined') cur[key] = transform(cond);
      };

      set(b?.nome, 'nome', v => String(v).trim());
      set(b?.email, 'email', v => String(v).trim().toLowerCase());
      set((typeof b?.whatsapp !== 'undefined' ? b?.whatsapp : b?.telefone), 'whatsapp', normalizeWhats);
      set(b?.cpfCnpj ?? b?.cpf, 'cpfCnpj', v => String(v || '').trim());
      set(b?.rg, 'rg', v => String(v || '').trim());
      set(b?.nascimento, 'nascimento', v => String(v || '').trim());

      if (typeof b?.status !== 'undefined') {
        const s = String(b.status).toLowerCase();
        if (CLIENTE_STATUS.includes(s)) cur.status = s;
      }

      if (
        typeof b?.cep    !== 'undefined' ||
        typeof b?.numero !== 'undefined' ||
        typeof b?.rua    !== 'undefined' ||
        typeof b?.bairro !== 'undefined' ||
        typeof b?.cidade !== 'undefined' ||
        typeof b?.estado !== 'undefined' || typeof b?.uf !== 'undefined'
      ) {
        const end = { ...(cur.endereco || {}) };
        if (typeof b?.cep    !== 'undefined') end.cep    = String(b.cep || '').trim();
        if (typeof b?.numero !== 'undefined') end.numero = String(b.numero || '').trim();
        if (typeof b?.rua    !== 'undefined') end.rua    = String(b.rua || '').trim();
        if (typeof b?.bairro !== 'undefined') end.bairro = String(b.bairro || '').trim();
        if (typeof b?.cidade !== 'undefined') end.cidade = String(b.cidade || '').trim();
        if (typeof b?.estado !== 'undefined' || typeof b?.uf !== 'undefined') end.uf = String(b.estado || b.uf || '').trim();
        cur.endereco = end;
      }

      if (Array.isArray(b?.contatos)) {
        cur.relacoes = normContatos(b.contatos);
      } else if (
        typeof b?.relacao1 !== 'undefined' || typeof b?.relacao2 !== 'undefined' ||
        typeof b?.obsRelacao1 !== 'undefined' || typeof b?.obsRelacao2 !== 'undefined' ||
        typeof b?.whatsRelacao2 !== 'undefined'
      ) {
        const rels = [...(cur.relacoes || [])];
        rels[0] = { ...(rels[0] || {}) };
        rels[1] = { ...(rels[1] || {}) };
        if (typeof b?.relacao1 !== 'undefined')    rels[0].tipo = String(b.relacao1 || '');
        if (typeof b?.obsRelacao1 !== 'undefined') rels[0].obs  = String(b.obsRelacao1 || '');
        if (typeof b?.relacao2 !== 'undefined')    rels[1].tipo = String(b.relacao2 || '');
        if (typeof b?.obsRelacao2 !== 'undefined') rels[1].obs  = String(b.obsRelacao2 || '');
        if (typeof b?.whatsRelacao2 !== 'undefined') rels[1].whatsapp = normalizeWhats(b.whatsRelacao2);
        cur.relacoes = rels.filter(r => (r?.tipo || r?.obs || r?.whatsapp));
      }

      if (Array.isArray(b?.documentos)) cur.documentos = b.documentos;

      db[idx] = cur;
      write(CLIENTES_KEY, db);

      log('CLIENTE_PUT', actor, String(id), `nome=${cur.nome || ''}`);

      // >>> SYNC HOOK
      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('clientes', { action: 'update', payload: cur });
      }

      return finish({ status: 200, data: cur });
    }

    if (m === 'DELETE') {
      const deny = ensureAllowed('clientes','delete'); if (deny) return deny;
      const id = b?.id;
      if (!id) return finish({ status: 400, error: 'id é obrigatório' });

      const db = read(CLIENTES_KEY) || [];
      const idx = db.findIndex(x => String(x.id) === String(id));
      if (idx < 0) return finish({ status: 404, error: 'cliente não encontrado' });

      const removed = db[idx];
      db.splice(idx, 1);
      write(CLIENTES_KEY, db);

      log('CLIENTE_DELETE', actor, String(id), `removido ${removed?.nome || ''}`);

      // >>> SYNC HOOK
      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('clientes', { action: 'delete', payload: { id: String(id) } });
      }

      return finish({ status: 200, data: { id: String(id) } });
    }

    return finish({ status: 405, error: 'método não suportado' });
  }

  // ============ CONTRATOS & ADENDOS ============
  if (endpoint === '/contratos') {
    const m = String(method || 'GET').toUpperCase();
    const b = body || {};
    const actor = _safeUsuarioEmail().trim();
    const readContratos  = () => read(CONTRATOS_KEY) || [];
    const writeContratos = (arr) => write(CONTRATOS_KEY, arr || []);

    if (m === 'GET') {
      const deny = ensureAllowed('contratos','get'); if (deny) return deny;
      let list = readContratos();
      if (b.id)       list = list.filter(c => String(c.id) === String(b.id));
      if (b.eventoId) list = list.filter(c => String(c.eventoId) === String(b.eventoId));
      list.sort((a,b) => Number(b.ts||0) - Number(a.ts||0));
      return finish({ status: 200, data: list });
    }

    if (m === 'POST') {
      const deny = ensureAllowed('contratos','post'); if (deny) return deny;

      const eventoId = String(b?.eventoId || '').trim();
      if (!eventoId) return finish({ status: 400, error: 'eventoId é obrigatório.' });

      const novo = {
        id: newId(),
        ts: now(),
        eventoId,
        // 'contrato' | 'adendo'
        tipo: String(b?.tipo || 'contrato').toLowerCase(),
        titulo: String(b?.titulo || (b?.tipo === 'adendo' ? 'Adendo' : 'Contrato')).trim(),
        html: String(b?.html || ''),          // opcional: html base
        pdf: b?.pdf || null,                  // opcional: dataURL/base64 do PDF gerado
        signers: Array.isArray(b?.signers) ? b.signers : [], // [{nome,email,whatsapp,role,status}]
        provider: 'zapsign',
        providerDocId: b?.providerDocId || null,
        status: 'rascunho',                   // 'rascunho'|'enviado'|'assinado'|'recusado'|'expirado'|'cancelado'
        statusTs: now(),
        timeline: [{ ts: now(), by: actor, action: 'CRIADO' }]
      };

      const arr = readContratos();
      arr.push(novo);
      writeContratos(arr);
      log('CONTRATO_POST', actor, novo.id, `evento=${eventoId}; tipo=${novo.tipo}`);

      // >>> SYNC HOOK
      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('contratos', { action: 'create', payload: novo });
      }

      return finish({ status: 201, data: novo });
    }

    if (m === 'PUT') {
      const deny = ensureAllowed('contratos','put'); if (deny) return deny;

      const id = String(b?.id || '').trim();
      if (!id) return finish({ status: 400, error: 'id é obrigatório.' });

      const arr = readContratos();
      const ix = arr.findIndex(c => String(c.id) === id);
      if (ix < 0) return finish({ status: 404, error: 'Contrato não encontrado.' });

      const cur = { ...arr[ix] };
      const beforeStatus = cur.status;

      // campos permitidos
      if (typeof b?.html          !== 'undefined') cur.html = String(b.html || '');
      if (typeof b?.pdf           !== 'undefined') cur.pdf  = b.pdf || null;
      if (typeof b?.signers       !== 'undefined' && Array.isArray(b.signers)) cur.signers = b.signers;
      if (typeof b?.providerDocId !== 'undefined') cur.providerDocId = b.providerDocId || null;
      if (typeof b?.titulo        !== 'undefined') cur.titulo = String(b.titulo || '').trim();
      if (typeof b?.status        !== 'undefined') {
        const s = String(b.status).toLowerCase().trim();
        cur.status = s;
        cur.statusTs = now();
        cur.timeline = [...(cur.timeline || []), { ts: now(), by: actor || 'sistema', action: `STATUS_${s.toUpperCase()}` }];
      }

      arr[ix] = cur;
      writeContratos(arr);

      // Notificações “inteligentes”
      if (beforeStatus !== cur.status) {
        const titulo = `${cur.tipo === 'adendo' ? 'Adendo' : 'Contrato'} ${cur.titulo || ''} – ${cur.status.toUpperCase()}`;
        pushNotificacao({
          titulo,
          descricao: `Evento ${cur.eventoId} • Status alterado para ${cur.status}`,
          payload: { contratoId: cur.id, eventoId: cur.eventoId, status: cur.status }
        });
      }

      log('CONTRATO_PUT', actor, id, `status=${cur.status || ''}`);

      // >>> SYNC HOOK
      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('contratos', { action: 'update', payload: cur });
      }

      return finish({ status: 200, data: cur });
    }

    if (m === 'DELETE') {
      const deny = ensureAllowed('contratos','delete'); if (deny) return deny;

      const id = String(b?.id || '').trim();
      if (!id) return finish({ status: 400, error: 'id é obrigatório.' });

      const arr = readContratos();
      const before = arr.length;
      const filtered = arr.filter(c => String(c.id) !== id);
      if (filtered.length === before) return finish({ status: 404, error: 'Contrato não encontrado.' });

      writeContratos(filtered);
      log('CONTRATO_DELETE', actor, id, 'Removido');

      // >>> SYNC HOOK
      if (window.firebaseSync?.enabled) {
        void window.firebaseSync.push('contratos', { action: 'delete', payload: { id } });
      }

      return finish({ status: 200, data: { removed: before - filtered.length } });
    }

    return finish({ status: 405, error: 'Método não suportado.' });
  } // <-- fecha: if (endpoint === '/contratos')

  // === [PATCH FASE F] — Backup/Snapshot ===================================
  if (endpoint === '/backup/snapshot') {
    // usa o finish() desta função
    const m = String(method || 'GET').toUpperCase();
    const b = body || {};
    const tenantId = (b.tenantId != null) ? String(b.tenantId).toLowerCase() : '';

    if (m !== 'DELETE' && !tenantId) {
      return finish({ status: 400, error: 'tenant_required' });
    }

    if (m === 'GET') {
      // opcional RBAC local
      const deny = typeof ensureAllowed === 'function' ? ensureAllowed('backup','get') : null;
      if (deny) return deny;
      const data = __listSnapshots(tenantId);
      return finish({ status: 200, data });
    }

    if (m === 'PUT') {
      const deny = typeof ensureAllowed === 'function' ? ensureAllowed('backup','put') : null;
      if (deny) return deny;

      const snapshot = b?.snapshot;
      if (!snapshot || typeof snapshot !== 'object') {
        return finish({ status: 400, error: 'invalid_snapshot' });
      }
      const meta = __addSnapshot(tenantId, snapshot);
      return finish({ status: 201, data: { id: meta.id, ts: meta.ts, bytes: meta.bytes } });
    }

    if (m === 'DELETE') {
      const deny = typeof ensureAllowed === 'function' ? ensureAllowed('backup','delete') : null;
      if (deny) return deny;

      const id = b?.id;
      if (!id) return finish({ status: 400, error: 'id_required' });
      const removed = __deleteSnapshot(id);
      return finish({ status: 200, data: { removed } });
    }

    return finish({ status: 405, error: 'method_not_allowed' });
  }
  // === [/PATCH] ============================================================

  // ============ WEBHOOK / ZapSign (simulador local) ============
  if (endpoint === '/assinaturas/zapsign/webhook' && method === 'POST') {
    const { providerDocId, status, signedPdf } = body || {};
    if (!providerDocId || !status) return finish({ status: 400, error: 'providerDocId e status são obrigatórios.' });

    const arr = read(CONTRATOS_KEY) || [];
    const ix = arr.findIndex(c => String(c.providerDocId || '') === String(providerDocId));
    if (ix < 0) return finish({ status: 404, error: 'Contrato não localizado para este providerDocId.' });

    arr[ix].status = String(status).toLowerCase();
    arr[ix].statusTs = now();
    if (signedPdf) arr[ix].pdf = signedPdf;
    arr[ix].timeline = [...(arr[ix].timeline || []), { ts: now(), by: 'webhook:zapsign', action: `STATUS_${String(status).toUpperCase()}` }];
    write(CONTRATOS_KEY, arr);

    // >>> SYNC HOOK (opcional)
    if (window.firebaseSync?.enabled) {
      void window.firebaseSync.push('contratos', { action: 'webhook', payload: { providerDocId, status, id: arr[ix].id } });
    }

    // alerta interno
    pushNotificacao({
      titulo: 'Assinatura atualizada',
      descricao: `Contrato ${arr[ix].id} → ${arr[ix].status.toUpperCase()}`,
      payload: { contratoId: arr[ix].id, eventoId: arr[ix].eventoId, status: arr[ix].status }
    });

    log('ZAPSIGN_WEBHOOK', 'zapsign', arr[ix].id, `status=${arr[ix].status}`);
    return finish({ status: 200, data: { ok: true } });
  }

  // 404 default (fallback para qualquer endpoint não tratado acima)
  return finish({ status: 404, error: 'Endpoint não encontrado.' });
} // <-- fecha: export function handleRequestLocal

// --- auto-switch para backend remoto quando __API_BASE__ estiver definido ---
// caminho correto, pois routes.js está em /api
import { handleRequest as handleRequestRemote } from './remote-adapter.js';


// Mantém compatibilidade: quem "importa handleRequest" continua funcionando
export function handleRequest(...args) {
  // Se estiver rodando em ambiente sem window (ex.: testes em Node),
  // ainda usa o backend local baseado em localStorage.
  if (typeof window === 'undefined') {
    return handleRequestLocal(...args);
  }

  // No navegador (Netlify, celular, tablet, outros PCs), SEMPRE usa a API remota.
  // Se a API estiver fora do ar ou __API_BASE__ não estiver configurada,
  // a chamada vai falhar com erro, em vez de salvar no localStorage.
  return handleRequestRemote(...args);
}

