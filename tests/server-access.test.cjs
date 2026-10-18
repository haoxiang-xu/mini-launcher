const test=require('node:test'),assert=require('node:assert/strict');
const {editionFor,assertServerAccess}=require('../desktop/edition.cjs');
const {prismArgs}=require('../desktop/core.cjs');
const path=require('node:path');
test('packaged player edition cannot enable host features with a command-line flag',()=>{
  assert.equal(editionFor({packaged:true,metadata:{miniEdition:'player'},argv:['--server']}),'player');
  assert.equal(editionFor({packaged:true,metadata:{miniEdition:'server'},argv:[]}),'server');
  assert.equal(editionFor({packaged:false,metadata:{},argv:['--server']}),'server');
});
test('host operations reject player editions, other windows and subframes',()=>{
  const sender={mainFrame:{}},window={webContents:sender,isDestroyed:()=>false};
  const event={sender,senderFrame:sender.mainFrame};
  assert.doesNotThrow(()=>assertServerAccess('server',window,event));
  assert.throws(()=>assertServerAccess('player',window,event),/server edition/i);
  assert.throws(()=>assertServerAccess('server',window,{...event,sender:{}}),/window/i);
  assert.throws(()=>assertServerAccess('server',window,{...event,senderFrame:{}}),/window/i);
});
test('Prism can launch a client directly into a local server without shell arguments',()=>{
  const root=path.resolve('test-root');
  assert.deepEqual(prismArgs(root,'launch','mini','127.0.0.1:25566'),['--dir',root,'--launch','mini','--server','127.0.0.1:25566']);
  assert.throws(()=>prismArgs(root,'launch','mini','127.0.0.1:25565 --offline'),/address/i);
});
