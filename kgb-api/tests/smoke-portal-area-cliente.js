/* eslint-disable no-console */
let loginAsAdmin;
try { ({ loginAsAdmin } = require("./smoke-util-login")); } catch {}
const http = require("http");

function getBase() {
  return process.env.BASE_URL || "http://127.0.0.1:3333";
}

function httpGet(url, cookie) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: "GET",
        headers: cookie ? { Cookie: cookie } : {},
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function getCookie() {
  // usa mesmo método de login dos smokes de timeline
  const base = getBase();
  const email = process.env.KGB_EMAIL || 'admin@buffet.com';
  const senha = process.env.KGB_SENHA || '123456';
  const payload = JSON.stringify({ email, senha });

  return new Promise((resolve, reject) => {
    try {
      const u = new URL(base + '/auth/login');
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          const setCookie = res.headers['set-cookie'] || [];
          const cookie = Array.isArray(setCookie) ? setCookie.map(x => x.split(';')[0]).join('; ') : String(setCookie).split(';')[0] || '';
          res.resume();
          res.on('end', () => resolve(cookie));
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    } catch (e) { reject(e); }
  });
}

(async () => {
  const base = getBase();
  const cookie = await getCookie();
  if (!cookie) {
    console.error("FAIL login: cookie vazio");
    process.exit(1);
  }
  console.log("OK login, cookie obtido");

  const eventoId = Date.now().toString();
  console.log("Evento para smoke:", eventoId);

  const r1 = await httpGet(`${base}/portal/eventos/${eventoId}/financeiro`, cookie);
  console.log(`OK /portal/eventos/${eventoId}/financeiro ->`, r1.status);
  if (r1.status !== 200) process.exit(1);

  const r2 = await httpGet(`${base}/portal/eventos/${eventoId}/parcelas`, cookie);
  console.log(`OK /portal/eventos/${eventoId}/parcelas ->`, r2.status);
  if (r2.status !== 200) process.exit(1);

  const r3 = await httpGet(`${base}/portal/eventos/${eventoId}/timeline`, cookie);
  console.log(`OK /portal/eventos/${eventoId}/timeline ->`, r3.status);
  if (r3.status !== 200) process.exit(1);

  console.log("SMOKE OK (com avisos se 404).");
  process.exit(0);
})().catch((e) => {
  console.error("SMOKE FAIL:", e && e.message ? e.message : e);
  process.exit(1);
});
