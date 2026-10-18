const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { ServerManager } = require('../desktop/server-manager.cjs');

async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-server-test-'));
  const bundle = path.join(dir, 'bundle'); fs.mkdirSync(bundle);
  const bytes = Buffer.from('test server launcher');
  fs.writeFileSync(path.join(bundle, 'server-launch.jar'), bytes);
  fs.writeFileSync(path.join(bundle, 'manifest.json'), JSON.stringify({ minecraft:'26.3', javaMajor:25, files:[{path:'server-launch.jar', sha256:crypto.createHash('sha256').update(bytes).digest('hex')}] }));
  const manager = new ServerManager({baseDir:path.join(dir,'profiles'), bundleDir:bundle,
    checkJava:async()=>25,
    spawnServer:(_java, args, options)=>spawn(process.execPath,[path.join(__dirname,'fixtures/server.cjs')],options)});
  t.after(async()=>{ await manager.shutdown(); fs.rmSync(dir,{recursive:true,force:true}); });
  return {dir,manager,bundle};
}
async function freePort() {
  const s=net.createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r));
  const port=s.address().port; await new Promise(r=>s.close(r)); return port;
}
async function until(check) {
  const end=Date.now()+5000;
  while(!check()){if(Date.now()>end)throw new Error('timed out'); await new Promise(r=>setTimeout(r,20));}
}

test('test and live profiles prepare separately and never accept the EULA automatically',async(t)=>{
  const {manager}=await setup(t);
  await manager.prepare('local-test'); await manager.prepare('live');
  const local=manager.get('local-test'),live=manager.get('live');
  assert.notEqual(local.directory,live.directory); assert.notEqual(local.port,live.port);
  assert.equal(local.eulaAccepted,false); assert.equal(local.address,'127.0.0.1:25565');
  await assert.rejects(manager.start('local-test'),/EULA/);
  assert.throws(()=>manager.get('../world'),/profile/);
});

test('verified prepare rejects tampered bundle and preserves worlds',async(t)=>{
  const {manager,bundle}=await setup(t); await manager.prepare('local-test');
  const world=path.join(manager.get('local-test').directory,'world'); fs.mkdirSync(world); fs.writeFileSync(path.join(world,'level.dat'),'keep');
  await manager.prepare('local-test'); assert.equal(fs.readFileSync(path.join(world,'level.dat'),'utf8'),'keep');
  fs.writeFileSync(path.join(bundle,'server-launch.jar'),'corrupt');
  await assert.rejects(manager.prepare('live'),/verification/);
});

test('real child process starts on loopback, logs, rejects duplicate starts, and saves on stop',async(t)=>{
  const {manager}=await setup(t); await manager.prepare('local-test');
  await manager.configure('local-test',{javaPath:process.execPath,port:await freePort(),memoryMb:2048});
  manager.acceptEula('local-test');
  const first=manager.start('local-test'); await assert.rejects(manager.start('local-test'),/already/); await first;
  await until(()=>manager.get('local-test').status==='running');
  const snapshot=manager.get('local-test');
  const properties=fs.readFileSync(path.join(snapshot.directory,'server.properties'),'utf8');
  assert.match(properties,/server-ip=127\.0\.0\.1/); assert.match(properties,/online-mode=true/);
  assert.ok(snapshot.logs.some(l=>l.message.includes('Done')));
  await assert.rejects(manager.configure('local-test',{port:25570}),/running/);
  await manager.command('local-test','list'); await manager.stop('local-test');
  assert.equal(manager.get('local-test').status,'stopped');
  assert.equal(fs.readFileSync(path.join(snapshot.directory,'world/level.dat'),'utf8'),'saved');
  const backup=await manager.backup('local-test'); assert.equal(fs.readFileSync(path.join(backup,'world/level.dat'),'utf8'),'saved');
});

test('port conflicts fail before spawning a server',async(t)=>{
  const {manager}=await setup(t); await manager.prepare('local-test'); manager.acceptEula('local-test');
  const occupied=net.createServer(); await new Promise(r=>occupied.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>occupied.close(r)));
  await manager.configure('local-test',{javaPath:process.execPath,port:occupied.address().port});
  await assert.rejects(manager.start('local-test'),/port.*use/i); assert.equal(manager.get('local-test').status,'error');
});

test('commands cannot inject extra lines and invalid settings are rejected',async(t)=>{
  const {manager}=await setup(t);
  await assert.rejects(manager.configure('local-test',{port:0}),/port/i);
  await assert.rejects(manager.configure('local-test',{memoryMb:999999}),/memory/i);
  await assert.rejects(manager.command('local-test','list\nstop'),/single line/i);
});
