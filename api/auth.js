// auth.js (opcional, robusto)

function toB64(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function fromB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

export function gerarTokenSimples(usuario) {
  const payload = { usuario, exp: Date.now() + 1000 * 60 * 60 * 2 }; // 2h
  return toB64(payload);
}

// persist = true -> localStorage (lembrar sessão); false -> sessionStorage (somente aba atual)
export function salvarToken(token, persist = true) {
  const store = persist ? localStorage : sessionStorage;
  store.setItem("token", token);
}

export function obterUsuarioDoToken() {
  const token =
    localStorage.getItem("token") ||
    sessionStorage.getItem("token"); // lê dos dois

  if (!token) return null;
  try {
    const payload = fromB64(token);
    if (payload.exp < Date.now()) {
      // expirada: remove dos dois
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
      return null;
    }
    return payload.usuario;
  } catch {
    return null;
  }
}

export function logout() {
  localStorage.removeItem("token");
  sessionStorage.removeItem("token");
}
