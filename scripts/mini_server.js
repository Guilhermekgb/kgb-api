// scripts/mini_server.js
const http = require('http');

const HOST = '127.0.0.1';
const PORT = 3333;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('ok\n');
});

server.on('error', (err) => {
  console.error('[MINI] LISTEN ERROR:', err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[MINI] LISTEN OK http://${HOST}:${PORT}`);
});
