const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { execFileSync } = require('node:child_process');
const release = require('../build/prism-release.json');
const { prismBundleFolder, prismExecutable, inventoryBundle, verifyPrismBundle } = require('../desktop/prism-bundle.cjs');
const root = path.resolve(__dirname, '..');

async function download(asset, cache) {
  const target = path.join(cache, asset.file);
  const valid = () => fs.existsSync(target) && crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') === asset.sha256;
  if (valid()) return target;
  console.log(`Downloading official Prism ${asset.file}…`);
  const response = await fetch(asset.url, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`Prism download failed: HTTP ${response.status}`);
  const partial = `${target}.part`;
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
  if (crypto.createHash('sha256').update(fs.readFileSync(partial)).digest('hex') !== asset.sha256) {
    fs.rmSync(partial, { force: true });
    throw new Error('Prism download checksum does not match the pinned official release.');
  }
  fs.renameSync(partial, target);
  return target;
}

async function prepare(platform = process.platform, arch = process.arch) {
  const folder = prismBundleFolder(root, platform, arch);
  try {
    if (verifyPrismBundle(folder, platform).version === release.version) {
      console.log(`Bundled Prism ${release.version} already verified for ${platform}/${arch}.`);
      return;
    }
  } catch { /* Rebuild missing or changed generated runtime resources. */ }
  const cache = path.join(root, 'out', 'prism-downloads');
  fs.mkdirSync(cache, { recursive: true });
  const asset = release[platform === 'darwin' ? 'darwin' : `${platform}-${arch}`];
  if (!asset) throw new Error('No pinned Prism release for this target.');
  const archive = await download(asset, cache);
  const source = await download(release.source, cache);
  fs.mkdirSync(path.dirname(folder), { recursive: true });
  const stage = fs.mkdtempSync(`${folder}-stage-`);
  try {
    if (process.platform === 'darwin') execFileSync('ditto', ['-x', '-k', archive, stage]);
    else execFileSync('tar', ['-xf', archive, '-C', stage]);
    fs.rmSync(path.join(stage, '__MACOSX'), { recursive: true, force: true });
    // Keep installed application resources read-only; --dir supplies writable user data.
    fs.rmSync(path.join(stage, 'portable.txt'), { force: true });
    fs.mkdirSync(path.join(stage, 'source'));
    fs.copyFileSync(source, path.join(stage, 'source', release.source.file));
    for (const name of ['LICENSE', 'COPYING.md']) {
      fs.writeFileSync(path.join(stage, name), execFileSync('tar', ['-xOf', source, `PrismLauncher-${release.version}/${name}`]));
    }
    fs.writeFileSync(path.join(stage, 'PRISM-NOTICE.txt'),
      `Prism Launcher ${release.version}\nCopyright 2022-2026 Prism Launcher Contributors.\n` +
      `Unmodified official runtime, distributed with mini as a separate application.\n` +
      `Code: GPL-3.0-only. Prism artwork: CC BY-SA 4.0. See LICENSE and COPYING.md.\n` +
      `Official release: https://github.com/PrismLauncher/PrismLauncher/releases/tag/${release.version}\n` +
      `Runtime archive: ${asset.file}\nSHA-256: ${asset.sha256}\n` +
      `Matching upstream source archive is included in source/${release.source.file}.\n` +
      `Source SHA-256: ${release.source.sha256}\n` +
      `Prism is an independent project and does not endorse mini.\n`);
    if (!fs.statSync(prismExecutable(stage, platform)).isFile()) throw new Error('Prism archive is missing its executable.');
    fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify({ version: release.version, platform, archiveSha256: asset.sha256, files: inventoryBundle(stage) }, null, 2) + '\n');
    verifyPrismBundle(stage, platform);
    fs.rmSync(folder, { recursive: true, force: true });
    fs.renameSync(stage, folder);
    console.log(`Bundled Prism ${release.version} ready: ${folder}`);
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}

if (require.main === module) {
  const arg = (name, fallback) => { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; };
  prepare(arg('--platform', process.platform), arg('--arch', process.arch)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { prepare, download };
