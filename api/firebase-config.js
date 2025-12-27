// stub opcional: Firebase ainda não configurado
// api/firebase-config.js

// Habilita os hooks de sync que usamos nas rotas locais
window.firebaseSync = window.firebaseSync || {};
window.firebaseSync.enabled = true;

// 🔧 IMPORTANTE:
// Não sobrescrevemos window.__API_BASE__ aqui.
// Ele já é definido nas páginas HTML (detectando se está em localhost ou Netlify).
// Se quiser garantir um valor padrão só em ambiente local, poderia fazer algo assim:
// if (!window.__API_BASE__) {
//   window.__API_BASE__ = "http://127.0.0.1:3333";
// }

// Config do seu Firebase (copiado da tela "Config")
window.__FIREBASE_CONFIG__ = {
  apiKey: "AIzaSyBb96JRanVqUBT0cMKtffLts2z4UqPkFX8",
  authDomain: "buffet-sistema.firebaseapp.com",
  projectId: "buffet-sistema",

  // Se der erro de Storage depois, troque esta linha para "buffet-sistema.appspot.com"
  storageBucket: "buffet-sistema.firebasestorage.app",

  messagingSenderId: "257870466569",
  appId: "1:257870466569:web:2daf007cdd376ca985b2d8"
};
