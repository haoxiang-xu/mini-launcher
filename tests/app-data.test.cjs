const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

test('rebranding keeps player and server settings in their existing directories before acquiring the app lock', () => {
  const entry = path.join(__dirname, '../desktop/main.cjs');
  const load = createRequire(entry);
  for (const edition of ['player', 'server']) {
    const paths = new Map();
    const stopped = new Error('stop before starting Electron');
    const app = {
      isPackaged: true,
      getPath: name => { assert.equal(name, 'appData'); return '/fixture/app-data'; },
      setPath: (name, value) => paths.set(name, value),
      requestSingleInstanceLock: () => { throw stopped; },
    };
    assert.throws(() => vm.runInNewContext(fs.readFileSync(entry, 'utf8'), {
      __dirname: path.dirname(entry), process: { platform: 'darwin', argv: [] },
      require: name => name === 'electron' ? { app } : name === './edition.cjs' ? { editionFor: () => edition } : load(name),
    }), error => error === stopped);
    assert.equal(paths.get('userData'), path.join('/fixture/app-data',
      edition === 'server' ? 'minecraft-mini-launcher-server' : 'Minecraft Mini Launcher'));
  }
});
