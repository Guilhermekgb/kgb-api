// server/providers/asaas.js
// Doc base Asaas: https://docs.asaas.com/

const BASES = {
  production: 'https://www.asaas.com/api/v3',
  sandbox:    'https://sandbox.asaas.com/api/v3'
};

function getCreds(env, override = {}) {
  const e = (env === 'sandbox') ? 'sandbox' : 'production';
  const apiKey = override.apiKey || process.env.ASAAS_API_KEY;
  if (!apiKey) throw new Error('ASAAS_API_KEY não configurada (.env).');
  const base = BASES[e];
  return { base, apiKey, env: e };
}

async function http(base, apiKey, path, init = {}) {
  const url = `${base}${path}`;
const headers = Object.assign(
  { 'Content-Type': 'application/json', 'Accept': 'application/json', 'access_token': apiKey },
  init.headers || {}
);

  const resp = await fetch(url, { ...init, headers });
  if (!resp.ok) {
    const txt = await resp.text().catch(()=>'');
    throw new Error(`Asaas HTTP ${resp.status} ${txt}`);
  }
  return resp.json();
}

// Busca/Cria cliente por documento/email
async function ensureCustomer(creds, customer) {
  const { base, apiKey } = creds;
  const doc = (customer.document||'').replace(/\D+/g,'');
  if (doc) {
    const q = await http(base, apiKey, `/customers?cpfCnpj=${encodeURIComponent(doc)}`);
    if (Array.isArray(q?.data) && q.data.length) return q.data[0].id;
  }
  if (customer.email) {
    const q = await http(base, apiKey, `/customers?email=${encodeURIComponent(customer.email)}`);
    if (Array.isArray(q?.data) && q.data.length) return q.data[0].id;
  }
  const c = await http(base, apiKey, `/customers`, {
    method: 'POST',
    body: JSON.stringify({
      name: customer.name,
      email: customer.email || undefined,
      cpfCnpj: doc || undefined
    })
  });
  return c.id;
}

function normalizeDiscount(desconto) {
  if (!desconto) return null;
  const tipo = (desconto.tipo === 'fixed') ? 'FIXED' : 'PERCENTAGE';
  return {
    type: tipo,
    value: Number(desconto.valor||0),
    dueDateLimitDays: Math.max(0, parseInt(desconto.diasAntes||0,10))
  };
}

function normalizeFine(juros) {
  if (!juros) return null;
  return { value: Number(juros.multaPercent||0) };
}

function normalizeInterest(juros) {
  if (!juros) return null;
  return { value: Number(juros.jurosDiaPercent||0) };
}

// PIX: precisa buscar QR após criar o payment
async function fetchPixArtifacts(creds, paymentId) {
  const { base, apiKey } = creds;
  const data = await http(base, apiKey, `/payments/${paymentId}/pixQrCode`);
  // Campos típicos: { encodedImage: 'data:image/png;base64,...', payload: 'pix copia e cola' }
  const b64 = (data.encodedImage || '').replace(/^data:image\/png;base64,?/, '');
  return {
    pix_qr_base64: b64,
    pix_copia_cola: data.payload || ''
  };
}

module.exports = {
  async testConnection({ env = 'production', credentials = {} }) {
    const creds = getCreds(env, credentials);
    // "myAccount" é leve e não cria nada
    const info = await http(creds.base, creds.apiKey, '/myAccount');
    return !!info?.id;
  },

// novo (método do objeto dentro do module.exports)
async createCharge({
  method, amount, description, due_date, customer, desconto, juros, metadata,
  env,            // <- opcional: 'production' | 'sandbox'
  credentials     // <- opcional: { apiKey }
}) {
  const creds = getCreds(env || process.env.ASAAS_ENV || 'production', credentials || {});

  const { base, apiKey } = creds;

  const customerId = await ensureCustomer(creds, customer);
  const billingType =
    method === 'pix'   ? 'PIX' :
    method === 'card'  ? 'CREDIT_CARD' :
                         'BOLETO';


    // Para CARTÃO, vamos gerar um PaymentLink (link de checkout) — mais simples no front.
    if (method === 'card') {
      const body = {
        billingType,
        name: description || 'Cobrança',
        value: Number(amount),
        chargeType: 'DETACHED',
        // descontos/juros (opcionais)
        discount: normalizeDiscount(desconto) || undefined,
        fine:     normalizeFine(juros)        || undefined,
        interest: normalizeInterest(juros)    || undefined
      };
      // se houver due_date e desconto com dias, limite relativo
      // (removido) o limite de desconto já vai dentro de `discount.dueDateLimitDays`


      const link = await http(base, apiKey, `/paymentLinks`, {
        method: 'POST', body: JSON.stringify(body)
      });
      return {
        provider: 'asaas',
        method: 'card',
        amount: Number(amount),
        checkout_url: link?.url || link?.shortUrl || link?.id
      };
    }

    // BOLETO / PIX como "payments"
    const payment = await http(base, apiKey, `/payments`, {
      method: 'POST',
      body: JSON.stringify({
        customer: customerId,
        billingType,
        value: Number(amount),
        description: description || undefined,
        dueDate: due_date || undefined, // para PIX também é aceito
        discount: normalizeDiscount(desconto) || undefined,
        fine:     normalizeFine(juros)        || undefined,
        interest: normalizeInterest(juros)    || undefined,
        externalReference: metadata?.ref || undefined
      })
    });

    if (method === 'pix') {
      const pix = await fetchPixArtifacts(creds, payment.id);
      return {
        provider: 'asaas',
        method: 'pix',
        amount: Number(amount),
        pix_qr_base64: pix.pix_qr_base64,
        pix_copia_cola: pix.pix_copia_cola
      };
    }

    // boleto
    return {
      provider: 'asaas',
      method: 'boleto',
      amount: Number(amount),
      linha_digitavel: payment.identificationField || payment.bankSlipBarcode || '',
      boleto_pdf_url: payment.bankSlipUrl || payment.invoiceUrl || ''
    };
  }
};
