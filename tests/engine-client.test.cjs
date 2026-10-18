const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createEngineClient } = require('../desktop/engine-client.cjs');
const options = { file: process.execPath, args: [path.join(__dirname, 'fixtures/engine-worker.cjs')] };

test('pipe client waits for handshake, handles split JSON frames and forwards progress without exposing process logs', async t => {
  const engine = createEngineClient(options); t.after(() => engine.close());
  const progress = []; engine.on('event', value => progress.push(value));
  assert.deepEqual((await engine.request('status')).accounts, []);
  assert.equal((await engine.request('progress')).ok, true);
  assert.equal(progress.find(value => value.event === 'progress').current, 3);
  await assert.rejects(engine.request('auth.login'), error => error.code === 'CLIENT_ID_REQUIRED');
});

test('native crash and deadline reject pending operations instead of falling back to the Prism GUI', async t => {
  const engine = createEngineClient(options); t.after(() => engine.close());
  await assert.rejects(engine.request('unknown', {}, { timeout: 40 }), error => error.code === 'TIMEOUT');
  await assert.rejects(engine.request('crash'), error => error.code === 'ENGINE_EXITED');
});
