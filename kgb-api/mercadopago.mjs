// kgb-api/providers/mercadopago.js  (ESM - Node 18+ tem fetch nativo)
const API = 'https://api.mercadopago.com';

/**
 * Resolve o access token: prioridade para credenciais recebidas na chamada,
 * depois .env (produção) e .env sandbox.
 */
function resolveToken(credentials = {}) {
  return (
    credentials.accessToken ||
    process.env.MP_ACCESS_TOKEN ||
    process.env.MP_ACCESS_TOKEN_SANDBOX ||
    ''
  );
}

/**
 * Testa conexão (GET /users/me)
 * @returns {Promise<boolean>}
 */
export async function testConnection({ env = 'sandbox', credentials = {} } = {}) {
  const token = resolveToken(credentials);
  if (!token) return false;

  const r = await fetch(`${API}/users/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return r.ok;
}

/**
 * Cria uma cobrança simples usando v1/payments.
 * Suporta: PIX e BOLETO (cartão aqui está como placeholder).
 *
 * @param {Object} p
 *  - method: 'pix' | 'boleto' | 'card'
 *  - amount: number
 *  - description: string
 *  - due_date: 'YYYY-MM-DD' (apenas boleto)
 *  - customer: { name, email, document } (document = CPF/CNPJ só números)
 *  - metadata: object
 *  - env: 'sandbox' | 'prod'
 *  - credentials: { accessToken }
 */
export async function createCharge(p = {}) {
  const {
    method,
    amount,
    description,
    due_date,
    customer = {},
    metadata = {},
    credentials = {}
  } = p;

  const token = resolveToken(credentials);
  if (!token) throw new Error('Mercado Pago: access token ausente.');

  if (!method || !amount || !customer?.name) {
    throw new Error('Dados obrigatórios ausentes (method, amount, customer.name).');
  }

  // Monta payload básico
  const base = {
    transaction_amount: Number(amount),
    description: description || 'Cobrança',
    payer: {
      email: customer.email || 'sem-email@example.com',
      first_name: customer.name || '',
      identification: customer.document
        ? { type: customer.document.length >= 12 ? 'CNPJ' : 'CPF', number: customer.document }
        : undefined
    },
    metadata: metadata || {}
  };

  let body = { ...base };

  if (method === 'pix') {
    body.payment_method_id = 'pix';
  } else if (method === 'boleto') {
    // Boleto Bradesco é o método atual no MP BR
    body.payment_method_id = 'bolbradesco';
    if (due_date) body.date_of_expiration = `${due_date}T23:59:59.000-03:00`;
  } else if (method === 'card') {
    // Aqui deixamos o cartão como "não implementado" neste provider simples
    // (fluxo de cartão com tokenização exige front seguro + token do cartão).
    throw new Error('Cobrança por cartão não implementada neste provider.');
  } else {
    throw new Error(`Método não suportado: ${method}`);
  }

  const r = await fetch(`${API}/v1/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.message || data?.error || JSON.stringify(data);
    throw new Error(`Mercado Pago: falha ao criar pagamento: ${msg}`);
  }
  return data;
}

export default { testConnection, createCharge };
