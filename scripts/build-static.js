'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const projectRoot = path.resolve(__dirname, '..');
const output = path.resolve(projectRoot, 'dist');
const assets = ['index.html', 'style.css', 'rules.js', 'ai.js', 'game.js'];
async function build() {
  if (path.dirname(output) !== projectRoot || path.basename(output) !== 'dist') throw new Error('Unexpected output directory');
  const existing = await fs.lstat(output).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  if (existing && existing.isSymbolicLink()) throw new Error('Build output cannot be a symbolic link');
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  for (const asset of assets) await fs.copyFile(path.join(projectRoot, asset), path.join(output, asset));
  await fs.writeFile(path.join(output, '.nojekyll'), '');
  console.log('Static game ready in dist/ (' + assets.length + ' game files).');
}
build().catch(error => { console.error(error.message); process.exitCode = 1; });
