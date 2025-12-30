// fin-cobranca-integ.js
// Ponte entre o modal financeiro e a API de pagamentos (Mercado Pago / outro gateway).

(function () {

  const LS_KEY = 'm14_integracoes';

  // Lê configurações salvas na tela Integrações (gateway, pixKey)
  function loadIntegracoesCfg() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      console.warn('[fin-cobranca-integ] erro ao ler m14_integracoes', e);
      return {};
    }
  }

  // Descobre a base da API (mesma lógica usada nas outras telas)
  function getApiBase() {
    try {
      if (typeof window !== 'undefined') {
        if (typeof window.__API_BASE__ === 'string' && window.__API_BASE__) {
          return window.__API_BASE__.replace(/\/$/, '');
        }
      }
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('API_BASE');
        if (raw) return String(raw).replace(/\/$/, '');
      }
    } catch (e) {
      console.warn('[fin-cobranca-integ] erro ao ler API_BASE', e);
    }
    return '';
  }

  // Chama a API para criar a cobrança
  async function apiCriarCobrancaOnline(body) {
    const base = getApiBase();          // ex.: same-origin (window.__API_BASE__)
    const url  = base + '/api/integracoes/payments/cobranca';

    // Se o projeto estiver usando handleRequest, aproveita
    if (typeof window.handleRequest === 'function') {
      return await window.handleRequest(url, {
        method: 'POST',
        body
      });
    }

    // Fallback simples com fetch
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || (data && data.ok === false)) {
      const msg = (data && data.message) || 'Não foi possível criar a cobrança.';
      throw new Error(msg);
    }
    return data;
  }

// Integração de cobrança bancária (Mercado Pago)
window.gerarCobrancaBancaria = async function (payload) {
  try {
    // AGORA usamos a API nova que fala com o Mercado Pago de verdade
    const resp = await apiCriarCobrancaOnline(payload);

    // LOG pra gente ver no console o que o backend devolve
    console.log('[cobranca] resposta do backend:', resp);
    console.log('[cobranca] payload enviado:', payload);

    if (!resp || resp.ok === false) {
      console.error('[cobranca] resposta inválida do backend:', resp);
      alert(resp?.message || 'Não foi possível criar a cobrança no gateway.');
      return false;
    }

    // o método vem de resp.tipo OU de payload.cobranca.metodo
    const metodo = (resp.tipo || payload?.cobranca?.metodo || '').toLowerCase();

    // Feedback geral
    alert(`Cobrança criada com sucesso no gateway: ${resp.gateway || 'mercadopago'}.`);

    // Decide o que fazer conforme o método
    if (metodo === 'pix') {
      if (typeof window.openPixModal === 'function') {
        window.openPixModal(resp, payload);
      } else {
        console.warn('[cobranca] openPixModal não está definida.');
      }
    } else if (metodo === 'boleto') {
      if (typeof window.openBoletoModal === 'function') {
        window.openBoletoModal(resp, payload);
      } else {
        console.warn('[cobranca] openBoletoModal não está definida.');
      }
    } else if (metodo === 'cartao') {
      if (typeof window.openCartaoModal === 'function') {
        window.openCartaoModal(resp, payload);
      } else {
        console.warn('[cobranca] openCartaoModal não está definida.');
      }
    } else {
      console.warn('[cobranca] método de pagamento desconhecido:', metodo);
    }

    return true;
  } catch (e) {
    console.error('[cobranca] erro geral:', e);
    alert(e?.message || 'Falha ao criar a cobrança no gateway. Tente novamente em instantes.');
    return false;
  }
};


function formatValorBR(v) {
  const n = Number(v || 0) / (String(v).length > 4 ? 100 : 1); // tenta adivinhar se veio em centavos
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Mostrar modal com QR + código copia/cola + botão WhatsApp
function openPixModal(resp, payloadBase) {
  const pix = resp.pix || {};
  const valor = resp.valor ?? payloadBase.total ?? payloadBase.valor ?? 0;
  const desc  = payloadBase?.descricao || payloadBase?.desc || 'Cobrança';

  const qrBase64   = pix.qr_base64 || pix.qrCodeBase64 || pix.qr_code_base64 || '';
  const copiaCola  = pix.copia_cola || pix.qr_code || pix.code || '';
  const linkPgto   = pix.checkout_url || pix.link || resp.checkout_url || '';

  // Remove qualquer modal antigo
  document.querySelectorAll('.pix-modal-overlay').forEach(el => el.remove());

  const wrap = document.createElement('div');
  wrap.className = 'pix-modal-overlay';
  wrap.style.cssText = `
    position:fixed; inset:0;
    background:rgba(15,23,42,.55);
    display:flex; align-items:center; justify-content:center;
    z-index:99999; padding:16px;
  `;

  const box = document.createElement('div');
  box.style.cssText = `
    width:min(420px, 96vw);
    background:#fff;
    border-radius:16px;
    box-shadow:0 20px 50px rgba(15,23,42,.35);
    padding:18px 18px 16px;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    color:#0f172a;
    display:flex; flex-direction:column; gap:12px;
  `;

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <div>
        <div style="font-size:14px;color:#64748b;">Cobrança PIX gerada</div>
        <div style="font-size:18px;font-weight:700;">${desc}</div>
      </div>
      <button type="button" aria-label="Fechar"
        style="border:0;background:#e2e8f0;border-radius:999px;width:28px;height:28px;cursor:pointer;font-weight:700;">
        ×
      </button>
    </div>

    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:4px;">
      <div style="font-size:13px;color:#64748b;">Valor a receber</div>
      <div style="font-size:22px;font-weight:800;">R$ ${formatValorBR(valor)}</div>
    </div>

    <div style="margin-top:8px;display:flex;justify-content:center;">
      ${qrBase64
        ? `<img src="${qrBase64}" alt="QR Code PIX"
             style="width:200px;height:200px;border-radius:12px;border:1px solid #e2e8f0;object-fit:contain;background:#f8fafc;" />`
        : `<div style="font-size:13px;color:#64748b;text-align:center;">
             QR Code não retornado pelo gateway. Use o código copia/cola abaixo.
           </div>`
      }
    </div>

    <div style="margin-top:8px;">
      <div style="font-size:13px;color:#64748b;margin-bottom:4px;">Código PIX (copia e cola)</div>
      <div style="
        border:1px solid #e2e8f0;border-radius:10px;
        padding:8px; font-size:12px; max-height:90px; overflow:auto;
        background:#f8fafc; word-break:break-all;
      ">${copiaCola || '— não retornado pelo gateway —'}</div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;justify-content:flex-end;">
      <button type="button" id="btn-pix-copy"
        style="flex:1 1 120px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer;">
        Copiar código PIX
      </button>

      <button type="button" id="btn-pix-whats"
        style="flex:1 1 140px;border:0;background:#22c55e;color:#fff;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;">
        Enviar por WhatsApp
      </button>
    </div>
  `;

  const close = () => wrap.remove();
  const btnClose = box.querySelector('button[aria-label="Fechar"]');
  btnClose?.addEventListener('click', close);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });

  // Copiar código
  box.querySelector('#btn-pix-copy')?.addEventListener('click', () => {
    if (!copiaCola) {
      alert('Nenhum código PIX foi retornado pelo gateway.');
      return;
    }
    try {
      navigator.clipboard.writeText(copiaCola);
      alert('Código PIX copiado para a área de transferência.');
    } catch {
      alert('Não foi possível copiar automaticamente. Selecione e copie o texto manualmente.');
    }
  });

  // Enviar via WhatsApp
  box.querySelector('#btn-pix-whats')?.addEventListener('click', () => {
    const msg = [
      'Olá! Segue o PIX para pagamento:',
      '',
      `Descrição: ${desc}`,
      `Valor: R$ ${formatValorBR(valor)}`,
      '',
      copiaCola ? 'Código PIX (copia e cola):' : '',
      copiaCola || '',
      '',
      linkPgto ? `Ou pague pelo link: ${linkPgto}` : '',
    ].filter(Boolean).join('\n');

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const base = isMobile ? 'whatsapp://send?text=' : 'https://wa.me/?text=';

    try {
      window.open(base + encodeURIComponent(msg), '_blank', 'noopener');
    } catch {
      // fallback: só copia a mensagem
      try { navigator.clipboard.writeText(msg); } catch {}
      alert('Mensagem de cobrança pronta e copiada. Cole no WhatsApp para enviar ao cliente.');
    }
  });

  wrap.appendChild(box);
  document.body.appendChild(wrap);

  // ESC pra fechar
  document.addEventListener('keydown', function esc(e){
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', esc);
    }
  });
}

// 👉 ADICIONE ESTA LINHA:
window.openPixModal = window.openPixModal || openPixModal;

})();
