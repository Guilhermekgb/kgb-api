#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const backupsDir = path.join(DATA_DIR, 'backups');

const days = Number(process.env.BACKUP_RETENTION_DAYS || '30');
if (Number.isNaN(days) || days <= 0) {
  console.error('Invalid BACKUP_RETENTION_DAYS:', process.env.BACKUP_RETENTION_DAYS);
  process.exit(1);
}

try { fs.mkdirSync(backupsDir, { recursive: true }); } catch (e) {}

const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
let removed = 0;
const files = (fs.readdirSync(backupsDir) || []).filter(f => f.endsWith('.json'));
for (const f of files) {
  try {
    const fp = path.join(backupsDir, f);
    const st = fs.statSync(fp);
    if (st.mtimeMs < cutoff) {
      fs.unlinkSync(fp);
      console.log('removed', f);
      removed++;
    }
  } catch (e) {
    console.warn('skip', f, e.message);
  }
}
console.log('done. removed:', removed);
