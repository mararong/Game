'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = __dirname;
const port = Number(process.env.PORT || 4173);
const lan = process.argv.includes('--lan');
const host = lan ? '0.0.0.0' : '127.0.0.1';
const allowed = new Set(['index.html', 'style.css', 'rules.js', 'ai.js', 'game.js']);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer((req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html'; }
  catch { res.writeHead(400); res.end('Bad request'); return; }
  if (!allowed.has(name)) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(root, name), (error, bytes) => {
    if (error) { res.writeHead(500); res.end('Unable to load file'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(name)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  });
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port ' + port + ' is in use. Set PORT to another port.' : error.message); process.exitCode = 1; });
server.listen(port, host, () => {
  const actualPort = server.address().port;
  console.log('Yutnori: http://localhost:' + actualPort);
  if (lan) {
    const addresses = [...new Set(Object.values(os.networkInterfaces()).flat()
      .filter(entry => entry && entry.family === 'IPv4' && !entry.internal)
      .map(entry => entry.address))];
    console.log('LAN mode: listening on all IPv4 interfaces.');
    console.log('Open one of these addresses from another device on the same Wi-Fi:');
    for (const address of addresses) console.log('  http://' + address + ':' + actualPort);
    if (!addresses.length) console.log('  No LAN address found. Connect this computer to Wi-Fi or Ethernet.');
  }
});
