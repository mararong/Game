'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const root = path.resolve(__dirname, '..');
async function startServer(t, args = []) {
  const child = spawn(process.execPath, ['server.js', ...args], { cwd: root, env: { ...process.env, PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  let output = '', errors = '';
  child.stderr.on('data', data => { errors += data; });
  const ready = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timeout: ' + errors)), 10000);
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('exit', code => { clearTimeout(timeout); reject(new Error('Server exited ' + code + ': ' + errors)); });
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/Yutnori: http:\/\/localhost:(\d+)/);
      if (match && (!args.includes('--lan') || output.includes('LAN mode:'))) { clearTimeout(timeout); resolve({ port: Number(match[1]), output }); }
    });
  });
  return { child, ...ready, url: 'http://127.0.0.1:' + ready.port };
}
test('static build contains only the game assets, identical to the working files', async () => {
  await new Promise((resolve, reject) => execFile(process.execPath, ['scripts/build-static.js'], { cwd: root, windowsHide: true }, error => error ? reject(error) : resolve()));
  const assets = ['index.html', 'style.css', 'rules.js', 'ai.js', 'game.js'];
  assert.deepEqual((await fs.readdir(path.join(root, 'dist'))).sort(), ['.nojekyll', ...assets].sort());
  for (const asset of assets) assert.deepEqual(await fs.readFile(path.join(root, 'dist', asset)), await fs.readFile(path.join(root, asset)));
});
test('local server serves the game and HEAD requests while keeping repository files inaccessible', async t => {
  const server = await startServer(t);
  const index = await fetch(server.url + '/'); assert.equal(index.status, 200); assert.match(index.headers.get('content-type'), /text\/html/);
  assert.equal(await index.text(), await fs.readFile(path.join(root, 'index.html'), 'utf8'));
  const head = await fetch(server.url + '/rules.js', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  for (const resource of ['/README.md', '/.git/config', '/package.json', '/.github/workflows/deploy-pages.yml', '/%2e%2e/package.json', '/index.html%00']) assert.equal((await fetch(server.url + resource)).status, 404, resource);
});
test('LAN mode starts on all IPv4 interfaces and serves game assets', async t => {
  const server = await startServer(t, ['--lan']);
  assert.ok(server.output.includes('LAN mode: listening on all IPv4 interfaces.'));
  assert.ok(server.port > 0);
  const response = await fetch(server.url + '/game.js');
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /javascript/);
  assert.equal(await response.text(), await fs.readFile(path.join(root, 'game.js'), 'utf8'));
});
