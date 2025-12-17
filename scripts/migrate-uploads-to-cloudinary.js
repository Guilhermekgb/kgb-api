#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ROOT = path.join(__dirname, '..');
const UPLOADS = path.join(ROOT, 'public', 'uploads');
const BACKUPS = path.join(ROOT, 'backups');
const DATA_FILE = path.join(ROOT, 'data', 'fotos-clientes.json');

function mkdirp(p){ try{ fs.mkdirSync(p, { recursive: true }); }catch(e){} }

function walk(dir){
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items){
    const fp = path.join(dir, it.name);
    if (it.isDirectory()) out.push(...walk(fp));
    else if (it.isFile()) out.push(fp);
  }
  return out;
}

async function main(){
  console.log('[migrate] Starting migration of public/uploads -> Cloudinary');
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET){
    console.error('[migrate] Missing Cloudinary credentials in .env. Aborting.');
    process.exit(1);
  }

  if (!fs.existsSync(UPLOADS)){
    console.log('[migrate] No uploads folder found at', UPLOADS); process.exit(0);
  }

  mkdirp(BACKUPS);
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const backupDest = path.join(BACKUPS, 'uploads-'+ts);
  console.log('[migrate] Creating backup copy at', backupDest);
  fs.cpSync(UPLOADS, backupDest, { recursive: true });

  // load existing data file (or init)
  let data = {};
  try{ data = JSON.parse(fs.readFileSync(DATA_FILE,'utf8')||'{}'); }catch(e){ data = {}; }
  if (!data.default) data.default = {};

  const files = walk(UPLOADS);
  console.log('[migrate] Found', files.length, 'files to migrate');

  for (const file of files){
    const rel = path.relative(UPLOADS, file).replace(/\\/g,'/');
    // skip if already present
    if (data.default && data.default[rel]){
      console.log('[migrate] Skipping (already mapped):', rel); continue;
    }
    try{
      const public_id = rel.replace(/\.[^/.]+$/,'');
      console.log('[migrate] Uploading', rel, '-> public_id:', public_id);
      const res = await cloudinary.uploader.upload(file, { public_id, upload_preset: undefined, overwrite: true });
      if (res && res.secure_url){
        data.default[rel] = res.secure_url;
        console.log('[migrate] Uploaded:', rel, '->', res.secure_url);
      } else {
        console.warn('[migrate] Unexpected response for', rel, res && typeof res === 'object' ? JSON.stringify(res).slice(0,200) : res);
      }
    }catch(err){
      console.error('[migrate] Failed to upload', rel, err && err.message || err);
    }
  }

  // write data file (pretty)
  try{
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log('[migrate] Updated data file at', DATA_FILE);
  }catch(e){ console.error('[migrate] Failed to write data file', e); }

  console.log('[migrate] Migration complete. Backup at', backupDest);
}

main().catch(e=>{ console.error('[migrate] Fatal error', e); process.exit(1); });
