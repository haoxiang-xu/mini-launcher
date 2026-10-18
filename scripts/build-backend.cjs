// Builds the pinned, modified GPL backend. It never falls back to the upstream GUI.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { applyBackend } = require('../native/prism/apply-backend.cjs');
const { deployMacBackend } = require('./deploy-mac-backend.cjs');
const { download } = require('./prepare-prism.cjs');
const { inventoryBundle } = require('../desktop/prism-bundle.cjs');
const { verifyEngineBundle } = require('../desktop/engine-bundle.cjs');
const release = require('../build/prism-release.json');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'runtime', 'backend', process.platform);
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fingerprint() {
  const digest = crypto.createHash('sha256').update(`${release.source.sha256}:${process.platform}:${process.arch}`);
  for (const file of ['scripts/build-backend.cjs', 'scripts/deploy-mac-backend.cjs', 'native/prism/apply-backend.cjs', 'native/prism/MiniBackend.cpp', 'native/prism/MiniBackend.h', 'desktop/engine-bundle.cjs']) digest.update(fs.readFileSync(path.join(root, file)));
  return digest.digest('hex');
}
async function main() {
  if (!['darwin', 'win32'].includes(process.platform)) throw new Error('Build the background engine on macOS or Windows with the native Qt toolchain.');
  const stamp = fingerprint();
  try {
    if (verifyEngineBundle(output).fingerprint === stamp) { console.log('mini background engine already verified.'); return; }
  } catch { /* Missing or changed generated output is rebuilt. */ }
  const cache = path.join(root, 'out', 'prism-downloads'); fs.mkdirSync(cache, { recursive: true });
  const archive = await download(release.source, cache);
  if (hash(archive) !== release.source.sha256) throw new Error('Prism source checksum mismatch.');
  const source = path.join(root, 'out', 'prism-backend-src', `PrismLauncher-${release.version}`);
  fs.mkdirSync(path.dirname(source), { recursive: true });
  if (!fs.existsSync(source)) execFileSync('tar', ['-xzf', archive, '-C', path.dirname(source)]);
  applyBackend(source);
  const build = path.join(root, 'out', 'prism-backend-build');
  const env = { ...process.env };
  const extra = [];
  let brew;
  if (process.platform === 'darwin') {
    brew = execFileSync('brew', ['--prefix'], { encoding: 'utf8' }).trim();
    env.PATH = `${brew}/opt/openjdk@17/bin:${env.PATH}`;
    env.PKG_CONFIG_PATH = `${brew}/opt/libarchive/lib/pkgconfig:${env.PKG_CONFIG_PATH || ''}`;
    const prefix = [brew, ...['qtbase', 'qtnetworkauth', 'qtsvg', 'qtimageformats', 'libarchive'].map(name => `${brew}/opt/${name}`)].join(';');
    extra.push('-DCMAKE_CXX_FLAGS=-Wno-deprecated-pragma -Wno-deprecated-declarations', `-DCMAKE_PREFIX_PATH=${prefix}`, ...['JAVA', 'JAVAC', 'JAR'].map(tool => `-DJava_${tool}_EXECUTABLE=${brew}/opt/openjdk@17/bin/${tool.toLowerCase()}`));
  } else {
    if (!env.CMAKE_PREFIX_PATH || !env.JAVA_HOME) throw new Error('Windows source builds require CMAKE_PREFIX_PATH (Qt/dependencies), JAVA_HOME (JDK 17), Ninja and the native compiler environment.');
    extra.push(`-DCMAKE_PREFIX_PATH=${env.CMAKE_PREFIX_PATH}`, ...['JAVA', 'JAVAC', 'JAR'].map(tool => `-DJava_${tool}_EXECUTABLE=${path.join(env.JAVA_HOME, 'bin', tool.toLowerCase() + '.exe')}`));
  }
  const run = (tool, args) => execFileSync(tool, args, { cwd: root, env, stdio: 'inherit' });
  run('cmake', ['-S', source, '-B', build, '-G', 'Ninja', '-DCMAKE_BUILD_TYPE=Release', ...extra, `-DCMAKE_INSTALL_PREFIX=${output}`, '-DBUILD_TESTING=OFF', '-DLauncher_USE_PCH=OFF', '-DLauncher_BUILD_PLATFORM=mini', '-DLauncher_MSA_CLIENT_ID=', '-DLauncher_IMGUR_CLIENT_ID=', '-DLauncher_CURSEFORGE_API_KEY=', '-DMACOSX_SPARKLE_UPDATE_FEED_URL=', '-DLauncher_ENABLE_JAVA_DOWNLOADER=ON']);
  run('cmake', ['--build', build, '--parallel', '4']);
  fs.rmSync(output, { recursive: true, force: true });
  run('cmake', ['--install', build, '--component', 'Runtime']);
  run('cmake', ['--install', build, '--component', 'bundle']);
  if (process.platform === 'darwin') {
    const app = path.join(output, 'MiniBackend.app');
    // macdeployqt selects cocoa for a normal app and omits the offscreen plugin.
    // Include the platform actually used by our service, with only bundled rpaths.
    fs.copyFileSync(path.join(brew, 'share/qt/plugins/platforms/libqoffscreen.dylib'), path.join(app, 'Contents/PlugIns/platforms/libqoffscreen.dylib'));
    deployMacBackend(app);
    // Deployment rewrites dylib paths, invalidating their original signatures.
    // Locally sign our resulting bundle; production notarization is separate.
    run('codesign', ['--force', '--deep', '--sign', '-', app]);
    run('codesign', ['--verify', '--deep', '--strict', app]);
  }
  const sources = path.join(output, 'source'); fs.mkdirSync(sources, { recursive: true });
  fs.copyFileSync(archive, path.join(sources, release.source.file));
  const kit = path.join(sources, 'mini-build');
  for (const file of ['scripts/build-backend.cjs', 'scripts/deploy-mac-backend.cjs', 'scripts/prepare-prism.cjs', 'native/prism/apply-backend.cjs', 'native/prism/MiniBackend.cpp', 'native/prism/MiniBackend.h', 'desktop/prism-bundle.cjs', 'desktop/engine-bundle.cjs', 'build/prism-release.json']) {
    const target = path.join(kit, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, file), target);
  }
  fs.writeFileSync(path.join(sources, 'build-backend.cjs'), "// Run with Node.js after installing the documented native dependencies.\nrequire('./mini-build/scripts/build-backend.cjs');\n");
  // Seed the build kit with the verified source so rebuilding also works offline.
  const kitCache = path.join(kit, 'out/prism-downloads'); fs.mkdirSync(kitCache, { recursive: true }); fs.copyFileSync(archive, path.join(kitCache, release.source.file));
  for (const file of ['LICENSE', 'COPYING.md']) fs.copyFileSync(path.join(source, file), path.join(output, file));
  fs.writeFileSync(path.join(output, 'BACKEND-NOTICE.txt'), `mini Background Engine, based on Prism ${release.version}, GPL-3.0-only.\nModified 2026-10-18 by mini: JSON service, Mini-controlled authentication/import/launch, no upstream UI.\nNot affiliated with or endorsed by Prism Launcher.\nOriginal source and complete adaptation/build scripts are included in source/.\nRebuild: node source/build-backend.cjs. Prerequisites: Qt 6 (base, networkauth, svg, imageformats), CMake, Ninja, JDK 17, extra-cmake-modules, cmark, qrencode, tomlplusplus, libarchive and zlib.\nOn macOS: Homebrew packages qtbase qtnetworkauth qtsvg qtimageformats cmake ninja extra-cmake-modules openjdk@17 cmark qrencode tomlplusplus libarchive.\nOn Windows: native compiler/Ninja environment, CMAKE_PREFIX_PATH for Qt/dependencies, JAVA_HOME for JDK 17.\nUpstream and dependency notices: LICENSE and COPYING.md.\n`);
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ backend: 'mini-prism', protocol: 1, version: release.version, platform: process.platform, arch: process.arch, fingerprint: stamp, files: inventoryBundle(output) }, null, 2) + '\n');
  verifyEngineBundle(output);
  console.log(`mini native backend ready: ${output}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
