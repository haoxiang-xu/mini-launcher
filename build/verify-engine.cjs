const path = require('node:path');
const { verifyEngineBundle } = require('../desktop/engine-bundle.cjs');
function verifyEngineResources(platform, arch = process.arch, root = path.resolve(__dirname, '..')) {
  // Electron Builder passes its numeric Arch enum to hooks.
  if (typeof arch === 'number') arch = ({ 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' })[arch];
  return verifyEngineBundle(path.join(root, 'runtime', 'backend', platform), platform, arch);
}
module.exports = { verifyEngineResources };
