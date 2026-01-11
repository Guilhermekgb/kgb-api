const Database = require('better-sqlite3');
const dbPath = './kgb-api/data.db';
try {
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare('SELECT perfil, permissoes_json, updated_at FROM permissoes_ui').all();
  console.log(JSON.stringify({ ok: true, items: rows }, null, 2));
  db.close();
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: String(err) }));
  process.exit(1);
}
