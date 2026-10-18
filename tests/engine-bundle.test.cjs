const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inventoryBundle } = require('../desktop/prism-bundle.cjs');
const { engineExecutable, verifyEngineBundle } = require('../desktop/engine-bundle.cjs');

test('packaging rejects missing, altered or wrong-architecture engines and requires rebuildable source', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-engine-bundle-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const binary = engineExecutable(folder, 'darwin');
  fs.mkdirSync(path.dirname(binary), { recursive: true }); fs.writeFileSync(binary, 'native test binary');
  fs.mkdirSync(path.join(folder, 'source'), { recursive: true });
  for (const file of ['LICENSE', 'COPYING.md', 'BACKEND-NOTICE.txt', 'source/PrismLauncher.tar.gz', 'source/build-backend.cjs']) fs.writeFileSync(path.join(folder, file), 'test');
  const manifest = { backend: 'mini-prism', protocol: 1, version: '11.1.1', platform: 'darwin', arch: 'arm64', files: inventoryBundle(folder) };
  fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest));
  assert.equal(verifyEngineBundle(folder, 'darwin', 'arm64').protocol, 1);
  assert.throws(() => verifyEngineBundle(folder, 'darwin', 'x64'), /architecture|target/);
  fs.writeFileSync(binary, 'changed');
  assert.throws(() => verifyEngineBundle(folder, 'darwin', 'arm64'), /verification/);
  assert.throws(() => verifyEngineBundle(path.join(folder, 'missing'), 'darwin', 'arm64'));
});
