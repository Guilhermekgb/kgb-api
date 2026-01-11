const puppeteer = require('puppeteer');
const crypto = require('crypto');

const UI_BASE = process.env.UI_BASE || 'http://127.0.0.1:5500';
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3333';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randEmail(prefix = 'vend'){
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}@kgb.com`;
}

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    // Helper: evaluate fetch in page context to backend (respecting CORS)
    const adminEmail = 'admin@kgb.com';
    const adminSenha = 'kgb12345';

    console.log('Opening login page to set admin token in localStorage...');
    await page.goto(`${UI_BASE}/login.html`, { waitUntil: 'networkidle2' });

    // Acquire token via direct fetch and set localStorage
    const adminToken = await page.evaluate(async (apiBase, email, senha) => {
      const res = await fetch(apiBase + '/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha })
      });
      const json = await res.json();
      // token might be in json.token
      const t = json?.token || json?.accessToken || json?.data?.token;
      if (!t) throw new Error('admin login failed: ' + JSON.stringify(json));
      localStorage.setItem('token', t);
      return t;
    }, API_BASE, adminEmail, adminSenha);

    console.log('adminToken acquired');

    // Go to permissoes.html
    await page.goto(`${UI_BASE}/permissoes.html`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="checkbox"][data-perfil="Vendedor"]', { timeout: 10000 });

    // Log API_BASE and GET /permissoesUi before
    const before = await page.evaluate(async () => {
      const apiBase = window.__API_BASE__ || window.API_BASE || 'unknown';
      let perms = null;
      try { perms = await window.apiFetch('/permissoesUi'); } catch(e) { perms = { error: String(e) }; }
      return { apiBase, perms };
    });
    console.log('UI __API_BASE__ (page):', before.apiBase);
    console.log('permissoesUi BEFORE:', JSON.stringify(before.perms, null, 2));

    // Create a vendor user for the test via window.apiFetch (admin)
    const vendorEmail = randEmail('vend');
    const vendorPass = 'vend12345';
    console.log('Creating vendor:', vendorEmail);
    const vendor = await page.evaluate(async (email, pass) => {
      try {
        const r = await window.apiFetch('/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'E2E Vendedor', email, senha: pass, perfil: 'Vendedor' }) });
        return r;
      } catch (e) { return { error: String(e) } }
    }, vendorEmail, vendorPass);
    console.log('Vendor create result:', vendor);

    // Select two permissions for Vendedor: dashboard.html and orcamento.html
    const pagesToCheck = ['dashboard.html', 'orcamento.html'];
    for (const p of pagesToCheck) {
      const sel = `input[type="checkbox"][data-perfil="Vendedor"][data-page="${p}"]`;
      await page.waitForSelector(sel, { timeout: 5000 });
      const isChecked = await page.$eval(sel, el => el.checked);
      if (!isChecked) await page.click(sel);
    }

    // Handle alert dialogs that may appear
    page.on('dialog', async dialog => {
      console.log('Dialog:', dialog.message());
      await dialog.accept();
    });

    // Click Save
    const saveSel = '#btnSalvarPermissoes';
    await page.waitForSelector(saveSel, { timeout: 5000 });
    await page.click(saveSel);
    await sleep(1500);

    // GET /permissoesUi after save (log)
    const after = await page.evaluate(async () => {
      let perms = null;
      try { perms = await window.apiFetch('/permissoesUi'); } catch(e) { perms = { error: String(e) }; }
      return { perms };
    });
    console.log('permissoesUi AFTER:', JSON.stringify(after.perms, null, 2));

    // Reload page and validate checkboxes remain
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="checkbox"][data-perfil="Vendedor"][data-page="dashboard.html"]');

    for (const p of pagesToCheck) {
      const sel = `input[type="checkbox"][data-perfil="Vendedor"][data-page="${p}"]`;
      const checked = await page.$eval(sel, el => el.checked);
      console.log(`After reload - ${p} checked=`, checked);
      if (!checked) throw new Error(`PERMISSION LOST AFTER RELOAD: ${p}`);
    }

    console.log('Permissions persisted after reload — OK');

    // Logout (clear token)
    await page.evaluate(() => { localStorage.removeItem('token'); localStorage.removeItem('KGB_AUTH_TOKEN'); sessionStorage.removeItem('token'); });

    // Login as vendor via API and set token
    await page.goto(`${UI_BASE}/login.html`, { waitUntil: 'networkidle2' });
    const vendorToken = await page.evaluate(async (apiBase, email, senha) => {
      const res = await fetch(apiBase + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) });
      const j = await res.json();
      const t = j?.token || j?.accessToken || j?.data?.token;
      if (!t) throw new Error('vendor login failed: ' + JSON.stringify(j));
      localStorage.setItem('token', t);
      return t;
    }, API_BASE, vendorEmail, vendorPass);
    console.log('Vendor logged in token:', !!vendorToken);

    // Vendor should access dashboard and orcamento
    await page.goto(`${UI_BASE}/dashboard.html`, { waitUntil: 'networkidle2' });
    if (page.url().endsWith('acesso-negado.html')) throw new Error('Vendor unexpectedly blocked from dashboard');
    console.log('Vendor can access dashboard — OK');

    await page.goto(`${UI_BASE}/orcamento.html`, { waitUntil: 'networkidle2' });
    if (page.url().endsWith('acesso-negado.html')) throw new Error('Vendor unexpectedly blocked from orcamento');
    console.log('Vendor can access orcamento — OK');

    // Vendor should NOT access usuarios.html
    await page.goto(`${UI_BASE}/usuarios.html`, { waitUntil: 'networkidle2' });
    if (!page.url().endsWith('acesso-negado.html')) {
      throw new Error('Vendor should be blocked from usuarios.html but was not');
    }
    console.log('Vendor blocked from usuarios.html — OK');

    console.log('E2E test completed successfully');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('E2E test failed:', err);
    try { await browser.close(); } catch(e){}
    process.exit(1);
  }
})();
