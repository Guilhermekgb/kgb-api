// api/firebase-config.js

// Habilita os hooks de sync que usamos nas rotas locais
window.firebaseSync = window.firebaseSync || {};
window.firebaseSync.enabled = true;

// SEMPRE ONLINE: aponte para sua API (sem barra final)
window.__API_BASE__ = "https://sua-api.exemplo.com";

// Config do seu Firebase (copiado da tela "Config")
window.__FIREBASE_CONFIG__ = {
  apiKey: "AIzaSyBb96JRanVqUBT0cMKtffLts2z4UqPkFX8",
  authDomain: "buffet-sistema.firebaseapp.com",
  projectId: "buffet-sistema",

 storageBucket: "buffet-sistema.firebasestorage.app",

  messagingSenderId: "257870466569",
  appId: "1:257870466569:web:2daf007cdd376ca985b2d8"
};
