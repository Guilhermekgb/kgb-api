#!/usr/bin/env node
const fs = require('fs');
const http = require('http');
const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, (res) => {
      const { statusCode } = res;
      res.resume();
      resolve({ url, statusCode });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(10000, () => { req.abort(); reject(new Error('timeout')); });
  });
}

function extractCloudinaryUrls(html, cloudName) {
  const re = /https?:\/\/res\.cloudinary\.com\/[\w-]+\/[\w\/\-\.]+/g;
  const matches = html.match(re) || [];
  if (cloudName) {
    return matches.filter(u => u.includes(`/${cloudName}/`));
  }
  return matches;
}

async function fetchHtmlFromUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).setTimeout(10000, function() { this.abort(); reject(new Error('timeout')); });
  });
}

async function checkFile(pathOrUrl, cloudName) {
  let html;
  if (/^https?:\/\//i.test(pathOrUrl)) {
    html = await fetchHtmlFromUrl(pathOrUrl);
  } else {
    html = fs.readFileSync(pathOrUrl, 'utf8');
  }
  const urls = extractCloudinaryUrls(html, cloudName);
  if (!urls.length) return { path: pathOrUrl, ok: true, checked: 0 };
  const results = [];
  for (const u of urls) {
    try {
      const r = await fetchUrl(u);
      results.push(r);
    } catch (e) {
      results.push({ url: u, statusCode: null, error: e.message });
    }
  }
  const failed = results.filter(r => r.statusCode !== 200);
  return { path: pathOrUrl, ok: failed.length === 0, checked: results.length, results };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node check-images.js <file1.html> [file2.html] [--cloud dzw8u1h69]');
    process.exit(2);
  }
  let cloudName = process.env.CLOUDINARY_CLOUDNAME || null;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cloud' && args[i+1]) { cloudName = args[i+1]; i++; continue; }
    files.push(args[i]);
  }
  let overallOk = true;
  for (const f of files) {
    try {
      const res = await checkFile(f, cloudName);
      if (res.checked === 0) {
        console.log(`[SKIP] ${f} — no Cloudinary URLs found`);
      } else if (res.ok) {
        console.log(`[OK]   ${f} — ${res.checked} images OK`);
      } else {
        overallOk = false;
        console.log(`[FAIL] ${f} — ${res.checked} checked`);
        for (const r of res.results) {
          console.log(`  - ${r.url} => ${r.statusCode || r.error}`);
        }
      }
    } catch (e) {
      overallOk = false;
      console.log(`[ERR]  ${f} — ${e.message}`);
    }
  }
  process.exit(overallOk ? 0 : 3);
}

if (require.main === module) main();
