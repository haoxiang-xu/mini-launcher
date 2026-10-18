const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {verifyResources}=require('../build/verify-resources.cjs');

test('packaging refuses missing, changed or unlisted server resources',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mini-package-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const pack=path.join(root,'pack/local');fs.mkdirSync(pack,{recursive:true});
  const bytes=Buffer.from('verified client pack'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  fs.writeFileSync(path.join(pack,'Mini-Local-26.3.mrpack'),bytes);
  fs.writeFileSync(path.join(pack,'manifest.json'),JSON.stringify({pack:'Mini-Local-26.3.mrpack',packSha256:hash(bytes)}));
  assert.doesNotThrow(()=>verifyResources('player',root));
  assert.throws(()=>verifyResources('server',root),/server bundle/i);
  const server=path.join(root,'pack/server-local');fs.mkdirSync(path.join(server,'mods'),{recursive:true});
  fs.writeFileSync(path.join(server,'server-launch.jar'),bytes);
  fs.writeFileSync(path.join(server,'manifest.json'),JSON.stringify({files:[{path:'server-launch.jar',sha256:hash(bytes)}]}));
  assert.doesNotThrow(()=>verifyResources('server',root));
  fs.writeFileSync(path.join(server,'mods/stale.jar'),bytes);
  assert.throws(()=>verifyResources('server',root),/unlisted/i);
  fs.unlinkSync(path.join(server,'mods/stale.jar'));
  fs.writeFileSync(path.join(server,'server-launch.jar'),'changed');
  assert.throws(()=>verifyResources('server',root),/verification/i);
});
