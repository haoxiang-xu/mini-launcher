const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { prismExecutable, verifyPrismBundle, inventoryBundle } = require('../desktop/prism-bundle.cjs');

test('resolves complete macOS and Windows runtime layouts without assuming a system install', () => {
  assert.equal(prismExecutable('/runtime', 'darwin'), '/runtime/Prism Launcher.app/Contents/MacOS/prismlauncher');
  assert.equal(prismExecutable('/runtime', 'win32'), '/runtime/prismlauncher.exe');
  assert.throws(() => prismExecutable('/runtime', 'unknown'), /Unsupported/);
});

test('packaging checks the runtime, source archive and notices, rejecting changed files and unsafe links', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-prism-bundle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'prismlauncher.exe'), 'fixture');
  fs.writeFileSync(path.join(root, 'PRISM-NOTICE.txt'), 'Prism, GPLv3');
  fs.mkdirSync(path.join(root, 'source'));
  fs.writeFileSync(path.join(root, 'source/PrismLauncher.tar.gz'), 'source fixture');
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ platform: 'win32', version: '11.1.1', files: inventoryBundle(root) }));
  assert.equal(verifyPrismBundle(root, 'win32').version, '11.1.1');
  fs.writeFileSync(path.join(root, 'prismlauncher.exe'), 'changed');
  assert.throws(() => verifyPrismBundle(root, 'win32'), /verification/);
  fs.writeFileSync(path.join(root, 'prismlauncher.exe'), 'fixture');
  fs.unlinkSync(path.join(root, 'source/PrismLauncher.tar.gz'));
  assert.throws(() => verifyPrismBundle(root, 'win32'), /verification|ENOENT/);
  if (process.platform !== 'win32') {
    fs.symlinkSync('/etc', path.join(root, 'external'));
    assert.throws(() => inventoryBundle(root), /outside/);
  }
});
