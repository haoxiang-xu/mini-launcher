const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function prismExecutable(folder, platform = process.platform) {
  if (platform === 'darwin') return path.join(folder, 'Prism Launcher.app', 'Contents', 'MacOS', 'prismlauncher');
  if (platform === 'win32') return path.join(folder, 'prismlauncher.exe');
  throw new Error(`Unsupported bundled Prism platform: ${platform}`);
}

function prismBundleFolder(root, platform = process.platform, arch = process.arch) {
  if (platform === 'darwin') return path.join(root, 'runtime', 'prism', 'darwin');
  if (platform === 'win32' && arch === 'x64') return path.join(root, 'runtime', 'prism', 'win32-x64');
  throw new Error(`Unsupported bundled Prism platform: ${platform}/${arch}`);
}

function inventoryBundle(root) {
  const files = [];
  const realRoot = fs.realpathSync(root);
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(folder, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (relative === 'manifest.json') continue;
      if (entry.isSymbolicLink()) {
        const resolved = fs.realpathSync(absolute);
        if (!resolved.startsWith(realRoot + path.sep)) throw new Error('Prism link points outside the bundle.');
        files.push({ path: relative, link: fs.readlinkSync(absolute) });
      } else if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push({ path: relative, sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') });
      else throw new Error('Unsupported Prism bundle entry.');
    }
  }
  walk(root);
  return files;
}

function verifyPrismBundle(folder, platform = process.platform) {
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
  if (manifest.platform !== platform || !manifest.version || !Array.isArray(manifest.files) ||
      !fs.statSync(prismExecutable(folder, platform)).isFile() ||
      !manifest.files.some(file => file.path === 'PRISM-NOTICE.txt') ||
      !manifest.files.some(file => /^source\/[^/]+\.tar\.gz$/.test(file.path))) {
    throw new Error('Incomplete Prism bundle; run npm run prepare:prism.');
  }
  if (JSON.stringify(inventoryBundle(folder)) !== JSON.stringify(manifest.files)) throw new Error('Prism bundle verification failed.');
  return manifest;
}

module.exports = { prismExecutable, prismBundleFolder, inventoryBundle, verifyPrismBundle };
