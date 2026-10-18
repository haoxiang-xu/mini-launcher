const fs = require('node:fs');
const path = require('node:path');
const { inventoryBundle } = require('./prism-bundle.cjs');

function engineExecutable(folder, platform = process.platform) {
  if (platform === 'darwin') return path.join(folder, 'MiniBackend.app', 'Contents', 'MacOS', 'MiniBackend');
  if (platform === 'win32') return path.join(folder, 'prismlauncher.exe');
  throw new Error(`Unsupported engine platform: ${platform}`);
}
function verifyEngineBundle(folder, platform = process.platform, arch = process.arch) {
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
  if (manifest.platform !== platform || manifest.arch !== arch) throw new Error('Engine target architecture does not match this build.');
  if (manifest.backend !== 'mini-prism' || manifest.protocol !== 1 || !manifest.version || !Array.isArray(manifest.files) ||
      !fs.statSync(engineExecutable(folder, platform)).isFile() ||
      !['LICENSE', 'COPYING.md', 'BACKEND-NOTICE.txt', 'source/build-backend.cjs'].every(name => manifest.files.some(file => file.path === name)) ||
      !manifest.files.some(file => /^source\/[^/]+\.tar\.gz$/.test(file.path))) throw new Error('Incomplete engine; run npm run build:backend.');
  if (JSON.stringify(inventoryBundle(folder)) !== JSON.stringify(manifest.files)) throw new Error('Engine bundle verification failed.');
  return manifest;
}
module.exports = { engineExecutable, verifyEngineBundle };
