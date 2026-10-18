const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { findPrism } = require("../desktop/core.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mini-prism-discovery-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { PROGRAMFILES: root, "PROGRAMFILES(X86)": root, LOCALAPPDATA: root, USERPROFILE: root, PATH: "" };
  function binary(folder, name = "prismlauncher.exe") {
    const file = path.join(root, folder, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "test fixture, never executed");
    return file;
  }
  return { root, env, binary };
}

test("detects a portable Prism on PATH and an install with a spaced directory name", (t) => {
  const f = fixture(t);
  const portable = f.binary("Portable tools/Prism");
  assert.equal(findPrism(null, "win32", { ...f.env, Path: path.dirname(portable), PATH: undefined }), portable);
  const installed = f.binary("Prism Launcher");
  assert.equal(findPrism(null, "win32", f.env), installed);
});

test("installation discovery validates candidates and keeps manual selection first", async (t) => {
  const { createPrismDetector } = require("../desktop/prism-discovery.cjs");
  const f = fixture(t);
  const portable = f.binary("Custom disk/Portable Prism");
  const wrong = f.binary("Other app", "other.exe");
  const manual = f.binary("Manual choice");
  const detect = createPrismDetector({ platform: "win32", env: f.env, scanInstallations: async () => [wrong, path.join(f.root, "missing.exe"), portable] });
  assert.deepEqual(await detect(), { path: portable, source: "auto" });
  assert.deepEqual(await detect(manual), { path: manual, source: "saved" });
  assert.deepEqual(await detect(path.join(f.root, "removed", "prismlauncher.exe")), { path: portable, source: "auto" });
});

test("status polling shares discovery and retry detects a newly installed launcher", async (t) => {
  const { createPrismDetector } = require("../desktop/prism-discovery.cjs");
  const f = fixture(t);
  let candidates = [];
  let scans = 0;
  const detect = createPrismDetector({ platform: "win32", env: f.env, scanInstallations: async () => { scans++; return candidates; } });
  assert.deepEqual(await Promise.all([detect(), detect()]), [{ path: null, source: "missing" }, { path: null, source: "missing" }]);
  await detect();
  assert.equal(scans, 1, "normal status polling must not launch another OS scan");
  const installed = f.binary("New installation");
  candidates = [installed];
  assert.deepEqual(await detect(null, { refresh: true }), { path: installed, source: "auto" });
});

test("a moved detected launcher is recovered and OS lookup failures allow retry", async (t) => {
  const { createPrismDetector } = require("../desktop/prism-discovery.cjs");
  const f = fixture(t);
  let current = f.binary("Old location");
  let fail = true;
  const detect = createPrismDetector({ platform: "win32", env: f.env, scanInstallations: async () => {
    if (fail) throw new Error("Registry access unavailable");
    return [current];
  } });
  assert.deepEqual(await detect(), { path: null, source: "missing" });
  fail = false;
  assert.equal((await detect(null, { refresh: true })).path, current);
  fs.unlinkSync(current);
  current = f.binary("New location");
  assert.equal((await detect()).path, current);
});

test("uses the bundled launcher ahead of system installs while preserving an explicit manual choice", async (t) => {
  const { createPrismDetector } = require("../desktop/prism-discovery.cjs");
  const f = fixture(t);
  const bundled = f.binary("Bundled runtime");
  const system = f.binary("Prism Launcher");
  const manual = f.binary("Manual choice");
  let scans = 0;
  const detect = createPrismDetector({ platform: "win32", env: f.env, bundledPath: bundled,
    scanInstallations: async () => { scans++; return [system]; } });
  assert.deepEqual(await detect(), { path: bundled, source: "bundled" });
  assert.deepEqual(await detect(manual), { path: manual, source: "saved" });
  fs.unlinkSync(bundled);
  assert.deepEqual(await detect(), { path: system, source: "auto" });
  assert.equal(scans, 0);
});
