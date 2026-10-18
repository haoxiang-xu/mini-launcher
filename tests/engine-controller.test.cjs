const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createEngineController, allowedAuthorizationUrl, assertEngineSender } = require('../desktop/engine-controller.cjs');

test('only the local main frame can control login and game tasks; browser authorization uses exact Microsoft hosts', () => {
  const sender = { mainFrame: {} }, window = { webContents: sender, isDestroyed: () => false };
  assert.doesNotThrow(() => assertEngineSender(window, { sender, senderFrame: sender.mainFrame }));
  assert.throws(() => assertEngineSender(window, { sender, senderFrame: {} }));
  assert.throws(() => assertEngineSender(window, { sender: {}, senderFrame: {} }));
  assert.equal(allowedAuthorizationUrl('https://www.microsoft.com/link'), true);
  for (const url of ['http://www.microsoft.com/link', 'https://www.microsoft.com.evil.example/link', 'file:///tmp/login', 'https://example.com']) assert.equal(allowedAuthorizationUrl(url), false);
});

test('controller shows real backend status, keeps credentials out of renderer state, and handles unconfigured login', async () => {
  const client = new EventEmitter();
  client.request = async method => {
    if (method === 'status') return { accounts: [{ id: 'id', name: 'Player', ownsMinecraft: true, accessToken: 'secret' }], instances: [], loginConfigured: false };
    throw Object.assign(new Error('Not configured'), { code: 'CLIENT_ID_REQUIRED' });
  };
  client.close = () => {};
  const engine = createEngineController({ file: '/test', dataRoot: '/data', clientFactory: () => client });
  const status = await engine.status();
  assert.deepEqual(status.accounts, [{ id: 'id', name: 'Player', ownsMinecraft: true }]);
  await assert.rejects(engine.login(), /配置|configured/);
  assert.equal(engine.state().phase, 'idle');
});

test('Mini owns the login, running, cancellation and sign-out lifecycle', async () => {
  const client = new EventEmitter();
  let account = { id: 'player', name: 'Player', ownsMinecraft: true }, finish;
  const snapshot = () => ({ accounts: account ? [account] : [], instances: [{ id: 'mini', name: 'mini' }], loginConfigured: true });
  client.request = async method => {
    if (method === 'status') return snapshot();
    if (method === 'auth.logout') { account = null; return snapshot(); }
    if (method === 'instance.launch') return new Promise(resolve => { finish = () => resolve(snapshot()); });
    return snapshot();
  };
  client.detach = () => {}; client.close = () => {};
  const engine = createEngineController({ file: '/test', dataRoot: '/data', clientId: 'test', clientFactory: () => client });
  await engine.status();
  const game = engine.launch('mini');
  assert.equal(engine.state().phase, 'launch');
  client.emit('event', { event: 'running' });
  assert.equal(engine.state().phase, 'playing');
  await assert.rejects(engine.logout('player'), /等待|running|完成/);
  await assert.rejects(engine.cancel(), /游戏|退出/);
  finish(); await game;
  await engine.logout('player');
  assert.equal(engine.state().phase, 'idle');
  assert.deepEqual(engine.state().accounts, []);
});
