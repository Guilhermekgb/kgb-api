// api/firebase-stub.js
// Implementação simples de firebaseSync.push/pull "de verdade".
// Ideia: se existir configuração do Firebase (window.__FIREBASE_CONFIG__),
// tentamos gravar as alterações em coleções do Firestore via REST.
// Se não existir (ou der erro), caímos em um fallback local (_firebase_outbox)
// só para não quebrar o sistema.

(function initFirebaseSync(){
  // Utilitários de leitura/escrita segura no localStorage
  function readJSON(key, def) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return def;
      return JSON.parse(raw);
    } catch {
      return def;
    }
  }

  function writeJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      // sem stress se der erro de quota
    }
  }

  // Pequeno helper para pegar dados do Firestore
  function getFirestoreInfo() {
    try {
      const cfg = window.__FIREBASE_CONFIG__ || {};
      const projectId = cfg.projectId;
      const apiKey    = cfg.apiKey;
      if (!projectId || !apiKey) return null;

      const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
      return { baseUrl, apiKey };
    } catch {
      return null;
    }
  }

  // Cria um documento em uma coleção do Firestore.
  // Aqui salvamos tudo dentro de um campo "json" (string) + "ts" (timestamp).
  async function firestoreCreateDoc(collection, data) {
    const info = getFirestoreInfo();
    if (!info) throw new Error('Firestore não configurado');

    const { baseUrl, apiKey } = info;

    const body = {
      fields: {
        ts:   { integerValue: String(data.ts || Date.now()) },
        json: { stringValue: JSON.stringify(data || {}) }
      }
    };

    const res = await fetch(
      `${baseUrl}/${encodeURIComponent(collection)}?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Falha ao gravar no Firestore (${res.status}): ${txt}`);
    }

    return res.json().catch(() => ({}));
  }

  // Lista documentos de uma coleção do Firestore (simples, sem filtros).
  async function firestoreListDocs(collection) {
    const info = getFirestoreInfo();
    if (!info) throw new Error('Firestore não configurado');

    const { baseUrl, apiKey } = info;

    const res = await fetch(
      `${baseUrl}/${encodeURIComponent(collection)}?key=${encodeURIComponent(apiKey)}`
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Falha ao ler do Firestore (${res.status}): ${txt}`);
    }

    const json = await res.json().catch(() => ({}));
    const docs = Array.isArray(json.documents) ? json.documents : [];

    // Converte os documents no formato simples { ts, payload }
    return docs.map(doc => {
      const f = doc.fields || {};
      const ts = Number(f.ts && f.ts.integerValue || 0);
      let payload = null;
      try {
        payload = JSON.parse(f.json && f.json.stringValue || 'null');
      } catch {
        payload = null;
      }
      return { ts, payload };
    });
  }

  // Implementação principal do firebaseSync
  const firebaseSyncImpl = {
    // flag "ligado": pode ser forçada em firebase-config.js
    enabled: true,

    /**
     * push(entity, payload)
     * entity: nome da entidade (ex.: 'usuarios', 'contratos', 'eventos')
     * payload: em geral { action: 'create|update|delete|webhook', payload: {...} }
     */
    async push(entity, payload) {
      const ent = String(entity || '').trim();
      if (!ent) return { ok: false, error: 'entity_vazia' };

      const now = Date.now();

      // Normaliza o formato que vamos guardar
      const normalized = {
        entity: ent,
        ts: now,
        // se vier no padrão { action, payload }, respeitamos;
        // se não, guardamos tudo em "payload".
        action: (payload && payload.action) || 'unknown',
        payload: (payload && payload.payload !== undefined)
          ? payload.payload
          : payload
      };

      // 1) Tenta Firestore (se tiver config)
      const info = getFirestoreInfo();
      if (info) {
        try {
          const collection = `m36_sync_${ent}`;
          await firestoreCreateDoc(collection, normalized);
          return { ok: true, remote: true };
        } catch (e) {
          // se der erro, logamos no console e caímos no fallback local
          console.warn('[firebaseSync.push] Erro Firestore, usando fallback local:', e);
        }
      }

      // 2) Fallback local: joga no "_firebase_outbox" (para não perder nada)
      const k = '_firebase_outbox';
      const out = readJSON(k, []);
      out.push(normalized);
      writeJSON(k, out);

      return { ok: true, stub: true, stored: 'local_outbox' };
    },

    /**
     * pull(entity, since)
     * entity: nome da entidade
     * since (opcional): timestamp mínimo de atualização.
     * Retorno (por enquanto): array simples [{ ts, payload }, ...]
     * (Na ETAPA 1.2 vamos evoluir para { items, nextSince } na rota /sync/pull.)
     */
    async pull(entity, since) {
      const ent = String(entity || '').trim();
      if (!ent) return [];

      const minTs = Number(since || 0);

      const info = getFirestoreInfo();
      if (!info) {
        // Sem Firestore configurado → nada "novo" online.
        return [];
      }

      try {
        const collection = `m36_sync_${ent}`;
        const docs = await firestoreListDocs(collection);

        // Filtra por timestamp, se fornecido
        const filtered = docs
          .filter(x => typeof x.ts === 'number' && x.ts > minTs)
          .sort((a, b) => a.ts - b.ts);

        return filtered;
      } catch (e) {
        console.warn('[firebaseSync.pull] Erro ao ler do Firestore:', e);
        return [];
      }
    }
  };

  // Expõe no window, preservando algo que já exista
  if (typeof window !== 'undefined') {
    window.firebaseSync = window.firebaseSync || {};
    // copia propriedades sem apagar outras que já possam existir
    Object.assign(window.firebaseSync, firebaseSyncImpl);
  }
})();
