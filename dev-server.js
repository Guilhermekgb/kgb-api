#!/usr/bin/env node
// Dev server para testes headless HTTP — serve a pasta pai (workspace root)
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5500;
const ROOT = path.resolve(__dirname, '..');

app.use(express.static(ROOT, { dotfiles: 'allow' }));

app.get('/__health', (req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
  console.log('[dev-server] serving', ROOT, 'on port', PORT);
});

// Auto-exit after 120s to avoid orphan processes in CI-like runners
const AUTO_EXIT_MS = parseInt(process.env.AUTO_EXIT_MS || '120000', 10);
setTimeout(() => {
  console.log('[dev-server] auto-shutdown after', AUTO_EXIT_MS, 'ms');
  server.close(() => process.exit(0));
}, AUTO_EXIT_MS);

// Graceful shutdown on SIGINT/SIGTERM
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
