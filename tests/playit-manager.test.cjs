const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');const {PassThrough}=require('node:stream');
const {PlayitManager}=require('../desktop/playit-manager.cjs');
test('playit requires a running live server; secrets never enter its visible log',async(t)=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mini-playit-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  let child,launch;
  const p=new PlayitManager({directory:root,checkVersion:async()=>true,spawnAgent:(binary,args)=>{launch={binary,args};child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>queueMicrotask(()=>child.emit('close',0));return child;}});
  p.configure({binary:path.join(root,'playit.exe'),publicAddress:'example.joinmc.link'});
  await assert.rejects(p.start({id:'local-test',status:'running'}),/live/i);
  await assert.rejects(p.start({id:'live',status:'stopped'}),/running/i);
  await p.start({id:'live',status:'running'});
  child.stdout.write('secret_key=DO_NOT_SHOW\nClaim https://playit.gg/claim/abc123\n');
  await new Promise(r=>setImmediate(r));
  assert.equal(p.snapshot().status,'running');assert.equal(p.snapshot().claimUrl,'https://playit.gg/claim/abc123');
  assert.ok(!JSON.stringify(p.snapshot().logs).includes('DO_NOT_SHOW'));assert.ok(launch.args.includes('--secret_path'));
  await p.stop();assert.equal(p.snapshot().status,'stopped');
});
