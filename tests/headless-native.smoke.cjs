const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const { createInterface } = require('node:readline');

test('real native backend starts with no setup UI and handles status, missing configuration and shutdown over its pipe', async t => {
  const binary = process.env.MINI_BACKEND_TEST_BINARY || path.resolve('runtime/backend/darwin/MiniBackend.app/Contents/MacOS/MiniBackend');
  assert.ok(fs.existsSync(binary), 'Build the native backend before running this smoke test.');
  if (process.platform === 'darwin') require('../scripts/deploy-mac-backend.cjs').verifyPortableMachOBundle(path.resolve(binary, '../../..'));
  assert.equal(spawnSync(binary, [], { timeout: 3000 }).status, 2, 'An accidental invocation must not open upstream UI.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-native-smoke-'));
  const child = spawn(binary, ['--mini-backend', '--dir', root], { env: { ...process.env, ...(process.platform === 'darwin' ? { DYLD_PRINT_LIBRARIES: '1' } : {}), QT_QPA_PLATFORM: 'offscreen', MINI_MICROSOFT_CLIENT_ID: '' }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { child.kill(); fs.rmSync(root, { recursive: true, force: true }); });
  const messages = [], waiting = [];
  let operation = 'startup';
  let failure, externalLoaded = false;
  // Never collect native stderr: an auth failure must not put credentials in logs.
  child.stderr.on('data', bytes => { if (/dyld[^\n]*\/(opt\/homebrew|usr\/local)\//.test(bytes.toString())) externalLoaded = true; });
  child.on('error', error => { failure = error; for (const item of waiting.splice(0)) item.reject(error); });
  child.on('exit', (code, signal) => { failure = new Error(`Backend exited (${code ?? signal})`); for (const item of waiting.splice(0)) item.reject(failure); });
  createInterface({ input: child.stdout }).on('line', line => {
    const value = JSON.parse(line); messages.push(value);
    for (const item of [...waiting]) if (item.match(value)) { waiting.splice(waiting.indexOf(item), 1); item.resolve(value); }
  });
  const wait = match => messages.find(match) ? Promise.resolve(messages.find(match)) : failure ? Promise.reject(failure) : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Backend response timed out during ${operation}`)), 20_000);
    waiting.push({ match, resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
  });
  const ready = await wait(message => message.event === 'ready');
  assert.equal(ready.protocol, 1);
  assert.equal(externalLoaded, false, 'The packaged engine must load its own libraries, not Homebrew libraries.');
  const request = async (id, method, params = {}) => {
    operation = id;
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    return wait(message => message.id === id && (message.result || message.error));
  };
  const status = await request('status', 'status');
  assert.deepEqual(status.result.accounts, []);
  assert.equal(status.result.loginConfigured, false);
  assert.equal((await request('login', 'auth.login')).error.code, 'CLIENT_ID_REQUIRED');
  assert.equal((await request('launch', 'instance.launch', { instanceId: 'missing' })).error.code, 'LOGIN_REQUIRED');
  assert.equal((await request('missing-pack', 'instance.import', { path: '/missing.mrpack' })).error.code, 'PACK_MISSING');
  const broken = path.join(root, 'invalid.mrpack'); fs.writeFileSync(broken, 'not a zip');
  assert.equal((await request('invalid-pack', 'instance.import', { path: broken })).error.code, 'TASK_FAILED');
  const pack = path.join(root, 'fixture.mrpack');
  execFileSync('python3', ['-c', `import json,zipfile,sys
with zipfile.ZipFile(sys.argv[1], 'w') as z:
 z.writestr('modrinth.index.json', json.dumps({'formatVersion':1,'game':'minecraft','versionId':'test','name':'mini smoke','files':[],'dependencies':{'minecraft':'26.3','fabric-loader':'0.19.5'}}))
 z.writestr('overrides/options.txt', 'renderDistance:8\\n')`, pack]);
  const installed = await request('valid-pack', 'instance.import', { path: pack });
  assert.ok(installed.result, JSON.stringify(installed.error));
  assert.equal(installed.result.instances.length, 1);
  const instanceId = installed.result.instances[0].id;
  assert.equal(fs.readFileSync(path.join(root, 'instances', instanceId, 'minecraft/options.txt'), 'utf8'), 'renderDistance:8\n');
  assert.equal((await request('shutdown', 'shutdown')).result.ok, true);
  assert.equal(messages.some(message => message.event === 'interaction-required'), false, 'No upstream UI may be requested.');
});
