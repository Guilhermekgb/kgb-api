#!/usr/bin/env node
/**
 * upload-to-cloudinary.js
 * Safe helper script skeleton to upload a mapping of local images to Cloudinary.
 * - Reads `data/fotos-clientes.json` (flattened mapping) and for each entry that
 *   looks like a local path or data URI attempts to upload and prints resulting URL.
 * - Does nothing unless `CLOUDINARY_CLOUD_NAME` is set and the `cloudinary` SDK is available.
 *
 * Usage (local, interactive):
 *   npm install cloudinary
 *   CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=... node scripts/upload-to-cloudinary.js
 *
 * The script is intentionally conservative: it logs actions and supports a `--dry-run` flag.
 */

const fs = require('fs');
const path = require('path');

const MAPPING = path.join(__dirname, '..', 'data', 'fotos-clientes.json');
const DRY = process.argv.includes('--dry-run');

function flatten(obj){
  const out = {};
  function walk(o,p){
    for(const k of Object.keys(o||{})){
      const v = o[k];
      const key = p? p + '/' + k : k;
      if (typeof v === 'string') out[key] = v;
      else if (v && typeof v === 'object') walk(v, key);
    }
  }
  walk(obj,'');
  return out;
}

if (!fs.existsSync(MAPPING)) {
  console.error('Mapping not found:', MAPPING);
  process.exit(2);
}

const raw = JSON.parse(fs.readFileSync(MAPPING, 'utf8'));
const flat = flatten(raw);

if (!process.env.CLOUDINARY_CLOUD_NAME) {
  console.log('CLOUDINARY_CLOUD_NAME not set — running in dry mode');
}

async function main(){
  let cloudinary = null;
  try {
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      cloudinary = require('cloudinary').v2;
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    }
  } catch (e){
    console.warn('cloudinary SDK not installed — install with `npm i cloudinary` to enable uploads');
    cloudinary = null;
  }

  const outMap = {};
  for (const key of Object.keys(flat)){
    const src = flat[key];
    console.log('=>', key, src.substring(0, 80).replace(/\n/g,' '));
    if (DRY || !cloudinary){
      console.log('   [dry] would upload:', key);
      outMap[key] = src; // keep original until real upload
      continue;
    }
    try{
      // If src looks like a data URI or local path, upload. Otherwise skip.
      if (src.startsWith('data:') || src.startsWith('file:') || src.match(/^\.\//) || src.match(/^[A-Za-z]:\\/)){
        const uploadSrc = src.startsWith('data:') ? src : path.resolve(__dirname, '..', src.replace(/^file:\/\//,''));
        console.log('   uploading', uploadSrc);
        const res = await cloudinary.uploader.upload(uploadSrc, { folder: 'fotos-migracao' });
        outMap[key] = res.secure_url;
        console.log('   uploaded =>', res.secure_url);
      } else {
        console.log('   skipping (already remote?):', src);
        outMap[key] = src;
      }
    } catch (e){
      console.error('   upload failed for', key, e.message);
      outMap[key] = src;
    }
  }

  const outPath = path.join(__dirname, '..', 'data', 'fotos-clientes-cloud-ready.json');
  fs.writeFileSync(outPath, JSON.stringify(outMap, null, 2), 'utf8');
  console.log('Wrote mapping preview to', outPath);
}

main().catch(e=>{ console.error(e); process.exit(1); });
