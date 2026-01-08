const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = new Database('data.db');
try {
  const ADMIN_EMAIL = 'admin@kgb.com';
  const existing = db.prepare('SELECT id FROM usuarios WHERE lower(email) = ?').get(ADMIN_EMAIL.toLowerCase());
  if (!existing) {
    const id = crypto.randomUUID();
    const senhaHash = bcrypt.hashSync('123', 10);
    db.prepare('INSERT INTO usuarios(id,nome,email,whatsapp,perfil,senha,foto,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, 'Administrador', ADMIN_EMAIL, '', 'Administrador', senhaHash, '', new Date().toISOString());
    console.log('[ENSURE-ADMIN] admin criado: admin@kgb.com senha: 123');
  } else {
    console.log('[ENSURE-ADMIN] admin already exists:', existing.id);
  }
} catch (e) {
  console.error('[ENSURE-ADMIN] erro:', e && e.message);
  process.exit(1);
}
