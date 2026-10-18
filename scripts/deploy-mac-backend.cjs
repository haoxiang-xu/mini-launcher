// SPDX-License-Identifier: GPL-3.0-only
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const run = (tool, args) => execFileSync(tool, args, { encoding: 'utf8' });
function machOFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...machOFiles(file));
    else if (entry.isFile()) {
      const fd = fs.openSync(file, 'r'), magic = Buffer.alloc(4);
      fs.readSync(fd, magic, 0, 4, 0); fs.closeSync(fd);
      if (['cffaedfe', 'feedfacf', 'cafebabe', 'bebafeca'].includes(magic.toString('hex'))) files.push(file);
    }
  }
  return files;
}
function dependencies(file) {
  return run('otool', ['-L', file]).split('\n').slice(1).map(line => line.trim().split(' (compatibility')[0]).filter(Boolean);
}
const external = reference => reference.startsWith('/') && !reference.startsWith('/System/Library/') && !reference.startsWith('/usr/lib/');
function verifyPortableMachOBundle(app) {
  for (const file of machOFiles(app)) {
    for (const reference of dependencies(file)) if (external(reference)) throw new Error(`External runtime dependency: ${path.basename(file)} → ${reference}`);
    const rpaths = run('otool', ['-l', file]);
    if (/path \/(?:opt\/homebrew|usr\/local)\//.test(rpaths)) throw new Error(`External runtime search path: ${file}`);
  }
}
function deployMacBackend(app) {
  const frameworks = path.join(app, 'Contents/Frameworks');
  const queue = machOFiles(app), visited = new Set();
  for (let index = 0; index < queue.length; index++) {
    const file = queue[index]; if (visited.has(file)) continue; visited.add(file);
    const id = run('otool', ['-D', file]).split('\n')[1]?.trim();
    if (id) run('install_name_tool', ['-id', '@rpath/' + path.relative(frameworks, file).split(path.sep).join('/'), file]);
    for (const reference of dependencies(file)) {
      if (!external(reference)) continue;
      const framework = reference.match(/([^/]+\.framework\/Versions\/[^/]+\/[^/]+)$/)?.[1];
      const target = path.join(frameworks, framework || path.basename(reference));
      if (!fs.existsSync(target)) {
        if (!fs.statSync(reference).isFile()) throw new Error(`Cannot deploy ${reference}`);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(fs.realpathSync(reference), target); queue.push(target);
      }
      run('install_name_tool', ['-change', reference, '@rpath/' + (framework || path.basename(target)), file]);
    }
    const commands = run('otool', ['-l', file]);
    const rpaths = [...commands.matchAll(/cmd LC_RPATH\s+cmdsize \d+\s+path (.+?) \(offset/g)].map(match => match[1]);
    for (const reference of rpaths) if (external(reference)) run('install_name_tool', ['-delete_rpath', reference, file]);
    const local = '@loader_path/' + path.relative(path.dirname(file), frameworks).split(path.sep).join('/');
    if (!rpaths.includes(local)) run('install_name_tool', ['-add_rpath', local, file]);
  }
  verifyPortableMachOBundle(app);
}
module.exports = { deployMacBackend, verifyPortableMachOBundle };
