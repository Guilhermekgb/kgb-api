const Database = require('better-sqlite3');
const db = new Database('data.db');
function listUsers() {
  try {
    const rows = db.prepare('select id,email,nome,perfil from usuarios limit 200').all();
    console.log(JSON.stringify({ users: rows }, null, 2));
  } catch (e) {
    console.error('listUsers error:', e && e.message);
  }
}
function tableInfo() {
  try {
    const cols = db.prepare("PRAGMA table_info('usuarios')").all();
    console.log(JSON.stringify({ cols }, null, 2));
  } catch (e) {
    console.error('tableInfo error:', e && e.message);
  }
}
listUsers();
tableInfo();
